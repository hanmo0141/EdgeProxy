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

  // 获取反代上下文（支持动态切换）
  const proxyCtx = getProxyContext(url, config, env, colo);

  log(`[Dispatcher] transport=${transport} path=${url.pathname} client=${clientIp} proxy=${proxyCtx.代理类型 || 'direct'}`);

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

/** 获取反代上下文（支持 URL 参数动态切换） */
function getProxyContext(
  url: URL,
  config: Config,
  env: Env,
  colo: string
): ProxyContext {
  const 特征码字典 = [
    (env.KEY || 'IP').toUpperCase(),
    'cloudatacdn',
    'loadshare',
  ];

  let 反代IP = `${colo}.${特征码字典[0]}.${特征码字典[1]}SsSs.nEt`.toLowerCase();
  let 反代兜底 = true;
  let 代理类型: string | null = null;
  let 代理全局 = false;
  let 代理参数: Record<string, string> = {};

  // 环境变量 PROXYIP
  if (env.PROXYIP) {
    const proxyIPs = env.PROXYIP.split(',').map(s => s.trim()).filter(Boolean);
    反代IP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
    反代兜底 = false;
  }

  // URL 参数动态切换代理
  // 支持: /video/path?proxyip=1.2.3.4
  // 支持: /video/path?socks5=user:pass@host:port
  // 支持: /video/path?http=user:pass@host:port
  // 支持: /video/path?https=user:pass@host:port
  const proxyParam = url.searchParams.get('proxyip');
  const socks5Param = url.searchParams.get('socks5');
  const httpParam = url.searchParams.get('http');
  const httpsParam = url.searchParams.get('https');

  if (proxyParam) {
    反代IP = proxyParam;
    反代兜底 = false;
    log(`[Dispatcher] 动态 ProxyIP: ${proxyParam}`);
  } else if (socks5Param) {
    const parsed = parseProxyParam(socks5Param);
    代理类型 = 'socks5';
    代理参数 = parsed;
    log(`[Dispatcher] 动态 SOCKS5: ${parsed.hostname}:${parsed.port}`);
  } else if (httpParam) {
    const parsed = parseProxyParam(httpParam);
    代理类型 = 'http';
    代理参数 = parsed;
    log(`[Dispatcher] 动态 HTTP: ${parsed.hostname}:${parsed.port}`);
  } else if (httpsParam) {
    const parsed = parseProxyParam(httpsParam);
    代理类型 = 'https';
    代理参数 = parsed;
    log(`[Dispatcher] 动态 HTTPS: ${parsed.hostname}:${parsed.port}`);
  }

  // 环境变量链式代理（全局）
  if (!代理类型 && env.GO2SOCKS5) {
    // GO2SOCKS5 白名单域名走 SOCKS5
    // 具体判断在 router 中处理
  }

  return {
    反代IP,
    代理类型,
    代理全局,
    代理参数,
    反代兜底,
    木马反代地址: null,
  };
}

/** 解析代理参数 user:pass@host:port 或 host:port */
function parseProxyParam(param: string): Record<string, string> {
  let hostname = '', port = '0', username = '', password = '';

  // user:pass@host:port
  const atIndex = param.indexOf('@');
  if (atIndex !== -1) {
    const userInfo = param.slice(0, atIndex);
    const hostPort = param.slice(atIndex + 1);
    const colonIndex = userInfo.indexOf(':');
    if (colonIndex !== -1) {
      username = userInfo.slice(0, colonIndex);
      password = userInfo.slice(colonIndex + 1);
    } else {
      username = userInfo;
    }
    const parts = hostPort.split(':');
    hostname = parts[0];
    port = parts[1] || '1080';
  } else {
    // host:port
    const parts = param.split(':');
    hostname = parts[0];
    port = parts[1] || '1080';
  }

  return { hostname, port, username, password };
}

interface Env {
  KV?: KVNamespace;
  KEY?: string;
  PROXYIP?: string;
  GO2SOCKS5?: string;
  [key: string]: unknown;
}
