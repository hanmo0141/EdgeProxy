/**
 * 配置管理器 - KV 读写
 */
import { Config } from './types';
import { log } from '../utils/helpers';

const CONFIG_KEY = 'config.json';
const CF_KEY = 'cf.json';
const TG_KEY = 'tg.json';
const ADD_KEY = 'ADD.txt';
const LOG_KEY = 'log.json';

const DEFAULT_CONFIG: Config = {
  UUID: '00000000-0000-4000-8000-000000000000',
  HOSTS: ['example.com'],
  PATH: '/?(.*?).*',
  协议类型: 'vmess',
  传输协议: 'ws',
  TLS分片: '',
  Fingerprint: 'chrome',
  ECH: false,
  ECHConfig: { SNI: '', DNS: '' },
  启用0RTT: false,
  随机路径: false,
  完整节点路径: '/video/%s?ed=2560',
  首页伪装: 'nginx',
  跳过证书验证: false,
  优选订阅生成: {
    SUB: '',
    SUBNAME: 'EasyTunnel',
    SUBUpdateTime: '12',
    local: true,
    本地IP库: { 随机IP: true, 随机数量: 50, 指定端口: ['443'] },
  },
  订阅转换配置: {
    SUBAPI: 'https://sub.xeton.dev',
    SUBCONFIG: 'https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online.ini',
    SUBEMOJI: 'true',
    SUBLIST: 'false',
    XUDP: 'true',
    UDP: 'true',
    TLS13: 'true',
    APPEND_TYPE: 'true',
    SORT: 'true',
  },
  SS: { TLS: true, 加密方式: 'aes-128-gcm' },
  gRPC模式: 'gun',
  gRPCUserAgent: '',
  CF: { Usage: { success: false, pages: 0, workers: 0, max: 102400 } },
  多用户: [],
};

/** 获取配置（从 KV 或环境变量构建） */
export async function getConfig(env: Env): Promise<Config> {
  let config: Config;

  // 尝试从 KV 读取
  if (env.KV) {
    const stored = await env.KV.get(CONFIG_KEY);
    if (stored) {
      try { config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) }; }
      catch { config = { ...DEFAULT_CONFIG }; }
    } else {
      config = { ...DEFAULT_CONFIG };
      await env.KV.put(CONFIG_KEY, JSON.stringify(config, null, 2));
    }
  } else {
    config = { ...DEFAULT_CONFIG };
  }

  // 环境变量覆盖
  const envUUID = env.UUID || env.uuid;
  if (envUUID) config.UUID = envUUID;
  if (env.HOST) config.HOSTS = env.HOST.split(',').map(h => h.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]);
  if (env.PATH) config.PATH = env.PATH.startsWith('/') ? env.PATH : '/' + env.PATH;

  return config;
}

/** 保存配置到 KV */
export async function saveConfig(env: Env, config: Config): Promise<void> {
  if (!env.KV) return;
  await env.KV.put(CONFIG_KEY, JSON.stringify(config, null, 2));
}

/** 获取 CF 配置 */
export async function getCFConfig(env: Env): Promise<Record<string, string | null>> {
  if (!env.KV) return {};
  const stored = await env.KV.get(CF_KEY);
  return stored ? JSON.parse(stored) : {};
}

/** 保存 CF 配置 */
export async function saveCFConfig(env: Env, data: Record<string, string | null>): Promise<void> {
  if (!env.KV) return;
  await env.KV.put(CF_KEY, JSON.stringify(data, null, 2));
}

/** 获取 TG 配置 */
export async function getTGConfig(env: Env): Promise<{ BotToken: string | null; ChatID: string | null }> {
  if (!env.KV) return { BotToken: null, ChatID: null };
  const stored = await env.KV.get(TG_KEY);
  return stored ? JSON.parse(stored) : { BotToken: null, ChatID: null };
}

/** 保存 TG 配置 */
export async function saveTGConfig(env: Env, data: { BotToken: string | null; ChatID: string | null }): Promise<void> {
  if (!env.KV) return;
  await env.KV.put(TG_KEY, JSON.stringify(data, null, 2));
}

/** 获取自定义优选 IP */
export async function getCustomIPs(env: Env): Promise<string> {
  if (!env.KV) return '';
  return (await env.KV.get(ADD_KEY)) || '';
}

/** 保存自定义优选 IP */
export async function saveCustomIPs(env: Env, ips: string): Promise<void> {
  if (!env.KV) return;
  await env.KV.put(ADD_KEY, ips);
}

/** 获取管理员密码 */
export function getAdminPassword(env: Env): string {
  return env.ADMIN || env.admin || env.PASSWORD || env.password || env.pswd || env.TOKEN || env.KEY || env.UUID || env.uuid || '';
}

/** 获取加密密钥 */
export function getEncryptionKey(env: Env): string {
  return env.KEY || '勿动此默认密钥，有需求请自行通过添加变量KEY进行修改';
}

interface Env {
  KV?: KVNamespace;
  [key: string]: unknown;
}
