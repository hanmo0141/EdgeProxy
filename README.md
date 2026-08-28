# 🚀 ehdbdg v2.0

一个基于 **Cloudflare Workers** 的免费代理隧道工具。  
你不需要购买服务器，只需要一个 Cloudflare 账号就能搭建自己的代理节点。

---

## 📋 目录

- [这是什么？](#这是什么)
- [你需要什么？](#你需要什么)
- [第一步：注册账号](#第一步注册账号)
- [第二步：部署 Worker 后端](#第二步部署-worker-后端)
- [第三步：部署 Web 管理面板](#第三步部署-web-管理面板)
- [第四步：配置和使用](#第四步配置和使用)
- [第五步：客户端连接](#第五步客户端连接)
- [常见问题](#常见问题)
- [功能列表](#功能列表)

---

## 这是什么？

ehdbdg 是一个代理工具，可以帮助你：

- 🔒 **保护隐私**：加密你的网络流量
- 🌐 **访问全球网站**：突破网络限制
- ⚡ **免费使用**：利用 Cloudflare 的免费额度
- 📱 **多设备支持**：手机、电脑、平板都能用

**它的工作原理：**

```
你的设备 → Cloudflare 节点（全球） → 目标网站
     ↑              ↑                    ↑
  客户端 APP     ehdbdg           你想访问的网站
```

---

## 你需要什么？

| 需要的东西 | 说明 | 在哪里获取 |
|-----------|------|-----------|
| Cloudflare 账号 | 免费注册 | https://dash.cloudflare.com/sign-up |
| GitHub 账号 | 免费注册 | https://github.com |
| 一台电脑 | Windows/Mac/Linux 都行 | 你已经有了 |
| 一个域名 | 可选，有免费域名 | Freenom / Cloudflare 注册 |

---

## 第一步：注册账号

### 1.1 注册 Cloudflare

1. 打开 https://dash.cloudflare.com/sign-up
2. 填写邮箱和密码
3. 去邮箱点击验证链接
4. 完成注册 ✅

### 1.2 注册 GitHub（如果还没有）

1. 打开 https://github.com
2. 点击 **Sign up**
3. 按照提示注册
4. 完成注册 ✅

---

## 第二步：部署 Worker 后端（超简单！）

**不需要安装任何软件，直接在网页上操作！**

### 2.1 打开 Cloudflare Workers

1. 登录 https://dash.cloudflare.com
2. 左侧菜单点击 **Workers & Pages**
3. 点击 **Create application**
4. 选择 **Create Worker**
5. 随便起个名字（比如 `edgeproxy`），点击 **Deploy**

### 2.2 粘贴代码

1. 部署完成后，点击 **Edit code**
2. 删除编辑器里所有默认代码
3. 打开这个链接：https://raw.githubusercontent.com/hanmo0141/ehdbdg/main/_worker.js
4. 全选复制页面里的代码（Ctrl+A → Ctrl+C）
5. 粘贴到 Cloudflare 编辑器里（Ctrl+V）
6. 点击右上角 **Save and Deploy**

### 2.3 设置环境变量

1. 回到 Worker 详情页
2. 点击 **Settings** → **Variables**
3. 添加以下变量：

| Name | Value | 类型 |
|------|-------|------|
| `ADMIN` | 你的管理员密码 | **Encrypt** |

4. 点击 **Save**

### 2.4 创建 KV 存储

1. 在 Worker 详情页，点击 **Settings** → **Variables**
2. 滚动到 **KV Namespace Bindings**
3. 点击 **Add binding**
4. Variable name 填 `KV`
5. KV namespace 选择 **Create a new namespace**
6. 名字随便填（比如 `edgeproxy-kv`）
7. 点击 **Add**
8. 点击 **Save**

### 2.5 绑定自定义域名（可选）

1. 在 Worker 详情页，点击 **Settings** → **Triggers**
2. 滚动到 **Custom Domains**
3. 点击 **Add**，输入你的域名
4. 按提示配置 DNS

**部署完成！** 🎉

你的 Worker 地址是：`https://edgeproxy.你的用户名.workers.dev`

---

## 第三步：部署 Web 管理面板

### 3.1 安装面板依赖

```bash
# 回到项目根目录
cd ../panel
npm install
```

### 3.2 构建面板

```bash
npm run build
```

构建完成后，会生成一个 `dist` 文件夹。

### 3.3 部署到 GitHub Pages

```bash
# 进入构建目录
cd dist

# 初始化 git
git init
git add .
git commit -m "deploy panel"

# 创建 gh-pages 分支
git checkout -b gh-pages
git push -f origin gh-pages
```

### 3.4 启用 GitHub Pages

1. 打开你的 GitHub 仓库页面
2. 点击 **Settings**（设置）
3. 左侧找到 **Pages**
4. Source 选择 **gh-pages** 分支
5. 点击 **Save**
6. 等待几分钟，访问 `https://你的用户名.github.io/ehdbdg/`

---

## 第四步：配置和使用

### 4.1 设置管理员密码

1. 打开 Cloudflare 控制台
2. 进入 **Workers & Pages**
3. 点击你的 Worker
4. 点击 **Settings** → **Variables**
5. 添加一个新的变量：
   - Name: `ADMIN`
   - Value: 你的管理员密码（随便设一个）
   - Type: **Encrypt**
6. 点击 **Save**

### 4.2 打开管理面板

1. 访问你的 Worker 地址（如 `https://edgeproxy.xxx.workers.dev`）
2. 或者访问你部署的 GitHub Pages 地址
3. 输入刚才设置的管理员密码
4. 登录成功！

### 4.3 配置节点

在管理面板中：

1. **节点管理** → 设置你的域名（HOSTS）
2. **协议配置** → 选择协议类型（推荐 VMess）
3. **传输协议** → 选择传输方式（推荐 WebSocket）
4. 点击 **保存**

---

## 第五步：客户端连接

### 5.1 获取订阅链接

在管理面板中，你会看到类似这样的链接：

```
https://你的Worker地址/sub
```

这个就是你的**订阅链接**。

### 5.2 下载客户端

根据你的设备选择：

| 设备 | 推荐客户端 | 下载地址 |
|------|-----------|---------|
| Windows | Clash Verge | https://github.com/clash-verge-rev/clash-verge-rev/releases |
| macOS | Clash Verge | https://github.com/clash-verge-rev/clash-verge-rev/releases |
| Android | Clash Meta | https://github.com/MetaCubeX/ClashMetaForAndroid/releases |
| iOS | Shadowrocket | App Store（付费） |
| iOS | Quantumult X | App Store（付费） |

### 5.3 导入订阅

1. 打开客户端
2. 找到 **配置管理** 或 **订阅**
3. 粘贴你的订阅链接
4. 点击 **导入** 或 **下载**
5. 选择一个节点
6. 点击 **连接** ✅

---

## 常见问题

### Q: 部署后无法访问？

**检查清单：**
- [ ] 环境变量 `ADMIN` 是否设置？
- [ ] KV 命名空间是否绑定？
- [ ] 域名是否配置正确？

### Q: 订阅导入失败？

**可能原因：**
- 订阅链接复制错了
- 客户端不支持该协议
- 网络问题

**解决方法：**
- 尝试在浏览器打开订阅链接，看看是否有内容
- 换一个客户端试试

### Q: 连接速度慢？

**优化方法：**
1. 在管理面板 → 节点管理 → 选择更快的传输协议
2. 尝试 gRPC 传输（通常更快）
3. 启用 ECH（加密客户端问候）

### Q: 免费额度用完了怎么办？

Cloudflare Workers 免费版每天有 10 万次请求额度。  
如果用完了：
- 等到第二天重置
- 或者升级到付费版（$5/月）

---

## 功能列表

### 核心功能

- ✅ **多协议支持**：VMess / Trojan / Shadowsocks
- ✅ **多传输层**：WebSocket / gRPC / XHTTP
- ✅ **链式代理**：支持通过其他代理连接
- ✅ **TLS 加密**：保护你的流量安全

### 管理功能

- ✅ **Web 管理面板**：漂亮的可视化界面
- ✅ **多用户管理**：支持多个用户独立使用
- ✅ **订阅生成**：自动生成各种客户端的配置
- ✅ **操作日志**：查看所有操作记录

### 高级功能

- ✅ **ECH 支持**：加密 TLS 握手，更难被检测
- ✅ **智能路由**：国内直连，国外走代理
- ✅ **自动故障转移**：节点故障时自动切换
- ✅ **流量统计**：查看每个用户的使用量

---

## 环境变量说明

| 变量名 | 说明 | 是否必填 | 示例 |
|-------|------|---------|------|
| `ADMIN` | 管理员密码 | ✅ 必填 | `mypassword123` |
| `KEY` | 加密密钥 | 可选 | `mysecretkey` |
| `UUID` | 用户 UUID | 可选 | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `HOST` | 绑定域名 | 可选 | `proxy.example.com` |
| `PATH` | 传输路径 | 可选 | `/video/%s?ed=2560` |
| `URL` | 伪装页面 | 可选 | `https://www.google.com` |
| `PROXYIP` | 反代 IP | 可选 | `1.2.3.4` |
| `DEBUG` | 调试模式 | 可选 | `true` |

---

## 支持的客户端

- 🖥️ **Windows**：Clash Verge, Clash Meta, V2RayN, Quantumult X
- 🍎 **macOS**：Clash Verge, ClashX Pro, Quantumult X
- 📱 **Android**：Clash Meta, V2RayNG, SagerNet
- 📱 **iOS**：Shadowrocket, Quantumult X, Surge, Loon
- 🌐 **浏览器**：Clash for Windows, SwitchyOmega

---

## 免责声明

本项目仅供学习交流使用。  
请遵守当地法律法规，合理使用网络。  
作者不对使用本工具造成的任何后果负责。

---

## 许可证

MIT License - 可以自由使用和修改
