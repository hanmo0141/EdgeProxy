/**
 * 核心调度器 - 协议识别与分发
 */
import { Config, ProxyContext } from '../config/types';
import { log } from '../utils/helpers';
import { handleWebSocket } from '../transport/websocket';
import { handleGRPC } from '../transport/grpc';
import { handleXHTTP } from '../transport/xhttp';

type TransportType = 'ws' | 'grpc' | 'xhttp';

/** 处理代理请求入口 */
export async function handleProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  config: Config,
  transport: TransportType
): Promise<Response> {
  const url = new URL(request.url);
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('True-Client-IP') || 'unknown';
  const colo = (request as any).cf?.colo || 'unknown';

  // 获取反代上下文
  const proxyCtx = await getProxyContext(url, config, env, colo);

  log(`[Dispatcher] transport=${transport} path=${url.pathname} client=${clientIp}`);

  switch (transport) {
    case 'ws':
      return handleWebSocket(request, config, proxyCtx, env);
    case 'grpc':
      return handleGRPC(request, config, proxyCtx, env);
    case 'xhttp':
      return handleXHTTP(request, config, proxyCtx, env);
    default:
      return new Response('Unsupported transport', { status: 400 });
  }
}

/** 获取反代上下文 */
async function getProxyContext(
  url: URL,
  config: Config,
  env: Env,
  colo: string
): Promise<ProxyContext> {
  const 特征码字典 = [
    (env.KEY || 'IP').toUpperCase(),
    'cloudatacdn',
    'loadshare',
  ];

  let 反代IP = `${colo}.${特征码字典[0]}.${特征码字典[1]}SsSs.nEt`.toLowerCase();
  let 反代兜底 = true;

  if (env.PROXYIP) {
    const proxyIPs = env.PROXYIP.split(',').map(s => s.trim()).filter(Boolean);
    反代IP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
    反代兜底 = false;
  }

  return {
    反代IP,
    代理类型: null,
    代理全局: false,
    代理参数: {},
    反代兜底,
    木马反代地址: null,
  };
}

interface Env {
  KV?: KVNamespace;
  KEY?: string;
  PROXYIP?: string;
  [key: string]: unknown;
}
