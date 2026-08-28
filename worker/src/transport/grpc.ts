/**
 * gRPC 双向流传输层
 */
import { Config, ProxyContext } from '../config/types';
import { toUint8Array, concat, readUint32 } from '../utils/binary';
import { parseVMessRequest, isVMessPacket } from '../protocols/vmess';
import { parseTrojanRequest, isTrojanPacket } from '../protocols/trojan';
import { connectToTarget, relayStreams } from '../core/router';
import { log } from '../utils/helpers';

/** 处理 gRPC 请求 */
export async function handleGRPC(
  request: Request,
  config: Config,
  proxyCtx: ProxyContext,
  env: Env
): Promise<Response> {
  if (!request.body) return new Response('Bad Request', { status: 400 });

  const reader = request.body.getReader();
  const uuid = config.UUID;
  let remoteSocket: any = null;
  let isDnsQuery = false;
  let 判断是否是木马: boolean | null = null;
  let pending = new Uint8Array(0);

  const grpcHeaders = new Headers({
    'Content-Type': 'application/grpc',
    'grpc-status': '0',
    'X-Accel-Buffering': 'no',
    'Cache-Control': 'no-store',
  });

  return new Response(new ReadableStream({
    async start(controller) {
      let closed = false;

      const grpcBridge = {
        readyState: WebSocket.OPEN,
        send(data: Uint8Array) {
          if (closed) return;
          // 包装为 gRPC 帧
          const lenBytes: number[] = [];
          let remaining = data.byteLength >>> 0;
          while (remaining > 127) { lenBytes.push((remaining & 0x7f) | 0x80); remaining >>>= 7; }
          lenBytes.push(remaining);
          const protobufLen = 1 + lenBytes.length + data.byteLength;
          const frame = new Uint8Array(5 + protobufLen);
          frame[0] = 0;
          frame[1] = (protobufLen >>> 24) & 0xff;
          frame[2] = (protobufLen >>> 16) & 0xff;
          frame[3] = (protobufLen >>> 8) & 0xff;
          frame[4] = protobufLen & 0xff;
          frame[5] = 0x0a;
          frame.set(lenBytes, 6);
          frame.set(data, 6 + lenBytes.length);
          try { controller.enqueue(frame); } catch { closed = true; }
        },
        close() {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch {}
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;

          // 合并数据
          const merged = new Uint8Array(pending.byteLength + value.byteLength);
          merged.set(pending);
          merged.set(toUint8Array(value), pending.byteLength);
          pending = merged;

          // 解析 gRPC 帧
          while (pending.byteLength >= 5) {
            const grpcLen = readUint32(pending, 1);
            const frameSize = 5 + grpcLen;
            if (pending.byteLength < frameSize) break;

            let payload = pending.subarray(5, frameSize);
            pending = pending.slice(frameSize);

            // 去掉 protobuf 头
            if (payload.byteLength >= 2 && payload[0] === 0x0a) {
              let offset = 1;
              let valid = false;
              while (offset < payload.length) {
                if ((payload[offset] & 0x80) === 0) { valid = true; break; }
                offset++;
                if (offset > 5) break;
              }
              if (valid) payload = payload.subarray(offset);
            }

            if (!payload.byteLength) continue;

            // 首包处理
            if (!remoteSocket && !isDnsQuery) {
              const bytes = toUint8Array(payload);

              if (判断是否是木马 === null) {
                判断是否是木马 = bytes.byteLength >= 58 && bytes[56] === 0x0d && bytes[57] === 0x0a;
              }

              if (判断是否是木马) {
                const result = parseTrojanRequest(bytes, uuid);
                if ('hasError' in result) throw new Error(result.message);
                log(`[gRPC] Trojan: ${result.hostname}:${result.port}`);
                isDnsQuery = result.isUDP;

                if (isDnsQuery) {
                  await handleDNSForward(payload, grpcBridge, request);
                } else {
                  remoteSocket = await connectToTarget(
                    result.hostname, result.port, result.rawData,
                    request, proxyCtx, {}, uuid, true, bytes
                  );
                  grpcBridge.send(new Uint8Array([0x05, 0x00]));
                  // 反向转发
                  startRelay(remoteSocket, grpcBridge, null);
                }
              } else {
                判断是否是木马 = false;
                const result = parseVMessRequest(bytes, uuid);
                if ('hasError' in result) throw new Error(result.message);
                log(`[gRPC] VMess: ${result.hostname}:${result.port}`);
                isDnsQuery = result.isUDP;

                if (isDnsQuery) {
                  await handleDNSForward(payload, grpcBridge, request);
                } else {
                  remoteSocket = await connectToTarget(
                    result.hostname, result.port, result.rawData,
                    request, proxyCtx, {}, uuid
                  );
                  grpcBridge.send(result.respHeader);
                  startRelay(remoteSocket, grpcBridge, null);
                }
              }
            } else if (remoteSocket) {
              // 已建立连接，转发数据
              const writer = remoteSocket.writable.getWriter();
              await writer.write(payload);
              writer.releaseLock();
            } else if (isDnsQuery) {
              await handleDNSForward(payload, grpcBridge, request);
            }
          }
        }
      } catch (err: any) {
        log(`[gRPC] 错误: ${err.message}`);
      } finally {
        try { remoteSocket?.close?.(); } catch {}
        grpcBridge.close();
      }
    },
    cancel() {
      try { remoteSocket?.close?.(); } catch {}
    }
  }), { status: 200, headers: grpcHeaders });
}

/** 反向转发（远端 → 客户端） */
function startRelay(remoteSocket: any, bridge: { send(data: Uint8Array): void; close(): void }, respHeader: Uint8Array | null) {
  (async () => {
    try {
      const reader = remoteSocket.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) bridge.send(toUint8Array(value));
      }
      reader.releaseLock();
    } catch {}
  })();
}

/** DNS 转发 */
async function handleDNSForward(payload: Uint8Array, bridge: { send(data: Uint8Array): void }, request: Request) {
  const TCP连接 = (request as any).fetcher.connect;
  if (!TCP连接) return;
  const socket = TCP连接({ hostname: '8.8.4.4', port: 53 });
  await socket.opened;
  const writer = socket.writable.getWriter();
  await writer.write(payload);
  writer.releaseLock();
  const reader = socket.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) bridge.send(toUint8Array(value));
  }
  reader.releaseLock();
  socket.close();
}

interface Env {
  KV?: KVNamespace;
  [key: string]: unknown;
}
