const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '_worker.js');
let code = fs.readFileSync(src, 'utf8');

// ============================================================
// 1. FIX PAGES_URL
// ============================================================
code = code.replace(
    "const Pages静态页面 = 'https://edt-pages.github.io';",
    "const PAGES_URL = 'https://hanmo0141.github.io/EdgeProxy';"
);

// ============================================================
// 2. REPLACE FEATURE KEYS (obfuscated signature dictionary)
// ============================================================
// Replace the runtime-computed 特征码字典 with explicit values
code = code.replace(
    `const 特征码字典 = [
	(Proxy.name + "IP").toUpperCase(),
	(String.fromCharCode(67, 109) + URL.name[2] + 'i' + URL.name[0]).toLowerCase(),
	String(2407 * 300 - 10).split('').reverse().join('')
];`,
    `const FEATURE_KEYS = [
    'PROXYIP',
    'edgetunnel',
    '19020'
];`
);

// ============================================================
// 3. REMOVE JSHAMAN DISCLAIMER COMMENT BLOCKS
// ============================================================

// The long disclaimer on line 15 (after 主程序入口 header)
const mainEntryStart = '///////////////////////////////////////////////////////主程序入口///////////////////////////////////////////////';
const mainEntryEnd = '\nexport default {';
if (code.includes(mainEntryStart)) {
    const idx1 = code.indexOf(mainEntryStart);
    const idx2 = code.indexOf(mainEntryEnd, idx1);
    if (idx1 >= 0 && idx2 >= 0) {
        const before = code.substring(0, idx1);
        const after = code.substring(idx2);
        code = before + '///////////////////////////////////////////////////////Main Entry Point///////////////////////////////////////////////\n' + after;
    }
}

// The long disclaimer on line 6509 (after HTML伪装页面 header)
const htmlPageStart = '//////////////////////////////////////////////////////HTML伪装页面///////////////////////////////////////////////';
const htmlPageEnd = '\nasync function nginx()';
if (code.includes(htmlPageStart)) {
    const idx1 = code.indexOf(htmlPageStart);
    const idx2 = code.indexOf(htmlPageEnd, idx1);
    if (idx1 >= 0 && idx2 >= 0) {
        const before = code.substring(0, idx1);
        const after = code.substring(idx2);
        code = before + '///////////////////////////////////////////////////////HTML Camouflage Pages///////////////////////////////////////////////\n' + after;
    }
}

// ============================================================
// 4. SECTION HEADER RENAMES (exact string matches)
// ============================================================
const sectionHeaders = [
    ['///////////////////////////////////////////////////////全局常量和工具函数///////////////////////////////////////////////', '///////////////////////////////////////////////////////Global Constants and Utilities///////////////////////////////////////////////'],
    ['///////////////////////////////////////////////////////查杀特征码///////////////////////////////////////////////', '///////////////////////////////////////////////////////Feature Keys///////////////////////////////////////////////'],
    ['///////////////////////////////////////////////////////////////////////叉HTTP传输数据///////////////////////////////////////////////', '///////////////////////////////////////////////////////xHTTP Transport///////////////////////////////////////////////'],
    ['///////////////////////////////////////////////////////////////////////gRPC传输数据///////////////////////////////////////////////', '///////////////////////////////////////////////////////gRPC Transport///////////////////////////////////////////////'],
    ['///////////////////////////////////////////////////////////////////////WS传输数据///////////////////////////////////////////////', '///////////////////////////////////////////////////////WebSocket Transport///////////////////////////////////////////////'],
    ['//////////////////////////////////////////////////功能性函数///////////////////////////////////////////////', '///////////////////////////////////////////////////////Utility Functions///////////////////////////////////////////////'],
    ['///////////////////////////////////////////////////////SOCKS5/HTTP函数///////////////////////////////////////////////', '///////////////////////////////////////////////////////SOCKS5/HTTP Functions///////////////////////////////////////////////'],
    ['//////////////////////////////////////////////////turnConnect///////////////////////////////////////////////', '///////////////////////////////////////////////// TURN Connect///////////////////////////////////////////////'],
    ['//////////////////////////////////////////////////sstpConnect///////////////////////////////////////////////', '///////////////////////////////////////////////// SSTP Connect///////////////////////////////////////////////'],
];

for (const [from, to] of sectionHeaders) {
    code = code.split(from).join(to);
}

// ============================================================
// 5. GLOBAL VARIABLE AND FUNCTION RENAMES
// ============================================================
// Order matters: replace longer names before shorter ones to avoid partial matches
const renames = [
    // ---- Global state variables ----
    ['let config_JSON,', 'let configJSON,'],
    ['缓存SOCKS5白名单 = null', 'cachedSocks5Whitelist = null'],
    ['缓存SOCKS5白名单 === null', 'cachedSocks5Whitelist === null'],
    ['缓存SOCKS5白名单 = SOCKS5白名单', 'cachedSocks5Whitelist = socks5Whitelist'],
    ['SOCKS5白名单 = 缓存SOCKS5白名单', 'socks5Whitelist = cachedSocks5Whitelist'],
    ['调试日志打印 =', 'debugLogging ='],
    ['SOCKS5白名单 = [', 'socks5Whitelist = ['],
    ['SOCKS5白名单.concat', 'socks5Whitelist.concat'],
    ['SOCKS5白名单.some', 'socks5Whitelist.some'],
    ['Pages静态页面', 'PAGES_URL'],

    // ---- Constants ----
    ['WS早期数据最大字节', 'WS_MAX_EARLY_BYTES'],
    ['WS早期数据最大头长度', 'WS_MAX_EARLY_HEADER_LEN'],
    ['上行合包目标字节', 'UPSTREAM_BUNDLE_TARGET'],
    ['上行队列最大字节', 'UPSTREAM_QUEUE_MAX_BYTES'],
    ['上行队列最大条目', 'UPSTREAM_QUEUE_MAX_ENTRIES'],
    ['下行Grain包字节', 'DOWNSTREAM_GRAIN_SIZE'],
    ['下行Grain尾部阈值', 'DOWNSTREAM_GRAIN_TAIL_THRESHOLD'],
    ['下行Grain低水位字节', 'DOWNSTREAM_GRAIN_LOW_WATER'],
    ['下行Grain最大等待轮次', 'DOWNSTREAM_GRAIN_MAX_WAIT'],
    ['TCP并发拨号数', 'tcpConcurrentDial'],
    ['反代并发拨号数', 'proxyConcurrentDial'],
    ['预加载竞速拨号', 'preloadRaceDial'],
    ['特征码字典', 'FEATURE_KEYS'],

    // ---- Main handler variables ----
    ['let 请求URL文本', 'let requestUrlText'],
    ['请求URL文本', 'requestUrlText'],
    ['请求URL锚点索引', 'urlAnchorIndex'],
    ['请求URL主体部分', 'urlBody'],
    ['请求URL锚点部分', 'urlAnchorPart'],
    ['管理员密码', 'adminPassword'],
    ['加密秘钥', 'encryptionKey'],
    ['访问路径', 'accessPath'],
    ['默认反代IP', 'defaultProxyIP'],
    ['默认反代兜底', 'defaultProxyFallback'],
    ['访问IP', 'visitorIP'],
    ['请求UUID', 'requestUUID'],
    ['目标UUID', 'targetUUID'],
    ['请求前8总和', 'requestPrefixSum'],
    ['目标前8总和', 'targetPrefixSum'],
    ['请求码', 'requestCode'],
    ['目标码', 'targetCode'],
    ['反代上下文', 'proxyContext'],
    ['本机Padding头', 'localPaddingHeader'],
    ['本机Padding键', 'localPaddingKey'],
    ['命中叉HTTP特征', 'matchedXhttp'],
    ['伪装页URL', 'camouflageUrl'],
    ['新请求头', 'newHeaders'],
    ['反代响应', 'proxyResponse'],
    ['内容类型', 'respContentType'],
    ['响应内容', 'responseContent'],
    ['区分大小写访问路径', 'caseSensitivePath'],

    // ---- Config variables ----
    ['config_JSON', 'configJSON'],
    ['配置JSON', 'configJSON'],

    // ---- Subscription variables ----
    ['订阅TOKEN', 'subToken'],
    ['作为优选订阅生成器', 'asBestSubGenerator'],
    ['请求TOKEN', 'requestToken'],
    ['用户客户端请求订阅', 'isClientSubRequest'],
    ['当前日序号', 'currentDayNum'],
    ['订阅转换后端TOKEN种子', 'subConvertTokenSeed'],
    ['今日订阅转换后端专属TOKEN', 'todaySubConvertToken'],
    ['昨日订阅转换后端专属TOKEN', 'yesterdaySubConvertToken'],
    ['订阅转换后端请求订阅', 'isSubConvertRequest'],
    ['订阅类型', 'subType'],
    ['订阅内容', 'subContent'],
    ['协议类型', 'protoType'],
    ['TLS分片参数', 'tlsFragmentParams'],
    ['完整节点路径', 'fullNodePath'],
    ['完整优选IP', 'fullBestIpList'],
    ['其他节点LINK', 'otherNodeLinks'],
    ['反代IP池', 'proxyIpPool'],

    // ---- Function names ----
    ['async function 处理叉HTTP请求', 'async function handleXhttpRequest'],
    ['function 处理叉HTTPUDP请求', 'function handleXhttpUdpRequest'],
    ['async function 处理gRPC请求', 'async function handleGrpcRequest'],
    ['async function 处理WS请求', 'async function handleWsRequest'],
    ['async function forwardataTCP', 'async function forwardDataTcp'],
    ['async function forwardataudp', 'async function forwardDataUdp'],

    // Protocol parsing
    ['function 解析木马请求', 'function parseTrojanRequest'],
    ['function 解析魏烈思请求', 'function parseVlessRequest'],
    ['function UUID字节匹配', 'function uuidBytesMatch'],
    ['function 获取UUID字节', 'function getUuidBytes'],
    ['function 读取十六进制半字节', 'function readHexNibble'],
    ['function 是有效WS早期数据', 'function isValidWsEarlyData'],
    ['function 解码WS早期数据', 'function decodeWsEarlyData'],

    // Trojan
    ['function 解析木马反代地址', 'function parseTrojanProxyAddr'],
    ['async function 连接木马反代', 'async function connectTrojanProxy'],
    ['function 提取木马反代握手数据', 'function extractTrojanProxyHandshake'],
    ['async function 转发木马UDP反代数据', 'async function forwardTrojanUdpProxyData'],
    ['async function 转发木马UDP数据', 'async function forwardTrojanUdpData'],
    ['const 木马文本解码器', 'const trojanTextDecoder'],

    // xHTTP
    ['function 获取叉HTTPPadding标识', 'function getXhttpPaddingIds'],
    ['function 计算HPACKHuffman字节长度', 'function computeHpackHuffmanByteLen'],
    ['function 提取叉HTTPPadding值', 'function extractXhttpPaddingValue'],
    ['function 校验叉HTTPPadding', 'function validateXhttpPadding'],
    ['const 叉HTTPBase62字符集', 'const XHTTP_BASE62_CHARS'],
    ['function 生成叉HTTPPadding串', 'function generateXhttpPadding'],
    ['async function 读取叉HTTP首包', 'async function readXhttpFirstPacket'],

    // SS
    ['function 数据转Uint8Array', 'function toUint8Array'],
    ['function 拼接字节数据', 'function concatBytesArray'],
    ['function SS递增Nonce计数器', 'function ssIncrementNonce'],
    ['async function SS派生主密钥', 'async function ssDeriveMasterKey'],
    ['async function SS派生会话密钥', 'async function ssDeriveSessionKey'],
    ['async function SSAEAD加密', 'async function ssAeadEncrypt'],
    ['async function SSAEAD解密', 'async function ssAeadDecrypt'],
    ['const SS支持加密配置', 'const SS_CIPHER_CONFIGS'],
    ['const SSAEAD标签长度', 'const SS_AEAD_TAG_LEN'],
    ['const SSNonce长度', 'const SS_NONCE_LEN'],
    ['const SS子密钥信息', 'const SS_SUBKEY_INFO'],
    ['const SS文本编码器', 'const ssTextEncoder'],
    ['const SS文本解码器', 'const ssTextDecoder'],
    ['const SS主密钥缓存', 'const ssMasterKeyCache'],

    // Grain system
    ['function 创建Grain收纳器', 'function createGrainBuffer'],
    ['function 创建上行Grain合包流', 'function createUpstreamGrainBundle'],
    ['function 创建上行写入队列', 'function createUpstreamWriteQueue'],
    ['function 创建下行Grain发送器', 'function createDownstreamGrainSender'],

    // WebSocket
    ['const UUID字节缓存', 'const uuidByteCache'],
    ['const 魏烈思文本解码器', 'const vlessTextDecoder'],

    // Config
    ['async function 读取config_JSON', 'async function loadConfig'],
    ['function Clash订阅配置文件热补丁', 'function clashSubHotPatch'],
    ['async function Singbox订阅配置文件热补丁', 'async function singboxSubHotPatch'],
    ['function Surge订阅配置文件热补丁', 'function surgeSubHotPatch'],
    ['async function 请求日志记录', 'async function recordRequestLog'],
    ['function 掩码敏感信息', 'function maskSensitiveInfo'],
    ['async function MD5MD5', 'async function md5md5'],
    ['function 随机路径', 'function randomPath'],
    ['function 替换星号为随机字符', 'function replaceWildcard'],
    ['function 识别运营商', 'function detectIsp'],
    ['async function 生成随机IP', 'async function generateRandomIps'],
    ['async function 整理成数组', 'async function toArray'],
    ['async function 获取优选订阅生成器数据', 'async function fetchBestSubData'],
    ['async function 请求优选API', 'async function fetchBestIpApi'],
    ['async function 反代参数获取', 'async function getProxyParams'],
    ['function 获取代理默认端口', 'function getProxyDefaultPort'],
    ['function 获取SOCKS5账号', 'function parseSocks5Account'],
    ['async function DoH查询', 'async function dohQuery'],
    ['async function 解析地址端口', 'async function resolveProxyAddresses'],
    ['function 创建请求TCP连接器', 'function createRequestTcpConnector'],
    ['function 有效数据长度', 'function dataByteLength'],
    ['function 失效TCP连接世代', 'function invalidateTcpGen'],
    ['function 开始TCP连接世代', 'function beginTcpGen'],
    ['function 构造本地204响应', 'function buildLocal204'],
    ['function 构造WS本地204响应', 'function buildWsLocal204'],
    ['function 获取传输协议配置', 'function getTransportConfig'],
    ['function 获取传输路径参数值', 'function getTransportPathParam'],

    // HTML pages
    ['async function nginx()', 'async function nginxPage()'],
    ['async function html1101', 'async function html1101Page'],

    // Proxy
    ['const 反代协议默认端口', 'const PROXY_DEFAULT_PORTS'],
    ['const SOCKS5账号Base64正则', 'const SOCKS5_B64_RE'],
    ['const IPv6方括号正则', 'const IPV6_BRACKET_RE'],

    // ---- Chinese variable names in function bodies ----
    ['反代数组索引', 'proxyArrayIndex'],
    ['连接超时毫秒', 'connectTimeoutMs'],
    ['已通过代理发送首包', 'firstPacketSentViaProxy'],
    ['待发送响应头', 'pendingRespHeader'],
    ['安装当前连接', 'installCurrentConnection'],
    ['等待连接建立', 'awaitConnectionOpen'],
    ['打开TCP连接', 'openTcpConnection'],
    ['写入首包', 'writeFirstPacket'],
    ['并发打开候选连接', 'raceOpenCandidates'],
    ['构建预加载竞速候选列表', 'buildPreloadRaceCandidates'],
    ['连接到代理', 'connectViaProxy'],
    ['连接直连', 'connectDirect'],
    ['所有反代数组', 'allProxyArray'],
    ['启用反代失败兜底', 'allowProxyFallback'],
    ['建立连接', 'establishConnection'],
    ['启用预加载', 'enablePreload'],

    // SS context
    ['获取SS上下文', 'getSsContext'],
    ['处理SS数据', 'handleSsData'],
    ['处理WS入站数据', 'handleWsInboundData'],
    ['入队WS显式传输', 'enqueueWsExplicit'],
    ['收尾WS显式传输', 'finalizeWsExplicit'],
    ['处理WS显式传输错误', 'handleWsExplicitError'],
    ['追加WS显式传输任务', 'appendWsExplicitTask'],
    ['入站解密器', 'inboundDecryptor'],
    ['回包Socket', 'replySocket'],
    ['首包已建立', 'firstPacketEstablished'],
    ['入站状态', 'inboundState'],
    ['出站加密器', 'outboundEncryptor'],
    ['获取出站加密器', 'getOutboundEncryptor'],
    ['SS入队发送', 'ssEnqueueSend'],
    ['SS单批最大字节', 'SS_MAX_CHUNK'],
    ['出站加密配置', 'outboundCipherConfig'],
    ['出站主密钥', 'outboundMasterKey'],
    ['出站随机字节', 'outboundSalt'],
    ['出站加密密钥', 'outboundKey'],
    ['出站Nonce计数器', 'outboundNonce'],
    ['随机字节已发送', 'saltSent'],
    ['加密并发送', 'encryptAndSend'],
    ['明文块数组', 'plaintextChunks'],
    ['明文块', 'plaintextChunk'],
    ['明文数据', 'plaintextData'],

    // Grain bundling
    ['合包缓冲', 'bundleBuffer'],
    ['收纳', 'enqueue'],
    ['合包', 'bundle'],
    ['字节数', 'byteCount'],
    ['条目数', 'entryCount'],
    ['压缩', 'compact'],
    ['取出', 'dequeue'],
    ['为空', 'isEmpty'],
    ['清空', 'clear'],
    ['读取', 'read'],
    ['写入', 'write'],
    ['结束', 'end'],
    ['停止已开始', 'stopping'],
    ['强制排空', 'forceDrain'],
    ['活动发送数', 'activeSendCount'],
    ['活动直发数', 'activeDirectCount'],
    ['活动发送错误', 'activeSendError'],
    ['活动发送等待者', 'activeSendWaiters'],
    ['标记发送完成', 'markSendComplete'],
    ['检查活动发送错误', 'checkActiveSendError'],
    ['当前发送器有效', 'isCurrentSenderValid'],
    ['关闭活动连接', 'closeActiveConnection'],
    ['发送原始块', 'sendRawChunk'],
    ['串行发送原始块', 'serialSendRawChunk'],
    ['附加响应头', 'prependResponseHeader'],
    ['排队冲刷', 'scheduleFlushNow'],
    ['启动定时器', 'startFlushTimer'],
    ['清理定时器', 'clearFlushTimer'],
    ['串行写', 'serialWrite'],
    ['在途写', 'inflightWrite'],

    // Downstream grain
    ['刷新发送队列', 'flushSendQueue'],
    ['安排刷新发送队列', 'scheduleFlushQueue'],
    ['发送队列', 'sendQueue'],
    ['队列字节数', 'queueBytes'],
    ['刷新定时器', 'flushTimer'],
    ['刷新Microtask已排队', 'flushMicrotaskScheduled'],
    ['关闭连接', 'closeConnection'],
    ['释放远端写入器', 'releaseRemoteWriter'],
    ['当前写入Socket', 'currentWriteSocket'],
    ['远端写入器', 'remoteWriter'],
    ['GRPC上行写入队列', 'grpcUpstreamQueue'],
    ['上行写入队列', 'upstreamQueue'],
    ['写入远端', 'writeToRemote'],
    ['获取写入器', 'getWriter'],
    ['获取连接任务', 'getConnectionTask'],
    ['释放写入器', 'releaseWriter'],
    ['重试连接', 'retryConnect'],
    ['名称', 'name'],
    ['写入并等待', 'writeAndWait'],
    ['等待空', 'waitIdle'],

    // Config related
    ['反代', 'proxy'],
    ['SOCKS5', 'SOCKS5'],
    ['路径模板', 'pathTemplate'],
    ['木马反代地址', 'trojanProxyAddr'],
    ['反代IP', 'proxyIP'],
    ['代理类型', 'proxyType'],
    ['代理账号', 'proxyAccount'],
    ['代理全局', 'proxyGlobal'],
    ['代理参数', 'proxyParams'],
    ['反代兜底', 'proxyFallback'],
    ['木马反代目标', 'trojanProxyTarget'],
    ['木马反代握手数据', 'trojanProxyHandshake'],
    ['保存快照', 'saveSnapshot'],

    // Subscription generation
    ['优选订阅生成', 'bestSubGen'],
    ['本地IP库', 'localIpPool'],
    ['随机IP', 'randomIp'],
    ['随机数量', 'randomCount'],
    ['指定端口', 'specifyPort'],
    ['订阅转换配置', 'subConvertConfig'],
    ['跳过证书验证', 'skipCertVerify'],
    ['启用0RTT', 'enable0rtt'],
    ['随机路径', 'randomPathEnabled'],
    ['gRPC模式', 'grpcMode'],
    ['gRPCUserAgent', 'gRPCUserAgent'],
    ['TLS分片', 'tlsFragment'],
    ['Fingerprint', 'Fingerprint'],

    // Cloudflare usage
    ['Usage_JSON', 'usageJson'],
    ['Usage', 'usage'],

    // Telegram
    ['TG_JSON', 'tgJson'],
    ['TG_TXT', 'tgText'],
    ['TG_TXT', 'tgText'],
    ['BotToken', 'BotToken'],
    ['ChatID', 'ChatID'],

    // Log
    ['日志内容', 'logEntry'],
    ['日志数组', 'logArray'],
    ['现有日志', 'existingLog'],
    ['KV容量限制', 'kvSizeLimitMb'],
    ['三十分钟前时间戳', 'thirtyMinAgoTs'],
    ['请求类型', 'requestType'],
    ['是否写入KV日志', 'writeKvLog'],
    ['前置长度', 'prefixLen'],
    ['后缀长度', 'suffixLen'],

    // Misc remaining Chinese identifiers
    ['混淆JSON', 'obfsJson'],
    ['链式代理匹配', 'chainProxyMatch'],
    ['链式代理数据', 'chainProxyData'],
    ['链式代理参数', 'chainProxyParams'],
    ['链式代理路径匹配', 'chainProxyPathMatch'],
    ['链式代理明文', 'chainProxyPlaintext'],
    ['反代查询参数', 'proxyQueryParam'],
    ['路径反代参数', 'pathProxyParam'],
    ['最终查询部分', 'finalQueryPart'],
    ['路径部分', 'pathPart'],
    ['查询部分', 'queryPart'],
    ['归一化路径', 'normalizedPath'],
    ['查询数组', 'queryArray'],

    // DoH
    ['DoH缓存', 'dohCache'],
    ['DoH缓存最大条目', 'DOH_CACHE_MAX'],
    ['DoH记录类型映射', 'DOH_TYPE_MAP'],
    ['规范化域名', 'normalizedDomain'],
    ['规范化记录类型', 'normalizedType'],
    ['缓存键', 'cacheKey'],
    ['当前时间戳', 'currentTs'],
    ['现缓存项', 'existingCache'],
    ['过期时间', 'expiresAt'],
    ['开始时间', 'startTime'],
    ['编码域名', 'encodeDnsName'],
    ['解析域名', 'parseDnsName'],
    ['记录类型字符串转数值', 'recordTypeStrToNum'],
    ['相关记录', 'matchingRecords'],
    ['最小TTL', 'minTTL'],
    ['缓存TTL', 'cacheTTL'],
    ['缓存过期时间', 'cacheExpiresAt'],
    ['缓存数据', 'cacheData'],
    ['缓存条目', 'cacheEntry'],
    ['缓存条目键', 'cacheEntryKey'],
    ['清理时间戳', 'cleanupTs'],

    // ISP detection
    ['ASN运营商映射', 'ASN_ISP_MAP'],
    ['运营商关键词映射', 'ISP_KEYWORD_MAP'],
    ['组织名称', 'orgName'],
    ['命中运营商', 'matchedIsp'],
    ['运营商文件标识', 'ispFileTag'],
    ['运营商名称映射', 'ISP_NAME_MAP'],
    ['查询参数运营商', 'queryIsp'],

    // Random IP generation
    ['运营商文件标识', 'ispFileTag'],
    ['运营商名称映射', 'ISP_NAME_MAP'],
    ['CF官方优选', 'CF Official'],
    ['CF移动优选', 'CF Mobile'],
    ['CF联通优选', 'CF Unicom'],
    ['CF电信优选', 'CF Telecom'],

    // Proxy address resolution
    ['地址端口', 'addrPort'],
    ['备注位置', 'remarkPos'],
    ['地址部分', 'addrPart'],
    ['备注部分', 'remarkPart'],
    ['子匹配', 'subMatch'],

    // Proxy parameter parsing
    ['解析代理URL', 'parseProxyUrl'],
    ['设置反代IP', 'setProxyIp'],
    ['提取路径值', 'extractPathValue'],
    ['查询反代IP', 'queryProxyIp'],
    ['匹配', 'match'],
    ['协议拆分', 'protocolSplit'],
    ['斜杠索引', 'slashIdx'],

    // Config reading helpers
    ['加载时间', 'loadTime'],
    ['默认配置JSON', 'defaultConfig'],
    ['初始化开始时间', 'initStartTime'],
    ['初始化TG_JSON', 'initTgJson'],
    ['初始化CF_JSON', 'initCfJson'],
    ['占位符', 'placeholder'],
    ['占位符', 'placeholder'],
    ['最终优选列表', 'finalBestList'],
    ['优选API', 'bestApis'],
    ['优选IP', 'bestIps'],
    ['其他节点', 'otherNodes'],

    // Subscription generation more
    ['节点地址', 'nodeAddr'],
    ['节点端口', 'nodePort'],
    ['节点备注', 'nodeRemark'],
    ['域名字段名', 'domainFieldName'],
    ['路径字段名', 'pathFieldName'],
    ['传输协议', 'transportType'],
    ['传输路径参数值', 'transportPathParam'],
    ['IS_LoonOrSurge', 'isLoonOrSurge'],
    ['isLoonOrSurge', 'isLoonOrSurge'],

    // Singbox hot patch
    ['数组化', 'toArrayHelper'],
    ['确保Route', 'ensureRoute'],
    ['获取DNS规则服务器', 'getDnsRuleServer'],
    ['添加规则集', 'addRuleSet'],
    ['迁移规则集字段', 'migrateRuleSetFields'],
    ['迁移DNS规则', 'migrateDnsRule'],
    ['RCODE映射', 'RCODE_MAP'],
    ['DNS地址协议类型', 'DNS_ADDR_PROTOCOLS'],
    ['修补路由规则', 'patchRouteRule'],

    // Clash hot patch
    ['基础DNS块', 'baseDnsBlock'],
    ['匹配到gRPC网络', 'matchesGrpcNetwork'],
    ['获取代理类型', 'getProxyType'],
    ['获取凭据值', 'getCredentialValue'],
    ['插入NameserverPolicy', 'insertNameserverPolicy'],
    ['添加Flow格式gRPCUserAgent', 'addFlowGrpcUserAgent'],
    ['添加Block格式gRPCUserAgent', 'addBlockGrpcUserAgent'],
    ['添加Block格式ECHOpts', 'addBlockEchopts'],

    // Proxy list
    ['IPv6方括号正则', 'IPV6_BRACKET_RE'],
    ['账号Base64正则', 'B64_RE'],

    // Remaining misc
    ['随机字符串', 'randomStr'],
    ['格式化时间戳', 'formattedTs'],

    // SSTP related
    ['读取SSTP', 'readSstp'],
    ['构建SSTP', 'buildSstp'],

    // TURN related  
    ['TURN_STUN_MAGIC_COOKIE', 'TURN_STUN_MAGIC_COOKIE'],
    ['TURN_STUN_TYPE', 'TURN_STUN_TYPE'],
    ['TURN_STUN_ATTR', 'TURN_STUN_ATTR'],

    // TLS related
    ['TLS_MAX_PLAINTEXT_FRAGMENT', 'TLS_MAX_PLAINTEXT_FRAGMENT'],
    ['TLS_VERSION_10', 'TLS_VERSION_10'],
    ['TLS_VERSION_12', 'TLS_VERSION_12'],
    ['TLS_VERSION_13', 'TLS_VERSION_13'],

    // HTTP version
    ['CONNECT_TIMEOUT_MS', 'CONNECT_TIMEOUT_MS'],

    // Remaining Chinese in catch blocks, console.error, etc.
    ['配置不完整', 'Config incomplete'],
    ['配置重置为默认值', 'Config reset to defaults'],
    ['配置已保存', 'Config saved'],
    ['自定义IP已保存', 'Custom IPs saved'],
    ['自定义IP保存失败', 'Failed to save custom IPs'],
    ['配置重置失败', 'Config reset failed'],
    ['保存配置失败', 'Failed to save config'],
    ['保存自定义IP失败', 'Failed to save custom IPs'],
    ['缺少代理参数', 'Missing proxy parameter'],
    ['代理检测请求失败', 'Proxy check request failed'],
    ['代理检测响应无效', 'Proxy check response invalid'],
    ['代理检测响应头过长或无效', 'Proxy check response header too long or invalid'],
    ['无效响应', 'Invalid response'],

    // Chinese string literals in config
    ['"v" + "le" + "ss"', '"vless"'],
    ['"edge" + "tunnel"', '"edgetunnel"'],

    // Log messages - translate the most common ones
    ['[WebSocket] 命中请求', '[WebSocket] Matched request'],
    ['[gRPC] 命中请求', '[gRPC] Matched request'],
    ['[叉HTTP] 命中请求', '[xHTTP] Matched request'],
    ['[gRPC] 木马首包', '[gRPC] Trojan first packet'],
    ['[gRPC] 魏烈思首包', '[gRPC] VLESS first packet'],
    ['[gRPC-Pipe] 连接失败', '[gRPC-Pipe] Connection failed'],
    ['[WS-Pipe] 连接失败', '[WS-Pipe] Connection failed'],
    ['[WS-Pipe] 读取失败', '[WS-Pipe] Read failed'],
    ['[WS-Pipe] 协议', '[WS-Pipe] Protocol'],
    ['[WS上行] 写入失败', '[WS-Upstream] Write failed'],
    ['[gRPC上行] 写入失败', '[gRPC-Upstream] Write failed'],
    ['[TCP转发] 尝试直连', '[TCP-Forward] Trying direct connect'],
    ['[TCP转发] 直连', '[TCP-Forward] Direct connect'],
    ['[TCP转发] SOCKS5/HTTP/HTTPS/TURN/SSTP 代理连接', '[TCP-Forward] SOCKS5/HTTP/HTTPS/TURN/SSTP proxy connect'],
    ['[TCP转发] 启用 SOCKS5/HTTP/HTTPS/TURN/SSTP 全局代理', '[TCP-Forward] Using global SOCKS5/HTTP/HTTPS/TURN/SSTP proxy'],
    ['[TCP转发] 构造本地204响应', '[TCP-Forward] Built local 204 response'],
    ['[木马反代] 代理到', '[Trojan-Proxy] Forwarding to'],
    ['[SS入站] 检测到前导噪声', '[SS-Inbound] Leading noise detected'],
    ['[SS入站] URL enc=', '[SS-Inbound] URL enc='],
    ['[SS入站] 解密失败', '[SS-Inbound] Decryption failed'],
    ['[SS发送] 加密失败', '[SS-Send] Encryption failed'],
    ['[WS转发] 连接结束', '[WS-Forward] Connection ended'],
    ['[WS转发] 处理失败', '[WS-Forward] Processing failed'],
    ['[WS转发] 协议类型', '[WS-Forward] Protocol type'],
    ['[gRPC转发] 处理失败', '[gRPC-Forward] Processing failed'],
    ['[xHTTP-Pipe] 连接失败', '[xHTTP-Pipe] Connection failed'],
    ['[xHTTP-Forward] 处理失败', '[xHTTP-Forward] Processing failed'],
    ['[TCP-Forward] 目标', '[TCP-Forward] Target'],
    ['[TCP-Forward] 反代IP', '[TCP-Forward] ProxyIP'],
    ['[TCP-Forward] 反代兜底', '[TCP-Forward] Proxy fallback'],
    ['[TCP-Forward] 反代类型', '[TCP-Forward] Proxy type'],
    ['[TCP-Forward] 全局', '[TCP-Forward] Global'],
    ['[TCP-Direct] Preload race dial enabled', '[TCP-Direct] Preload race dial enabled'],
    ['[TCP-Direct] A records', '[TCP-Direct] A records'],
    ['[TCP-Direct] Concurrent attempts', '[TCP-Direct] Concurrent attempts'],
    ['[TCP-Direct] Preload race result', '[TCP-Direct] Preload race result'],
    ['[TCP-Direct] Preload race failed', '[TCP-Direct] Preload race failed'],
    ['[TCP-Direct] 未获得可用解析结果', '[TCP-Direct] No usable DNS results'],
    ['[TCP-Direct] 预加载竞速不可用', '[TCP-Direct] Preload race unavailable'],
    ['[TCP-Downlink] 读取失败', '[TCP-Downlink] Read failed'],
    ['[TCP-Downlink] 处理失败', '[TCP-Downlink] Processing failed'],
    ['[Proxy-Connect] Concurrent attempts', '[Proxy-Connect] Concurrent attempts'],
    ['[Proxy-Connect] Connected to', '[Proxy-Connect] Connected to'],
    ['[Proxy-Connect] Batch connect failed', '[Proxy-Connect] Batch connect failed'],
    ['[Proxy-Connect] All proxy connects failed', '[Proxy-Connect] All proxy connects failed'],
    ['[Proxy-Resolve] Resolution complete', '[Proxy-Resolve] Resolution complete'],
    ['[UDP-Forward] Received DNS request', '[UDP-Forward] Received DNS request'],
    ['[UDP-Forward] DNS request written upstream', '[UDP-Forward] DNS request written upstream'],
    ['[UDP-Forward] Received DNS response', '[UDP-Forward] Received DNS response'],
    ['[UDP-Forward] DNS forward failed', '[UDP-Forward] DNS forward failed'],
    ['[DoH] Cache hit', '[DoH] Cache hit'],
    ['[DoH] Query started', '[DoH] Query started'],
    ['[DoH] Response received', '[DoH] Response received'],
    ['[DoH] Query completed', '[DoH] Query completed'],
    ['[DoH] Cache written', '[DoH] Cache written'],
    ['[DoH] Query failed', '[DoH] Query failed'],
    ['[SOCKS5-Proxy] Forwarding to', '[SOCKS5-Proxy] Forwarding to'],
    ['[HTTP-Proxy] Forwarding to', '[HTTP-Proxy] Forwarding to'],
    ['[HTTPS-Proxy] Forwarding to', '[HTTPS-Proxy] Forwarding to'],
    ['[TURN-Proxy] Forwarding to', '[TURN-Proxy] Forwarding to'],
    ['[SSTP-Proxy] Forwarding to', '[SSTP-Proxy] Forwarding to'],
    ['[Trojan-Proxy] Forwarding to', '[Trojan-Proxy] Forwarding to'],
    ['[SS-Init] Auto-detect cipher', '[SS-Init] Auto-detect cipher'],
];

// Apply renames - longer strings first to avoid partial matches
// Sort by length descending
renames.sort((a, b) => b[0].length - a[0].length);

for (const [from, to] of renames) {
    if (from === to) continue; // skip already-English names
    code = code.split(from).join(to);
}

// ============================================================
// 6. ADD FILE HEADER
// ============================================================
const header = `/**
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

`;

// Only add header if not already present
if (!code.startsWith('/**')) {
    code = header + code;
}

// ============================================================
// 7. WRITE RESULT
// ============================================================
fs.writeFileSync(src, code, 'utf8');

const lines = code.split('\n').length;
const nonEmptyLines = code.split('\n').filter(l => l.trim()).length;
console.log(`Rewrite complete!`);
console.log(`Total lines: ${lines}`);
console.log(`Non-empty lines: ${nonEmptyLines}`);
console.log(`File size: ${(code.length / 1024).toFixed(1)} KB`);

// Verify key functions exist
const checks = [
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
    'export default'
];

console.log('\nFunction verification:');
let allPresent = true;
for (const fn of checks) {
    if (!code.includes(fn)) {
        console.log(`  MISSING: ${fn}`);
        allPresent = false;
    }
}
if (allPresent) console.log('  All key functions present!');

// Check for remaining Chinese identifiers (excluding string literals and log messages)
const chinesePattern = /[\u4e00-\u9fff]{2,}/g;
const remaining = code.match(chinesePattern);
if (remaining) {
    const unique = [...new Set(remaining)];
    console.log(`\nRemaining Chinese identifiers (${unique.length}):`);
    unique.forEach(c => console.log(`  ${c}`));
} else {
    console.log('\nNo remaining Chinese identifiers found!');
}
