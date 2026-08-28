/**
 * 通用工具函数
 */

/** 日志输出 */
export function log(...args: unknown[]): void {
  console.log(new Date().toISOString(), ...args);
}

/** 调试日志 */
let debugEnabled = false;
export function setDebug(enabled: boolean) { debugEnabled = enabled; }
export function debug(...args: unknown[]): void {
  if (debugEnabled) console.log('[DEBUG]', ...args);
}

/** 带超时的 Promise */
export function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms); })
  ]).finally(() => clearTimeout(timer));
}

/** 安全关闭 WebSocket */
export function closeSocket(socket: { readyState: number; close(): void } | null | undefined): void {
  try {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING)) {
      socket.close();
    }
  } catch {}
}

/** 构造本地 204 响应 */
export function buildLocal204(respHeader: Uint8Array | null = null): Uint8Array {
  const body = new TextEncoder().encode(
    'HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
  );
  if (!respHeader || respHeader.byteLength === 0) return body;
  const result = new Uint8Array(respHeader.byteLength + body.byteLength);
  result.set(respHeader, 0);
  result.set(body, respHeader.byteLength);
  return result;
}

/** 替换星号为随机字符 */
export function replaceAsterisk(str: string): string {
  return str.replace(/\*/g, () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return chars[Math.floor(Math.random() * chars.length)];
  });
}

/** 随机路径 */
export function randomPath(base: string): string {
  if (!base || base === '/') return '/' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return base;
}
