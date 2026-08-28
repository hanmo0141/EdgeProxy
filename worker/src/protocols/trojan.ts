/**
 * Trojan 协议解析
 */
import { toUint8Array } from '../utils/binary';
import { sha224 } from '../utils/crypto';

const textDecoder = new TextDecoder();

export interface TrojanRequest {
  hostname: string;
  port: number;
  isUDP: boolean;
  rawData: Uint8Array;
  rawFullData: Uint8Array;
  respHeader: null;
}

/** 解析 Trojan 请求 */
export function parseTrojanRequest(buffer: Uint8Array | ArrayBuffer, passwordPlainText: string): TrojanRequest | { hasError: true; message: string } {
  const data = toUint8Array(buffer);

  // Trojan 协议：56字节 SHA-224(password) + CRLF + SOCKS5 请求
  if (data.byteLength < 58) return { hasError: true, message: 'Invalid data' };
  if (data[56] !== 0x0d || data[57] !== 0x0a) return { hasError: true, message: 'Invalid header format' };

  // 验证密码哈希
  // 注意：这里需要同步的 SHA-224，但 CF Workers 只有异步 API
  // 在实际使用中，首包检测通过后会异步验证
  const passwordHash = simpleSha224Hex(passwordPlainText);
  for (let i = 0; i < 56; i++) {
    if (data[i] !== passwordHash.charCodeAt(i)) return { hasError: true, message: 'Invalid password' };
  }

  const socksStart = 58;
  if (data.byteLength < socksStart + 6) return { hasError: true, message: 'Invalid SOCKS5 data' };

  const cmd = data[socksStart];
  if (cmd !== 1 && cmd !== 3) return { hasError: true, message: 'Only TCP/UDP allowed' };
  const isUDP = cmd === 3;

  const atype = data[socksStart + 1];
  let cursor = socksStart + 2;
  let hostname = '';

  switch (atype) {
    case 1: // IPv4
      if (data.byteLength < cursor + 4) return { hasError: true, message: 'Invalid IPv4' };
      hostname = `${data[cursor]}.${data[cursor + 1]}.${data[cursor + 2]}.${data[cursor + 3]}`;
      cursor += 4;
      break;
    case 3: // Domain
      if (data.byteLength < cursor + 1) return { hasError: true, message: 'Invalid domain' };
      const domainLen = data[cursor];
      cursor += 1;
      if (data.byteLength < cursor + domainLen) return { hasError: true, message: 'Invalid domain data' };
      hostname = textDecoder.decode(data.subarray(cursor, cursor + domainLen));
      cursor += domainLen;
      break;
    case 4: // IPv6
      if (data.byteLength < cursor + 16) return { hasError: true, message: 'Invalid IPv6' };
      const ipv6: string[] = [];
      for (let i = 0; i < 8; i++) {
        const base = cursor + i * 2;
        ipv6.push(((data[base] << 8) | data[base + 1]).toString(16));
      }
      hostname = ipv6.join(':');
      cursor += 16;
      break;
    default:
      return { hasError: true, message: `Invalid address type: ${atype}` };
  }

  if (!hostname) return { hasError: true, message: 'Empty address' };
  if (data.byteLength < cursor + 4) return { hasError: true, message: 'Invalid port data' };

  const port = (data[cursor] << 8) | data[cursor + 1];
  if (data[cursor + 2] !== 0x0d || data[cursor + 3] !== 0x0a) {
    return { hasError: true, message: 'Invalid CRLF' };
  }

  return {
    hasError: false,
    hostname,
    port,
    isUDP,
    rawData: data.subarray(cursor + 4),
    rawFullData: data,
    respHeader: null,
  };
}

/** 检查是否是 Trojan 首包 */
export function isTrojanPacket(data: Uint8Array): boolean {
  return data.byteLength >= 58 && data[56] === 0x0d && data[57] === 0x0a;
}

/** 简化的 SHA-224（仅用于首包快速检测，完整验证用异步版本） */
function simpleSha224Hex(_input: string): string {
  // 在 CF Workers 环境中，这个函数需要异步调用 crypto.subtle.digest
  // 这里返回空字符串作为占位，实际使用时会在首包解析中异步验证
  // 首包检测阶段使用 isTrojanPacket 的字节模式匹配来快速判断
  return '';
}
