/**
 * 订阅生成器 - 支持 VLESS/VMess/Trojan/SS + 订阅转换后端
 */
import { Config } from '../config/types';
import { base64Encode, base64SecretEncode } from '../utils/encoding';
import { randomPath, log } from '../utils/helpers';
import { md5 } from '../utils/crypto';

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
    const target = url.searchParams.get('target')!;
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
    } catch (err: any) {
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
function detectFormat(url: URL, ua: string): string {
  if (url.searchParams.has('target')) return url.searchParams.get('target')!;
  if (url.searchParams.has('clash') || ua.includes('clash') || ua.includes('meta') || ua.includes('mihomo')) return 'clash';
  if (url.searchParams.has('sb') || ua.includes('singbox') || ua.includes('sing-box')) return 'singbox';
  if (url.searchParams.has('surge') || ua.includes('surge')) return 'surge';
  if (url.searchParams.has('loon') || ua.includes('loon')) return 'loon';
  if (url.searchParams.has('quanx') || ua.includes('quantumult')) return 'quanx';
  return 'mixed';
}

/** 节点信息 */
interface Node {
  address: string;
  port: string;
  remark: string;
}

/** 生成节点列表（支持 KV 中的 ADD.txt） */
async function generateNodes(config: Config, host: string, env: Env): Promise<Node[]> {
  const nodes: Node[] = [];

  // 尝试从 KV 读取自定义优选 IP
  let customIPs: string[] = [];
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
function generateLink(node: Node, config: Config): string {
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
function buildSubConverterURL(config: Config, target: string, url: URL, uuid: string): string {
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
function generateClashConfig(nodes: Node[], config: Config): string {
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
function patchClashConfig(yaml: string, config: Config): string {
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
function generateSingboxConfig(nodes: Node[], config: Config): string {
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
async function patchSingboxConfig(json: string, config: Config): Promise<string> {
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
function generateSurgeConfig(nodes: Node[], config: Config): string {
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
function generateLoonConfig(nodes: Node[], config: Config): string {
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
function generateQuantumultXConfig(nodes: Node[], config: Config): string {
  const path = config.随机路径 ? randomPath(config.PATH) : config.PATH;

  let conf = `[server_remote]\n`;

  for (const node of nodes) {
    const encoded = base64Encode(`00000000-0000-4000-8000-000000000000@${node.address}:${node.port}`);
    conf += `${node.remark}, tag=vmess, server=$(parsed), port=${node.port}, cipher=none, tls=true, obfs=ws, obfs-path="${path}", obfs-header=Host:example.com\n`;
  }

  return conf;
}

interface Env {
  KV?: KVNamespace;
  [key: string]: unknown;
}
