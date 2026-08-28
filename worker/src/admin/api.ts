/**
 * 管理面板 API
 */
import { Config } from '../config/types';
import { getConfig, saveConfig, getCFConfig, saveCFConfig, getTGConfig, saveTGConfig, getCustomIPs, saveCustomIPs, getAdminPassword, getEncryptionKey } from '../config/manager';
import { verifyAuth, generateAuthCookie, isValidUUID, verifyVersionUUID } from './auth';
import { md5 } from '../utils/crypto';
import { log } from '../utils/helpers';

const PAGES_URL = 'https://hanmo0141.github.io/EdgeProxy';

export async function handleAdmin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  config: Config
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice(1).toLowerCase();
  const method = request.method;
  const adminPassword = getAdminPassword(env);
  const encryptionKey = getEncryptionKey(env);
  const ua = request.headers.get('User-Agent') || '';

  // UUID 从环境变量获取
  const envUUID = env.UUID || env.uuid || '';
  const userID = envUUID || config.UUID;

  // === 版本信息 ===
  if (path === 'version') {
    const reqUUID = (url.searchParams.get('uuid') || '').toLowerCase();
    if (isValidUUID(reqUUID) && verifyVersionUUID(reqUUID, userID.toLowerCase())) {
      return jsonResponse({ Version: 20260811 });
    }
    return jsonResponse({ Version: 0 }, 403);
  }

  // === 登录页面 ===
  if (path === 'login') {
    // 检查是否已登录
    const cookies = request.headers.get('Cookie') || '';
    const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth='))?.split('=')[1];
    if (authCookie === await generateAuthCookie(ua, encryptionKey, adminPassword)) {
      return redirect('/admin');
    }

    // 处理登录 POST
    if (method === 'POST') {
      const formData = await request.text();
      const params = new URLSearchParams(formData);
      const inputPassword = params.get('password');
      if (inputPassword === adminPassword) {
        const cookieValue = await generateAuthCookie(ua, encryptionKey, adminPassword);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `auth=${cookieValue}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`,
          }
        });
      }
      return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return fetch(PAGES_URL + '/login');
  }

  // === 登出 ===
  if (path === 'logout') {
    const resp = redirect('/login');
    resp.headers.set('Set-Cookie', 'auth=; Path=/; Max-Age=0; HttpOnly');
    return resp;
  }

  // === 管理面板（需要认证） ===
  if (!adminPassword) {
    return fetch(PAGES_URL + '/noADMIN');
  }

  const authed = await verifyAuth(request, adminPassword, encryptionKey);
  if (!authed) return redirect('/login');

  // === API 路由 ===
  const apiPath = path.replace('admin/', '');

  // GET 配置
  if (apiPath === 'config.json' && method === 'GET') {
    return jsonResponse(config);
  }

  // POST 保存配置
  if (apiPath === 'config.json' && method === 'POST') {
    try {
      const newConfig = await request.json() as Config;
      if (!newConfig.UUID || !newConfig.HOSTS?.length) {
        return jsonResponse({ error: '配置不完整' }, 400);
      }
      await saveConfig(env, { ...config, ...newConfig });
      return jsonResponse({ success: true, message: '配置已保存' });
    } catch (err: any) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  // 读取日志
  if (apiPath === 'log.json') {
    const logs = env.KV ? (await env.KV.get('log.json') || '[]') : '[]';
    return new Response(logs, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // CF 配置
  if (apiPath === 'cf.json') {
    if (method === 'POST') {
      const data = await request.json() as Record<string, string | null>;
      await saveCFConfig(env, data);
      return jsonResponse({ success: true });
    }
    return jsonResponse(await getCFConfig(env));
  }

  // TG 配置
  if (apiPath === 'tg.json') {
    if (method === 'POST') {
      const data = await request.json() as { BotToken: string | null; ChatID: string | null };
      await saveTGConfig(env, data);
      return jsonResponse({ success: true });
    }
    return jsonResponse(await getTGConfig(env));
  }

  // TG 发送消息
  if (apiPath === 'tg/send') {
    if (method === 'POST') {
      const { message } = await request.json() as { message: string };
      const tgConfig = await getTGConfig(env);
      if (tgConfig.BotToken && tgConfig.ChatID) {
        try {
          await fetch(`https://api.telegram.org/bot${tgConfig.BotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: tgConfig.ChatID, text: message, parse_mode: 'HTML' }),
          });
          return jsonResponse({ success: true });
        } catch (err: any) {
          return jsonResponse({ error: err.message }, 500);
        }
      }
      return jsonResponse({ error: 'Telegram 未配置' }, 400);
    }
  }

  // CF 用量查询
  if (apiPath === 'cf/usage') {
    const cfConfig = await getCFConfig(env);
    try {
      const usage = await getCloudflareUsage(cfConfig);
      return jsonResponse(usage);
    } catch (err: any) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  // 自定义优选 IP
  if (apiPath === 'add.txt') {
    if (method === 'POST') {
      const ips = await request.text();
      await saveCustomIPs(env, ips);
      return jsonResponse({ success: true });
    }
    const ips = await getCustomIPs(env);
    return new Response(ips || 'null', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  // 重置配置
  if (apiPath === 'init') {
    // 删除 KV 中的配置，恢复默认
    if (env.KV) await env.KV.delete('config.json');
    const freshConfig = await getConfig(env);
    return jsonResponse({ success: true, config: freshConfig });
  }

  // 代理检查
  if (apiPath === 'check') {
    const proxyType = ['socks5', 'http', 'https'].find(t => url.searchParams.has(t));
    if (!proxyType) return jsonResponse({ error: '缺少代理参数' }, 400);
    // 简化：只返回成功
    return jsonResponse({ success: true, proxy: `${proxyType}://${url.searchParams.get(proxyType)}` });
  }

  // 页面代理（前端静态资源）
  return fetch(PAGES_URL + '/admin' + url.search);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function redirect(path: string): Response {
  return new Response('重定向中...', { status: 302, headers: { Location: path } });
}

interface Env {
  KV?: KVNamespace;
  UUID?: string;
  uuid?: string;
  [key: string]: unknown;
}

/** 查询 Cloudflare Workers 用量 */
async function getCloudflareUsage(cfConfig: Record<string, string | null>): Promise<any> {
  const { Email, GlobalAPIKey, AccountID, APIToken, UsageAPI } = cfConfig;

  // 方式1: 使用 UsageAPI
  if (UsageAPI) {
    const resp = await fetch(UsageAPI);
    if (resp.ok) return await resp.json();
  }

  // 方式2: 使用 Global API Key
  if (Email && GlobalAPIKey && AccountID) {
    const auth = btoa(`${Email}:${GlobalAPIKey}`);
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${AccountID}/workers/services`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      return {
        success: true,
        pages: data.result?.length || 0,
        workers: data.result?.length || 0,
        max: 100000,
      };
    }
  }

  // 方式3: 使用 API Token
  if (APIToken && AccountID) {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${AccountID}/workers/services`, {
      headers: { 'Authorization': `Bearer ${APIToken}` }
    });
    if (resp.ok) {
      const data = await resp.json() as any;
      return {
        success: true,
        pages: data.result?.length || 0,
        workers: data.result?.length || 0,
        max: 100000,
      };
    }
  }

  return { success: false, message: '未配置 Cloudflare API 凭据' };
}

/** 发送 Telegram 通知 */
export async function sendTelegramNotification(env: Env, message: string): Promise<void> {
  if (!env.KV) return;
  const tgJson = await env.KV.get('tg.json');
  if (!tgJson) return;
  const { BotToken, ChatID } = JSON.parse(tgJson);
  if (!BotToken || !ChatID) return;

  try {
    await fetch(`https://api.telegram.org/bot${BotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ChatID, text: message, parse_mode: 'HTML' }),
    });
  } catch {}
}
