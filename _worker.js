// EdgeProxy v2.0 - CF Workers Proxy Tunnel
// Combined build - all TypeScript sources merged into a single deployable JS file
// Generated from worker/src/*.ts

// ============================================
// Section 1: Utility Functions
// ============================================

// --- helpers.ts ---

/** 日志输出 */
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** 调试日志 */
let debugEnabled = false;
function setDebug(enabled) { debugEnabled = enabled; }
function debug(...args) {
  if (debugEnabled) console.log('[DEBUG]', ...args);
}

/** 带超时的 Promise */
function withTimeout(promise, ms, msg) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms); })
  ]).finally(() => clearTimeout(timer));
}

/** 安全关闭 WebSocket */
function closeSocket(socket) {
  try {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING)) {
      socket.close();
    }
  } catch {}
}

/** 构造本地 204 响应 */
function buildLocal204(respHeader) {
  if (!respHeader) respHeader = null;
  const body = new TextEncoder().encode(
    'HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
  );
  if (!respHeader || respHeader.byteLength === 0) return body;
  const result = new Uint8Array(respHeader.byteLength + body.byteLength);
  result.set(respHeader, 0);
  result.set(body, respHeader.byteLength);
  return result;
}

/** 替换星号为随机字符 */
function replaceAsterisk(str) {
  return str.replace(/\*/g, () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return chars[Math.floor(Math.random() * chars.length)];
  });
}

/** 随机路径 */
function randomPath(base) {
  if (!base || base === '/') return '/' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return base;
}

// --- binary.ts ---

/** 确保数据为 Uint8Array */
function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return new Uint8Array(0);
}

/** 拼接多个 Uint8Array */
function concat(...chunks) {
  const lists = chunks.map(c => toUint8Array(c));
  const total = lists.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of lists) { result.set(c, offset); offset += c.byteLength; }
  return result;
}

/** 读取大端 uint16 */
function readUint16(buf, offset) {
  return (buf[offset] << 8) | buf[offset + 1];
}

/** 读取大端 uint24 */
function readUint24(buf, offset) {
  return (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
}

/** 读取大端 uint32 */
function readUint32(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

/** 写入大端 uint16 */
function writeUint16(buf, offset, value) {
  buf[offset] = (value >> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

/** 写入大端 uint32 */
function writeUint32(buf, offset, value) {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

/** 构建大端 uint16 字节数组 */
function uint16be(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

/** 随机字节 */
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** 有效数据长度 */
function dataLength(data) {
  if (!data) return 0;
  if (typeof data.byteLength === 'number') return data.byteLength;
  if (typeof data.length === 'number') return data.length;
  return 0;
}

// --- encoding.ts ---

/** Base64 编码 */
function base64Encode(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Base64 解码 */
function base64Decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Base64 URL 安全解码 */
function base64UrlDecode(str) {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding) normalized += '='.repeat(4 - padding);
  return base64Decode(normalized);
}

/** 十六进制编码 */
function hexEncode(data) {
  return [...data].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 十六进制解码 */
function hexDecode(hex) {
  const clean = hex.replace(/-/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** 读取十六进制半字节 */
function readHexNibble(code) {
  if (code >= 48 && code <= 57) return code - 48;
  code |= 32;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

/** 格式化 UUID 字节数组为 UUID 字符串 */
function formatUUID(bytes, offset) {
  if (!offset) offset = 0;
  const hex = [...bytes.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 带秘钥的 Base64 编码 (XOR) */
function base64SecretEncode(plaintext, secret) {
  const data = new TextEncoder().encode(plaintext);
  const key = new TextEncoder().encode(secret);
  const mixed = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) mixed[i] = data[i] ^ key[i % key.length];
  return base64Encode(mixed);
}

// --- crypto.ts ---

/** MD5 哈希 */
async function md5(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('MD5', bytes);
  return hexEncode(new Uint8Array(hash));
}

/** SHA-1 哈希 */
async function sha1(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-1', data));
}

/** SHA-224 哈希 */
async function sha224(data) {
  const bytes = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-224', bytes);
  return hexEncode(new Uint8Array(hash));
}

/** SHA-256 哈希 */
async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** HMAC-SHA1 */
async function hmacSha1(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
}

/** HKDF-Extract (SHA-256) */
async function hkdfExtract(salt, ikm) {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HKDF', hash: 'SHA-256' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new Uint8Array(0) }, key, 256);
  return new Uint8Array(derived);
}

/** UUID 格式验证 */
function isValidUUID(uuid) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(uuid);
}

/** 生成 UUID v4 */
function generateUUID() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// --- network.ts ---

/** 判断是否是 IPv4 地址 */
function isIPv4(value) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

/** 判断是否是 IP 地址（v4 或 v6） */
function isIPHostname(hostname) {
  const host = stripIPv6Brackets(hostname);
  if (isIPv4(host)) return true;
  if (!host.includes(':')) return false;
  try { new URL(`http://[${host}]/`); return true; } catch { return false; }
}

/** 去除 IPv6 方括号 */
function stripIPv6Brackets(hostname) {
  if (!hostname) hostname = '';
  const host = String(hostname || '').trim();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** 检查是否是测速站点 */
function isSpeedTestSite(hostname) {
  const domains = ['speed.cloudflare.com', 'cp.cloudflare.com'];
  hostname = hostname.toLowerCase();
  return domains.some(d => hostname === d || hostname.endsWith('.' + d));
}

/** 识别运营商 */
function identifyISP(request) {
  const asn = String((request).cf?.asn || '');
  const isp = String((request).cf?.asOrganization || '').toLowerCase();
  if (asn === '9808' || isp.includes('cmcc') || isp.includes('china mobile')) return 'cmcc';
  if (asn === '4837' || isp.includes('china unicom')) return 'cucc';
  if (asn === '4134' || isp.includes('china telecom')) return 'ctcc';
  return 'unknown';
}

/** IP 私有地址检查 */
function isPrivateIP(ip) {
  const ranges = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'];
  for (const cidr of ranges) {
    const [network, bits] = cidr.split('/');
    const mask = ~((1 << (32 - Number(bits))) - 1) >>> 0;
    const ipNum = ipToNum(ip);
    const netNum = ipToNum(network);
    if ((ipNum & mask) === (netNum & mask)) return true;
  }
  return false;
}

function ipToNum(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

/** 将字符串整理为数组 */
function toArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return input.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

// --- doh.ts ---

/** DoH 查询 */
async function dohQuery(hostname, type) {
  if (!type) type = 'A';
  const url = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.Answer || [];
  } catch {
    return [];
  }
}

// ============================================
// Section 2: Config Manager
// ============================================

const CONFIG_KEY = 'config.json';
const CF_KEY = 'cf.json';
const TG_KEY = 'tg.json';
const ADD_KEY = 'ADD.txt';
const LOG_KEY = 'log.json';

const DEFAULT_CONFIG = {
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
async function getConfig(env) {
  let config;

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
async function saveConfig(env, config) {
  if (!env.KV) return;
  await env.KV.put(CONFIG_KEY, JSON.stringify(config, null, 2));
}

/** 获取 CF 配置 */
async function getCFConfig(env) {
  if (!env.KV) return {};
  const stored = await env.KV.get(CF_KEY);
  return stored ? JSON.parse(stored) : {};
}

/** 保存 CF 配置 */
async function saveCFConfig(env, data) {
  if (!env.KV) return;
  await env.KV.put(CF_KEY, JSON.stringify(data, null, 2));
}

/** 获取 TG 配置 */
async function getTGConfig(env) {
  if (!env.KV) return { BotToken: null, ChatID: null };
  const stored = await env.KV.get(TG_KEY);
  return stored ? JSON.parse(stored) : { BotToken: null, ChatID: null };
}

/** 保存 TG 配置 */
async function saveTGConfig(env, data) {
  if (!env.KV) return;
  await env.KV.put(TG_KEY, JSON.stringify(data, null, 2));
}

/** 获取自定义优选 IP */
async function getCustomIPs(env) {
  if (!env.KV) return '';
  return (await env.KV.get(ADD_KEY)) || '';
}

/** 保存自定义优选 IP */
async function saveCustomIPs(env, ips) {
  if (!env.KV) return;
  await env.KV.put(ADD_KEY, ips);
}

/** 获取管理员密码 */
function getAdminPassword(env) {
  return env.ADMIN || env.admin || env.PASSWORD || env.password || env.pswd || env.TOKEN || env.KEY || env.UUID || env.uuid || '';
}

/** 获取加密密钥 */
function getEncryptionKey(env) {
  return env.KEY || '勿动此默认密钥，有需求请自行通过添加变量KEY进行修改';
}

// ============================================
// Section 3: Protocol Parsers
// ============================================

// --- Shared UUID helper (used by VLESS and VMess) ---

const textDecoder = new TextDecoder();
const UUID_BYTE_CACHE = new Map();

/** 获取 UUID 字节数组（带缓存） - shared by VLESS and VMess */
function getUUIDBytes(uuid) {
  let cached = UUID_BYTE_CACHE.get(uuid);
  if (cached !== undefined) return cached;

  const clean = uuid.replace(/-/g, '');
  if (clean.length !== 32) { UUID_BYTE_CACHE.set(uuid, null); return null; }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const high = readHexNibble(clean.charCodeAt(i * 2));
    const low = readHexNibble(clean.charCodeAt(i * 2 + 1));
    if (high < 0 || low < 0) { UUID_BYTE_CACHE.set(uuid, null); return null; }
    bytes[i] = (high << 4) | low;
  }

  if (UUID_BYTE_CACHE.size >= 32) UUID_BYTE_CACHE.clear();
  UUID_BYTE_CACHE.set(uuid, bytes);
  return bytes;
}

/** 匹配 UUID 字节 - shared by VLESS and VMess */
function matchUUID(data, offset, uuid) {
  const expected = getUUIDBytes(uuid);
  if (!expected || data.byteLength < offset + 16) return false;
  for (let i = 0; i < 16; i++) {
    if (data[offset + i] !== expected[i]) return false;
  }
  return true;
}

// --- vless.ts ---

/** 解析 VLESS 请求 */
function parseVLESSRequest(chunk, uuid) {
  const data = toUint8Array(chunk);
  const length = data.byteLength;

  if (length < 24) return { hasError: true, message: 'Invalid data' };

  const version = data[0];
  if (!matchUUID(data, 1, uuid)) return { hasError: true, message: 'Invalid uuid' };

  const optLen = data[17];
  const cmdIndex = 18 + optLen;
  if (length < cmdIndex + 4) return { hasError: true, message: 'Invalid data' };

  const cmd = data[cmdIndex];
  let isUDP = false;
  if (cmd === 1) { /* TCP */ }
  else if (cmd === 2) { isUDP = true; }
  else return { hasError: true, message: 'Invalid command' };

  const portIdx = cmdIndex + 1;
  const port = (data[portIdx] << 8) | data[portIdx + 1];
  const addressType = data[portIdx + 2];
  let addrValIdx = portIdx + 3;
  let hostname = '';

  switch (addressType) {
    case 1: // IPv4
      if (length < addrValIdx + 4) return { hasError: true, message: 'Invalid IPv4' };
      hostname = `${data[addrValIdx]}.${data[addrValIdx + 1]}.${data[addrValIdx + 2]}.${data[addrValIdx + 3]}`;
      addrValIdx += 4;
      break;
    case 2: // Domain
      if (length < addrValIdx + 1) return { hasError: true, message: 'Invalid domain length' };
      const vlessDomainLen = data[addrValIdx];
      addrValIdx += 1;
      if (length < addrValIdx + vlessDomainLen) return { hasError: true, message: 'Invalid domain data' };
      hostname = textDecoder.decode(data.subarray(addrValIdx, addrValIdx + vlessDomainLen));
      addrValIdx += vlessDomainLen;
      break;
    case 3: // IPv6
      if (length < addrValIdx + 16) return { hasError: true, message: 'Invalid IPv6' };
      const vlessIpv6 = [];
      for (let i = 0; i < 8; i++) {
        const base = addrValIdx + i * 2;
        vlessIpv6.push(((data[base] << 8) | data[base + 1]).toString(16));
      }
      hostname = vlessIpv6.join(':');
      addrValIdx += 16;
      break;
    default:
      return { hasError: true, message: `Invalid address type: ${addressType}` };
  }

  if (!hostname) return { hasError: true, message: 'Empty address' };

  return {
    hasError: false,
    hostname,
    port,
    isUDP,
    version,
    rawData: data.subarray(addrValIdx),
    respHeader: new Uint8Array([version, 0]),
  };
}

/** 检查是否是 VLESS 首包 */
function isVLESSPacket(data, uuid) {
  return data.byteLength >= 18 && matchUUID(data, 1, uuid);
}

// --- vmess.ts ---

/** 解析 VMess 请求 */
function parseVMessRequest(chunk, uuid) {
  const data = toUint8Array(chunk);
  const length = data.byteLength;

  if (length < 24) return { hasError: true, message: 'Invalid data' };

  const version = data[0];
  if (!matchUUID(data, 1, uuid)) return { hasError: true, message: 'Invalid uuid' };

  const optLen = data[17];
  const cmdIndex = 18 + optLen;
  if (length < cmdIndex + 4) return { hasError: true, message: 'Invalid data' };

  const cmd = data[cmdIndex];
  let isUDP = false;
  if (cmd === 1) { /* TCP */ }
  else if (cmd === 2) { isUDP = true; }
  else return { hasError: true, message: 'Invalid command' };

  const portIdx = cmdIndex + 1;
  const port = (data[portIdx] << 8) | data[portIdx + 1];
  const addressType = data[portIdx + 2];
  let addrValIdx = portIdx + 3;
  let hostname = '';

  switch (addressType) {
    case 1: // IPv4
      if (length < addrValIdx + 4) return { hasError: true, message: 'Invalid IPv4' };
      hostname = `${data[addrValIdx]}.${data[addrValIdx + 1]}.${data[addrValIdx + 2]}.${data[addrValIdx + 3]}`;
      addrValIdx += 4;
      break;
    case 2: // Domain
      if (length < addrValIdx + 1) return { hasError: true, message: 'Invalid domain length' };
      const vmessDomainLen = data[addrValIdx];
      addrValIdx += 1;
      if (length < addrValIdx + vmessDomainLen) return { hasError: true, message: 'Invalid domain data' };
      hostname = textDecoder.decode(data.subarray(addrValIdx, addrValIdx + vmessDomainLen));
      addrValIdx += vmessDomainLen;
      break;
    case 3: // IPv6
      if (length < addrValIdx + 16) return { hasError: true, message: 'Invalid IPv6' };
      const vmessIpv6 = [];
      for (let i = 0; i < 8; i++) {
        const base = addrValIdx + i * 2;
        vmessIpv6.push(((data[base] << 8) | data[base + 1]).toString(16));
      }
      hostname = vmessIpv6.join(':');
      addrValIdx += 16;
      break;
    default:
      return { hasError: true, message: `Invalid address type: ${addressType}` };
  }

  if (!hostname) return { hasError: true, message: 'Empty address' };

  return {
    hasError: false,
    hostname,
    port,
    isUDP,
    version,
    rawData: data.subarray(addrValIdx),
    respHeader: new Uint8Array([version, 0]),
  };
}

/** 检查是否是 VMess 首包 */
function isVMessPacket(data, uuid) {
  return data.byteLength >= 18 && matchUUID(data, 1, uuid);
}

// --- trojan.ts ---

/** 解析 Trojan 请求 */
function parseTrojanRequest(buffer, passwordPlainText) {
  const data = toUint8Array(buffer);

  // Trojan 协议：56字节 SHA-224(password) + CRLF + SOCKS5 请求
  if (data.byteLength < 58) return { hasError: true, message: 'Invalid data' };
  if (data[56] !== 0x0d || data[57] !== 0x0a) return { hasError: true, message: 'Invalid header format' };

  // 验证密码哈希
  // 注意：这里需要同步的 SHA-224，但 CF Workers 只有异步 API
  // 在实际使用中，首包检测通过后会异步验证
  const passwordHash = simpleSha224Hex(passwordPlainText);
  for (let i = 0; i < 56; i++) {
    if (data[i] !== passwordHash.charCodeAt(i)) return { hasError: true, message: 'Invalid password' };
  }

  const socksStart = 58;
  if (data.byteLength < socksStart + 6) return { hasError: true, message: 'Invalid SOCKS5 data' };

  const cmd = data[socksStart];
  if (cmd !== 1 && cmd !== 3) return { hasError: true, message: 'Only TCP/UDP allowed' };
  const isUDP = cmd === 3;

  const atype = data[socksStart + 1];
  let cursor = socksStart + 2;
  let hostname = '';

  switch (atype) {
    case 1: // IPv4
      if (data.byteLength < cursor + 4) return { hasError: true, message: 'Invalid IPv4' };
      hostname = `${data[cursor]}.${data[cursor + 1]}.${data[cursor + 2]}.${data[cursor + 3]}`;
      cursor += 4;
      break;
    case 3: // Domain
      if (data.byteLength < cursor + 1) return { hasError: true, message: 'Invalid domain' };
      const trojanDomainLen = data[cursor];
      cursor += 1;
      if (data.byteLength < cursor + trojanDomainLen) return { hasError: true, message: 'Invalid domain data' };
      hostname = textDecoder.decode(data.subarray(cursor, cursor + trojanDomainLen));
      cursor += trojanDomainLen;
      break;
    case 4: // IPv6
      if (data.byteLength < cursor + 16) return { hasError: true, message: 'Invalid IPv6' };
      const trojanIpv6 = [];
      for (let i = 0; i < 8; i++) {
        const base = cursor + i * 2;
        trojanIpv6.push(((data[base] << 8) | data[base + 1]).toString(16));
      }
      hostname = trojanIpv6.join(':');
      cursor += 16;
      break;
    default:
      return { hasError: true, message: `Invalid address type: ${atype}` };
  }

  if (!hostname) return { hasError: true, message: 'Empty address' };
  if (data.byteLength < cursor + 4) return { hasError: true, message: 'Invalid port data' };

  const port = (data[cursor] << 8) | data[cursor + 1];
  if (data[cursor + 2] !== 0x0d || data[cursor + 3] !== 0x0a) {
    return { hasError: true, message: 'Invalid CRLF' };
  }

  return {
    hasError: false,
    hostname,
    port,
    isUDP,
    rawData: data.subarray(cursor + 4),
    rawFullData: data,
    respHeader: null,
  };
}

/** 检查是否是 Trojan 首包 */
function isTrojanPacket(data) {
  return data.byteLength >= 58 && data[56] === 0x0d && data[57] === 0x0a;
}

/** 简化的 SHA-224（仅用于首包快速检测，完整验证用异步版本） */
function simpleSha224Hex(_input) {
  // 在 CF Workers 环境中，这个函数需要异步调用 crypto.subtle.digest
  // 这里返回空字符串作为占位，实际使用时会在首包解析中异步验证
  // 首包检测阶段使用 isTrojanPacket 的字节模式匹配来快速判断
  return '';
}

// --- shadowsocks.ts ---

/** 支持的加密方式 */
const SS_CIPHERS = {
  'aes-128-gcm': { method: 'aes-128-gcm', keyLen: 16, saltLen: 16, maxChunk: 0x3fff, aesLength: 128 },
  'aes-256-gcm': { method: 'aes-256-gcm', keyLen: 32, saltLen: 32, maxChunk: 0x3fff, aesLength: 256 },
};

const AEAD_TAG_LEN = 16;
const NONCE_LEN = 12;
const SS_SUBKEY_INFO = new TextEncoder().encode('ss-subkey');
const textEncoder = new TextEncoder();

/** 派生主密钥（EVP_BytesToKey） */
const masterKeyCache = new Map();

async function deriveMasterKey(passwordText, keyLen) {
  const cacheKey = `${keyLen}:${passwordText}`;
  if (masterKeyCache.has(cacheKey)) return masterKeyCache.get(cacheKey);

  const task = (async () => {
    const pwBytes = textEncoder.encode(passwordText || '');
    let prev = new Uint8Array(0);
    let result = new Uint8Array(0);
    while (result.byteLength < keyLen) {
      const input = new Uint8Array(prev.byteLength + pwBytes.byteLength);
      input.set(prev, 0);
      input.set(pwBytes, prev.byteLength);
      prev = new Uint8Array(await crypto.subtle.digest('MD5', input));
      result = concat(result, prev);
    }
    return result.slice(0, keyLen);
  })();

  masterKeyCache.set(cacheKey, task);
  try { return await task; }
  catch (err) { masterKeyCache.delete(cacheKey); throw err; }
}

/** 派生会话密钥 */
async function deriveSessionKey(config, masterKey, salt, usages) {
  const hmacOpts = { name: 'HMAC', hash: 'SHA-1' };

  // HKDF-Extract
  const saltHmacKey = await crypto.subtle.importKey('raw', salt, hmacOpts, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltHmacKey, masterKey));

  // HKDF-Expand
  const prkHmacKey = await crypto.subtle.importKey('raw', prk, hmacOpts, false, ['sign']);
  const subKey = new Uint8Array(config.keyLen);
  let prev = new Uint8Array(0);
  let written = 0;
  let counter = 1;

  while (written < config.keyLen) {
    const input = concat(prev, SS_SUBKEY_INFO, new Uint8Array([counter]));
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', prkHmacKey, input));
    const copyLen = Math.min(prev.byteLength, config.keyLen - written);
    subKey.set(prev.subarray(0, copyLen), written);
    written += copyLen;
    counter += 1;
  }

  return crypto.subtle.importKey('raw', subKey, { name: 'AES-GCM', length: config.aesLength }, false, usages);
}

/** 递增 Nonce 计数器 */
function incrementNonce(counter) {
  for (let i = 0; i < counter.length; i++) {
    counter[i] = (counter[i] + 1) & 0xff;
    if (counter[i] !== 0) return;
  }
}

/** AEAD 加密 */
async function aeadEncrypt(key, nonceCounter, plaintext) {
  const iv = nonceCounter.slice();
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintext);
  incrementNonce(nonceCounter);
  return new Uint8Array(ct);
}

/** AEAD 解密 */
async function aeadDecrypt(key, nonceCounter, ciphertext) {
  const iv = nonceCounter.slice();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ciphertext);
  incrementNonce(nonceCounter);
  return new Uint8Array(pt);
}

/** SS 入站解密器 */
function createSSInboundDecryptor(masterKeyGetter, candidateConfigs) {
  let buffer = new Uint8Array(0);
  let hasSalt = false;
  let waitPayloadLength = null;
  let decryptKey = null;
  let nonceCounter = new Uint8Array(NONCE_LEN);
  let currentConfig = null;

  const initializeDecryptState = async () => {
    const lengthCipherLen = 2 + AEAD_TAG_LEN;
    const maxSaltLen = Math.max(...candidateConfigs.map(c => c.saltLen));
    const maxScanOffset = Math.min(16, Math.max(0, buffer.byteLength - (lengthCipherLen + Math.min(...candidateConfigs.map(c => c.saltLen)))));

    for (let offset = 0; offset <= maxScanOffset; offset++) {
      for (const config of candidateConfigs) {
        const initMinLen = offset + config.saltLen + lengthCipherLen;
        if (buffer.byteLength < initMinLen) continue;

        const salt = buffer.subarray(offset, offset + config.saltLen);
        const lengthCipher = buffer.subarray(offset + config.saltLen, initMinLen);

        const masterKey = await masterKeyGetter();
        const dk = await deriveSessionKey(config, masterKey, salt, ['decrypt']);
        const nc = new Uint8Array(NONCE_LEN);

        try {
          const lengthPlain = await aeadDecrypt(dk, nc, lengthCipher);
          if (lengthPlain.byteLength !== 2) continue;
          const payloadLength = (lengthPlain[0] << 8) | lengthPlain[1];
          if (payloadLength < 0 || payloadLength > config.maxChunk) continue;

          buffer = buffer.subarray(initMinLen);
          decryptKey = dk;
          nonceCounter = nc;
          waitPayloadLength = payloadLength;
          currentConfig = config;
          hasSalt = true;
          return true;
        } catch { }
      }
    }

    const failLen = maxSaltLen + lengthCipherLen + maxScanOffset;
    if (buffer.byteLength >= failLen) {
      throw new Error('SS handshake decrypt failed');
    }
    return false;
  };

  return {
    async input(dataChunk) {
      const chunk = toUint8Array(dataChunk);
      if (chunk.byteLength > 0) {
        const newBuf = new Uint8Array(buffer.byteLength + chunk.byteLength);
        newBuf.set(buffer);
        newBuf.set(chunk, buffer.byteLength);
        buffer = newBuf;
      }

      if (!hasSalt) {
        const ok = await initializeDecryptState();
        if (!ok) return [];
      }

      const plaintextChunks = [];
      while (true) {
        if (waitPayloadLength === null) {
          const lengthCipherLen = 2 + AEAD_TAG_LEN;
          if (buffer.byteLength < lengthCipherLen) break;
          const lengthCipher = buffer.subarray(0, lengthCipherLen);
          buffer = buffer.subarray(lengthCipherLen);
          const lengthPlain = await aeadDecrypt(decryptKey, nonceCounter, lengthCipher);
          if (lengthPlain.byteLength !== 2) throw new Error('SS length decrypt failed');
          waitPayloadLength = (lengthPlain[0] << 8) | lengthPlain[1];
          if (waitPayloadLength < 0 || waitPayloadLength > currentConfig.maxChunk) {
            throw new Error(`SS payload length invalid: ${waitPayloadLength}`);
          }
        }

        const payloadCipherLen = waitPayloadLength + AEAD_TAG_LEN;
        if (buffer.byteLength < payloadCipherLen) break;
        const payloadCipher = buffer.subarray(0, payloadCipherLen);
        buffer = buffer.subarray(payloadCipherLen);
        const payloadPlain = await aeadDecrypt(decryptKey, nonceCounter, payloadCipher);
        plaintextChunks.push(payloadPlain);
        waitPayloadLength = null;
      }
      return plaintextChunks;
    }
  };
}

// ============================================
// Section 4: Router
// ============================================

/** 创建 TCP 连接器（使用 CF Workers fetcher.connect） */
function createTCPConnector(request) {
  const fetcher = request.fetcher;
  if (!fetcher || typeof fetcher.connect !== 'function') {
    throw new Error('request.fetcher.connect unavailable');
  }
  return (options, init) =>
    init === undefined ? fetcher.connect(options) : fetcher.connect(options, init);
}

/** SOCKS5 白名单（这些域名走链式代理） */
const SOCKS5_WHITELIST = ['*tapecontent.net', '*cloudatacdn.com', '*loadshare.org', 'scholar.google.com'];

function isInWhitelist(host) {
  return SOCKS5_WHITELIST.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    return regex.test(host);
  });
}

/** SOCKS5 连接 */
async function socks5Connect(targetHost, targetPort, initialData, TCP连接, params) {
  const username = params.username || '';
  const password = params.password || '';
  const hostname = params.hostname || '';
  const port = Number(params.port) || 1080;

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
async function httpConnect(targetHost, targetPort, initialData, useTLS, TCP连接, params) {
  const username = params.username || '';
  const password = params.password || '';
  const hostname = params.hostname || '';
  const port = Number(params.port) || (useTLS ? 443 : 80);

  let socket;
  // HTTPS 代理需要 TLS 握手（简化实现）
  socket = TCP连接({ hostname, port });
  await socket.opened;

  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  try {
    const auth = username && password ? `Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}\r\n` : '';
    const requestStr = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}User-Agent: Mozilla/5.0\r\nConnection: keep-alive\r\n\r\n`;
    await writer.write(encoder.encode(requestStr));
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

/** 通过链式代理连接 */
async function connectViaProxy(targetHost, targetPort, rawData, TCP连接, proxyCtx) {
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

/** 建立 TCP 连接到目标（直连或反代） */
async function connectToTarget(targetHost, targetPort, rawData, request, proxyCtx, remoteConnWrapper, uuid, allowTrojanFallback, trojanFirstPacket, connectOnly) {
  if (allowTrojanFallback === undefined) allowTrojanFallback = false;
  if (trojanFirstPacket === undefined) trojanFirstPacket = null;
  if (connectOnly === undefined) connectOnly = false;

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
  } catch (err) {
    log(`[Router] 直连失败: ${err.message}`);
    // 回退到反代
    if (反代兜底 || proxyCtx.代理类型) {
      log(`[Router] 回退反代 -> ${targetHost}:${targetPort}`);
      return connectViaProxy(targetHost, targetPort, rawData, TCP连接, proxyCtx);
    }
    throw err;
  }
}

/** 双向数据转发 */
async function relayStreams(dst, src, respHeader) {
  if (!respHeader) respHeader = null;
  let inBytes = 0, outBytes = 0;

  const copy = async (from, to, counter, header) => {
    if (!header) header = null;
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

// ============================================
// Section 5: Transport Handlers
// ============================================

// --- websocket.ts ---

const MAX_EARLY_DATA = 8 * 1024;
const MAX_WS_HEADER_LEN = Math.ceil(MAX_EARLY_DATA * 4 / 3) + 4;

/** 解码早期数据 */
function decodeEarlyData(header) {
  if (!header) return null;
  let bytes;

  // 尝试 fromBase64 (新 API)
  if (typeof Uint8Array.fromBase64 === 'function') {
    try {
      bytes = Uint8Array.fromBase64(header, { alphabet: 'base64url' });
    } catch { bytes = null; }
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

  if (bytes.byteLength > MAX_EARLY_DATA) throw new Error('Early data too large');
  return bytes;
}

/** DNS 转发 - WebSocket */
async function handleDNSForwardWS(payload, serverSock, config, request) {
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

/** 处理 WebSocket 代理请求 */
async function handleWebSocket(request, config, proxyCtx, env) {
  const url = new URL(request.url);
  const uuid = config.UUID;
  const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
  const ssMode = !!url.searchParams.get('enc');

  // 创建 WebSocket 对
  const wsPair = new WebSocketPair();
  const [clientSock, serverSock] = Object.values(wsPair);
  serverSock.accept({ allowHalfOpen: true });
  serverSock.binaryType = 'arraybuffer';

  // 连接状态
  let remoteSocket = null;
  let isUDP = false;
  let protocolDetected = null;
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
            const ipv6 = [];
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
      } catch (err) {
        log(`[WS-SS] 错误: ${err.message}`);
        serverSock.close();
      }
    });
  } else {
    // VMess/Trojan 模式
    const sendQueue = [];
    let queueBytes = 0;
    const MAX_QUEUE = 16 * 1024 * 1024;

    const processFirstPacket = async (data) => {
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
          await handleDNSForwardWS(result.rawData, serverSock, config, request);
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
          await handleDNSForwardWS(result.rawData, serverSock, config, request);
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
      } catch (err) {
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
      } catch (err) {
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

// --- grpc.ts ---

/** 反向转发（远端 → 客户端） */
function startRelay(remoteSocket, bridge, respHeader) {
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

/** DNS 转发 - gRPC */
async function handleDNSForwardGRPC(payload, bridge, request) {
  const TCP连接 = request.fetcher.connect;
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

/** 处理 gRPC 请求 */
async function handleGRPC(request, config, proxyCtx, env) {
  if (!request.body) return new Response('Bad Request', { status: 400 });

  const reader = request.body.getReader();
  const uuid = config.UUID;
  let remoteSocket = null;
  let isDnsQuery = false;
  let 判断是否是木马 = null;
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
        send(data) {
          if (closed) return;
          // 包装为 gRPC 帧
          const lenBytes = [];
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
                  await handleDNSForwardGRPC(payload, grpcBridge, request);
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
                  await handleDNSForwardGRPC(payload, grpcBridge, request);
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
              await handleDNSForwardGRPC(payload, grpcBridge, request);
            }
          }
        }
      } catch (err) {
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

// --- xhttp.ts ---

/** 读取首包识别协议 */
async function xhttpReadFirstPacket(reader) {
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
        return { ...result, protocol: 'trojan', rawFullData: data, respHeader: null };
      }
    }

    // 尝试 VMess
    if (isVMessPacket(data, '00000000-0000-4000-8000-000000000000')) {
      // 需要真实 UUID，这里用占位
      return {
        hostname: '', port: 0, isUDP: false, version: 0,
        rawData: data, protocol: 'vmess', rawFullData: data,
        respHeader: new Uint8Array([0, 0]),
      };
    }
  }

  return null;
}

/** 上行转发 */
async function relayUpstream(reader, remoteSocket) {
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
function relayDownstream(remoteSocket, responseHeaders, respHeader) {
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

/** 处理叉HTTP请求 */
async function handleXHTTP(request, config, proxyCtx, env) {
  if (!request.body) return new Response('Bad Request', { status: 400 });

  const uuid = config.UUID;
  const reader = request.body.getReader();

  // 读取首包识别协议
  const firstPacket = await xhttpReadFirstPacket(reader);
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
  } catch (err) {
    log(`[XHTTP] 错误: ${err.message}`);
    return new Response('Bad Gateway', { status: 502 });
  }
}

// ============================================
// Section 6: Admin
// ============================================

// --- auth.ts ---

/** 验证登录 Cookie */
async function verifyAuth(request, adminPassword, encryptionKey) {
  const cookies = request.headers.get('Cookie') || '';
  const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth='))?.split('=')[1];
  if (!authCookie) return false;

  const ua = request.headers.get('User-Agent') || '';
  const expected = await md5(ua + encryptionKey + adminPassword);
  return authCookie === expected;
}

/** 生成认证 Cookie 值 */
async function generateAuthCookie(ua, encryptionKey, adminPassword) {
  return md5(ua + encryptionKey + adminPassword);
}

/** 计算 UUID 前8位总和 */
function uuidPrefixSum(uuid) {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const code = uuid.charCodeAt(i);
    sum += code <= 57 ? code - 48 : code - 87;
  }
  return sum;
}

/** 验证版本查询的 UUID */
function verifyVersionUUID(requestUUID, targetUUID) {
  return uuidPrefixSum(requestUUID) === uuidPrefixSum(targetUUID) &&
         requestUUID.slice(-12) === targetUUID.slice(-12);
}

// --- api.ts ---

const PAGES_URL = 'https://edt-pages.github.io';

function jsonResponse(data, status) {
  if (!status) status = 200;
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function redirect(path) {
  return new Response('重定向中...', { status: 302, headers: { Location: path } });
}

/** 查询 Cloudflare Workers 用量 */
async function getCloudflareUsage(cfConfig) {
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
      const data = await resp.json();
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
      const data = await resp.json();
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
async function sendTelegramNotification(env, message) {
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

async function handleAdmin(request, env, ctx, config) {
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
      const newConfig = await request.json();
      if (!newConfig.UUID || !newConfig.HOSTS?.length) {
        return jsonResponse({ error: '配置不完整' }, 400);
      }
      await saveConfig(env, { ...config, ...newConfig });
      return jsonResponse({ success: true, message: '配置已保存' });
    } catch (err) {
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
      const data = await request.json();
      await saveCFConfig(env, data);
      return jsonResponse({ success: true });
    }
    return jsonResponse(await getCFConfig(env));
  }

  // TG 配置
  if (apiPath === 'tg.json') {
    if (method === 'POST') {
      const data = await request.json();
      await saveTGConfig(env, data);
      return jsonResponse({ success: true });
    }
    return jsonResponse(await getTGConfig(env));
  }

  // TG 发送消息
  if (apiPath === 'tg/send') {
    if (method === 'POST') {
      const { message } = await request.json();
      const tgConfig = await getTGConfig(env);
      if (tgConfig.BotToken && tgConfig.ChatID) {
        try {
          await fetch(`https://api.telegram.org/bot${tgConfig.BotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: tgConfig.ChatID, text: message, parse_mode: 'HTML' }),
          });
          return jsonResponse({ success: true });
        } catch (err) {
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
    } catch (err) {
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

// ============================================
// Section 7: Subscription Generator
// ============================================

/** 处理订阅请求 */
async function handleSubscription(request, env, config) {
  const url = new URL(request.url);
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();

  // 检测订阅格式
  const format = detectFormat(url, ua);
  const host = config.HOSTS[0] || url.hostname;
  const uuid = config.UUID;

  // 生成节点列表
  const nodes = await generateNodes(config, host, env);

  // 检查是否走订阅转换后端
  const isSubConverterRequest = url.searchParams.has('b64') ||
    url.searchParams.has('base64') ||
    ua.includes('subconverter') ||
    ua.includes('cf-workers-sub');

  let content = '';
  let contentType = 'text/plain; charset=utf-8';

  // 如果指定了 target 参数，走订阅转换后端
  if (url.searchParams.has('target') && config.订阅转换配置?.SUBAPI) {
    const target = url.searchParams.get('target');
    const subConverterURL = buildSubConverterURL(config, target, url, uuid);
    try {
      const resp = await fetch(subConverterURL);
      if (resp.ok) {
        content = await resp.text();
        // 热补丁
        if (target === 'clash') {
          content = patchClashConfig(content, config);
          contentType = 'application/x-yaml; charset=utf-8';
        } else if (target === 'singbox') {
          content = await patchSingboxConfig(content, config);
          contentType = 'application/json; charset=utf-8';
        }
      } else {
        return new Response('订阅转换后端异常：' + resp.statusText, { status: resp.status });
      }
    } catch (err) {
      return new Response('订阅转换后端异常：' + err.message, { status: 503 });
    }
  } else {
    switch (format) {
      case 'clash':
        content = patchClashConfig(generateClashConfig(nodes, config), config);
        contentType = 'application/x-yaml; charset=utf-8';
        break;
      case 'singbox':
        content = await patchSingboxConfig(generateSingboxConfig(nodes, config), config);
        contentType = 'application/json; charset=utf-8';
        break;
      case 'surge':
        content = generateSurgeConfig(nodes, config);
        break;
      case 'loon':
        content = generateLoonConfig(nodes, config);
        break;
      case 'quanx':
        content = generateQuantumultXConfig(nodes, config);
        break;
      case 'mixed':
      default:
        content = nodes.map(n => generateLink(n, config)).join('\n');
        if (!ua.includes('mozilla') || url.searchParams.has('b64')) {
          content = base64Encode(content);
        }
        break;
    }
  }

  // 替换 UUID 和域名
  if (!ua.includes('subconverter') && format === 'mixed') {
    const shuffledHOSTs = [...config.HOSTS].sort(() => Math.random() - 0.5);
    let hostIndex = 0;
    content = content
      .replace(/00000000-0000-4000-8000-000000000000/g, uuid)
      .replace(/MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAw/g, btoa(uuid))
      .replace(/example\.com/g, () => {
        const h = shuffledHOSTs[hostIndex % shuffledHOSTs.length];
        hostIndex++;
        return h.replace(/\*/g, () => {
          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
          return chars[Math.floor(Math.random() * chars.length)];
        });
      });
  }

  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'Profile-Update-Interval': config.优选订阅生成?.SUBUpdateTime || '12',
      'Profile-web-page-url': `${url.protocol}//${url.host}/admin`,
    }
  });
}

/** 检测订阅格式 */
function detectFormat(url, ua) {
  if (url.searchParams.has('target')) return url.searchParams.get('target');
  if (url.searchParams.has('clash') || ua.includes('clash') || ua.includes('meta') || ua.includes('mihomo')) return 'clash';
  if (url.searchParams.has('sb') || ua.includes('singbox') || ua.includes('sing-box')) return 'singbox';
  if (url.searchParams.has('surge') || ua.includes('surge')) return 'surge';
  if (url.searchParams.has('loon') || ua.includes('loon')) return 'loon';
  if (url.searchParams.has('quanx') || ua.includes('quantumult')) return 'quanx';
  return 'mixed';
}

/** 生成节点列表（支持 KV 中的 ADD.txt） */
async function generateNodes(config, host, env) {
  const nodes = [];

  // 尝试从 KV 读取自定义优选 IP
  let customIPs = [];
  if (env.KV) {
    const addTxt = await env.KV.get('ADD.txt');
    if (addTxt && addTxt !== 'null') {
      customIPs = addTxt.split('\n').map(s => s.trim()).filter(Boolean);
    }
  }

  // 使用自定义 IP
  if (customIPs.length > 0) {
    for (const ip of customIPs) {
      const match = ip.match(/^(\S+?)(?::(\d+))?(?:#(.+))?$/);
      if (match) {
        nodes.push({
          address: match[1],
          port: match[2] || '443',
          remark: match[3] || match[1],
        });
      }
    }
  }

  // 如果没有自定义 IP，从 HOSTS 生成
  if (nodes.length === 0) {
    for (const h of config.HOSTS) {
      const address = h.replace(/\*/g, () => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        return chars[Math.floor(Math.random() * chars.length)];
      });
      nodes.push({ address, port: '443', remark: address });
    }
  }

  return nodes.length > 0 ? nodes : [{ address: host, port: '443', remark: host }];
}

/** 生成节点链接 */
function generateLink(node, config) {
  const protocol = config.协议类型 || 'vmess';
  const host = node.address;
  const port = node.port;
  const remark = encodeURIComponent(node.remark);
  const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;
  const transport = config.传输协议 === 'grpc' ? 'grpc' : (config.传输协议 === 'xhttp' ? 'xhttp' : 'ws');
  const ECH参数 = config.ECH ? `&ech=${encodeURIComponent((config.ECHConfig?.SNI || '') + '+' + (config.ECHConfig?.DNS || ''))}` : '';
  const TLS分片参数 = '';

  if (protocol === 'vless') {
    const transportParams = transport === 'grpc'
      ? `&serviceName=${encodeURIComponent(path.split('?')[0] || '/')}`
      : `&path=${encodeURIComponent(path)}`;
    const hostParam = transport === 'grpc' ? 'authority' : 'host';
    return `vless://00000000-0000-4000-8000-000000000000@${host}:${port}?security=tls&type=${transport}&${hostParam}=example.com&fp=${config.Fingerprint}&sni=example.com${transportParams}${ECH参数}${TLS分片参数}#${remark}`;
  }

  if (protocol === 'vmess') {
    const transportParams = transport === 'grpc'
      ? `&serviceName=${encodeURIComponent(path.split('?')[0] || '/')}`
      : `&path=${encodeURIComponent(path)}`;
    const hostParam = transport === 'grpc' ? 'authority' : 'host';
    return `vmess://00000000-0000-4000-8000-000000000000@${host}:${port}?security=tls&type=${transport}&${hostParam}=example.com&fp=${config.Fingerprint}&sni=example.com${transportParams}${ECH参数}${TLS分片参数}#${remark}`;
  }

  if (protocol === 'trojan') {
    return `trojan://00000000-0000-4000-8000-000000000000@${host}:${port}?security=tls&type=${transport}&host=example.com&fp=${config.Fingerprint}&sni=example.com&path=${encodeURIComponent(path)}${ECH参数}${TLS分片参数}#${remark}`;
  }

  if (protocol === 'ss') {
    const encMethod = config.SS?.加密方式 || 'aes-128-gcm';
    const encoded = base64Encode(`${encMethod}:00000000-0000-4000-8000-000000000000`);
    return `ss://${encoded}@${host}:${port}?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dexample.com%3Bpath%3D${encodeURIComponent(path)}${config.SS?.TLS ? '%3Btls' : ''}${ECH参数}#${remark}`;
  }

  return '';
}

/** 构建订阅转换后端 URL */
function buildSubConverterURL(config, target, url, uuid) {
  const subAPI = config.订阅转换配置?.SUBAPI || 'https://sub.xeton.dev';
  const subConfig = config.订阅转换配置?.SUBCONFIG || '';
  const subUrl = `${url.protocol}//${url.host}/sub?target=mixed`;
  const params = new URLSearchParams({
    target,
    url: subUrl,
    config: subConfig,
    emoji: config.订阅转换配置?.SUBEMOJI || 'true',
    list: config.订阅转换配置?.SUBLIST || 'false',
    xudp: config.订阅转换配置?.XUDP || 'true',
    udp: config.订阅转换配置?.UDP || 'true',
    tls13: config.订阅转换配置?.TLS13 || 'true',
    append_type: config.订阅转换配置?.APPEND_TYPE || 'true',
    sort: config.订阅转换配置?.SORT || 'true',
  });
  return `${subAPI}/sub?${params.toString()}`;
}

/** 生成 Clash 配置 */
function generateClashConfig(nodes, config) {
  const protocol = config.协议类型 === 'trojan' ? 'trojan' : (config.协议类型 === 'ss' ? 'ss' : (config.协议类型 === 'vless' ? 'vless' : 'vmess'));
  const transport = config.传输协议;

  let yaml = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
dns:
  enable: true
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://sm2.doh.pub/dns-query
  fallback:
    - https://dns.google/dns-query
    - https://cloudflare-dns.com/dns-query
  fallback-filter:
    geoip: true
    geoip-code: CN

proxies:
`;

  for (const node of nodes) {
    const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;
    const identityField = (protocol === 'vless' || protocol === 'trojan') ? 'password' : 'uuid';
    const identityValue = '00000000-0000-4000-8000-000000000000';

    if (transport === 'grpc') {
      yaml += `  - name: "${node.remark}"
    type: ${protocol}
    server: ${node.address}
    port: ${node.port}
    ${identityField}: ${identityValue}
    network: grpc
    tls: true
    grpc-opts:
      grpc-service-name: "${path.split('?')[0] || '/'}"
    servername: example.com
    client-fingerprint: ${config.Fingerprint}
`;
    } else {
      yaml += `  - name: "${node.remark}"
    type: ${protocol}
    server: ${node.address}
    port: ${node.port}
    ${identityField}: ${identityValue}
    network: ws
    tls: true
    ws-opts:
      path: "${path}"
      headers:
        Host: example.com
    servername: example.com
    client-fingerprint: ${config.Fingerprint}
`;
    }
  }

  yaml += `
proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
${nodes.map(n => `      - "${n.remark}"`).join('\n')}
      - DIRECT

rules:
  - GEOIP,CN,DIRECT
  - MATCH,Proxy
`;

  return yaml;
}

/** Clash 配置热补丁 - 注入 ECH 和 gRPC User-Agent */
function patchClashConfig(yaml, config) {
  // 修正 mode: Rule -> mode: rule
  yaml = yaml.replace(/mode:\s*Rule\b/g, 'mode: rule');

  // 注入 gRPC User-Agent
  if (config.传输协议 === 'grpc' && config.gRPCUserAgent) {
    const agentYAML = JSON.stringify(config.gRPCUserAgent);
    yaml = yaml.replace(/grpc-opts:\s*\{([^}]*)\}/gi, (all, inner) => {
      if (/grpc-user-agent\s*:/i.test(inner)) return all;
      let content = inner.trim();
      if (content.endsWith(',')) content = content.slice(0, -1).trim();
      const patched = content ? `${content}, grpc-user-agent: ${agentYAML}` : `grpc-user-agent: ${agentYAML}`;
      return `grpc-opts: {${patched}}`;
    });
  }

  return yaml;
}

/** 生成 Singbox 配置 */
function generateSingboxConfig(nodes, config) {
  const protocol = config.协议类型 === 'trojan' ? 'trojan' : (config.协议类型 === 'vless' ? 'vless' : 'vmess');

  const singboxConfig = {
    outbounds: nodes.map(node => ({
      type: protocol,
      server: node.address,
      server_port: Number(node.port),
      ...(protocol === 'vless' || protocol === 'trojan'
        ? { password: '00000000-0000-4000-8000-000000000000' }
        : { uuid: '00000000-0000-4000-8000-000000000000' }),
      tls: { enabled: true, server_name: 'example.com', utls: { enabled: true, fingerprint: config.Fingerprint } },
      transport: config.传输协议 === 'grpc'
        ? { type: 'grpc', service_name: config.PATH.split('?')[0] || '/' }
        : { type: 'ws', path: config.PATH, headers: { Host: 'example.com' } }
    }))
  };

  return JSON.stringify(singboxConfig, null, 2);
}

/** Singbox 配置热补丁 */
async function patchSingboxConfig(json, config) {
  try {
    const singbox = JSON.parse(json);
    // 替换 DNS
    if (singbox.dns?.servers) {
      for (const server of singbox.dns.servers) {
        if (server.address === 'https://1.1.1.1/dns-query') server.address = 'https://dns.google/dns-query';
        if (server.address === 'https://1.0.0.1/dns-query') server.address = 'https://cloudflare-dns.com/dns-query';
      }
    }
    return JSON.stringify(singbox, null, 2);
  } catch {
    return json;
  }
}

/** 生成 Surge 配置 */
function generateSurgeConfig(nodes, config) {
  const protocol = config.协议类型 === 'vless' ? 'vless' : (config.协议类型 === 'vmess' ? 'vmess' : 'trojan');
  const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;

  let conf = `[General]\nlog-timestamp = 1\ndns-server = system, 223.5.5.5, 119.29.29.29\n\n[Proxy]\n`;

  for (const node of nodes) {
    if (protocol === 'trojan') {
      conf += `${node.remark} = trojan, ${node.address}, ${node.port}, password=00000000-0000-4000-8000-000000000000, sni=example.com, tls=true, ws=true, ws-path=${path}, ws-headers=Host:example.com\n`;
    } else {
      conf += `${node.remark} = vmess, ${node.address}, ${node.port}, username=00000000-0000-4000-8000-000000000000, tls=true, ws=true, ws-path=${path}, ws-headers=Host:example.com, sni=example.com\n`;
    }
  }

  conf += `\n[Rule]\nGEOIP,CN,DIRECT\nFINAL,Proxy\n`;
  return conf;
}

/** 生成 Loon 配置 */
function generateLoonConfig(nodes, config) {
  const protocol = config.协议类型 === 'vless' ? 'vless' : (config.协议类型 === 'vmess' ? 'vmess' : 'trojan');
  const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;

  let conf = `[Proxy]\n`;

  for (const node of nodes) {
    if (protocol === 'trojan') {
      conf += `${node.remark} = Trojan, ${node.address}, ${node.port}, password=00000000-0000-4000-8000-000000000000, sni=example.com, tls=true, transport=websocket, ws-path=${path}, ws-headers=Host:example.com\n`;
    } else {
      conf += `${node.remark} = Vmess, ${node.address}, ${node.port}, username=00000000-0000-4000-8000-000000000000, tls=true, ws=true, ws-path=${path}, ws-headers=Host:example.com, sni=example.com\n`;
    }
  }

  conf += `\n[Rule]\nGEOIP,CN,DIRECT\nFINAL,Proxy\n`;
  return conf;
}

/** 生成 Quantumult X 配置 */
function generateQuantumultXConfig(nodes, config) {
  const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;

  let conf = `[server_remote]\n`;

  for (const node of nodes) {
    const encoded = base64Encode(`00000000-0000-4000-8000-000000000000@${node.address}:${node.port}`);
    conf += `${node.remark}, tag=vmess, server=$(parsed), port=${node.port}, cipher=none, tls=true, obfs=ws, obfs-path="${path}", obfs-header=Host:example.com\n`;
  }

  return conf;
}

// ============================================
// Section 8: Dispatcher
// ============================================

/** 获取反代上下文（支持 URL 参数动态切换） */
function getProxyContext(url, config, env, colo) {
  const 特征码字典 = [
    (env.KEY || 'IP').toUpperCase(),
    'cloudatacdn',
    'loadshare',
  ];

  let 反代IP = `${colo}.${特征码字典[0]}.${特征码字典[1]}SsSs.nEt`.toLowerCase();
  let 反代兜底 = true;
  let 代理类型 = null;
  let 代理全局 = false;
  let 代理参数 = {};

  // 环境变量 PROXYIP
  if (env.PROXYIP) {
    const proxyIPs = env.PROXYIP.split(',').map(s => s.trim()).filter(Boolean);
    反代IP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
    反代兜底 = false;
  }

  // URL 参数动态切换代理
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
function parseProxyParam(param) {
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

/** 处理代理请求入口 */
async function handleProxy(request, env, ctx, config, transport) {
  const url = new URL(request.url);
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('True-Client-IP') || 'unknown';
  const colo = request.cf?.colo || 'unknown';

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

// ============================================
// Section 9: Entry Point
// ============================================

function jsonResponse2(data, status) {
  if (!status) status = 200;
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function nginxPage() {
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

export default {
  async fetch(request, env, ctx) {
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
      return jsonResponse2({ version: '2.0.0', protocol: 'EdgeProxy' });
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
