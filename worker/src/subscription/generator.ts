/**
 * 订阅生成器
 */
import { Config } from '../config/types';
import { base64Encode } from '../utils/encoding';
import { replaceAsterisk, randomPath, log } from '../utils/helpers';

/** 处理订阅请求 */
export async function handleSubscription(
  request: Request,
  env: Env,
  config: Config
): Promise<Response> {
  const url = new URL(request.url);
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();

  // 检测订阅格式
  const format = detectFormat(url, ua);
  const host = config.HOSTS[0] || url.hostname;
  const uuid = config.UUID;

  // 生成节点列表
  const nodes = generateNodes(config, host, uuid);

  let content = '';
  let contentType = 'text/plain; charset=utf-8';

  switch (format) {
    case 'clash':
      content = generateClashConfig(nodes, config);
      contentType = 'application/x-yaml; charset=utf-8';
      break;
    case 'singbox':
      content = generateSingboxConfig(nodes, config);
      contentType = 'application/json; charset=utf-8';
      break;
    case 'mixed':
    default:
      content = nodes.map(n => generateLink(n, config)).join('\n');
      if (!ua.includes('mozilla') || url.searchParams.has('b64')) {
        content = base64Encode(content);
      }
      break;
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
function detectFormat(url: URL, ua: string): string {
  if (url.searchParams.has('target')) return url.searchParams.get('target')!;
  if (url.searchParams.has('clash') || ua.includes('clash') || ua.includes('meta') || ua.includes('mihomo')) return 'clash';
  if (url.searchParams.has('sb') || ua.includes('singbox') || ua.includes('sing-box')) return 'singbox';
  return 'mixed';
}

/** 节点信息 */
interface Node {
  address: string;
  port: string;
  remark: string;
}

/** 生成节点列表 */
function generateNodes(config: Config, host: string, uuid: string): Node[] {
  const nodes: Node[] = [];

  // 从 HOSTS 生成
  for (const h of config.HOSTS) {
    const address = h.replace(/\*/g, () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      return chars[Math.floor(Math.random() * chars.length)];
    });
    nodes.push({ address, port: '443', remark: address });
  }

  // 如果有自定义优选 IP
  // TODO: 从 KV 读取 ADD.txt

  return nodes.length > 0 ? nodes : [{ address: host, port: '443', remark: host }];
}

/** 生成 VMess/Trojan 链接 */
function generateLink(node: Node, config: Config): string {
  const protocol = config.协议类型 === 'ss' ? 'ss' : (config.协议类型 === 'trojan' ? 'trojan' : 'vmess');
  const host = node.address;
  const port = node.port;
  const remark = encodeURIComponent(node.remark);
  const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;
  const transport = config.传输协议 === 'grpc' ? 'grpc' : (config.传输协议 === 'xhttp' ? 'xhttp' : 'ws');

  if (protocol === 'vmess') {
    const transportParams = transport === 'grpc'
      ? `&serviceName=${encodeURIComponent(path.split('?')[0] || '/')}`
      : `&path=${encodeURIComponent(path)}`;
    const hostParam = transport === 'grpc' ? 'authority' : 'host';

    return `vmess://00000000-0000-4000-8000-000000000000@${host}:${port}?security=tls&type=${transport}&${hostParam}=example.com&fp=${config.Fingerprint}&sni=example.com${transportParams}#${remark}`;
  }

  if (protocol === 'trojan') {
    return `trojan://00000000-0000-4000-8000-000000000000@${host}:${port}?security=tls&type=${transport}&host=example.com&fp=${config.Fingerprint}&sni=example.com&path=${encodeURIComponent(path)}#${remark}`;
  }

  if (protocol === 'ss') {
    const encMethod = config.SS?.加密方式 || 'aes-128-gcm';
    const encoded = base64Encode(`${encMethod}:00000000-0000-4000-8000-000000000000`);
    return `ss://${encoded}@${host}:${port}?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dexample.com%3Bpath%3D${encodeURIComponent(path)}${config.SS?.TLS ? '%3Btls' : ''}#${remark}`;
  }

  return '';
}

/** 生成 Clash 配置 */
function generateClashConfig(nodes: Node[], config: Config): string {
  const protocol = config.协议类型 === 'trojan' ? 'trojan' : 'vmess';
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
    if (transport === 'grpc') {
      yaml += `  - name: "${node.remark}"
    type: ${protocol}
    server: ${node.address}
    port: ${node.port}
    uuid: 00000000-0000-4000-8000-000000000000
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
    uuid: 00000000-0000-4000-8000-000000000000
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

/** 生成 Singbox 配置 */
function generateSingboxConfig(nodes: Node[], config: Config): string {
  const protocol = config.协议类型 === 'trojan' ? 'trojan' : 'vmess';

  const singboxConfig = {
    outbounds: nodes.map(node => ({
      type: protocol,
      server: node.address,
      server_port: Number(node.port),
      uuid: '00000000-0000-4000-8000-000000000000',
      tls: { enabled: true, server_name: 'example.com', utls: { enabled: true, fingerprint: config.Fingerprint } },
      transport: config.传输协议 === 'grpc'
        ? { type: 'grpc', service_name: config.PATH.split('?')[0] || '/' }
        : { type: 'ws', path: config.PATH, headers: { Host: 'example.com' } }
    }))
  };

  return JSON.stringify(singboxConfig, null, 2);
}

interface Env {
  KV?: KVNamespace;
  [key: string]: unknown;
}
