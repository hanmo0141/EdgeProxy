/**
 * 配置类型定义
 */

/** 主配置 */
export interface Config {
  UUID: string;
  HOSTS: string[];
  PATH: string;
  协议类型: string; // 'vless' | 'vmess' | 'trojan' | 'ss'
  传输协议: string; // 'ws' | 'grpc' | 'xhttp'
  TLS分片: string;
  Fingerprint: string;
  ECH: boolean;
  ECHConfig: { SNI: string; DNS: string };
  启用0RTT: boolean;
  随机路径: boolean;
  完整节点路径: string;
  首页伪装: string;
  跳过证书验证: boolean;
  优选订阅生成: {
    SUB: string;
    SUBNAME: string;
    SUBUpdateTime: string;
    local: boolean;
    本地IP库: { 随机IP: boolean; 随机数量: number; 指定端口: string[] };
  };
  订阅转换配置: {
    SUBAPI: string;
    SUBCONFIG: string;
    SUBEMOJI: string;
    SUBLIST: string;
    XUDP: string;
    UDP: string;
    TLS13: string;
    APPEND_TYPE: string;
    SORT: string;
  };
  SS: {
    TLS: boolean;
    加密方式: string;
  };
  gRPC模式: string;
  gRPCUserAgent: string;
  CF: {
    Usage: {
      success: boolean;
      pages: number;
      workers: number;
      max: number;
    };
  };
  多用户: User[];
}

/** 用户配置 */
export interface User {
  id: string;
  name: string;
  uuid: string;
  password: string; // trojan 密码
  enabled: boolean;
  traffic: {
    upload: number;
    download: number;
    limit: number; // 0 = 无限制
  };
  createdAt: number;
}

/** 节点信息（用于生成订阅） */
export interface NodeInfo {
  address: string;
  port: number;
  remark: string;
  proxyip?: string;
  chainProxy?: string;
}

/** 反代上下文 */
export interface ProxyContext {
  反代IP: string;
  代理类型: string | null;
  代理全局: boolean;
  代理参数: Record<string, string>;
  反代兜底: boolean;
  木马反代地址: { hostname: string; port: number } | null;
}

/** 连接信息 */
export interface ConnectionInfo {
  targetHost: string;
  targetPort: number;
  protocol: string;
  transport: string;
  userId?: string;
  clientIp: string;
  timestamp: number;
}
