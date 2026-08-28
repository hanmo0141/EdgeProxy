/**
 * EasyTunnel - CF Workers 代理隧道
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

    // 读取配置
    const config = await getConfig(env);

    // === 版本信息接口 ===
    if (path === 'version') {
      return jsonResponse({ version: '2.0.0' });
    }

    // === WebSocket 代理 ===
    if (upgrade === 'websocket') {
      return handleProxy(request, env, ctx, config, 'ws');
    }

    // === gRPC / 叉HTTP 代理 (POST) ===
    if (method === 'POST' && !path.startsWith('admin/') && path !== 'login') {
      const contentType = (request.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/grpc')) {
        return handleProxy(request, env, ctx, config, 'grpc');
      }
      return handleProxy(request, env, ctx, config, 'xhttp');
    }

    // === 管理面板 ===
    if (path.startsWith('admin') || path === 'login' || path === 'logout') {
      return handleAdmin(request, env, ctx, config);
    }

    // === 订阅接口 ===
    if (path === 'sub') {
      return handleSubscription(request, env, config);
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
      const resp = await fetch(fakeUrl.origin + url.pathname + url.search, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: request.body,
      });
      return resp;
    } catch {
      return new Response(await nginxPage(), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  }
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function nginxPage(): Promise<string> {
  return `<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body><center><h1>403 Forbidden</h1></center><hr><center>nginx</center></body></html>`;
}

// === 环境变量类型 ===
interface Env {
  KV?: KVNamespace;
  ADMIN?: string;
  KEY?: string;
  UUID?: string;
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
}
