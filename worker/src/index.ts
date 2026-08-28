/**
 * EdgeProxy v2.0 - CF Workers 代理隧道
 * 入口文件：请求路由分发
 */
import { handleProxy } from './core/dispatcher';
import { handleAdmin } from './admin/api';
import { handleSubscription } from './subscription/generator';
import { getConfig } from './config/manager';
import { log } from './utils/helpers';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1).toLowerCase();
    const ua = request.headers.get('User-Agent') || '';
    const upgrade = (request.headers.get('Upgrade') || '').toLowerCase();
    const method = request.method;

    // 调试模式
    const debugMode = ['1', 'true'].includes(env.DEBUG);

    // 读取配置
    const config = await getConfig(env);

    // === 版本信息接口 ===
    if (path === 'version') {
      return jsonResponse({ version: '2.0.0', protocol: 'EdgeProxy' });
    }

    // === WebSocket 代理 ===
    if (upgrade === 'websocket') {
      if (debugMode) log(`[WS] ${url.pathname} from ${request.headers.get('CF-Connecting-IP')}`);
      return handleProxy(request, env, ctx, config, 'ws');
    }

    // === gRPC / 叉HTTP 代理 (POST) ===
    if (method === 'POST' && !path.startsWith('admin/') && path !== 'login') {
      const contentType = (request.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/grpc')) {
        if (debugMode) log(`[gRPC] ${url.pathname} from ${request.headers.get('CF-Connecting-IP')}`);
        return handleProxy(request, env, ctx, config, 'grpc');
      }
      if (debugMode) log(`[XHTTP] ${url.pathname} from ${request.headers.get('CF-Connecting-IP')}`);
      return handleProxy(request, env, ctx, config, 'xhttp');
    }

    // === 管理面板 ===
    if (path.startsWith('admin') || path === 'login' || path === 'logout') {
      return handleAdmin(request, env, ctx, config);
    }

    // === 订阅接口 ===
    if (path === 'sub') {
      if (debugMode) log(`[SUB] format=${url.searchParams.get('target') || 'auto'} from ${request.headers.get('CF-Connecting-IP')}`);
      return handleSubscription(request, env, config);
    }

    // === robots.txt ===
    if (path === 'robots.txt') {
      return new Response('User-agent: *\nDisallow: /', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // === HTTP → HTTPS 重定向 ===
    if (url.protocol === 'http:') {
      return Response.redirect(url.href.replace('http://', 'https://'), 301);
    }

    // === 伪装页 / 默认 nginx ===
    const fakePage = env.URL || 'nginx';
    if (fakePage === 'nginx') {
      return new Response(await nginxPage(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 代理到伪装页
    try {
      const fakeUrl = new URL(fakePage.startsWith('http') ? fakePage : `https://${fakePage}`);
      const newHeaders = new Headers(request.headers);
      newHeaders.set('Host', fakeUrl.host);
      newHeaders.set('Referer', fakeUrl.origin);
      const resp = await fetch(fakeUrl.origin + url.pathname + url.search, {
        method: request.method,
        headers: newHeaders,
        body: request.body,
      });
      // 替换域名
      const contentType = resp.headers.get('content-type') || '';
      if (/text|javascript|json|xml/.test(contentType)) {
        const body = (await resp.text()).replaceAll(fakeUrl.host, url.host);
        return new Response(body, { status: resp.status, headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' } });
      }
      return resp;
    } catch {
      return new Response(await nginxPage(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function nginxPage(): Promise<string> {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Welcome to nginx!</title>
  <style>
    body { background-color: #333; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .container { text-align: center; }
    h1 { font-size: 3rem; margin-bottom: 0.5rem; }
    p { color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to nginx!</h1>
    <p>If you see this page, the nginx web server is successfully installed and working.</p>
  </div>
</body>
</html>`;
}

// === 环境变量类型 ===
interface Env {
  KV?: KVNamespace;
  ADMIN?: string;
  admin?: string;
  PASSWORD?: string;
  password?: string;
  pswd?: string;
  TOKEN?: string;
  KEY?: string;
  UUID?: string;
  uuid?: string;
  HOST?: string;
  PATH?: string;
  URL?: string;
  PROXYIP?: string;
  DEBUG?: string;
  BEST_SUB?: string;
  OFF_LOG?: string;
  GO2SOCKS5?: string;
  TCP_CONCURRENT_DIAL?: string;
  PROXY_CONCURRENT_DIAL?: string;
  PRELOAD_RACE_DIAL?: string;
  [key: string]: unknown;
}
