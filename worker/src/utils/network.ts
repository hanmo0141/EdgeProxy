/**
 * 网络工具函数
 */

/** 判断是否是 IPv4 地址 */
export function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

/** 判断是否是 IP 地址（v4 或 v6） */
export function isIPHostname(hostname: string): boolean {
  const host = stripIPv6Brackets(hostname);
  if (isIPv4(host)) return true;
  if (!host.includes(':')) return false;
  try { new URL(`http://[${host}]/`); return true; } catch { return false; }
}

/** 去除 IPv6 方括号 */
export function stripIPv6Brackets(hostname: string = ''): string {
  const host = String(hostname || '').trim();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** 检查是否是测速站点 */
export function isSpeedTestSite(hostname: string): boolean {
  const domains = ['speed.cloudflare.com', 'cp.cloudflare.com'];
  hostname = hostname.toLowerCase();
  return domains.some(d => hostname === d || hostname.endsWith('.' + d));
}

/** 识别运营商 */
export function identifyISP(request: Request): string {
  const asn = String((request as any).cf?.asn || '');
  const isp = String((request as any).cf?.asOrganization || '').toLowerCase();
  if (asn === '9808' || isp.includes('cmcc') || isp.includes('china mobile')) return 'cmcc';
  if (asn === '4837' || isp.includes('china unicom')) return 'cucc';
  if (asn === '4134' || isp.includes('china telecom')) return 'ctcc';
  return 'unknown';
}

/** IP 私有地址检查 */
export function isPrivateIP(ip: string): boolean {
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

function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

/** 将字符串整理为数组 */
export function toArray(input: string | string[] | undefined | null): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return input.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}
