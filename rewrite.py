#!/usr/bin/env python3
"""Comprehensive rewrite script for _worker.js
Translates Chinese identifiers to English, removes JShaman, cleans up code"""
import re, os

src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_worker.js')
with open(src, 'r', encoding='utf-8-sig') as f:
    code = f.read()

def sr(old, new):
    """String replace all occurrences"""
    global code
    code = code.replace(old, new)

# ============================================================
# 1. FIX PAGES_URL
# ============================================================
sr("const Pages静态页面 = 'https://edt-pages.github.io';",
   "const PAGES_URL = 'https://hanmo0141.github.io/EdgeProxy';")

# ============================================================
# 2. REPLACE FEATURE KEYS (obfuscated signature dictionary)
# ============================================================
sr("""const 特征码字典 = [
\t(Proxy.name + "IP").toUpperCase(),
\t(String.fromCharCode(67, 109) + URL.name[2] + 'i' + URL.name[0]).toLowerCase(),
\tString(2407 * 300 - 10).split('').reverse().join('')
];""",
   """const FEATURE_KEYS = [
    'PROXYIP',
    'edgetunnel',
    '19020'
];""")

# ============================================================
# 3. REMOVE JSHAMAN DISCLAIMER COMMENT BLOCKS
# ============================================================
# Block 1: After 主程序入口 header (line 15)
marker1 = '///////////////////////////////////////////////////////主程序入口///////////////////////////////////////////////'
export_marker = '\nexport default {'
idx1 = code.find(marker1)
idx2 = code.find(export_marker, idx1) if idx1 >= 0 else -1
if idx1 >= 0 and idx2 >= 0:
    code = code[:idx1] + '///////////////////////////////////////////////////////Main Entry Point///////////////////////////////////////////////\n' + code[idx2:]

# Block 2: After HTML伪装页面 header (line 6509)
marker2 = '//////////////////////////////////////////////////////HTML伪装页面///////////////////////////////////////////////'
nginx_marker = '\nasync function nginx()'
idx1 = code.find(marker2)
idx2 = code.find(nginx_marker, idx1) if idx1 >= 0 else -1
if idx1 >= 0 and idx2 >= 0:
    code = code[:idx1] + '///////////////////////////////////////////////////////HTML Camouflage Pages///////////////////////////////////////////////\n' + code[idx2:]

# ============================================================
# 4. SECTION HEADER RENAMES
# ============================================================
section_headers = [
    ('///////////////////////////////////////////////////////全局常量和工具函数///////////////////////////////////////////////', '///////////////////////////////////////////////////////Global Constants and Utilities///////////////////////////////////////////////'),
    ('///////////////////////////////////////////////////////查杀特征码///////////////////////////////////////////////', '///////////////////////////////////////////////////////Feature Keys///////////////////////////////////////////////'),
    ('///////////////////////////////////////////////////////////////////////叉HTTP传输数据///////////////////////////////////////////////', '///////////////////////////////////////////////////////xHTTP Transport///////////////////////////////////////////////'),
    ('///////////////////////////////////////////////////////////////////////gRPC传输数据///////////////////////////////////////////////', '///////////////////////////////////////////////////////gRPC Transport///////////////////////////////////////////////'),
    ('///////////////////////////////////////////////////////////////////////WS传输数据///////////////////////////////////////////////', '///////////////////////////////////////////////////////WebSocket Transport///////////////////////////////////////////////'),
    ('//////////////////////////////////////////////////功能性函数///////////////////////////////////////////////', '///////////////////////////////////////////////////////Utility Functions///////////////////////////////////////////////'),
    ('///////////////////////////////////////////////////////SOCKS5/HTTP函数///////////////////////////////////////////////', '///////////////////////////////////////////////////////SOCKS5/HTTP Functions///////////////////////////////////////////////'),
    ('//////////////////////////////////////////////////turnConnect///////////////////////////////////////////////', '///////////////////////////////////////////////// TURN Connect///////////////////////////////////////////////'),
    ('//////////////////////////////////////////////////sstpConnect///////////////////////////////////////////////', '///////////////////////////////////////////////// SSTP Connect///////////////////////////////////////////////'),
]
for old, new in section_headers:
    sr(old, new)

# ============================================================
# 5. COMPREHENSIVE RENAMES (sorted by length desc for safety)
# ============================================================
renames = [
    # Global state
    ('let config_JSON,', 'let configJSON,'),
    ('缓存SOCKS5白名单', 'cachedSocks5Whitelist'),
    ('调试日志打印', 'debugLogging'),
    ('SOCKS5白名单', 'socks5Whitelist'),
    ('Pages静态页面', 'PAGES_URL'),
    ('WS早期数据最大字节', 'WS_MAX_EARLY_BYTES'),
    ('WS早期数据最大头长度', 'WS_MAX_EARLY_HEADER_LEN'),
    ('上行合包目标字节', 'UPSTREAM_BUNDLE_TARGET'),
    ('上行队列最大字节', 'UPSTREAM_QUEUE_MAX_BYTES'),
    ('上行队列最大条目', 'UPSTREAM_QUEUE_MAX_ENTRIES'),
    ('下行Grain包字节', 'DOWNSTREAM_GRAIN_SIZE'),
    ('下行Grain尾部阈值', 'DOWNSTREAM_GRAIN_TAIL_THRESHOLD'),
    ('下行Grain低水位字节', 'DOWNSTREAM_GRAIN_LOW_WATER'),
    ('下行Grain最大等待轮次', 'DOWNSTREAM_GRAIN_MAX_WAIT'),
    ('TCP并发拨号数', 'tcpConcurrentDial'),
    ('反代并发拨号数', 'proxyConcurrentDial'),
    ('预加载竞速拨号', 'preloadRaceDial'),
    ('特征码字典', 'FEATURE_KEYS'),

    # Main handler
    ('let 请求URL文本', 'let requestUrlText'),
    ('请求URL文本', 'requestUrlText'),
    ('请求URL锚点索引', 'urlAnchorIndex'),
    ('请求URL主体部分', 'urlBody'),
    ('请求URL锚点部分', 'urlAnchorPart'),
    ('管理员密码', 'adminPassword'),
    ('加密秘钥', 'encryptionKey'),
    ('访问路径', 'accessPath'),
    ('默认反代IP', 'defaultProxyIP'),
    ('默认反代兜底', 'defaultProxyFallback'),
    ('访问IP', 'visitorIP'),
    ('请求UUID', 'requestUUID'),
    ('目标UUID', 'targetUUID'),
    ('请求前8总和', 'requestPrefixSum'),
    ('目标前8总和', 'targetPrefixSum'),
    ('请求码', 'requestCode'),
    ('目标码', 'targetCode'),
    ('反代上下文', 'proxyContext'),
    ('本机Padding头', 'localPaddingHeader'),
    ('本机Padding键', 'localPaddingKey'),
    ('命中叉HTTP特征', 'matchedXhttp'),
    ('伪装页URL', 'camouflageUrl'),
    ('新请求头', 'newHeaders'),
    ('反代响应', 'proxyResponse'),
    ('内容类型', 'respContentType'),
    ('响应内容', 'responseContent'),
    ('区分大小写访问路径', 'caseSensitivePath'),
    ('config_JSON', 'configJSON'),

    # Subscription
    ('订阅TOKEN', 'subToken'),
    ('作为优选订阅生成器', 'asBestSubGenerator'),
    ('请求TOKEN', 'requestToken'),
    ('用户客户端请求订阅', 'isClientSubRequest'),
    ('当前日序号', 'currentDayNum'),
    ('订阅转换后端TOKEN种子', 'subConvertTokenSeed'),
    ('今日订阅转换后端专属TOKEN', 'todaySubConvertToken'),
    ('昨日订阅转换后端专属TOKEN', 'yesterdaySubConvertToken'),
    ('订阅转换后端请求订阅', 'isSubConvertRequest'),
    ('订阅类型', 'subType'),
    ('订阅内容', 'subContent'),
    ('协议类型', 'protoType'),
    ('TLS分片参数', 'tlsFragmentParams'),
    ('完整节点路径', 'fullNodePath'),
    ('完整优选IP', 'fullBestIpList'),
    ('其他节点LINK', 'otherNodeLinks'),
    ('反代IP池', 'proxyIpPool'),

    # Functions
    ('async function 处理叉HTTP请求', 'async function handleXhttpRequest'),
    ('function 处理叉HTTPUDP请求', 'function handleXhttpUdpRequest'),
    ('async function 处理gRPC请求', 'async function handleGrpcRequest'),
    ('async function 处理WS请求', 'async function handleWsRequest'),
    ('async function forwardataTCP', 'async function forwardDataTcp'),
    ('async function forwardataudp', 'async function forwardDataUdp'),
    ('function 解析木马请求', 'function parseTrojanRequest'),
    ('function 解析魏烈思请求', 'function parseVlessRequest'),
    ('function UUID字节匹配', 'function uuidBytesMatch'),
    ('function 获取UUID字节', 'function getUuidBytes'),
    ('function 读取十六进制半字节', 'function readHexNibble'),
    ('function 是有效WS早期数据', 'function isValidWsEarlyData'),
    ('function 解码WS早期数据', 'function decodeWsEarlyData'),
    ('function 解析木马反代地址', 'function parseTrojanProxyAddr'),
    ('async function 连接木马反代', 'async function connectTrojanProxy'),
    ('function 提取木马反代握手数据', 'function extractTrojanProxyHandshake'),
    ('async function 转发木马UDP反代数据', 'async function forwardTrojanUdpProxyData'),
    ('async function 转发木马UDP数据', 'async function forwardTrojanUdpData'),
    ('const 木马文本解码器', 'const trojanTextDecoder'),
    ('function 获取叉HTTPPadding标识', 'function getXhttpPaddingIds'),
    ('function 计算HPACKHuffman字节长度', 'function computeHpackHuffmanByteLen'),
    ('function 提取叉HTTPPadding值', 'function extractXhttpPaddingValue'),
    ('function 校验叉HTTPPadding', 'function validateXhttpPadding'),
    ('const 叉HTTPBase62字符集', 'const XHTTP_BASE62_CHARS'),
    ('function 生成叉HTTPPadding串', 'function generateXhttpPadding'),
    ('async function 读取叉HTTP首包', 'async function readXhttpFirstPacket'),
    ('function 数据转Uint8Array', 'function toUint8Array'),
    ('function 拼接字节数据', 'function concatBytesArray'),
    ('function SS递增Nonce计数器', 'function ssIncrementNonce'),
    ('async function SS派生主密钥', 'async function ssDeriveMasterKey'),
    ('async function SS派生会话密钥', 'async function ssDeriveSessionKey'),
    ('async function SSAEAD加密', 'async function ssAeadEncrypt'),
    ('async function SSAEAD解密', 'async function ssAeadDecrypt'),
    ('const SS支持加密配置', 'const SS_CIPHER_CONFIGS'),
    ('const SSAEAD标签长度', 'const SS_AEAD_TAG_LEN'),
    ('const SSNonce长度', 'const SS_NONCE_LEN'),
    ('const SS子密钥信息', 'const SS_SUBKEY_INFO'),
    ('const SS文本编码器', 'const ssTextEncoder'),
    ('const SS文本解码器', 'const ssTextDecoder'),
    ('const SS主密钥缓存', 'const ssMasterKeyCache'),
    ('function 创建Grain收纳器', 'function createGrainBuffer'),
    ('function 创建上行Grain合包流', 'function createUpstreamGrainBundle'),
    ('function 创建上行写入队列', 'function createUpstreamWriteQueue'),
    ('function 创建下行Grain发送器', 'function createDownstreamGrainSender'),
    ('const UUID字节缓存', 'const uuidByteCache'),
    ('const 魏烈思文本解码器', 'const vlessTextDecoder'),
    ('async function 读取config_JSON', 'async function loadConfig'),
    ('function Clash订阅配置文件热补丁', 'function clashSubHotPatch'),
    ('async function Singbox订阅配置文件热补丁', 'async function singboxSubHotPatch'),
    ('function Surge订阅配置文件热补丁', 'function surgeSubHotPatch'),
    ('async function 请求日志记录', 'async function recordRequestLog'),
    ('function 掩码敏感信息', 'function maskSensitiveInfo'),
    ('async function MD5MD5', 'async function md5md5'),
    ('function 随机路径', 'function randomPath'),
    ('function 替换星号为随机字符', 'function replaceWildcard'),
    ('function 识别运营商', 'function detectIsp'),
    ('async function 生成随机IP', 'async function generateRandomIps'),
    ('async function 整理成数组', 'async function toArray'),
    ('async function 获取优选订阅生成器数据', 'async function fetchBestSubData'),
    ('async function 请求优选API', 'async function fetchBestIpApi'),
    ('async function 反代参数获取', 'async function getProxyParams'),
    ('function 获取代理默认端口', 'function getProxyDefaultPort'),
    ('function 获取SOCKS5账号', 'function parseSocks5Account'),
    ('async function DoH查询', 'async function dohQuery'),
    ('async function 解析地址端口', 'async function resolveProxyAddresses'),
    ('function 创建请求TCP连接器', 'function createRequestTcpConnector'),
    ('function 有效数据长度', 'function dataByteLength'),
    ('function 失效TCP连接世代', 'function invalidateTcpGen'),
    ('function 开始TCP连接世代', 'function beginTcpGen'),
    ('function 构造本地204响应', 'function buildLocal204'),
    ('function 构造WS本地204响应', 'function buildWsLocal204'),
    ('function 获取传输协议配置', 'function getTransportConfig'),
    ('function 获取传输路径参数值', 'function getTransportPathParam'),
    ('async function nginx()', 'async function nginxPage()'),
    ('async function html1101', 'async function html1101Page'),
    ('const 反代协议默认端口', 'const PROXY_DEFAULT_PORTS'),
    ('const SOCKS5账号Base64正则', 'const SOCKS5_B64_RE'),
    ('const IPv6方括号正则', 'const IPV6_BRACKET_RE'),

    # Local variables in function bodies
    ('反代数组索引', 'proxyArrayIdx'),
    ('连接超时毫秒', 'connectTimeoutMs'),
    ('已通过代理发送首包', 'firstPacketSentViaProxy'),
    ('待发送响应头', 'pendingRespHeader'),
    ('安装当前连接', 'installCurrentConn'),
    ('等待连接建立', 'awaitConnOpen'),
    ('打开TCP连接', 'openTcpConn'),
    ('写入首包', 'writeFirstPacket'),
    ('并发打开候选连接', 'raceOpenCandidates'),
    ('构建预加载竞速候选列表', 'buildPreloadRaceCandidates'),
    ('启用反代失败兜底', 'allowProxyFallback'),
    ('建立连接', 'establishConnection'),
    ('启用预加载', 'enablePreload'),
    ('获取SS上下文', 'getSsContext'),
    ('处理SS数据', 'handleSsData'),
    ('处理WS入站数据', 'handleWsInbound'),
    ('入队WS显式传输', 'enqueueWsExplicit'),
    ('收尾WS显式传输', 'finalizeWsExplicit'),
    ('处理WS显式传输错误', 'handleWsExplicitError'),
    ('追加WS显式传输任务', 'appendWsExplicitTask'),
    ('入站解密器', 'inboundDecryptor'),
    ('回包Socket', 'replySocket'),
    ('首包已建立', 'firstPktEstablished'),
    ('入站状态', 'inboundState'),
    ('出站加密器', 'outboundEncryptor'),
    ('获取出站加密器', 'getOutboundEncryptor'),
    ('SS入队发送', 'ssEnqueueSend'),
    ('SS单批最大字节', 'SS_MAX_CHUNK'),
    ('出站加密配置', 'outboundCipherCfg'),
    ('出站主密钥', 'outboundMasterKey'),
    ('出站随机字节', 'outboundSalt'),
    ('出站加密密钥', 'outboundKey'),
    ('出站Nonce计数器', 'outboundNonce'),
    ('随机字节已发送', 'saltSent'),
    ('加密并发送', 'encryptAndSend'),
    ('明文块数组', 'plaintextChunks'),
    ('明文块', 'plaintextChunk'),
    ('明文数据', 'plaintextData'),
    ('合包缓冲', 'bundleBuffer'),
    ('停止已开始', 'stopping'),
    ('强制排空', 'forceDrain'),
    ('活动发送数', 'activeSendCount'),
    ('活动直发数', 'activeDirectCount'),
    ('活动发送错误', 'activeSendError'),
    ('活动发送等待者', 'activeSendWaiters'),
    ('标记发送完成', 'markSendComplete'),
    ('检查活动发送错误', 'checkActiveSendError'),
    ('当前发送器有效', 'isCurrentSenderValid'),
    ('关闭活动连接', 'closeActiveConn'),
    ('发送原始块', 'sendRawChunk'),
    ('串行发送原始块', 'serialSendRaw'),
    ('附加响应头', 'prependRespHeader'),
    ('排队冲刷', 'scheduleFlushNow'),
    ('启动定时器', 'startFlushTimer'),
    ('清理定时器', 'clearFlushTimer'),
    ('串行写', 'serialWrite'),
    ('在途写', 'inflightWrite'),
    ('刷新发送队列', 'flushSendQueue'),
    ('安排刷新发送队列', 'scheduleFlushQueue'),
    ('发送队列', 'sendQueue'),
    ('队列字节数', 'queueBytes'),
    ('刷新定时器', 'flushTimer'),
    ('刷新Microtask已排队', 'flushMicrotaskScheduled'),
    ('关闭连接', 'closeConnection'),
    ('释放远端写入器', 'releaseRemoteWriter'),
    ('当前写入Socket', 'currentWriteSocket'),
    ('远端写入器', 'remoteWriter'),
    ('GRPC上行写入队列', 'grpcUpstreamQueue'),
    ('上行写入队列', 'upstreamQueue'),
    ('写入远端', 'writeToRemote'),
    ('获取写入器', 'getWriter'),
    ('获取连接任务', 'getConnectionTask'),
    ('释放写入器', 'releaseWriter'),
    ('重试连接', 'retryConnect'),
    ('写入并等待', 'writeAndWait'),
    ('等待空', 'waitIdle'),
    ('路径模板', 'pathTemplate'),
    ('木马反代地址', 'trojanProxyAddr'),
    ('反代IP', 'proxyIP'),
    ('代理类型', 'proxyType'),
    ('代理账号', 'proxyAccount'),
    ('代理全局', 'proxyGlobal'),
    ('代理参数', 'proxyParams'),
    ('反代兜底', 'proxyFallback'),
    ('木马反代目标', 'trojanProxyTarget'),
    ('木马反代握手数据', 'trojanProxyHandshake'),
    ('保存快照', 'saveSnapshot'),
    ('优选订阅生成', 'bestSubGen'),
    ('本地IP库', 'localIpPool'),
    ('随机IP', 'randomIp'),
    ('随机数量', 'randomCount'),
    ('指定端口', 'specifyPort'),
    ('订阅转换配置', 'subConvertConfig'),
    ('跳过证书验证', 'skipCertVerify'),
    ('启用0RTT', 'enable0rtt'),
    ('gRPC模式', 'grpcMode'),
    ('TLS分片', 'tlsFragment'),
    ('日志内容', 'logEntry'),
    ('日志数组', 'logArray'),
    ('现有日志', 'existingLog'),
    ('KV容量限制', 'kvSizeLimitMb'),
    ('三十分钟前时间戳', 'thirtyMinAgoTs'),
    ('请求类型', 'requestType'),
    ('是否写入KV日志', 'writeKvLog'),
    ('混淆JSON', 'obfsJson'),
    ('链式代理匹配', 'chainProxyMatch'),
    ('链式代理数据', 'chainProxyData'),
    ('链式代理路径匹配', 'chainProxyPathMatch'),
    ('链式代理明文', 'chainProxyPlaintext'),
    ('反代查询参数', 'proxyQueryParam'),
    ('路径反代参数', 'pathProxyParam'),
    ('最终查询部分', 'finalQueryPart'),
    ('路径部分', 'pathPart'),
    ('查询部分', 'queryPart'),
    ('归一化路径', 'normalizedPath'),
    ('查询数组', 'queryArray'),
    ('DoH缓存', 'dohCache'),
    ('DoH缓存最大条目', 'DOH_CACHE_MAX'),
    ('DoH记录类型映射', 'DOH_TYPE_MAP'),
    ('规范化域名', 'normalizedDomain'),
    ('规范化记录类型', 'normalizedType'),
    ('缓存键', 'cacheKey'),
    ('当前时间戳', 'currentTs'),
    ('现缓存项', 'existingCache'),
    ('过期时间', 'expiresAt'),
    ('开始时间', 'startTime'),
    ('编码域名', 'encodeDnsName'),
    ('解析域名', 'parseDnsName'),
    ('相关记录', 'matchingRecords'),
    ('最小TTL', 'minTTL'),
    ('缓存TTL', 'cacheTTL'),
    ('缓存过期时间', 'cacheExpiresAt'),
    ('缓存数据', 'cacheData'),
    ('缓存条目键', 'cacheEntryKey'),
    ('清理时间戳', 'cleanupTs'),
    ('ASN运营商映射', 'ASN_ISP_MAP'),
    ('运营商关键词映射', 'ISP_KEYWORD_MAP'),
    ('组织名称', 'orgName'),
    ('命中运营商', 'matchedIsp'),
    ('运营商文件标识', 'ispFileTag'),
    ('运营商名称映射', 'ISP_NAME_MAP'),
    ('查询参数运营商', 'queryIsp'),
    ('地址端口', 'addrPort'),
    ('备注位置', 'remarkPos'),
    ('地址部分', 'addrPart'),
    ('备注部分', 'remarkPart'),
    ('解析代理URL', 'parseProxyUrl'),
    ('设置反代IP', 'setProxyIp'),
    ('提取路径值', 'extractPathValue'),
    ('查询反代IP', 'queryProxyIp'),
    ('协议拆分', 'protocolSplit'),
    ('斜杠索引', 'slashIdx'),
    ('加载时间', 'loadTime'),
    ('默认配置JSON', 'defaultConfig'),
    ('初始化开始时间', 'initStartTime'),
    ('初始化TG_JSON', 'initTgJson'),
    ('初始化CF_JSON', 'initCfJson'),
    ('占位符', 'placeholder'),
    ('最终优选列表', 'finalBestList'),
    ('优选API', 'bestApis'),
    ('其他节点', 'otherNodes'),
    ('节点地址', 'nodeAddr'),
    ('节点端口', 'nodePort'),
    ('节点备注', 'nodeRemark'),
    ('域名字段名', 'domainFieldName'),
    ('路径字段名', 'pathFieldName'),
    ('传输协议', 'transportType'),
    ('传输路径参数值', 'transportPathParam'),
    ('数组化', 'toArrayHelper'),
    ('确保Route', 'ensureRoute'),
    ('获取DNS规则服务器', 'getDnsRuleServer'),
    ('添加规则集', 'addRuleSet'),
    ('迁移规则集字段', 'migrateRuleSetFields'),
    ('迁移DNS规则', 'migrateDnsRule'),
    ('RCODE映射', 'RCODE_MAP'),
    ('DNS地址协议类型', 'DNS_ADDR_PROTOCOLS'),
    ('修补路由规则', 'patchRouteRule'),
    ('匹配到gRPC网络', 'matchesGrpcNetwork'),
    ('获取代理类型', 'getProxyType'),
    ('获取凭据值', 'getCredentialValue'),
    ('插入NameserverPolicy', 'insertNameserverPolicy'),
    ('添加Flow格式gRPCUserAgent', 'addFlowGrpcUA'),
    ('添加Block格式gRPCUserAgent', 'addBlockGrpcUA'),
    ('添加Block格式ECHOpts', 'addBlockEchopts'),
    ('基础DNS块', 'baseDnsBlock'),
    ('随机字符串', 'randomStr'),
    ('格式化时间戳', 'formattedTs'),
    ('缓存条目', 'cacheEntry'),

    # Config struct fields (Chinese keys in objects)
    ('优选IP作为反代IP', 'bestIpAsProxyIp'),
    ('备注匹配', 'remarkMatch'),
    ('地址匹配', 'addrMatch'),
    ('地址备注分离', 'addrRemarkSplit'),
    ('合并其他节点数组', 'mergedOtherNodes'),

    # Subscription variables
    ('完整优选IP', 'fullBestIpList'),

    # "v" + "le" + "ss" obfuscation
    ('"v" + "le" + "ss"', '"vless"'),
    ('"edge" + "tunnel"', '"edgetunnel"'),
    ("'vl' + 'ess'", "'vless'"),
    ("'tro' + 'jan'", "'trojan'"),
]

# Sort by length descending to avoid partial matches
renames.sort(key=lambda x: len(x[0]), reverse=True)

for old, new in renames:
    if old == new:
        continue
    sr(old, new)

# ============================================================
# 6. ADD FILE HEADER
# ============================================================
header = """/**
 * EdgeProxy Worker - Cloudflare Workers Proxy Tunnel
 *
 * Capabilities:
 * - VLESS/VMess/Trojan/Shadowsocks protocol parsing
 * - WebSocket/gRPC/xHTTP transport handlers
 * - SOCKS5/HTTP/HTTPS/TURN/SSTP chain proxy support
 * - TLS 1.2/1.3 client implementation (AES-GCM, ChaCha20-Poly1305)
 * - Grain packet bundling system (upstream & downstream)
 * - Subscription generation (Clash/Singbox/Surge/Loon/QuantumultX)
 * - Subscription hot-patching (ECH/gRPC injection)
 * - Admin panel (auth, config, logs, CF usage, Telegram notifications)
 * - DoH client with caching
 * - ISP detection and random IP generation
 * - SHA-224 for Trojan password hashing
 * - HTML camouflage pages
 */

"""
if not code.startswith('/**'):
    code = header + code

# ============================================================
# 7. WRITE RESULT
# ============================================================
with open(src, 'w', encoding='utf-8') as f:
    f.write(code)

lines = code.count('\n') + 1
non_empty = sum(1 for l in code.split('\n') if l.strip())
print(f'Rewrite complete!')
print(f'Total lines: {lines}')
print(f'Non-empty lines: {non_empty}')
print(f'File size: {len(code) / 1024:.1f} KB')

# Verify key functions
checks = [
    'handleXhttpRequest', 'handleGrpcRequest', 'handleWsRequest',
    'forwardDataTcp', 'forwardDataUdp', 'parseTrojanRequest',
    'parseVlessRequest', 'connectStreams', 'socks5Connect',
    'httpConnect', 'httpsConnect', 'turnConnect', 'sstpConnect',
    'TlsClient', 'createGrainBuffer', 'createUpstreamGrainBundle',
    'createUpstreamWriteQueue', 'createDownstreamGrainSender',
    'clashSubHotPatch', 'singboxSubHotPatch', 'surgeSubHotPatch',
    'recordRequestLog', 'loadConfig', 'dohQuery',
    'detectIsp', 'generateRandomIps', 'getProxyParams',
    'nginxPage', 'html1101Page', 'sha224',
    'getCloudflareUsage', 'resolveProxyAddresses',
    'ssAeadEncrypt', 'ssAeadDecrypt', 'ssDeriveMasterKey',
    'export default', 'PAGES_URL'
]

print('\nFunction verification:')
all_present = True
for fn in checks:
    if fn not in code:
        print(f'  MISSING: {fn}')
        all_present = False
if all_present:
    print('  All key functions present!')

# Check remaining Chinese identifiers
import re
chinese_pattern = re.compile(r'[\u4e00-\u9fff]{3,}')
remaining = chinese_pattern.findall(code)
if remaining:
    unique = sorted(set(remaining))
    print(f'\nRemaining Chinese identifiers ({len(unique)}):')
    for c in unique[:50]:
        print(f'  {c}')
    if len(unique) > 50:
        print(f'  ... and {len(unique) - 50} more')
else:
    print('\nNo remaining Chinese identifiers found!')
