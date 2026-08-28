# EasyTunnel v2.0

基于 Cloudflare Workers 的代理隧道，支持 VMess/Trojan/Shadowsocks 协议。

## 功能特性

- ✅ **多协议支持**：VMess / Trojan / Shadowsocks
- ✅ **多传输层**：WebSocket / gRPC / XHTTP
- ✅ **链式代理**：SOCKS5 / HTTP / HTTPS / TURN / SSTP
- ✅ **多用户管理**：独立 UUID、流量统计
- ✅ **订阅生成**：Clash / Singbox / Surge / Loon
- ✅ **Web 管理面板**：Vue 3 + TailwindCSS
- ✅ **ECH 支持**：加密客户端问候
- ✅ **实时日志**：操作日志查看

## 项目结构

```
edgetunnel/
├── worker/          # CF Workers 后端 (TypeScript)
│   └── src/
│       ├── index.ts        # 入口
│       ├── config/         # 配置管理
│       ├── core/           # 核心调度
│       ├── protocols/      # 协议解析
│       ├── transport/      # 传输层
│       ├── proxy/          # 链式代理
│       ├── tls/            # TLS 客户端
│       ├── subscription/   # 订阅生成
│       ├── admin/          # 管理 API
│       └── utils/          # 工具函数
│
└── panel/           # Web 管理面板 (Vue 3)
    └── src/
        ├── views/          # 页面
        ├── components/     # 组件
        ├── router/         # 路由
        └── stores/         # 状态管理
```

## 部署步骤

### 1. 部署 Worker 后端

```bash
cd worker
npm install
# 编辑 wrangler.toml，填入你的 KV namespace ID
npx wrangler deploy
```

设置环境变量（在 CF 控制台）：
- `ADMIN`：管理员密码（必填）
- `KEY`：加密密钥
- `UUID`：用户 UUID
- `HOST`：你的域名
- `PATH`：传输路径

绑定 KV 命名空间（binding 名称：`KV`）

### 2. 部署 Web 面板

```bash
cd panel
npm install
npm run build
# 将 dist/ 目录部署到 GitHub Pages 或 Cloudflare Pages
```

### 3. 配置自定义域名

在 CF 控制台为 Worker 绑定自定义域名。

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `ADMIN` | 管理员密码 | ✅ |
| `KEY` | 加密密钥 | ❌ |
| `UUID` | 用户 UUID | ❌ |
| `HOST` | 绑定域名 | ❌ |
| `PATH` | 传输路径 | ❌ |
| `URL` | 伪装页 URL | ❌ |
| `PROXYIP` | 反代 IP | ❌ |
| `DEBUG` | 调试模式 | ❌ |

## 支持的客户端

- Clash / Clash Meta / Mihomo
- Singbox / Sing-box
- V2Ray / Xray
- Surge
- Quantumult X
- Loon
- Shadowrocket
