/**
 * 叉HTTP (XHTTP) 传输层
 */
import { Config, ProxyContext } from '../config/types';
import { toUint8Array } from '../utils/binary';
import { parseVMessRequest, isVMessPacket } from '../protocols/vmess';
import { parseTrojanRequest, isTrojanPacket } from '../protocols/trojan';
import { connectToTarget, relayStreams } from '../core/router';
import { log } from '../utils/helpers';

/** 处理叉HTTP请求 */
export async function handleXHTTP(
  request: Request,
  config: Config,
  proxyCtx: ProxyContext,
  env: Env
): Promise<Response> {
  if (!request.body) return new Response('Bad Request', { status: 400 });

  const uuid = config.UUID;
  const reader = request.body.getReader();

  // 读取首包识别协议
  const firstPacket = await readFirstPacket(reader);
  if (!firstPacket) return new Response('Invalid request', { status: 400 });

  // 测速站点本地处理
  let targetHost = '';
  if (isSpeedTestSite(firstPacket.hostname)) {
    return new Response(buildLocal204(firstPacket.respHeader), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-store',
      }
    });
  }

  const responseHeaders = new Headers({
    'Content-Type': 'application/octet-stream',
    'X-Accel-Buffering': 'no',
    'Cache-Control': 'no-store',
  });

  try {
    // 建立连接
    const remoteSocket = await connectToTarget(
      firstPacket.hostname, firstPacket.port, firstPacket.rawData,
      request, proxyCtx, {}, uuid,
      firstPacket.protocol === 'trojan', firstPacket.rawFullData
    );

    if (!remoteSocket) return new Response('Bad Gateway', { status: 502 });

    // 双向流
    const upDone = relayUpstream(reader, remoteSocket);
    const downDone = relayDownstream(remoteSocket, responseHeaders, firstPacket.respHeader);

    await Promise.allSettled([upDone, downDone]);

    return new Response(downDone.readable, { status: 200, headers: responseHeaders });
  } catch (err: any) {
    log(`[XHTTP] 错误: ${err.message}`);
    return new Response('Bad Gateway', { status: 502 });
  }
}

/** 读取首包识别协议 */
async function readFirstPacket(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let buffer = new Uint8Array(1024);
  let offset = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done && offset === 0) return null;
    if (done) break;

    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (offset + chunk.byteLength > buffer.byteLength) {
      const newBuf = new Uint8Array(Math.max(buffer.byteLength * 2, offset + chunk.byteLength));
      newBuf.set(buffer.subarray(0, offset));
      buffer = newBuf;
    }
    buffer.set(chunk, offset);
    offset += chunk.byteLength;

    const data = buffer.subarray(0, offset);

    // 尝试 Trojan
    if (isTrojanPacket(data)) {
      const result = parseTrojanRequest(data, 'placeholder');
      if (!('hasError' in result)) {
        return { ...result, protocol: 'trojan' as const, rawFullData: data, respHeader: null };
      }
    }

    // 尝试 VMess
    if (isVMessPacket(data, '00000000-0000-4000-8000-000000000000')) {
      // 需要真实 UUID，这里用占位
      return {
        hostname: '', port: 0, isUDP: false, version: 0,
        rawData: data, protocol: 'vmess' as const, rawFullData: data,
        respHeader: new Uint8Array([0, 0]),
      };
    }
  }

  return null;
}

/** 上行转发 */
async function relayUpstream(reader: ReadableStreamDefaultReader<Uint8Array>, remoteSocket: any) {
  try {
    const writer = remoteSocket.writable.getWriter();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) await writer.write(toUint8Array(value));
    }
    writer.releaseLock();
  } catch {}
}

/** 下行转发 */
function relayDownstream(remoteSocket: any, responseHeaders: Headers, respHeader: Uint8Array | null) {
  const transform = new TransformStream();
  (async () => {
    const writer = transform.writable.getWriter();
    try {
      if (respHeader && respHeader.byteLength > 0) await writer.write(respHeader);
    } catch { return; }
    try { writer.releaseLock(); } catch {}
    await remoteSocket.readable.pipeTo(transform.writable);
  })();
  return transform;
}

function isSpeedTestSite(hostname: string): boolean {
  const domains = ['speed.cloudflare.com', 'cp.cloudflare.com'];
  hostname = hostname.toLowerCase();
  return domains.some(d => hostname === d || hostname.endsWith('.' + d));
}

function buildLocal204(respHeader: Uint8Array | null): Uint8Array {
  const body = new TextEncoder().encode(
    'HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
  );
  if (!respHeader || respHeader.byteLength === 0) return body;
  const result = new Uint8Array(respHeader.byteLength + body.byteLength);
  result.set(respHeader, 0);
  result.set(body, respHeader.byteLength);
  return result;
}
