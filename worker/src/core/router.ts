/**
 * 连接路由器 - 直连/反代/链式代理决策
 */
import { ProxyContext } from '../config/types';
import { log, debug } from '../utils/helpers';
import { isSpeedTestSite, isIPHostname, stripIPv6Brackets } from '../utils/network';

/** 创建 TCP 连接器（使用 CF Workers fetcher.connect） */
export function createTCPConnector(request: Request) {
  const req = request as any;
  const fetcher = req?.fetcher;
  if (!fetcher || typeof fetcher.connect !== 'function') {
    throw new Error('request.fetcher.connect unavailable');
  }
  return (options: { hostname: string; port: number }, init?: any) =>
    init === undefined ? fetcher.connect(options) : fetcher.connect(options, init);
}

/** 建立 TCP 连接到目标（直连或反代） */
export async function connectToTarget(
  targetHost: string,
  targetPort: number,
  rawData: Uint8Array | null,
  request: Request,
  proxyCtx: ProxyContext,
  remoteConnWrapper: any,
  uuid: string,
  allowTrojanFallback = false,
  trojanFirstPacket: Uint8Array | null = null,
  connectOnly = false
): Promise<any> {
  const TCP连接 = createTCPConnector(request);
  const 使用反代 = proxyCtx.代理类型 !== null;
  const 反代兜底 = proxyCtx.反代兜底;

  // 如果指定了链式代理
  if (proxyCtx.代理类型 && (proxyCtx.代理全局 || isInWhitelist(targetHost))) {
    log(`[Router] 链式代理 -> ${targetHost}:${targetPort} via ${proxyCtx.代理类型}`);
    return connectViaProxy(targetHost, targetPort, rawData, TCP连接, proxyCtx);
  }

  // 尝试直连
  try {
    log(`[Router] 直连 -> ${targetHost}:${targetPort}`);
    const socket = TCP连接({ hostname: targetHost, port: targetPort });
    await Promise.race([
      socket.opened,
      new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 3000))
    ]);
    return socket;
  } catch (err: any) {
    log(`[Router] 直连失败: ${err.message}`);
    // 回退到反代
    if (反代兜底 || proxyCtx.代理类型) {
      log(`[Router] 回退反代 -> ${targetHost}:${targetPort}`);
      return connectViaProxy(targetHost, targetPort, rawData, TCP连接, proxyCtx);
    }
    throw err;
  }
}

/** 通过链式代理连接 */
async function connectViaProxy(
  targetHost: string,
  targetPort: number,
  rawData: Uint8Array | null,
  TCP连接: Function,
  proxyCtx: ProxyContext
): Promise<any> {
  switch (proxyCtx.代理类型) {
    case 'socks5':
      return socks5Connect(targetHost, targetPort, rawData, TCP连接, proxyCtx.代理参数);
    case 'http':
      return httpConnect(targetHost, targetPort, rawData, false, TCP连接, proxyCtx.代理参数);
    case 'https':
      return httpConnect(targetHost, targetPort, rawData, true, TCP连接, proxyCtx.代理参数);
    default:
      throw new Error(`不支持的代理类型: ${proxyCtx.代理类型}`);
  }
}

/** SOCKS5 白名单（这些域名走链式代理） */
const SOCKS5_WHITELIST = ['*tapecontent.net', '*cloudatacdn.com', '*loadshare.org', 'scholar.google.com'];

function isInWhitelist(host: string): boolean {
  return SOCKS5_WHITELIST.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    return regex.test(host);
  });
}

/** SOCKS5 连接 */
async function socks5Connect(
  targetHost: string,
  targetPort: number,
  initialData: Uint8Array | null,
  TCP连接: Function,
  params: Record<string, string>
): Promise<any> {
  const { username, password, hostname, port } = {
    username: params.username || '',
    password: params.password || '',
    hostname: params.hostname || '',
    port: Number(params.port) || 1080,
  };

  const socket = TCP连接({ hostname, port });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  try {
    // 方法选择
    const authMethods = username && password
      ? new Uint8Array([0x05, 0x02, 0x00, 0x02])
      : new Uint8Array([0x05, 0x01, 0x00]);
    await writer.write(authMethods);

    let response = await reader.read();
    if (response.done || response.value.byteLength < 2) throw new Error('SOCKS5 方法选择失败');

    const selectedMethod = new Uint8Array(response.value)[1];
    if (selectedMethod === 0x02) {
      // 用户名/密码认证
      if (!username || !password) throw new Error('SOCKS5 需要认证');
      const userBytes = new TextEncoder().encode(username);
      const passBytes = new TextEncoder().encode(password);
      const authPacket = new Uint8Array([0x01, userBytes.length, ...userBytes, passBytes.length, ...passBytes]);
      await writer.write(authPacket);
      response = await reader.read();
      if (response.done || new Uint8Array(response.value)[1] !== 0x00) throw new Error('SOCKS5 认证失败');
    } else if (selectedMethod !== 0x00) {
      throw new Error(`SOCKS5 不支持的认证方式: ${selectedMethod}`);
    }

    // CONNECT 请求
    const hostBytes = new TextEncoder().encode(targetHost);
    const connectPacket = new Uint8Array([
      0x05, 0x01, 0x00, 0x03,
      hostBytes.length, ...hostBytes,
      (targetPort >> 8) & 0xff, targetPort & 0xff
    ]);
    await writer.write(connectPacket);

    response = await reader.read();
    if (response.done || new Uint8Array(response.value)[1] !== 0x00) {
      throw new Error('SOCKS5 CONNECT 失败');
    }

    // 发送初始数据
    if (initialData && initialData.byteLength > 0) {
      await writer.write(initialData);
    }

    writer.releaseLock();
    reader.releaseLock();
    return socket;
  } catch (error) {
    try { writer.releaseLock(); } catch {}
    try { reader.releaseLock(); } catch {}
    try { socket.close(); } catch {}
    throw error;
  }
}

/** HTTP/HTTPS CONNECT 连接 */
async function httpConnect(
  targetHost: string,
  targetPort: number,
  initialData: Uint8Array | null,
  useTLS: boolean,
  TCP连接: Function,
  params: Record<string, string>
): Promise<any> {
  const { username, password, hostname, port } = {
    username: params.username || '',
    password: params.password || '',
    hostname: params.hostname || '',
    port: Number(params.port) || (useTLS ? 443 : 80),
  };

  let socket: any;
  if (useTLS) {
    // HTTPS 代理需要 TLS 握手（简化实现）
    socket = TCP连接({ hostname, port });
    await socket.opened;
  } else {
    socket = TCP连接({ hostname, port });
    await socket.opened;
  }

  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  try {
    const auth = username && password ? `Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}\r\n` : '';
    const request = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}User-Agent: Mozilla/5.0\r\nConnection: keep-alive\r\n\r\n`;
    await writer.write(encoder.encode(request));
    writer.releaseLock();

    const reader = socket.readable.getReader();
    let responseBuffer = new Uint8Array(0);
    let headerEndIndex = -1;
    let bytesRead = 0;

    while (headerEndIndex === -1 && bytesRead < 8192) {
      const { done, value } = await reader.read();
      if (done || !value) throw new Error('代理连接关闭');
      const newBuf = new Uint8Array(responseBuffer.byteLength + value.byteLength);
      newBuf.set(responseBuffer);
      newBuf.set(value, responseBuffer.byteLength);
      responseBuffer = newBuf;
      bytesRead = responseBuffer.byteLength;

      // 查找 \r\n\r\n
      for (let i = 0; i <= responseBuffer.byteLength - 4; i++) {
        if (responseBuffer[i] === 0x0d && responseBuffer[i + 1] === 0x0a &&
            responseBuffer[i + 2] === 0x0d && responseBuffer[i + 3] === 0x0a) {
          headerEndIndex = i + 4;
          break;
        }
      }
    }

    if (headerEndIndex === -1) throw new Error('代理响应头过长');

    const statusLine = decoder.decode(responseBuffer.slice(0, headerEndIndex)).split('\r\n')[0];
    const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : NaN;
    if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
      throw new Error(`代理连接失败: HTTP ${statusCode}`);
    }

    reader.releaseLock();

    // 发送初始数据
    if (initialData && initialData.byteLength > 0) {
      const w = socket.writable.getWriter();
      await w.write(initialData);
      w.releaseLock();
    }

    return socket;
  } catch (error) {
    try { writer.releaseLock(); } catch {}
    try { socket.close(); } catch {}
    throw error;
  }
}

/** 双向数据转发 */
export async function relayStreams(dst: any, src: any, respHeader: Uint8Array | null = null): Promise<{ inBytes: number; outBytes: number }> {
  let inBytes = 0, outBytes = 0;

  const copy = async (from: any, to: any, counter: { value: number }, header: Uint8Array | null = null) => {
    try {
      const reader = from.readable.getReader();
      const writer = to.writable.getWriter();
      let first = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          let data = value;
          if (first && header && header.byteLength > 0) {
            const merged = new Uint8Array(header.byteLength + value.byteLength);
            merged.set(header);
            merged.set(value, header.byteLength);
            data = merged;
          }
          first = false;
          await writer.write(data);
          counter.value += data.byteLength;
        }
      }
      reader.releaseLock();
      writer.releaseLock();
    } catch {}
  };

  const srcToDst = copy(src, dst, { value: outBytes }, respHeader);
  const dstToSrc = copy(dst, src, { value: inBytes });

  await Promise.allSettled([srcToDst, dstToSrc]);
  return { inBytes, outBytes };
}
