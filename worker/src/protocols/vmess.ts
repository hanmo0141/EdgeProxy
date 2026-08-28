/**
 * VMess 协议解析
 */
import { toUint8Array } from '../utils/binary';
import { formatUUID } from '../utils/encoding';

const textDecoder = new TextDecoder();
const UUID_BYTE_CACHE = new Map<string, Uint8Array | null>();

/** 获取 UUID 字节数组（带缓存） */
function getUUIDBytes(uuid: string): Uint8Array | null {
  let cached = UUID_BYTE_CACHE.get(uuid);
  if (cached !== undefined) return cached;

  const clean = uuid.replace(/-/g, '');
  if (clean.length !== 32) { UUID_BYTE_CACHE.set(uuid, null); return null; }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const high = readHexNibble(clean.charCodeAt(i * 2));
    const low = readHexNibble(clean.charCodeAt(i * 2 + 1));
    if (high < 0 || low < 0) { UUID_BYTE_CACHE.set(uuid, null); return null; }
    bytes[i] = (high << 4) | low;
  }

  if (UUID_BYTE_CACHE.size >= 32) UUID_BYTE_CACHE.clear();
  UUID_BYTE_CACHE.set(uuid, bytes);
  return bytes;
}

function readHexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  code |= 32;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

/** 匹配 UUID 字节 */
function matchUUID(data: Uint8Array, offset: number, uuid: string): boolean {
  const expected = getUUIDBytes(uuid);
  if (!expected || data.byteLength < offset + 16) return false;
  for (let i = 0; i < 16; i++) {
    if (data[offset + i] !== expected[i]) return false;
  }
  return true;
}

export interface VMessRequest {
  hostname: string;
  port: number;
  isUDP: boolean;
  version: number;
  rawData: Uint8Array;
  respHeader: Uint8Array;
}

/** 解析 VMess 请求 */
export function parseVMessRequest(chunk: Uint8Array | ArrayBuffer, uuid: string): VMessRequest | { hasError: true; message: string } {
  const data = toUint8Array(chunk);
  const length = data.byteLength;

  if (length < 24) return { hasError: true, message: 'Invalid data' };

  const version = data[0];
  if (!matchUUID(data, 1, uuid)) return { hasError: true, message: 'Invalid uuid' };

  const optLen = data[17];
  const cmdIndex = 18 + optLen;
  if (length < cmdIndex + 4) return { hasError: true, message: 'Invalid data' };

  const cmd = data[cmdIndex];
  let isUDP = false;
  if (cmd === 1) { /* TCP */ }
  else if (cmd === 2) { isUDP = true; }
  else return { hasError: true, message: 'Invalid command' };

  const portIdx = cmdIndex + 1;
  const port = (data[portIdx] << 8) | data[portIdx + 1];
  const addressType = data[portIdx + 2];
  let addrValIdx = portIdx + 3;
  let hostname = '';

  switch (addressType) {
    case 1: // IPv4
      if (length < addrValIdx + 4) return { hasError: true, message: 'Invalid IPv4' };
      hostname = `${data[addrValIdx]}.${data[addrValIdx + 1]}.${data[addrValIdx + 2]}.${data[addrValIdx + 3]}`;
      addrValIdx += 4;
      break;
    case 2: // Domain
      if (length < addrValIdx + 1) return { hasError: true, message: 'Invalid domain length' };
      const domainLen = data[addrValIdx];
      addrValIdx += 1;
      if (length < addrValIdx + domainLen) return { hasError: true, message: 'Invalid domain data' };
      hostname = textDecoder.decode(data.subarray(addrValIdx, addrValIdx + domainLen));
      addrValIdx += domainLen;
      break;
    case 3: // IPv6
      if (length < addrValIdx + 16) return { hasError: true, message: 'Invalid IPv6' };
      const ipv6: string[] = [];
      for (let i = 0; i < 8; i++) {
        const base = addrValIdx + i * 2;
        ipv6.push(((data[base] << 8) | data[base + 1]).toString(16));
      }
      hostname = ipv6.join(':');
      addrValIdx += 16;
      break;
    default:
      return { hasError: true, message: `Invalid address type: ${addressType}` };
  }

  if (!hostname) return { hasError: true, message: 'Empty address' };

  return {
    hasError: false,
    hostname,
    port,
    isUDP,
    version,
    rawData: data.subarray(addrValIdx),
    respHeader: new Uint8Array([version, 0]),
  };
}

/** 检查是否是 VMess 首包 */
export function isVMessPacket(data: Uint8Array, uuid: string): boolean {
  return data.byteLength >= 18 && matchUUID(data, 1, uuid);
}
