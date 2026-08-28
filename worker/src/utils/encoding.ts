/**
 * 编解码工具
 */

/** Base64 编码 */
export function base64Encode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Base64 解码 */
export function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Base64 URL 安全解码 */
export function base64UrlDecode(str: string): Uint8Array {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding) normalized += '='.repeat(4 - padding);
  return base64Decode(normalized);
}

/** 十六进制编码 */
export function hexEncode(data: Uint8Array): string {
  return [...data].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 十六进制解码 */
export function hexDecode(hex: string): Uint8Array {
  const clean = hex.replace(/-/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** 读取十六进制半字节 */
export function readHexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  code |= 32; // to lowercase
  if (code >= 97 && code <= 102) return code - 87; // a-f
  return -1;
}

/** 格式化 UUID 字节数组为 UUID 字符串 */
export function formatUUID(bytes: Uint8Array, offset = 0): string {
  const hex = [...bytes.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 带秘钥的 Base64 编码 (XOR) */
export function base64SecretEncode(plaintext: string, secret: string): string {
  const data = new TextEncoder().encode(plaintext);
  const key = new TextEncoder().encode(secret);
  const mixed = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) mixed[i] = data[i] ^ key[i % key.length];
  return base64Encode(mixed);
}
