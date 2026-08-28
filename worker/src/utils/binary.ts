/**
 * 二进制数据操作工具
 */

/** 确保数据为 Uint8Array */
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return new Uint8Array(0);
}

/** 拼接多个 Uint8Array */
export function concat(...chunks: (Uint8Array | ArrayBuffer | number[])[]): Uint8Array {
  const lists = chunks.map(c => toUint8Array(c));
  const total = lists.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of lists) { result.set(c, offset); offset += c.byteLength; }
  return result;
}

/** 读取大端 uint16 */
export function readUint16(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

/** 读取大端 uint24 */
export function readUint24(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
}

/** 读取大端 uint32 */
export function readUint32(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

/** 写入大端 uint16 */
export function writeUint16(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

/** 写入大端 uint32 */
export function writeUint32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

/** 构建大端 uint16 字节数组 */
export function uint16be(value: number): [number, number] {
  return [(value >> 8) & 0xff, value & 0xff];
}

/** 随机字节 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** 有效数据长度 */
export function dataLength(data: unknown): number {
  if (!data) return 0;
  if (typeof (data as any).byteLength === 'number') return (data as any).byteLength;
  if (typeof (data as any).length === 'number') return (data as any).length;
  return 0;
}
