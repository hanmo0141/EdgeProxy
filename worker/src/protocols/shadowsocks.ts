/**
 * Shadowsocks AEAD 加解密
 */
import { toUint8Array, concat } from '../utils/binary';

/** 支持的加密方式 */
export const SS_CIPHERS: Record<string, { method: string; keyLen: number; saltLen: number; maxChunk: number; aesLength: number }> = {
  'aes-128-gcm': { method: 'aes-128-gcm', keyLen: 16, saltLen: 16, maxChunk: 0x3fff, aesLength: 128 },
  'aes-256-gcm': { method: 'aes-256-gcm', keyLen: 32, saltLen: 32, maxChunk: 0x3fff, aesLength: 256 },
};

const AEAD_TAG_LEN = 16;
const NONCE_LEN = 12;
const SS_SUBKEY_INFO = new TextEncoder().encode('ss-subkey');
const textEncoder = new TextEncoder();

/** 派生主密钥（EVP_BytesToKey） */
const masterKeyCache = new Map<string, Promise<Uint8Array>>();

export async function deriveMasterKey(passwordText: string, keyLen: number): Promise<Uint8Array> {
  const cacheKey = `${keyLen}:${passwordText}`;
  if (masterKeyCache.has(cacheKey)) return masterKeyCache.get(cacheKey)!;

  const task = (async () => {
    const pwBytes = textEncoder.encode(passwordText || '');
    let prev = new Uint8Array(0);
    let result = new Uint8Array(0);
    while (result.byteLength < keyLen) {
      const input = new Uint8Array(prev.byteLength + pwBytes.byteLength);
      input.set(prev, 0);
      input.set(pwBytes, prev.byteLength);
      prev = new Uint8Array(await crypto.subtle.digest('MD5', input));
      result = concat(result, prev);
    }
    return result.slice(0, keyLen);
  })();

  masterKeyCache.set(cacheKey, task);
  try { return await task; }
  catch (err) { masterKeyCache.delete(cacheKey); throw err; }
}

/** 派生会话密钥 */
export async function deriveSessionKey(
  config: typeof SS_CIPHERS['aes-256-gcm'],
  masterKey: Uint8Array,
  salt: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const hmacOpts = { name: 'HMAC' as const, hash: 'SHA-1' as const };

  // HKDF-Extract
  const saltHmacKey = await crypto.subtle.importKey('raw', salt, hmacOpts, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltHmacKey, masterKey));

  // HKDF-Expand
  const prkHmacKey = await crypto.subtle.importKey('raw', prk, hmacOpts, false, ['sign']);
  const subKey = new Uint8Array(config.keyLen);
  let prev = new Uint8Array(0);
  let written = 0;
  let counter = 1;

  while (written < config.keyLen) {
    const input = concat(prev, SS_SUBKEY_INFO, new Uint8Array([counter]));
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', prkHmacKey, input));
    const copyLen = Math.min(prev.byteLength, config.keyLen - written);
    subKey.set(prev.subarray(0, copyLen), written);
    written += copyLen;
    counter += 1;
  }

  return crypto.subtle.importKey('raw', subKey, { name: 'AES-GCM', length: config.aesLength }, false, usages);
}

/** 递增 Nonce 计数器 */
export function incrementNonce(counter: Uint8Array): void {
  for (let i = 0; i < counter.length; i++) {
    counter[i] = (counter[i] + 1) & 0xff;
    if (counter[i] !== 0) return;
  }
}

/** AEAD 加密 */
export async function aeadEncrypt(key: CryptoKey, nonceCounter: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = nonceCounter.slice();
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintext);
  incrementNonce(nonceCounter);
  return new Uint8Array(ct);
}

/** AEAD 解密 */
export async function aeadDecrypt(key: CryptoKey, nonceCounter: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const iv = nonceCounter.slice();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext);
  incrementNonce(nonceCounter);
  return new Uint8Array(pt);
}

/** SS 入站解密器 */
export interface SSInboundDecryptor {
  input(dataChunk: Uint8Array): Promise<Uint8Array[]>;
}

export function createSSInboundDecryptor(
  masterKeyGetter: () => Promise<Uint8Array>,
  candidateConfigs: typeof SS_CIPHERS['aes-256-gcm'][]
): SSInboundDecryptor {
  let buffer = new Uint8Array(0);
  let hasSalt = false;
  let waitPayloadLength: number | null = null;
  let decryptKey: CryptoKey | null = null;
  let nonceCounter = new Uint8Array(NONCE_LEN);
  let currentConfig: typeof SS_CIPHERS['aes-256-gcm'] | null = null;

  const initializeDecryptState = async (): Promise<boolean> => {
    const lengthCipherLen = 2 + AEAD_TAG_LEN;
    const maxSaltLen = Math.max(...candidateConfigs.map(c => c.saltLen));
    const maxScanOffset = Math.min(16, Math.max(0, buffer.byteLength - (lengthCipherLen + Math.min(...candidateConfigs.map(c => c.saltLen)))));

    for (let offset = 0; offset <= maxScanOffset; offset++) {
      for (const config of candidateConfigs) {
        const initMinLen = offset + config.saltLen + lengthCipherLen;
        if (buffer.byteLength < initMinLen) continue;

        const salt = buffer.subarray(offset, offset + config.saltLen);
        const lengthCipher = buffer.subarray(offset + config.saltLen, initMinLen);

        const masterKey = await masterKeyGetter();
        const dk = await deriveSessionKey(config, masterKey, salt, ['decrypt']);
        const nc = new Uint8Array(NONCE_LEN);

        try {
          const lengthPlain = await aeadDecrypt(dk, nc, lengthCipher);
          if (lengthPlain.byteLength !== 2) continue;
          const payloadLength = (lengthPlain[0] << 8) | lengthPlain[1];
          if (payloadLength < 0 || payloadLength > config.maxChunk) continue;

          buffer = buffer.subarray(initMinLen);
          decryptKey = dk;
          nonceCounter = nc;
          waitPayloadLength = payloadLength;
          currentConfig = config;
          hasSalt = true;
          return true;
        } catch { }
      }
    }

    const failLen = maxSaltLen + lengthCipherLen + maxScanOffset;
    if (buffer.byteLength >= failLen) {
      throw new Error('SS handshake decrypt failed');
    }
    return false;
  };

  return {
    async input(dataChunk: Uint8Array): Promise<Uint8Array[]> {
      const chunk = toUint8Array(dataChunk);
      if (chunk.byteLength > 0) {
        const newBuf = new Uint8Array(buffer.byteLength + chunk.byteLength);
        newBuf.set(buffer);
        newBuf.set(chunk, buffer.byteLength);
        buffer = newBuf;
      }

      if (!hasSalt) {
        const ok = await initializeDecryptState();
        if (!ok) return [];
      }

      const plaintextChunks: Uint8Array[] = [];
      while (true) {
        if (waitPayloadLength === null) {
          const lengthCipherLen = 2 + AEAD_TAG_LEN;
          if (buffer.byteLength < lengthCipherLen) break;
          const lengthCipher = buffer.subarray(0, lengthCipherLen);
          buffer = buffer.subarray(lengthCipherLen);
          const lengthPlain = await aeadDecrypt(decryptKey!, nonceCounter, lengthCipher);
          if (lengthPlain.byteLength !== 2) throw new Error('SS length decrypt failed');
          waitPayloadLength = (lengthPlain[0] << 8) | lengthPlain[1];
          if (waitPayloadLength < 0 || waitPayloadLength > currentConfig!.maxChunk) {
            throw new Error(`SS payload length invalid: ${waitPayloadLength}`);
          }
        }

        const payloadCipherLen = waitPayloadLength + AEAD_TAG_LEN;
        if (buffer.byteLength < payloadCipherLen) break;
        const payloadCipher = buffer.subarray(0, payloadCipherLen);
        buffer = buffer.subarray(payloadCipherLen);
        const payloadPlain = await aeadDecrypt(decryptKey!, nonceCounter, payloadCipher);
        plaintextChunks.push(payloadPlain);
        waitPayloadLength = null;
      }
      return plaintextChunks;
    }
  };
}
