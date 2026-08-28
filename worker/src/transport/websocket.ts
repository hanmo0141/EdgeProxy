/**
 * WebSocket 传输层
 */
import { Config, ProxyContext } from '../config/types';
import { toUint8Array, concat } from '../utils/binary';
import { base64UrlDecode } from '../utils/encoding';
import { parseVMessRequest, isVMessPacket } from '../protocols/vmess';
import { parseVLESSRequest, isVLESSPacket } from '../protocols/vless';
import { parseTrojanRequest, isTrojanPacket } from '../protocols/trojan';
import { connectToTarget, createTCPConnector, relayStreams } from '../core/router';
import { log } from '../utils/helpers';

const MAX_EARLY_DATA = 8 * 1024;
const MAX_WS_HEADER_LEN = Math.ceil(MAX_EARLY_DATA * 4 / 3) + 4;

/** 处理 WebSocket 代理请求 */
export async function handleWebSocket(
  request: Request,
  config: Config,
  proxyCtx: ProxyContext,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const uuid = config.UUID;
  const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
  const ssMode = !!url.searchParams.get('enc');

  // 创建 WebSocket 对
  const wsPair = new WebSocketPair();
  const [clientSock, serverSock] = Object.values(wsPair);
  (serverSock as any).accept({ allowHalfOpen: true });
  serverSock.binaryType = 'arraybuffer';

  // 连接状态
  let remoteSocket: any = null;
  let isUDP = false;
  let protocolDetected: 'vmess' | 'trojan' | 'ss' | null = null;
  let trojanContext = { 缓存: new Uint8Array(0), 反代地址: proxyCtx.木马反代地址 };

  // SS 模式处理
  if (ssMode) {
    // SS 加密处理（简化：直接转发）
    serverSock.addEventListener('message', async (event) => {
      try {
        const data = toUint8Array(event.data);
        if (!remoteSocket) {
          // 首包：解析 SS 地址
          if (data.byteLength < 3) return;
          const addrType = data[0];
          let cursor = 1;
          let hostname = '';
          let port = 0;

          if (addrType === 1) {
            hostname = `${data[1]}.${data[2]}.${data[3]}.${data[4]}`;
            cursor = 5;
          } else if (addrType === 3) {
            const domainLen = data[1];
            hostname = new TextDecoder().decode(data.subarray(2, 2 + domainLen));
            cursor = 2 + domainLen;
          } else if (addrType === 4) {
            const ipv6: string[] = [];
            for (let i = 0; i < 8; i++) ipv6.push(((data[1 + i * 2] << 8) | data[2 + i * 2]).toString(16));
            hostname = ipv6.join(':');
            cursor = 17;
          }
          port = (data[cursor] << 8) | data[cursor + 1];
          const rawData = data.subarray(cursor + 2);

          remoteSocket = await connectToTarget(hostname, port, rawData, request, proxyCtx, {}, uuid);
          // 双向转发
          relayStreams(remoteSocket, { readable: new ReadableStream({ start(c) { c.close(); } }), writable: serverSock }, null);
          serverSock.send(new Uint8Array([0x05, 0x00]));
          return;
        }
        // 已建立连接，直接转发
        const writer = remoteSocket.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
      } catch (err: any) {
        log(`[WS-SS] 错误: ${err.message}`);
        serverSock.close();
      }
    });
  } else {
    // VMess/Trojan 模式
    const sendQueue: ArrayBuffer[] = [];
    let queueBytes = 0;
    const MAX_QUEUE = 16 * 1024 * 1024;

    const processFirstPacket = async (data: Uint8Array) => {
      // 检测协议（VLESS/VMess 和 Trojan 使用相同的字节模式，VLESS 优先检测）
      if (isVLESSPacket(data, uuid) || isVMessPacket(data, uuid)) {
        // VLESS 和 VMess 使用相同的格式，根据配置选择协议
        const isVless = config.协议类型 === 'vless';
        const result = isVless
          ? parseVLESSRequest(data, uuid)
          : parseVMessRequest(data, uuid);
        if ('hasError' in result) throw new Error(result.message);
        protocolDetected = isVless ? 'vless' : 'vmess';
        log(`[WS] ${isVless ? 'VLESS' : 'VMess'}: ${result.hostname}:${result.port} UDP=${result.isUDP} v=${result.version}`);
        isUDP = result.isUDP;

        if (result.isUDP) {
          await handleDNSForward(result.rawData, serverSock, config, request);
          return;
        }

        remoteSocket = await connectToTarget(
          result.hostname, result.port, result.rawData,
          request, proxyCtx, {}, uuid
        );
        const { outBytes } = await relayStreams(remoteSocket, serverSock, result.respHeader);
      } else if (isTrojanPacket(data)) {
        const result = parseTrojanRequest(data, uuid);
        if ('hasError' in result) throw new Error(result.message);
        protocolDetected = 'trojan';
        log(`[WS] Trojan: ${result.hostname}:${result.port} UDP=${result.isUDP}`);
        isUDP = result.isUDP;

        if (result.isUDP) {
          await handleDNSForward(result.rawData, serverSock, config, request);
          return;
        }

        remoteSocket = await connectToTarget(
          result.hostname, result.port, result.rawData,
          request, proxyCtx, {}, uuid, true, data
        );
        const respHeader = new Uint8Array([0x05, 0x00]);
        const { outBytes } = await relayStreams(remoteSocket, serverSock, respHeader);
      } else {
        throw new Error('无法识别的协议');
      }
    };

    // 处理早期数据（0-RTT）
    if (earlyDataHeader) {
      try {
        const earlyData = decodeEarlyData(earlyDataHeader);
        if (earlyData && earlyData.byteLength > 0) {
          await processFirstPacket(earlyData);
        }
      } catch (err: any) {
        log(`[WS] 早期数据错误: ${err.message}`);
        serverSock.close();
        return new Response(null, { status: 101, webSocket: clientSock });
      }
    }

    // 消息处理
    serverSock.addEventListener('message', async (event) => {
      try {
        if (remoteSocket) {
          // 已建立连接，直接转发
          const writer = remoteSocket.writable.getWriter();
          await writer.write(toUint8Array(event.data));
          writer.releaseLock();
        } else {
          // 首包处理
          await processFirstPacket(toUint8Array(event.data));
        }
      } catch (err: any) {
        log(`[WS] 错误: ${err.message}`);
        serverSock.close();
      }
    });

    serverSock.addEventListener('close', () => {
      try { remoteSocket?.close?.(); } catch {}
    });

    serverSock.addEventListener('error', () => {
      try { remoteSocket?.close?.(); } catch {}
    });
  }

  return new Response(null, {
    status: 101,
    webSocket: clientSock,
    headers: { 'Sec-WebSocket-Extensions': '' },
  });
}

/** 解码早期数据 */
function decodeEarlyData(header: string): Uint8Array | null {
  if (!header) return null;
  let bytes: Uint8Array;

  // 尝试 fromBase64 (新 API)
  if (typeof (Uint8Array as any).fromBase64 === 'function') {
    try {
      bytes = (Uint8Array as any).fromBase64(header, { alphabet: 'base64url' });
    } catch { bytes = null as any; }
  }

  if (!bytes || bytes.byteLength === 0) {
    let normalized = header.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    if (padding) normalized += '='.repeat(4 - padding);
    try {
      const binary = atob(normalized);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch { return null; }
  }

  if (bytes!.byteLength > MAX_EARLY_DATA) throw new Error('Early data too large');
  return bytes!;
}

/** DNS 转发 */
async function handleDNSForward(
  payload: Uint8Array,
  serverSock: WebSocket,
  config: Config,
  request: Request
): Promise<void> {
  const TCP连接 = createTCPConnector(request);
  const socket = TCP连接({ hostname: '8.8.4.4', port: 53 });
  await socket.opened;
  const writer = socket.writable.getWriter();
  await writer.write(payload);
  writer.releaseLock();
  await socket.readable.pipeTo(new WritableStream({
    async write(chunk) {
      if (serverSock.readyState === WebSocket.OPEN) {
        serverSock.send(chunk);
      }
    }
  }));
}

interface Env {
  KV?: KVNamespace;
  [key: string]: unknown;
}
