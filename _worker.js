const VERSION = '2026-08-29 12:00:00';
let cachedConfig, cachedSocks5Whitelist = null, debugLogEnabled = false;
let socks5Whitelist = ['*tapecontent.net', '*cloudatacdn.com', '*loadshare.org', '*cdn-centaurus.com', 'scholar.google.com'];
const PAGES_URL = 'https://hanmo0141.github.io/EdgeProxy-Pages';
const WS_MAX_EARLY_BYTES = 8 * 1024, WS_MAX_EARLY_HEADER_LEN = Math.ceil(WS_MAX_EARLY_BYTES * 4 / 3) + 4;
const UPSTREAM_BUNDLE_TARGET = 20 * 1024, UPSTREAM_QUEUE_MAX_BYTES = 16 * 1024 * 1024, UPSTREAM_QUEUE_MAX_ENTRIES = 4096;
const DOWNSTREAM_GRAIN_BYTES = 32 * 1024, DOWNSTREAM_GRAIN_TAIL = 512, DOWNSTREAM_GRAIN_LOW_WATER = Math.max(4096, DOWNSTREAM_GRAIN_TAIL * 12), DOWNSTREAM_GRAIN_MAX_WAIT = 4;
let TCP_CONCURRENT_DIAL = 2, PROXY_CONCURRENT_DIAL = 1, PRELOAD_RACE_DIAL = false;
const FEATURE_CODES = [
	(Proxy.name + "IP").toUpperCase(),
	(String.fromCharCode(67, 109) + URL.name[2] + 'i' + URL.name[0]).toLowerCase(),
	String(2407 * 300 - 10).split('').reverse().join('')
];
/////////////////////////////////////////////////////// Main Entry Point ///////////////////////////////////////////////
export default {
	async fetch(request, env, ctx) {
		let reqUrlText = request.url.replace(/%5[Cc]/g, '').replace(/\\/g, '');
		const anchorIdx = reqUrlText.indexOf('#');
		const reqUrlBody = anchorIdx === -1 ? reqUrlText : reqUrlText.slice(0, anchorIdx);
		if (!reqUrlBody.includes('?') && /%3f/i.test(reqUrlBody)) {
			const anchorPart = anchorIdx === -1 ? '' : reqUrlText.slice(anchorIdx);
			reqUrlText = reqUrlBody.replace(/%3f/i, '?') + anchorPart;
		}
		const url = new URL(reqUrlText);
		const UA = request.headers.get('User-Agent') || 'null';
		const upgradeHeader = (request.headers.get('Upgrade') || '').toLowerCase(), contentType = (request.headers.get('content-type') || '').toLowerCase();
		const adminPassword = env.ADMIN || env.admin || env.PASSWORD || env.password || env.pswd || env.TOKEN || env.KEY || env.UUID || env.uuid;
		const encryptionKey = env.KEY || 'DoNotChangeDefaultKey';
		const userIDMD5 = await doubleMD5(adminPassword + encryptionKey);
		const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
		const envUUID = env.UUID || env.uuid;
		const userID = (envUUID && uuidRegex.test(envUUID)) ? envUUID.toLowerCase() : [userIDMD5.slice(0, 8), userIDMD5.slice(8, 12), '4' + userIDMD5.slice(13, 16), '8' + userIDMD5.slice(17, 20), userIDMD5.slice(20)].join('-');
		const hosts = env.HOST ? (await splitToArray(env.HOST)).map(h => h.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]) : [url.hostname];
		const host = hosts[0];
		const accessPath = url.pathname.slice(1).toLowerCase();
		debugLogEnabled = ['1', 'true'].includes(env.DEBUG) || debugLogEnabled;
		PRELOAD_RACE_DIAL = ['1', 'true'].includes(env.PRELOAD_RACE_DIAL) || PRELOAD_RACE_DIAL;
		PROXY_CONCURRENT_DIAL = Math.max(1, Number(env.PROXY_CONCURRENT_DIAL) || PROXY_CONCURRENT_DIAL);
		TCP_CONCURRENT_DIAL = Math.max(1, Number(env.TCP_CONCURRENT_DIAL) || TCP_CONCURRENT_DIAL);
		if (!env.TCP_CONCURRENT_DIAL && TCP_CONCURRENT_DIAL !== 1 && detectISP(request) === 'cmcc') TCP_CONCURRENT_DIAL = 1;
		let defaultProxyIP = (`${request.cf.colo}.${FEATURE_CODES[0]}.${FEATURE_CODES[1]}SsSs.nEt`).toLowerCase(), defaultProxyFallback = true;
		if (env.PROXYIP) {
			const proxyIPs = await splitToArray(env.PROXYIP);
			defaultProxyIP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
			defaultProxyFallback = false;
		}
		const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('True-Client-IP') || request.headers.get('X-Real-IP') || request.headers.get('X-Forwarded-For') || request.headers.get('Fly-Client-IP') || request.headers.get('X-Appengine-Remote-Addr') || request.headers.get('X-Cluster-Client-IP') || 'UnknownIP';
		if (cachedSocks5Whitelist === null) {
			if (env.GO2SOCKS5) socks5Whitelist = [...new Set(socks5Whitelist.concat(await splitToArray(env.GO2SOCKS5)))];
			cachedSocks5Whitelist = socks5Whitelist;
		} else socks5Whitelist = cachedSocks5Whitelist;
		// Version endpoint
		if (accessPath === 'version') {
			const reqUUID = (url.searchParams.get('uuid') || '').toLowerCase();
			if (uuidRegex.test(reqUUID)) {
				const targetUUID = String(userID).toLowerCase();
				let reqSum = 0, targetSum = 0;
				for (let i = 0; i < 8; i++) {
					const rc = reqUUID.charCodeAt(i); reqSum += rc <= 57 ? rc - 48 : rc - 87;
					const tc = targetUUID.charCodeAt(i); targetSum += tc <= 57 ? tc - 48 : tc - 87;
				}
				if (reqSum === targetSum && reqUUID.slice(-12) === targetUUID.slice(-12)) return new Response(JSON.stringify({ Version: Number(String(VERSION).replace(/\D+/g, '')) }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
			}
		}
		// WebSocket proxy
		else if (adminPassword && upgradeHeader === 'websocket') {
			const proxyCtx = await getProxyContext(url, userID, defaultProxyIP, defaultProxyFallback);
			log(`[WebSocket] Hit: ${url.pathname}${url.search}`);
			return await handleWSRequest(request, userID, url, proxyCtx);
		}
		// gRPC / xHTTP proxy
		else if (adminPassword && !accessPath.startsWith('admin/') && accessPath !== 'login' && request.method === 'POST') {
			const proxyCtx = await getProxyContext(url, userID, defaultProxyIP, defaultProxyFallback);
			const { header: myPaddingHeader, key: myPaddingKey } = getXHTTPPaddingIdent(userID);
			const hitXHTTP = !!request.headers.get(myPaddingHeader) || !!url.searchParams.get(myPaddingKey);
			if (!hitXHTTP && contentType.startsWith('application/grpc')) {
				log(`[gRPC] Hit: ${url.pathname}${url.search}`);
				return await handleGRPCRequest(request, userID, proxyCtx);
			}
			log(`[xHTTP] Hit: ${url.pathname}${url.search}`);
			return await handleXHTTPRequest(request, userID, proxyCtx);
		}
		// HTTP routing
		else {
			if (url.protocol === 'http:') return Response.redirect(url.href.replace(`http://${url.hostname}`, `https://${url.hostname}`), 301);
			if (!adminPassword) return fetch(PAGES_URL + '/noADMIN').then(r => { const h = new Headers(r.headers); h.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); h.set('Pragma', 'no-cache'); h.set('Expires', '0'); return new Response(r.body, { status: 404, statusText: r.statusText, headers: h }) });
			if (env.KV && typeof env.KV.get === 'function') {
				const caseSensitivePath = url.pathname.slice(1);
				// Quick subscription redirect via KEY
				if (caseSensitivePath === encryptionKey && encryptionKey !== 'DoNotChangeDefaultKey') {
					const params = new URLSearchParams(url.search);
					params.set('token', await doubleMD5(host + userID));
					return new Response('Redirecting...', { status: 302, headers: { 'Location': `/sub?${params.toString()}` } });
				}
				// Login page
				else if (accessPath === 'login') {
					const cookies = request.headers.get('Cookie') || '';
					const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth='))?.split('=')[1];
					if (authCookie == await doubleMD5(UA + encryptionKey + adminPassword)) return new Response('Redirecting...', { status: 302, headers: { 'Location': '/admin' } });
					if (request.method === 'POST') {
						const formData = await request.text();
						const params = new URLSearchParams(formData);
						const inputPassword = params.get('password');
						if (inputPassword === (typeof adminPassword === 'string' ? adminPassword.replace(/[\r\n]/g, '') : adminPassword)) {
							const resp = new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							resp.headers.set('Set-Cookie', `auth=${await doubleMD5(UA + encryptionKey + adminPassword)}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`);
							return resp;
						}
					}
					return fetch(PAGES_URL + '/login');
				}
				// Admin panel
				else if (accessPath === 'admin' || accessPath.startsWith('admin/')) {
					const cookies = request.headers.get('Cookie') || '';
					const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth='))?.split('=')[1];
					if (!authCookie || authCookie !== await doubleMD5(UA + encryptionKey + adminPassword)) return new Response('Redirecting...', { status: 302, headers: { 'Location': '/login' } });
					// Log endpoint
					if (accessPath === 'admin/log.json') {
						const logContent = await env.KV.get('log.json') || '[]';
						return new Response(logContent, { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
					}
					// CF Usage query
					else if (caseSensitivePath === 'admin/getCloudflareUsage') {
						try {
							let Email, GlobalAPIKey, AccountID, APIToken;
							if (request.method === 'POST') {
								const body = await request.json();
								Email = body.Email; GlobalAPIKey = body.GlobalAPIKey; AccountID = body.AccountID; APIToken = body.APIToken;
							} else {
								Email = url.searchParams.get('Email'); GlobalAPIKey = url.searchParams.get('GlobalAPIKey'); AccountID = url.searchParams.get('AccountID'); APIToken = url.searchParams.get('APIToken');
							}
							const usageJSON = await getCloudflareUsage(Email, GlobalAPIKey, AccountID, APIToken);
							return new Response(JSON.stringify(usageJSON, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
						} catch (err) {
							return new Response(JSON.stringify({ msg: 'Query failed: ' + err.message, error: err.message }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
						}
					}
					// Preferred IP API verification
					else if (caseSensitivePath === 'admin/getADDAPI') {
						if (url.searchParams.get('url')) {
							const apiURL = url.searchParams.get('url');
							try {
								new URL(apiURL);
								const apiResult = await fetchPreferredIPs([apiURL], url.searchParams.get('port') || '443');
								let ips = apiResult[0].length > 0 ? apiResult[0] : apiResult[1];
								ips = ips.map(item => item.replace(/#(.+)$/, (_, remark) => '#' + decodeURIComponent(remark)));
								return new Response(JSON.stringify({ success: true, data: ips }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							} catch (err) {
								return new Response(JSON.stringify({ msg: 'Verify failed: ' + err.message, error: err.message }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							}
						}
						return new Response(JSON.stringify({ success: false, data: [] }, null, 2), { status: 403, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
					}
					// Proxy check endpoint
					else if (accessPath === 'admin/check') {
						const proxyProtocol = ['socks5', 'http', 'https', 'turn', 'sstp'].find(type => url.searchParams.has(type)) || null;
						if (!proxyProtocol) return new Response(JSON.stringify({ error: 'Missing proxy param' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
						const proxyParam = url.searchParams.get(proxyProtocol);
						const startTime = Date.now();
						let checkResult;
						try {
							const checkParsed = await parseProxyAccount(proxyParam, getDefaultProxyPort(proxyProtocol));
							const { username, password, hostname, port } = checkParsed;
							const fullProxy = username && password ? `${username}:${password}@${hostname}:${port}` : `${hostname}:${port}`;
							try {
								const checkHost = 'cloudflare.com', checkPort = 443, encoder = new TextEncoder(), decoder = new TextDecoder();
								const tcpConn = createTCPConnector(request);
								let tcpSocket = null, tlsSocket = null;
								try {
									tcpSocket = proxyProtocol === 'socks5' ? await socks5Connect(checkHost, checkPort, new Uint8Array(0), tcpConn, checkParsed)
										: proxyProtocol === 'turn' ? await turnConnect(checkParsed, checkHost, checkPort, tcpConn)
										: proxyProtocol === 'sstp' ? await sstpConnect(checkParsed, checkHost, checkPort, tcpConn)
										: (proxyProtocol === 'https' && isIPHostname(hostname) ? await httpsConnect(checkHost, checkPort, new Uint8Array(0), tcpConn, checkParsed) : await httpConnect(checkHost, checkPort, new Uint8Array(0), proxyProtocol === 'https', tcpConn, checkParsed));
									if (!tcpSocket) throw new Error('Cannot connect to proxy');
									tlsSocket = new TlsClient(tcpSocket, { serverName: checkHost, insecure: true });
									await tlsSocket.handshake();
									await tlsSocket.write(encoder.encode(`GET /cdn-cgi/trace HTTP/1.1\r\nHost: ${checkHost}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n`));
									let respBuf = new Uint8Array(0), hdrEnd = -1, contentLen = null, chunked = false;
									const maxResp = 64 * 1024;
									while (respBuf.length < maxResp) {
										const val = await tlsSocket.read();
										if (!val) break;
										if (val.byteLength === 0) continue;
										respBuf = concatBytes(respBuf, val);
										if (hdrEnd === -1) {
											const idx = respBuf.findIndex((_, i) => i < respBuf.length - 3 && respBuf[i] === 0x0d && respBuf[i+1] === 0x0a && respBuf[i+2] === 0x0d && respBuf[i+3] === 0x0a);
											if (idx !== -1) {
												hdrEnd = idx + 4;
												const hdrs = decoder.decode(respBuf.slice(0, hdrEnd));
												const sl = hdrs.split('\r\n')[0] || '';
												const sm = sl.match(/HTTP\/\d\.\d\s+(\d+)/);
												const sc = sm ? parseInt(sm[1], 10) : NaN;
												if (!Number.isFinite(sc) || sc < 200 || sc >= 300) throw new Error(`Proxy check failed: ${sl || 'Invalid'}`);
												const lm = hdrs.match(/\r\nContent-Length:\s*(\d+)/i);
												if (lm) contentLen = parseInt(lm[1], 10);
												chunked = /\r\nTransfer-Encoding:\s*chunked/i.test(hdrs);
											}
										}
										if (hdrEnd !== -1 && contentLen !== null && respBuf.length >= hdrEnd + contentLen) break;
										if (hdrEnd !== -1 && chunked && decoder.decode(respBuf).includes('\r\n0\r\n\r\n')) break;
									}
									if (hdrEnd === -1) throw new Error('Response header too long');
									const response = decoder.decode(respBuf);
									const ip = response.match(/(?:^|\n)ip=(.*)/)?.[1];
									const loc = response.match(/(?:^|\n)loc=(.*)/)?.[1];
									if (!ip || !loc) throw new Error('Invalid proxy response');
									checkResult = { success: true, proxy: proxyProtocol + "://" + fullProxy, ip, loc, responseTime: Date.now() - startTime };
								} finally { try { tlsSocket ? tlsSocket.close() : await tcpSocket?.close?.() } catch (e) { } }
							} catch (error) {
								checkResult = { success: false, error: error.message, proxy: proxyProtocol + "://" + fullProxy, responseTime: Date.now() - startTime };
							}
						} catch (err) {
							checkResult = { success: false, error: err.message, proxy: proxyProtocol + "://" + proxyParam, responseTime: Date.now() - startTime };
						}
						return new Response(JSON.stringify(checkResult, null, 2), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
					}
					cachedConfig = await readConfig(env, host, userID, UA);
					// Reset config (POST only to prevent CSRF via img/link tags)
					if (accessPath === 'admin/init' && request.method === 'POST') {
						try {
							cachedConfig = await readConfig(env, host, userID, UA, true);
							ctx.waitUntil(logRequest(env, request, clientIP, 'Init_Config', cachedConfig));
							cachedConfig.init = 'Config reset to defaults';
							return new Response(JSON.stringify(cachedConfig, null, 2), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
						} catch (err) {
							return new Response(JSON.stringify({ msg: 'Failed: ' + err.message, error: err.message }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
						}
					} else if (request.method === 'POST') {
						if (accessPath === 'admin/config.json') {
							try {
								const newConfig = await request.json();
								if (!newConfig.UUID || !newConfig.HOST) return new Response(JSON.stringify({ error: 'Incomplete config' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
								await env.KV.put('config.json', JSON.stringify(newConfig, null, 2));
								ctx.waitUntil(logRequest(env, request, clientIP, 'Save_Config', cachedConfig));
								return new Response(JSON.stringify({ success: true, message: 'Saved' }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							} catch (error) {
								return new Response(JSON.stringify({ error: 'Save failed: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							}
						} else if (accessPath === 'admin/cf.json') {
							try {
								const newConfig = await request.json();
								const CF_JSON = { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null };
								if (!newConfig.init || newConfig.init !== true) {
									if (newConfig.Email && newConfig.GlobalAPIKey) { CF_JSON.Email = newConfig.Email; CF_JSON.GlobalAPIKey = newConfig.GlobalAPIKey; }
									else if (newConfig.AccountID && newConfig.APIToken) { CF_JSON.AccountID = newConfig.AccountID; CF_JSON.APIToken = newConfig.APIToken; }
									else if (newConfig.UsageAPI) { CF_JSON.UsageAPI = newConfig.UsageAPI; }
									else return new Response(JSON.stringify({ error: 'Incomplete' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
								}
								await env.KV.put('cf.json', JSON.stringify(CF_JSON, null, 2));
								ctx.waitUntil(logRequest(env, request, clientIP, 'Save_Config', cachedConfig));
								return new Response(JSON.stringify({ success: true, message: 'Saved' }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							} catch (error) {
								return new Response(JSON.stringify({ error: 'Save failed: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							}
						} else if (accessPath === 'admin/tg.json') {
							try {
								const newConfig = await request.json();
								if (newConfig.init && newConfig.init === true) { await env.KV.put('tg.json', JSON.stringify({ BotToken: null, ChatID: null }, null, 2)); }
								else {
									if (!newConfig.BotToken || !newConfig.ChatID) return new Response(JSON.stringify({ error: 'Incomplete' }), { status: 400, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
									await env.KV.put('tg.json', JSON.stringify(newConfig, null, 2));
								}
								ctx.waitUntil(logRequest(env, request, clientIP, 'Save_Config', cachedConfig));
								return new Response(JSON.stringify({ success: true, message: 'Saved' }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							} catch (error) {
								return new Response(JSON.stringify({ error: 'Save failed: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							}
						} else if (caseSensitivePath === 'admin/ADD.txt') {
							try {
								const customIPs = await request.text();
								await env.KV.put('ADD.txt', customIPs);
								ctx.waitUntil(logRequest(env, request, clientIP, 'Save_Custom_IPs', cachedConfig));
								return new Response(JSON.stringify({ success: true, message: 'Saved' }), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							} catch (error) {
								return new Response(JSON.stringify({ error: 'Save failed: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
							}
						} else return new Response(JSON.stringify({ error: 'Unsupported POST path' }), { status: 404, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
					} else if (accessPath === 'admin/config.json') {
						return new Response(JSON.stringify(cachedConfig, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
					} else if (caseSensitivePath === 'admin/ADD.txt') {
						let localIPs = await env.KV.get('ADD.txt') || 'null';
						if (localIPs == 'null') localIPs = (await generateRandomIPs(request, cachedConfig.bestSub.localIPs.randomCount, cachedConfig.bestSub.localIPs.specificPort))[1];
						return new Response(localIPs, { status: 200, headers: { 'Content-Type': 'text/plain;charset=utf-8', 'asn': request.cf.asn } });
					} else if (accessPath === 'admin/cf.json') {
						return new Response(JSON.stringify(request.cf, null, 2), { status: 200, headers: { 'Content-Type': 'application/json;charset=utf-8' } });
					}
					ctx.waitUntil(logRequest(env, request, clientIP, 'Admin_Login', cachedConfig));
					return fetch(PAGES_URL + '/admin' + url.search);
				}
				// Logout / clear cookie
				else if (accessPath === 'logout' || uuidRegex.test(accessPath)) {
					const resp = new Response('Redirecting...', { status: 302, headers: { 'Location': '/login' } });
					resp.headers.set('Set-Cookie', 'auth=; Path=/; Max-Age=0; HttpOnly');
					return resp;
				}
				// Subscription endpoint
				else if (accessPath === 'sub') {
					const subToken = await doubleMD5(host + userID), isBestSubGen = ['1', 'true'].includes(env.BEST_SUB) && url.searchParams.get('host') === 'example.com' && url.searchParams.get('uuid') === '00000000-0000-4000-8000-000000000000' && UA.toLowerCase().includes('tunnel (https://github.com/' + FEATURE_CODES[1] + '/edge');
					const requestToken = url.searchParams.get('token');
					const isClientSub = requestToken === subToken;
					const currentDayNum = Math.floor(Date.now() / 86400000);
					const converterSeed = base64SecretEncode(subToken, userID);
					const [todayConverterToken, yesterdayConverterToken] = await Promise.all([doubleMD5(converterSeed + currentDayNum), doubleMD5(converterSeed + (currentDayNum - 1))]);
					const isConverterSub = requestToken === todayConverterToken || requestToken === yesterdayConverterToken;
					if (isClientSub || isConverterSub || isBestSubGen) {
						cachedConfig = await readConfig(env, host, userID, UA);
						if (isBestSubGen) ctx.waitUntil(logRequest(env, request, clientIP, 'Get_BEST_SUB', cachedConfig, false));
						else ctx.waitUntil(logRequest(env, request, clientIP, 'Get_SUB', cachedConfig));
						const ua = UA.toLowerCase();
						const respHeaders = { "content-type": "text/plain; charset=utf-8", "Profile-Update-Interval": cachedConfig.bestSub.subUpdateTime, "Profile-web-page-url": url.protocol + '//' + url.host + '/admin', "Cache-Control": "no-store" };
						if (cachedConfig.CF.Usage.success) {
							const pagesSum = cachedConfig.CF.Usage.pages, workersSum = cachedConfig.CF.Usage.workers;
							const total = Number.isFinite(cachedConfig.CF.Usage.max) ? (cachedConfig.CF.Usage.max / 1000) * 1024 : 1024 * 100;
							respHeaders["Subscription-Userinfo"] = `upload=${pagesSum}; download=${workersSum}; total=${total}; expire=4102329600`;
						}
						const isSubConverterRequest = url.searchParams.has('b64') || url.searchParams.has('base64') || request.headers.get('subconverter-request') || request.headers.get('subconverter-version') || ua.includes('subconverter') || ua.includes('cf-workers-sub') || isBestSubGen;
						const subType = isSubConverterRequest ? 'mixed' : url.searchParams.has('target') ? url.searchParams.get('target') : url.searchParams.has('clash') || ua.includes('clash') || ua.includes('meta') || ua.includes('mihomo') ? 'clash' : url.searchParams.has('sb') || url.searchParams.has('singbox') || ua.includes('singbox') || ua.includes('sing-box') ? 'singbox' : url.searchParams.has('surge') || ua.includes('surge') ? 'surge&ver=4' : url.searchParams.has('quanx') || ua.includes('quantumult') ? 'quanx' : url.searchParams.has('loon') || ua.includes('loon') ? 'loon' : 'mixed';
						if (!ua.includes('mozilla')) respHeaders["Content-Disposition"] = `attachment; filename*=utf-8''${encodeURIComponent(cachedConfig.bestSub.subName)}`;
						const protocolType = ((url.searchParams.has('surge') || ua.includes('surge')) && cachedConfig.protocolType !== 'ss') ? 'tro' + 'jan' : cachedConfig.protocolType;
						let subContent = '';
						if (subType === 'mixed') {
							const fragParam = cachedConfig.tlsFragment == 'Shadowrocket' ? `&fragment=${encodeURIComponent('1,40-60,30-50,tlshello')}` : cachedConfig.tlsFragment == 'Happ' ? `&fragment=${encodeURIComponent('3,1,tlshello')}` : '';
							let fullIPs = [], otherLinks = '', proxyPool = [];
							if (!url.searchParams.has('sub') && cachedConfig.bestSub.local) {
								const fullIPList = cachedConfig.bestSub.localIPs.randomIP ? (await generateRandomIPs(request, cachedConfig.bestSub.localIPs.randomCount, cachedConfig.bestSub.localIPs.specificPort))[0] : await env.KV.get('ADD.txt') ? await splitToArray(await env.KV.get('ADD.txt')) : (await generateRandomIPs(request, cachedConfig.bestSub.localIPs.randomCount, cachedConfig.bestSub.localIPs.specificPort))[0];
								const apis = [], ips = [], others = [];
								for (const el of fullIPList) {
									if (el.toLowerCase().startsWith('sub://')) { apis.push(el); }
									else {
										const rp = el.indexOf('#');
										const addr = rp > -1 ? el.slice(0, rp) : el, remark = rp > -1 ? el.slice(rp) : '';
										const subM = el.match(/sub\s*=\s*([^\s&#]+)/i);
										if (subM && subM[1].trim().includes('.')) {
											const isP = el.toLowerCase().includes('proxyip=true');
											apis.push('sub://' + subM[1].trim() + (isP ? "?proxyip=true" : "") + (el.includes('#') ? ('#' + el.split('#')[1]) : ''));
										} else if (addr.toLowerCase().startsWith('https://')) { apis.push(el); }
										else if (addr.toLowerCase().includes('://')) {
											others.push(el.includes('#') ? el.split('#')[0] + '#' + encodeURIComponent(decodeURIComponent(el.split('#')[1])) : el);
										} else { ips.push(addr.includes('*') ? replaceAsterisks(addr) + remark : el); }
									}
								}
								const apiRes = await fetchPreferredIPs(apis, '443');
								const merged = [...new Set(others.concat(apiRes[1]))];
								otherLinks = merged.length > 0 ? merged.join('\n') + '\n' : '';
								proxyPool = apiRes[3] || [];
								fullIPs = [...new Set(ips.concat(apiRes[0]))];
							} else {
								let bestSubHost = url.searchParams.get('sub') || cachedConfig.bestSub.sub;
								const [gIPs, gOthers] = await getBestSubGenData(bestSubHost);
								fullIPs = fullIPs.concat(gIPs); otherLinks += gOthers;
							}
							const echParam = cachedConfig.ech ? `&ech=${encodeURIComponent((cachedConfig.echConfig.sni ? cachedConfig.echConfig.sni + '+' : '') + cachedConfig.echConfig.dns)}` : '';
							const isLoonOrSurge = ua.includes('loon') || ua.includes('surge');
							const { type: transportProto, pathField, hostField } = getTransportConfig(cachedConfig);
							subContent = otherLinks + fullIPs.map(raw => {
								const re = /^(\[[\da-fA-F:]+\]|[\d.]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)(?::(\d+))?(?:#(.+))?$/;
								const m = raw.match(re);
								let addr, port = "443", remark;
								if (m) { addr = m[1]; port = m[2] || '443'; remark = m[3] || addr; } else return null;
								let fullPath = cachedConfig.fullPath;
								const chainM = remark.match(/\$(socks5|http|https|turn|sstp):\/\/([^#\s]+)/i);
								if (chainM) {
									try {
										const ct = chainM[1].toLowerCase(), cp = chainM[2];
										const chainData = { type: ct, ...await parseProxyAccount(cp, getDefaultProxyPort(ct)) };
										fullPath = `/video/${base64SecretEncode(JSON.stringify(chainData), userID) + (cachedConfig.enable0RTT ? '?ed=2560' : '')}`;
										remark = remark.replace(chainM[0], '').trim() || addr;
									} catch (e) { }
								} else if (proxyPool.length > 0) {
									const mp = proxyPool.find(p => p.includes(addr));
									if (mp) fullPath = (`${cachedConfig.path}/proxyip=${mp}`).replace(/\/\//g, '/') + (cachedConfig.enable0RTT ? '?ed=2560' : '');
								}
								if (isLoonOrSurge) fullPath = fullPath.replace(/,/g, '%2C');
								if (protocolType === 'ss' && !isBestSubGen) {
									if (!cachedConfig.ss.tls) { const tp = [443, 2053, 2083, 2087, 2096, 8443], ntp = [80, 2052, 2082, 2086, 2095, 8080]; port = String(ntp[tp.indexOf(Number(port))] ?? port); }
									fullPath = (fullPath.includes('?') ? fullPath.replace('?', '?enc=' + cachedConfig.ss.method + '&') : (fullPath + '?enc=' + cachedConfig.ss.method)).replace(/([=,])/g, '\\$1');
									if (!isSubConverterRequest) fullPath = fullPath + ';mux=0';
									return `${protocolType}://${btoa(cachedConfig.ss.method + ':00000000-0000-4000-8000-000000000000')}@${addr}:${port}?plugin=v2${encodeURIComponent('ray-plugin;mode=websocket;host=example.com;path=' + (cachedConfig.randomPath ? randomPath(fullPath) : fullPath) + (cachedConfig.ss.tls ? ';tls' : '')) + echParam + fragParam}#${encodeURIComponent(remark)}`;
								} else {
									const tPathVal = getTransportPathValue(cachedConfig, fullPath, isBestSubGen);
									return `${protocolType}://00000000-0000-4000-8000-000000000000@${addr}:${port}?security=tls&type=${transportProto + echParam}&${hostField}=example.com&fp=${cachedConfig.fingerprint}&sni=example.com&${pathField}=${encodeURIComponent(tPathVal) + fragParam}&encryption=none#${encodeURIComponent(remark)}`;
								}
							}).filter(i => i !== null).join('\n');
						} else {
							const converterURL = `${cachedConfig.subConverter.subAPI}/sub?target=${subType}&url=${encodeURIComponent(url.protocol + '//' + url.host + '/sub?target=mixed&token=' + todayConverterToken + '&cnIspCode=' + detectISP(request) + (url.searchParams.has('sub') && url.searchParams.get('sub') != '' ? `&sub=${url.searchParams.get('sub')}` : ''))}&config=${encodeURIComponent(cachedConfig.subConverter.subConfig)}&emoji=${cachedConfig.subConverter.subEmoji}&list=${cachedConfig.subConverter.subList}&scv=${cachedConfig.skipCertVerify}&xudp=${cachedConfig.subConverter.xudp}&udp=${cachedConfig.subConverter.udp}&tls13=${cachedConfig.subConverter.tls13}&append_type=${cachedConfig.subConverter.appendType}&sort=${cachedConfig.subConverter.sort}`;
							try {
								const response = await fetch(converterURL, { headers: { 'User-Agent': 'Subconverter for ' + subType + ' edge' + 'tunnel (https://github.com/' + FEATURE_CODES[1] + '/edge' + 'tunnel)' } });
								if (response.ok) {
									subContent = await response.text();
									if (url.searchParams.has('surge') || ua.includes('surge')) subContent = surgeHotPatch(subContent, url.protocol + '//' + url.host + '/sub?token=' + subToken + '&surge', cachedConfig);
								} else return new Response('Subconverter error: ' + response.statusText, { status: response.status });
							} catch (error) { return new Response('Subconverter error: ' + error.message, { status: 403 }); }
						}
						if (!ua.includes('subconverter') && isClientSub) {
							const shuffled = [...cachedConfig.HOSTS].sort(() => Math.random() - 0.5);
							let cnt = 0, curHost = null;
							subContent = subContent.replace(/00000000-0000-4000-8000-000000000000/g, cachedConfig.UUID).replace(/MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAw/g, btoa(cachedConfig.UUID)).replace(/example\.com/g, () => { if (cnt % 2 === 0) { curHost = replaceAsterisks(shuffled[Math.floor(cnt / 2) % shuffled.length]); } cnt++; return curHost; });
						}
						if (subType === 'mixed' && (!ua.includes('mozilla') || url.searchParams.has('b64') || url.searchParams.has('base64'))) subContent = btoa(subContent);
						if (subType === 'singbox') { subContent = await singboxHotPatch(subContent, cachedConfig); respHeaders["content-type"] = 'application/json; charset=utf-8'; }
						else if (subType === 'clash') { subContent = clashHotPatch(subContent, cachedConfig); respHeaders["content-type"] = 'application/x-yaml; charset=utf-8'; }
						return new Response(subContent, { status: 200, headers: respHeaders });
					}
				}
				else if (accessPath === 'locations') {
					const cookies = request.headers.get('Cookie') || '';
					const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth='))?.split('=')[1];
					if (authCookie && authCookie == await doubleMD5(UA + encryptionKey + adminPassword)) return fetch(new Request('https://speed.cloudflare.com/locations', { headers: { 'Referer': 'https://speed.cloudflare.com/' } }));
				}
				else if (accessPath === 'robots.txt') return new Response('User-agent: *\nDisallow: /', { status: 200, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
			} else if (!envUUID) return fetch(PAGES_URL + '/noKV').then(r => { const h = new Headers(r.headers); h.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); h.set('Pragma', 'no-cache'); h.set('Expires', '0'); return new Response(r.body, { status: 404, statusText: r.statusText, headers: h }) });
		}
		// Disguise page / fallback
		let disguiseURL = env.URL || 'nginx';
		if (disguiseURL && disguiseURL !== 'nginx' && disguiseURL !== '1101') {
			disguiseURL = disguiseURL.trim().replace(/\/$/, '');
			if (!disguiseURL.match(/^https?:\/\//i)) disguiseURL = 'https://' + disguiseURL;
			if (disguiseURL.toLowerCase().startsWith('http://')) disguiseURL = 'https://' + disguiseURL.substring(7);
			try { const u = new URL(disguiseURL); disguiseURL = u.protocol + '//' + u.host } catch (e) { disguiseURL = 'nginx' }
		}
		if (disguiseURL === '1101') return new Response(await html1101(url.host, clientIP), { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
		try {
			const pURL = new URL(disguiseURL), nh = new Headers(request.headers);
			nh.set('Host', pURL.host); nh.set('Referer', pURL.origin); nh.set('Origin', pURL.origin);
			if (!nh.has('User-Agent') && UA && UA !== 'null') nh.set('User-Agent', UA);
			const pResp = await fetch(pURL.origin + url.pathname + url.search, { method: request.method, headers: nh, body: request.body, cf: request.cf });
			const ct = pResp.headers.get('content-type') || '';
			if (/text|javascript|json|xml/.test(ct)) {
				const body = (await pResp.text()).replaceAll(pURL.host, url.host);
				return new Response(body, { status: pResp.status, headers: { ...Object.fromEntries(pResp.headers), 'Cache-Control': 'no-store' } });
			}
			return pResp;
		} catch (e) { }
		return new Response(await nginxPage(), { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
	}
};
/////////////////////////////////////////////////////// xHTTP Transport ///////////////////////////////////////////////
const HPACK Huffman code length table
const HPACK_HUFF_LEN = [13,23,28,28,28,28,28,28,28,24,30,28,28,30,28,28,28,28,28,28,28,28,30,28,28,28,28,28,28,28,28,28,6,10,10,12,13,6,8,11,10,10,8,11,8,6,6,6,5,5,5,6,6,6,6,6,6,6,7,8,15,6,12,10,13,6,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,7,8,7,8,13,19,13,14,6,15,5,6,5,6,5,6,6,6,5,7,7,6,6,6,5,6,7,6,5,5,6,7,7,7,7,7,15,11,14,13,28,20,22,20,20,22,22,22,23,22,23,23,23,23,23,24,23,24,24,22,23,24,23,23,23,23,21,22,23,22,23,23,24,22,21,20,22,22,23,23,21,23,22,22,24,21,22,23,23,21,21,22,21,23,22,23,23,20,22,22,22,23,22,22,23,26,26,20,19,22,23,22,25,26,26,26,27,27,26,24,25,19,21,26,27,27,26,27,24,21,21,26,26,28,27,27,27,20,24,20,21,22,21,21,23,22,22,25,25,24,24,26,23,26,27,26,26,27,27,27,27,27,28,27,27,27,27,27,26,30];
const XHTTP_BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function getXHTTPPaddingIdent(uuid) { return { header: uuid.slice(1, 7), key: '_' + uuid.slice(25, 31) }; }
function calcHPACKHuffmanLen(str) { const b = new TextEncoder().encode(str); let t = 0; for (let i = 0; i < b.length; i++) t += HPACK_HUFF_LEN[b[i]]; return Math.ceil(t / 8); }
function extractXHTTPPaddingVal(req, hdr, key) { const hv = req.headers.get(hdr); if (hv) { try { const u = new URL(hv, 'https://x.invalid'); const qv = u.searchParams.get(key); if (qv) return qv; } catch (e) { } return hv; } return new URL(req.url).searchParams.get(key) || ''; }
function validateXHTTPPadding(req, hdr, key) { const v = extractXHTTPPaddingVal(req, hdr, key); if (!v) return true; const hl = calcHPACKHuffmanLen(v); return hl >= 98 && hl <= 1002; }
function generateXHTTPPadding(len) { let r = ''; for (let i = 0; i < len; i++) r += XHTTP_BASE62[Math.floor(Math.random() * 62)]; return r; }
async function handleXHTTPRequest(request, uuid, proxyCtx) {
	if (!request.body) return new Response('Bad Request', { status: 400 });
	const { header: myPadHdr, key: myPadKey } = getXHTTPPaddingIdent(uuid);
	if (!validateXHTTPPadding(request, myPadHdr, myPadKey)) return new Response('Bad Request', { status: 400 });
	const reader = request.body.getReader();
	const firstPkt = await readXHTTPFirstPkt(reader, uuid);
	if (!firstPkt) { try { reader.releaseLock() } catch (e) { } return new Response('Invalid request', { status: 400 }); }
	if (isSpeedTestSite(firstPkt.hostname) && proxyCtx.proxyType === null) {
		try { reader.releaseLock() } catch (e) { }
		return new Response(buildLocal204Resp(firstPkt.respHeader), { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store' } });
	}
	if (firstPkt.isUDP && firstPkt.protocol !== 'trojan' && firstPkt.port !== 53) {
		try { reader.releaseLock() } catch (e) { }
		return new Response('UDP is not supported', { status: 400 });
	}
	const respHeaders = new Headers({ 'Content-Type': 'application/octet-stream', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store' });
	try { const u = new URL('https://x.invalid/'); u.searchParams.set(myPadKey, generateXHTTPPadding(100 + Math.floor(Math.random() * 901))); respHeaders.set(myPadHdr, u.toString()); } catch (e) { }
	if (firstPkt.isUDP) return handleXHTTPUDP(firstPkt, reader, request, proxyCtx, respHeaders);
	try { reader.releaseLock() } catch (e) { }
	const remoteWrapper = { socket: null, connectingPromise: null, retryConnect: null, downlinkDrain: Promise.resolve() };
	const abortCtrl = new AbortController();
	let cleaned = false;
	const cleanup = (reason) => { if (cleaned) return; cleaned = true; try { abortCtrl.abort(reason) } catch (e) { } invalidateTCPC generation(remoteWrapper); };
	const fakeWS = { readyState: WebSocket.OPEN };
	let socket;
	try { socket = await forwardTCP(firstPkt.hostname, firstPkt.port, firstPkt.rawData, fakeWS, firstPkt.respHeader, remoteWrapper, uuid, request, proxyCtx, firstPkt.protocol === 'trojan', firstPkt.originalData, true); }
	catch (err) { log(`[xHTTP-Pipe] Connect failed: ${err?.message || err}`); cleanup(err); return new Response('bad gateway', { status: 502 }); }
	if (!socket) { cleanup(new Error('socket null')); return new Response('bad gateway', { status: 502 }); }
	const upPromise = (async () => {
		const bundler = createUpstreamBundleStream();
		const pipePromise = bundler.readable.pipeTo(socket.writable, { signal: abortCtrl.signal });
		void pipePromise.catch(cleanup);
		const upReader = request.body.getReader();
		const cancelUp = () => { try { upReader.cancel(abortCtrl.signal.reason).catch(() => { }); } catch (e) { } };
		abortCtrl.signal.addEventListener('abort', cancelUp, { once: true });
		try {
			try { while (true) { const { done, value } = await upReader.read(); if (done) break; if (value?.byteLength) await bundler.write(value); } }
			finally { abortCtrl.signal.removeEventListener('abort', cancelUp); try { upReader.releaseLock() } catch (e) { } }
		} finally { try { await bundler.end() } catch (e) { } }
		await pipePromise;
	})();
	const respStream = typeof IdentityTransformStream !== 'undefined' ? new IdentityTransformStream() : new TransformStream();
	const downPromise = (async () => {
		const writer = respStream.writable.getWriter();
		try { if (dataLen(firstPkt.respHeader) > 0) await writer.write(firstPkt.respHeader); } catch (err) { try { await writer.abort(err) } catch (e) { } throw err; } finally { try { writer.releaseLock() } catch (e) { } }
		await socket.readable.pipeTo(respStream.writable, { signal: abortCtrl.signal });
	})();
	void upPromise.catch(cleanup); void downPromise.then(() => cleanup(), cleanup);
	void Promise.allSettled([upPromise, downPromise]);
	return new Response(respStream.readable, { status: 200, headers: respHeaders });
}
function handleXHTTPUDP(firstPkt, reader, request, proxyCtx, respHeaders) {
	const trojanCtx = { buffer: new Uint8Array(0), proxyAddr: proxyCtx.trojanProxyAddr };
	return new Response(new ReadableStream({
		async start(controller) {
			let closed = false;
			let udpRespHdr = firstPkt.respHeader;
			const bridge = {
				readyState: WebSocket.OPEN,
				send(data) { if (closed) return; try { const c = toUint8Array(data); controller.enqueue(c); } catch (e) { closed = true; this.readyState = WebSocket.CLOSED; } },
				close() { if (closed) return; closed = true; this.readyState = WebSocket.CLOSED; try { controller.close() } catch (e) { } }
			};
			let failed = false;
			try {
				if (firstPkt.protocol === 'trojan') {
					trojanCtx.targetHost = firstPkt.hostname; trojanCtx.targetPort = firstPkt.port;
					if (trojanCtx.proxyAddr) await forwardTrojanUDPData(firstPkt.originalData, bridge, trojanCtx, request);
				}
				if (!(firstPkt.protocol === 'trojan' && trojanCtx.proxyAddr) && firstPkt.rawData?.byteLength) {
					if (firstPkt.protocol === 'trojan') await forwardTrojanUDPData(firstPkt.rawData, bridge, trojanCtx, request);
					else await forwardUDP(firstPkt.rawData, bridge, udpRespHdr, request);
					udpRespHdr = null;
				}
				while (true) { const { done, value } = await reader.read(); if (done) break; if (!value || value.byteLength === 0) continue; if (firstPkt.protocol === 'trojan') await forwardTrojanUDPData(value, bridge, trojanCtx, request); else await forwardUDP(value, bridge, udpRespHdr, request); udpRespHdr = null; }
			} catch (err) { failed = true; log(`[xHTTP] UDP failed: ${err?.message || err}`); closeQuietly(bridge); }
			finally {
				const keepTrojanDown = !failed && firstPkt.protocol === 'trojan' && trojanCtx.proxyAddr && trojanCtx.proxySocket;
				if (!keepTrojanDown) { try { trojanCtx.proxySocket?.close() } catch (e) { } closeQuietly(bridge); }
				try { reader.releaseLock() } catch (e) { }
			}
		},
		cancel() { try { trojanCtx.proxySocket?.close() } catch (e) { } try { reader.releaseLock() } catch (e) { } }
	}), { status: 200, headers: respHeaders });
}
function dataLen(d) { if (!d) return 0; if (typeof d.byteLength === 'number') return d.byteLength; if (typeof d.length === 'number') return d.length; return 0; }
function invalidateTCPCGeneration(w) { if (!w) return; w.generation = (Number.isInteger(w.generation) ? w.generation : 0) + 1; const s = w.socket; w.socket = null; w.downlinkController = null; w.downlinkDrain = Promise.resolve(); try { s?.close?.() } catch (e) { } }
function startTCPCGeneration(w) { if (!Number.isInteger(w.generation)) w.generation = 0; const gen = ++w.generation; const prev = w.socket; w.socket = null; const prevDL = w.downlinkController; w.downlinkController = null; const prevDrain = w.downlinkDrain || Promise.resolve(); let curDrain; try { curDrain = prevDL?.stopAndFlush?.() || Promise.resolve(); } catch (err) { curDrain = Promise.reject(err); } const dd = Promise.all([prevDrain, curDrain]); dd.catch(() => { }); w.downlinkDrain = dd; try { prev?.close?.() } catch (e) { } return { generation: gen, downlinkDrain: dd }; }
async function readXHTTPFirstPkt(reader, token) {
	const dec = vlessTextDecoder;
	const tryVless = (data) => {
		const len = data.byteLength;
		if (len < 18) return { state: 'need_more' };
		if (!uuidBytesMatch(data, 1, token)) return { state: 'invalid' };
		const optLen = data[17], cmdIdx = 18 + optLen;
		if (len < cmdIdx + 1) return { state: 'need_more' };
		const cmd = data[cmdIdx]; if (cmd !== 1 && cmd !== 2) return { state: 'invalid' };
		const portIdx = cmdIdx + 1;
		if (len < portIdx + 3) return { state: 'need_more' };
		const port = (data[portIdx] << 8) | data[portIdx + 1], atype = data[portIdx + 2], addrIdx = portIdx + 3;
		let hdrLen = -1, hostname = '';
		if (atype === 1) { if (len < addrIdx + 4) return { state: 'need_more' }; hostname = `${data[addrIdx]}.${data[addrIdx+1]}.${data[addrIdx+2]}.${data[addrIdx+3]}`; hdrLen = addrIdx + 4; }
		else if (atype === 2) { if (len < addrIdx + 1) return { state: 'need_more' }; const dl = data[addrIdx]; if (len < addrIdx + 1 + dl) return { state: 'need_more' }; hostname = dec.decode(data.subarray(addrIdx + 1, addrIdx + 1 + dl)); hdrLen = addrIdx + 1 + dl; }
		else if (atype === 3) { if (len < addrIdx + 16) return { state: 'need_more' }; const ipv6 = []; for (let i = 0; i < 8; i++) { const b = addrIdx + i * 2; ipv6.push(((data[b] << 8) | data[b + 1]).toString(16)); } hostname = ipv6.join(':'); hdrLen = addrIdx + 16; }
		else return { state: 'invalid' };
		if (!hostname) return { state: 'invalid' };
		return { state: 'ok', result: { protocol: 'vless', hostname, port, isUDP: cmd === 2, rawData: data.subarray(hdrLen), respHeader: new Uint8Array([data[0], 0]), originalData: null } };
	};
	const tryTrojan = (data) => {
		const pwHash = sha224(token), pwBytes = new TextEncoder().encode(pwHash);
		const len = data.byteLength;
		if (len < 58) return { state: 'need_more' };
		if (data[56] !== 0x0d || data[57] !== 0x0a) return { state: 'invalid' };
		for (let i = 0; i < 56; i++) { if (data[i] !== pwBytes[i]) return { state: 'invalid' }; }
		const s5Idx = 58;
		if (len < s5Idx + 2) return { state: 'need_more' };
		const cmd = data[s5Idx]; if (cmd !== 1 && cmd !== 3) return { state: 'invalid' };
		const isUDP = cmd === 3, atype = data[s5Idx + 1];
		let cursor = s5Idx + 2, hostname = '';
		if (atype === 1) { if (len < cursor + 4) return { state: 'need_more' }; hostname = `${data[cursor]}.${data[cursor+1]}.${data[cursor+2]}.${data[cursor+3]}`; cursor += 4; }
		else if (atype === 3) { if (len < cursor + 1) return { state: 'need_more' }; const dl = data[cursor]; if (len < cursor + 1 + dl) return { state: 'need_more' }; hostname = dec.decode(data.subarray(cursor + 1, cursor + 1 + dl)); cursor += 1 + dl; }
		else if (atype === 4) { if (len < cursor + 16) return { state: 'need_more' }; const ipv6 = []; for (let i = 0; i < 8; i++) { const b = cursor + i * 2; ipv6.push(((data[b] << 8) | data[b + 1]).toString(16)); } hostname = ipv6.join(':'); cursor += 16; }
		else return { state: 'invalid' };
		if (!hostname) return { state: 'invalid' };
		if (len < cursor + 4) return { state: 'need_more' };
		const port = (data[cursor] << 8) | data[cursor + 1];
		if (data[cursor + 2] !== 0x0d || data[cursor + 3] !== 0x0a) return { state: 'invalid' };
		return { state: 'ok', result: { protocol: 'trojan', hostname, port, isUDP, rawData: data.subarray(cursor + 4), originalData: data, respHeader: null } };
	};
	let buffer = new Uint8Array(1024), offset = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) { if (offset === 0) return null; break; }
		const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
		if (offset + chunk.byteLength > buffer.byteLength) { const nb = new Uint8Array(Math.max(buffer.byteLength * 2, offset + chunk.byteLength)); nb.set(buffer.subarray(0, offset)); buffer = nb; }
		buffer.set(chunk, offset); offset += chunk.byteLength;
		const cur = buffer.subarray(0, offset);
		const tr = tryTrojan(cur); if (tr.state === 'ok') return { ...tr.result, reader };
		const vr = tryVless(cur); if (vr.state === 'ok') return { ...vr.result, reader };
		if (tr.state === 'invalid' && vr.state === 'invalid') return null;
	}
	const final = buffer.subarray(0, offset);
	const ft = tryTrojan(final); if (ft.state === 'ok') return { ...ft.result, reader };
	const fv = tryVless(final); if (fv.state === 'ok') return { ...fv.result, reader };
	return null;
}
/////////////////////////////////////////////////////// gRPC Transport ///////////////////////////////////////////////
async function handleGRPCRequest(request, uuid, proxyCtx) {
	if (!request.body) return new Response('Bad Request', { status: 400 });
	const reader = request.body.getReader();
	const remoteWrapper = { socket: null, connectingPromise: null, retryConnect: null, downlinkDrain: Promise.resolve() };
	const invalidateRemote = () => invalidateTCPC generation(remoteWrapper);
	let isDNS = false;
	const trojanCtx = { buffer: new Uint8Array(0), proxyAddr: proxyCtx.trojanProxyAddr };
	let isTrojan = null, curWriteSocket = null, remoteWriter = null, grpcUpQueue = null;
	const grpcHeaders = new Headers({ 'Content-Type': 'application/grpc', 'grpc-status': '0', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store' });
	const downBufLimit = DOWNSTREAM_GRAIN_BYTES;
	return new Response(new ReadableStream({
		async start(controller) {
			let closed = false, sendQueue = [], queueBytes = 0, flushTimer = null, microtaskQueued = false;
			const grpcBridge = {
				readyState: WebSocket.OPEN,
				send(data) {
					if (closed) return;
					const chunk = data instanceof Uint8Array ? data : new Uint8Array(data);
					const lenBytes = [];
					let remaining = chunk.byteLength >>> 0;
					while (remaining > 127) { lenBytes.push((remaining & 0x7f) | 0x80); remaining >>>= 7; }
					lenBytes.push(remaining);
					const lb = new Uint8Array(lenBytes);
					const pl = 1 + lb.length + chunk.byteLength;
					const frame = new Uint8Array(5 + 1 + lb.length + chunk.byteLength);
					frame[0] = 0; frame[1] = (pl >>> 24) & 0xff; frame[2] = (pl >>> 16) & 0xff; frame[3] = (pl >>> 8) & 0xff; frame[4] = pl & 0xff;
					frame[5] = 0x0a; frame.set(lb, 6); frame.set(chunk, 6 + lb.length);
					sendQueue.push(frame); queueBytes += frame.byteLength; scheduleFlush();
				},
				close() { if (this.readyState === WebSocket.CLOSED) return; doFlush(true); closed = true; this.readyState = WebSocket.CLOSED; try { controller.close() } catch (e) { } }
			};
			const doFlush = (force = false) => {
				microtaskQueued = false;
				if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
				if ((!force && closed) || queueBytes === 0) return;
				const out = new Uint8Array(queueBytes); let off = 0;
				for (const item of sendQueue) { out.set(item, off); off += item.byteLength; }
				sendQueue = []; queueBytes = 0;
				try { controller.enqueue(out); } catch (e) { closed = true; grpcBridge.readyState = WebSocket.CLOSED; }
			};
			const scheduleFlush = () => {
				if (queueBytes >= downBufLimit) { doFlush(); return; }
				if (microtaskQueued || flushTimer) return;
				microtaskQueued = true;
				queueMicrotask(() => { microtaskQueued = false; if (closed || queueBytes === 0 || flushTimer) return; flushTimer = setTimeout(doFlush, 1); });
			};
			const closeConn = () => { if (closed) return; grpcUpQueue?.clear(); invalidateRemote(); doFlush(true); closed = true; grpcBridge.readyState = WebSocket.CLOSED; if (flushTimer) clearTimeout(flushTimer); if (remoteWriter) { try { remoteWriter.releaseLock() } catch (e) { } remoteWriter = null; } curWriteSocket = null; try { reader.releaseLock() } catch (e) { } try { trojanCtx.proxySocket?.close() } catch (e) { } try { controller.close() } catch (e) { } };
			const releaseRemoteWriter = () => { if (remoteWriter) { try { remoteWriter.releaseLock() } catch (e) { } remoteWriter = null; } curWriteSocket = null; };
			const upQueue = grpcUpQueue = createWriteQueue({
				getWriter: () => { const s = remoteWrapper.socket; if (!s) return null; if (s !== curWriteSocket) { releaseRemoteWriter(); curWriteSocket = s; remoteWriter = s.writable.getWriter(); } return remoteWriter; },
				getConnectTask: () => remoteWrapper.connectingPromise, releaseWriter: releaseRemoteWriter,
				retryConnect: async () => { if (typeof remoteWrapper.retryConnect !== 'function') throw new Error('retry unavailable'); await remoteWrapper.retryConnect(); },
				closeConnection: closeConn, name: 'gRPC-UP'
			});
			const writeToRemote = async (payload, allowRetry = true) => upQueue.writeAndWait(payload, allowRetry);
			let failed = false;
			try {
				let pending = new Uint8Array(0);
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (!value || value.byteLength === 0) continue;
					const cur = value instanceof Uint8Array ? value : new Uint8Array(value);
					const merged = new Uint8Array(pending.length + cur.length); merged.set(pending, 0); merged.set(cur, pending.length); pending = merged;
					while (pending.byteLength >= 5) {
						const gLen = ((pending[1] << 24) >>> 0) | (pending[2] << 16) | (pending[3] << 8) | pending[4];
						const frameSize = 5 + gLen;
						if (pending.byteLength < frameSize) break;
						let payload = pending.subarray(5, frameSize); pending = pending.slice(frameSize);
						if (!payload.byteLength) continue;
						if (payload.byteLength >= 2 && payload[0] === 0x0a) { let shift = 0, off = 1, valid = false; while (off < payload.length) { const c = payload[off++]; if ((c & 0x80) === 0) { valid = true; break; } shift += 7; if (shift > 35) break; } if (valid) payload = payload.subarray(off); }
						if (!payload.byteLength) continue;
						if (isDNS) { if (isTrojan) await forwardTrojanUDPData(payload, grpcBridge, trojanCtx, request); else await forwardUDP(payload, grpcBridge, null, request); continue; }
						if (remoteWrapper.socket || remoteWrapper.connectingPromise) {
							if (!(await writeToRemote(payload))) throw new Error('Remote not ready');
						} else {
							const firstBytes = toUint8Array(payload);
							if (isTrojan === null) isTrojan = firstBytes.byteLength >= 58 && firstBytes[56] === 0x0d && firstBytes[57] === 0x0a;
							if (isTrojan) {
								const parsed = parseTrojanRequest(firstBytes, uuid);
								if (parsed?.hasError) throw new Error(parsed.message || 'Invalid trojan');
								const { port, hostname, rawClientData, isUDP } = parsed;
								log(`[gRPC] Trojan: ${hostname}:${port} UDP:${isUDP}`);
								if (isSpeedTestSite(hostname) && proxyCtx.proxyType === null) { grpcBridge.send(buildLocal204Resp()); return; }
								if (isUDP) { isDNS = true; trojanCtx.targetHost = hostname; trojanCtx.targetPort = port; if (trojanCtx.proxyAddr) await forwardTrojanUDPData(firstBytes, grpcBridge, trojanCtx, request); else if (dataLen(rawClientData) > 0) await forwardTrojanUDPData(rawClientData, grpcBridge, trojanCtx, request); }
								else await forwardTCP(hostname, port, rawClientData, grpcBridge, null, remoteWrapper, uuid, request, proxyCtx, true, firstBytes);
							} else {
								isTrojan = false;
								const parsed = parseVlessRequest(firstBytes, uuid);
								if (parsed?.hasError) throw new Error(parsed.message || 'Invalid vless');
								const { port, hostname, version, isUDP, rawClientData } = parsed;
								const respHdr = new Uint8Array([version, 0]);
								log(`[gRPC] VLESS: ${hostname}:${port} UDP:${isUDP}`);
								if (isSpeedTestSite(hostname) && proxyCtx.proxyType === null) { grpcBridge.send(buildLocal204Resp(respHdr)); return; }
								if (isUDP) { if (port !== 53) throw new Error('UDP not supported'); isDNS = true; }
								grpcBridge.send(respHdr);
								if (isDNS) await forwardUDP(rawClientData, grpcBridge, null, request);
								else await forwardTCP(hostname, port, rawClientData, grpcBridge, null, remoteWrapper, uuid, request, proxyCtx);
							}
						}
					}
					doFlush();
				}
				await upQueue.waitIdle();
			} catch (err) { failed = true; log(`[gRPC] Error: ${err?.message || err}`); }
			finally {
				const keepDown = !failed && isDNS && isTrojan && trojanCtx.proxyAddr && trojanCtx.proxySocket;
				if (keepDown) { upQueue.clear(); invalidateRemote(); releaseRemoteWriter(); try { reader.releaseLock() } catch (e) { } }
				else closeConn();
			}
		},
		cancel() { grpcUpQueue?.clear(); invalidateRemote(); try { trojanCtx.proxySocket?.close() } catch (e) { } try { reader.releaseLock() } catch (e) { } }
	}), { status: 200, headers: grpcHeaders });
}
/////////////////////////////////////////////////////// WebSocket Transport ///////////////////////////////////////////////
function isValidWSEarlyData(bytes, token) {
	if (!bytes?.byteLength) return false;
	if (bytes.byteLength >= 18 && uuidBytesMatch(bytes, 1, token)) return true;
	if (bytes.byteLength < 58 || bytes[56] !== 0x0d || bytes[57] !== 0x0a) return false;
	const pw = sha224(token);
	for (let i = 0; i < 56; i++) { if (bytes[i] !== pw.charCodeAt(i)) return false; }
	return true;
}
function decodeWSEarlyData(header, token) {
	if (!header) return null;
	if (header.length > WS_MAX_EARLY_HEADER_LEN) throw new Error('early data too large');
	let bytes;
	if (typeof Uint8Array.fromBase64 === 'function') { try { bytes = Uint8Array.fromBase64(header, { alphabet: 'base64url' }); } catch (_) { } }
	if (!bytes) {
		let n = header.replace(/-/g, '+').replace(/_/g, '/');
		const pad = n.length % 4; if (pad) n += '='.repeat(4 - pad);
		let bs; try { bs = atob(n); } catch (_) { return null; }
		bytes = new Uint8Array(bs.length); for (let i = 0; i < bs.length; i++) bytes[i] = bs.charCodeAt(i);
	}
	if (bytes.byteLength > WS_MAX_EARLY_BYTES) throw new Error('early data too large');
	return isValidWSEarlyData(bytes, token) ? bytes : null;
}
async function handleWSRequest(request, uuid, url, proxyCtx) {
	const pair = new WebSocketPair();
	const [clientSock, serverSock] = Object.values(pair);
	try { serverSock.accept({ allowHalfOpen: true }); } catch (_) { serverSock.accept(); }
	serverSock.binaryType = 'arraybuffer';
	let remoteWrapper = { socket: null, connectingPromise: null, retryConnect: null, downlinkDrain: Promise.resolve() };
	const invalidateRemote = () => invalidateTCPC generation(remoteWrapper);
	let isDNS = false, isTrojan = null;
	const trojanCtx = { buffer: new Uint8Array(0), proxyAddr: proxyCtx.trojanProxyAddr };
	const earlyDataHeader = request.headers.get('sec-websocket-protocol') || '';
	const ssModeNoEarly = !!url.searchParams.get('enc');
	let wsUpQueue = null, wsExplicitChain = Promise.resolve(), wsExplicitStop = false, wsExplicitFailed = false, wsExplicitEnqueued = false;
	let wsExplicitBytes = 0, wsExplicitEntries = 0;
	let protocolDetected = null, curWriteSocket = null, remoteWriter = null;
	let ssCtx = null, ssInitTask = null;
	let wsLocalSpeedMode = false, wsLocalSpeedRespSock = null, wsLocalSpeedBuf = new Uint8Array(0), wsLocalSpeedRespHdr = null;
	const wsLocalSpeedLimit = 64 * 1024;
	const sendWSSpeedResp = async () => { if (!wsLocalSpeedRespSock) return; const h = wsLocalSpeedRespHdr; wsLocalSpeedRespHdr = null; await wsSend(wsLocalSpeedRespSock, buildWSLocal204Resp(h)); };
	const findHTTPHeaderEnd = (d) => { for (let i = 0; i <= d.byteLength - 4; i++) { if (d[i] === 0x0d && d[i+1] === 0x0a && d[i+2] === 0x0d && d[i+3] === 0x0a) return i + 4; } return -1; };
	const processLocalSpeedData = async (data) => {
		const c = toUint8Array(data); if (!c.byteLength) return;
		if (wsLocalSpeedBuf.byteLength + c.byteLength > wsLocalSpeedLimit) throw new Error('speed-test request too large');
		wsLocalSpeedBuf = concatBytes(wsLocalSpeedBuf, c);
		while (wsLocalSpeedBuf.byteLength) {
			const he = findHTTPHeaderEnd(wsLocalSpeedBuf); if (he === -1) return;
			const hdr = vlessTextDecoder.decode(wsLocalSpeedBuf.subarray(0, he));
			const clm = hdr.match(/(?:^|\r\n)content-length\s*:\s*(\d+)/i);
			const cl = clm ? Number(clm[1]) : 0;
			const rl = he + cl;
			if (!Number.isSafeInteger(cl) || rl > wsLocalSpeedLimit) throw new Error('speed-test body too large');
			if (wsLocalSpeedBuf.byteLength < rl) return;
			wsLocalSpeedBuf = wsLocalSpeedBuf.slice(rl);
			await sendWSSpeedResp();
		}
	};
	const enableLocalSpeedMode = async (sock, hdr = null, firstData = null) => { wsLocalSpeedMode = true; wsLocalSpeedRespSock = sock; wsLocalSpeedBuf = new Uint8Array(0); wsLocalSpeedRespHdr = hdr; if (dataLen(firstData) > 0) await processLocalSpeedData(firstData); };
	const releaseRemoteWriter = () => { if (remoteWriter) { try { remoteWriter.releaseLock() } catch (e) { } remoteWriter = null; } curWriteSocket = null; };
	const upQueue = wsUpQueue = createWriteQueue({
		getWriter: () => { const s = remoteWrapper.socket; if (!s) return null; if (s !== curWriteSocket) { releaseRemoteWriter(); curWriteSocket = s; remoteWriter = s.writable.getWriter(); } return remoteWriter; },
		getConnectTask: () => remoteWrapper.connectingPromise, releaseWriter: releaseRemoteWriter,
		retryConnect: async () => { if (typeof remoteWrapper.retryConnect !== 'function') throw new Error('retry unavailable'); await remoteWrapper.retryConnect(); },
		closeConnection: err => handleWSError(err), name: 'WS-UP'
	});
	const writeToRemote = async (chunk, allowRetry = true) => upQueue.write(chunk, allowRetry);
	const getSSCtx = async () => {
		if (ssCtx) return ssCtx;
		if (!ssInitTask) {
			ssInitTask = (async () => {
				const encMethod = (url.searchParams.get('enc') || '').toLowerCase();
				const prefConfig = SS_CIPHER_CONFIGS[encMethod] || SS_CIPHER_CONFIGS['aes-128-gcm'];
				const candidates = [prefConfig, ...Object.values(SS_CIPHER_CONFIGS).filter(c => c.method !== prefConfig.method)];
				const masterKeyCache = new Map();
				const getMasterKey = (cfg) => { if (!masterKeyCache.has(cfg.method)) masterKeyCache.set(cfg.method, ssDeriveMasterKey(uuid, cfg.keyLen)); return masterKeyCache.get(cfg.method); };
				const inboundState = { buffer: new Uint8Array(0), hasSalt: false, waitPayloadLen: null, decryptKey: null, nonceCounter: new Uint8Array(SS_NONCE_LEN), cipherConfig: null };
				const initInboundDecrypt = async () => {
					const lenCipherTotal = 2 + SS_AEAD_TAG_LEN;
					const maxSalt = Math.max(...candidates.map(c => c.saltLen));
					const maxScan = 16;
					const maxOffset = Math.min(maxScan, Math.max(0, inboundState.buffer.byteLength - (lenCipherTotal + Math.min(...candidates.map(c => c.saltLen)))));
					for (let offset = 0; offset <= maxOffset; offset++) {
						for (const cfg of candidates) {
							const initLen = offset + cfg.saltLen + lenCipherTotal;
							if (inboundState.buffer.byteLength < initLen) continue;
							const salt = inboundState.buffer.subarray(offset, offset + cfg.saltLen);
							const lenCipher = inboundState.buffer.subarray(offset + cfg.saltLen, initLen);
							const mk = await getMasterKey(cfg);
							const dk = await ssDeriveSessionKey(cfg, mk, salt, ['decrypt']);
							const nc = new Uint8Array(SS_NONCE_LEN);
							try {
								const lp = await ssAEADDecrypt(dk, nc, lenCipher);
								if (lp.byteLength !== 2) continue;
								const pl = (lp[0] << 8) | lp[1];
								if (pl < 0 || pl > cfg.maxChunk) continue;
								if (offset > 0) log(`[SS] leading noise ${offset}B aligned`);
								if (cfg.method !== prefConfig.method) log(`[SS] URL enc=${encMethod || prefConfig.method} actual=${cfg.method}, switched`);
								inboundState.buffer = inboundState.buffer.subarray(initLen);
								inboundState.decryptKey = dk; inboundState.nonceCounter = nc; inboundState.waitPayloadLen = pl; inboundState.cipherConfig = cfg; inboundState.hasSalt = true;
								return true;
							} catch (_) { }
						}
					}
					const failLen = maxSalt + lenCipherTotal + maxScan;
					if (inboundState.buffer.byteLength >= failLen) throw new Error(`SS handshake decrypt failed`);
					return false;
				};
				const inboundDecryptor = {
					async input(chunk) {
						const c = toUint8Array(chunk); if (c.byteLength > 0) inboundState.buffer = concatBytes(inboundState.buffer, c);
						if (!inboundState.hasSalt) { const ok = await initInboundDecrypt(); if (!ok) return []; }
						const plains = [];
						while (true) {
							if (inboundState.waitPayloadLen === null) {
								const lt = 2 + SS_AEAD_TAG_LEN;
								if (inboundState.buffer.byteLength < lt) break;
								const lc = inboundState.buffer.subarray(0, lt); inboundState.buffer = inboundState.buffer.subarray(lt);
								const lp = await ssAEADDecrypt(inboundState.decryptKey, inboundState.nonceCounter, lc);
								if (lp.byteLength !== 2) throw new Error('SS length decrypt failed');
								inboundState.waitPayloadLen = (lp[0] << 8) | lp[1];
								if (inboundState.waitPayloadLen < 0 || inboundState.waitPayloadLen > inboundState.cipherConfig.maxChunk) throw new Error(`SS payload invalid`);
							}
							const payloadTotal = inboundState.waitPayloadLen + SS_AEAD_TAG_LEN;
							if (inboundState.buffer.byteLength < payloadTotal) break;
							const pc = inboundState.buffer.subarray(0, payloadTotal); inboundState.buffer = inboundState.buffer.subarray(payloadTotal);
							const pp = await ssAEADDecrypt(inboundState.decryptKey, inboundState.nonceCounter, pc);
							plains.push(pp); inboundState.waitPayloadLen = null;
						}
						return plains;
					}
				};
				let outboundEncryptor = null;
				const SS_BATCH_MAX = 32 * 1024;
				const getOutboundEncryptor = async () => {
					if (outboundEncryptor) return outboundEncryptor;
					if (!inboundState.cipherConfig) throw new Error('SS cipher not negotiated');
					const cfg = inboundState.cipherConfig;
					const mk = await ssDeriveMasterKey(uuid, cfg.keyLen);
					const salt = crypto.getRandomValues(new Uint8Array(cfg.saltLen));
					const ek = await ssDeriveSessionKey(cfg, mk, salt, ['encrypt']);
					const nc = new Uint8Array(SS_NONCE_LEN);
					let saltSent = false;
					outboundEncryptor = {
						async encryptSend(data, sendChunk) {
							const pd = toUint8Array(data);
							if (!saltSent) { await sendChunk(salt); saltSent = true; }
							if (pd.byteLength === 0) return;
							let off = 0;
							while (off < pd.byteLength) {
								const end = Math.min(off + cfg.maxChunk, pd.byteLength);
								const payload = pd.subarray(off, end);
								const lp = new Uint8Array(2); lp[0] = (payload.byteLength >>> 8) & 0xff; lp[1] = payload.byteLength & 0xff;
								const lc = await ssAEADEncrypt(ek, nc, lp);
								const pc = await ssAEADEncrypt(ek, nc, payload);
								const frame = new Uint8Array(lc.byteLength + pc.byteLength); frame.set(lc, 0); frame.set(pc, lc.byteLength);
								await sendChunk(frame); off = end;
							}
						}
					};
					return outboundEncryptor;
				};
				let ssSendQueue = Promise.resolve();
				const ssEnqueueSend = (chunk) => {
					ssSendQueue = ssSendQueue.then(async () => {
						if (serverSock.readyState !== WebSocket.OPEN) return;
						const enc = await getOutboundEncryptor();
						await enc.encryptSend(chunk, async (ec) => { if (ec.byteLength > 0 && serverSock.readyState === WebSocket.OPEN) await wsSend(serverSock, ec.buffer); });
					}).catch(err => { log(`[SS] encrypt fail: ${err?.message || err}`); closeQuietly(serverSock); });
					return ssSendQueue;
				};
				const respSock = {
					get readyState() { return serverSock.readyState; },
					send(data) { const c = toUint8Array(data); if (c.byteLength <= SS_BATCH_MAX) return ssEnqueueSend(c); for (let i = 0; i < c.byteLength; i += SS_BATCH_MAX) ssEnqueueSend(c.subarray(i, Math.min(i + SS_BATCH_MAX, c.byteLength))); return ssSendQueue; },
					close() { closeQuietly(serverSock); }
				};
				ssCtx = { inboundDecryptor, respSock, established: false, targetHost: '', targetPort: 0 };
				return ssCtx;
			})().finally(() => { ssInitTask = null; });
		}
		return ssInitTask;
	};
	const processSSData = async (chunk) => {
		const ctx = await getSSCtx();
		let plains = null;
		try { plains = await ctx.inboundDecryptor.input(chunk); } catch (err) {
			const msg = err?.message || `${err}`;
			if (msg.includes('Decryption failed') || msg.includes('handshake decrypt') || msg.includes('length decrypt')) { log(`[SS] decrypt fail: ${msg}`); closeQuietly(serverSock); return; }
			throw err;
		}
		for (const plain of plains) {
			if (wsLocalSpeedMode) { await processLocalSpeedData(plain); continue; }
			let written = false;
			try { written = await writeToRemote(plain, false); } catch (err) { if (err?.isQueueOverflow) throw err; written = false; }
			if (written) continue;
			if (ctx.established && ctx.targetHost && ctx.targetPort > 0) { await forwardTCP(ctx.targetHost, ctx.targetPort, plain, ctx.respSock, null, remoteWrapper, uuid, request, proxyCtx); continue; }
			const pd = toUint8Array(plain);
			if (pd.byteLength < 3) throw new Error('invalid ss data');
			const atype = pd[0]; let cursor = 1, hostname = '';
			if (atype === 1) { hostname = `${pd[cursor]}.${pd[cursor+1]}.${pd[cursor+2]}.${pd[cursor+3]}`; cursor += 4; }
			else if (atype === 3) { const dl = pd[cursor]; cursor += 1; hostname = ssTextDecoder.decode(pd.subarray(cursor, cursor + dl)); cursor += dl; }
			else if (atype === 4) { const ipv6 = []; const dv = new DataView(pd.buffer, pd.byteOffset + cursor, 16); for (let i = 0; i < 8; i++) ipv6.push(dv.getUint16(i * 2).toString(16)); hostname = ipv6.join(':'); cursor += 16; }
			else throw new Error(`invalid ss atype: ${atype}`);
			const port = (pd[cursor] << 8) | pd[cursor + 1]; cursor += 2;
			const raw = pd.subarray(cursor);
			if (isSpeedTestSite(hostname) && proxyCtx.proxyType === null) { await enableLocalSpeedMode(ctx.respSock, null, raw); return; }
			ctx.established = true; ctx.targetHost = hostname; ctx.targetPort = port;
			await forwardTCP(hostname, port, raw, ctx.respSock, null, remoteWrapper, uuid, request, proxyCtx);
		}
	};
	const processWSInbound = async (chunk) => {
		if (isDNS) { if (isTrojan) return await forwardTrojanUDPData(chunk, serverSock, trojanCtx, request); return await forwardUDP(chunk, serverSock, null, request); }
		if (protocolDetected === 'ss') { await processSSData(chunk); return; }
		if (wsLocalSpeedMode) { await processLocalSpeedData(chunk); return; }
		if (await writeToRemote(chunk)) return;
		if (protocolDetected === null) {
			if (url.searchParams.get('enc')) protocolDetected = 'ss';
			else { const bytes = toUint8Array(chunk); protocolDetected = bytes.byteLength >= 58 && bytes[56] === 0x0d && bytes[57] === 0x0a ? 'trojan' : 'vless'; }
			isTrojan = protocolDetected === 'trojan';
			log(`[WS] Protocol: ${protocolDetected} | Host: ${url.host}`);
		}
		if (protocolDetected === 'ss') { await processSSData(chunk); return; }
		if (await writeToRemote(chunk)) return;
		if (protocolDetected === 'trojan') {
			const parsed = parseTrojanRequest(chunk, uuid);
			if (parsed?.hasError) throw new Error(parsed.message || 'Invalid trojan');
			const { port, hostname, rawClientData, isUDP } = parsed;
			if (isSpeedTestSite(hostname) && proxyCtx.proxyType === null) { await enableLocalSpeedMode(serverSock, null, rawClientData); return; }
			if (isUDP) { isDNS = true; trojanCtx.targetHost = hostname; trojanCtx.targetPort = port;
				if (trojanCtx.proxyAddr) return forwardTrojanUDPData(toUint8Array(chunk), serverSock, trojanCtx, request);
				if (dataLen(rawClientData) > 0) return forwardTrojanUDPData(rawClientData, serverSock, trojanCtx, request);
				return;
			}
			await forwardTCP(hostname, port, rawClientData, serverSock, null, remoteWrapper, uuid, request, proxyCtx, true, toUint8Array(chunk));
		} else {
			isTrojan = false;
			const bytes = toUint8Array(chunk);
			const parsed = parseVlessRequest(bytes, uuid);
			if (parsed?.hasError) throw new Error(parsed.message || 'Invalid vless');
			const { port, hostname, version, isUDP, rawClientData } = parsed;
			const respHdr = new Uint8Array([version, 0]);
			if (isSpeedTestSite(hostname) && proxyCtx.proxyType === null) { await enableLocalSpeedMode(serverSock, respHdr, rawClientData); return; }
			if (isUDP) { if (port === 53) isDNS = true; else throw new Error('UDP not supported'); }
			if (isDNS) return forwardUDP(rawClientData, serverSock, respHdr, request);
			await forwardTCP(hostname, port, rawClientData, serverSock, respHdr, remoteWrapper, uuid, request, proxyCtx);
		}
	};
	const handleWSError = (err) => {
		if (wsExplicitFailed) return;
		wsExplicitFailed = true; wsExplicitStop = true; wsExplicitBytes = 0; wsExplicitEntries = 0;
		const msg = err?.message || `${err}`;
		if (msg.includes('Network connection lost') || msg.includes('ReadableStream is closed')) log(`[WS] Connection ended: ${msg}`);
		else log(`[WS] Error: ${msg}`);
		upQueue.clear(); releaseRemoteWriter(); invalidateRemote();
		try { trojanCtx.proxySocket?.close() } catch (e) { } closeQuietly(serverSock);
	};
	const enqueueExplicit = (task) => { wsExplicitChain = wsExplicitChain.then(task).catch(handleWSError); return wsExplicitChain; };
	const pushExplicit = (data) => {
		if (wsExplicitStop || wsExplicitFailed) return;
		const cs = Math.max(0, dataLen(data));
		const nb = wsExplicitBytes + cs, ne = wsExplicitEntries + 1;
		if (nb > UPSTREAM_QUEUE_MAX_BYTES || ne > UPSTREAM_QUEUE_MAX_ENTRIES) { handleWSError(new Error(`[WS] Queue overflow: ${nb}B/${ne}`)); return; }
		wsExplicitBytes = nb; wsExplicitEntries = ne;
		enqueueExplicit(async () => {
			wsExplicitBytes = Math.max(0, wsExplicitBytes - cs); wsExplicitEntries = Math.max(0, wsExplicitEntries - 1);
			if (wsExplicitFailed) return; await processWSInbound(data);
		});
	};
	const finishExplicit = () => {
		if (wsExplicitEnqueued) return; wsExplicitEnqueued = true; wsExplicitStop = true;
		enqueueExplicit(async () => { if (wsExplicitFailed) return; await upQueue.waitIdle(); releaseRemoteWriter(); invalidateRemote(); try { trojanCtx.proxySocket?.close() } catch (e) { } });
	};
	serverSock.addEventListener('message', (ev) => { pushExplicit(ev.data); });
	serverSock.addEventListener('close', () => { closeQuietly(serverSock); finishExplicit(); });
	serverSock.addEventListener('error', (err) => { handleWSError(err); });
	if (!ssModeNoEarly && earlyDataHeader) {
		try { const bytes = decodeWSEarlyData(earlyDataHeader, uuid); if (bytes?.byteLength) pushExplicit(bytes.buffer); } catch (error) { handleWSError(error); }
	}
	return new Response(null, { status: 101, webSocket: clientSock, headers: { 'Sec-WebSocket-Extensions': '' } });
}
/////////////////////////////////////////////////////// Trojan Fallback & UDP ///////////////////////////////////////////////
function parseTrojanProxyAddr(address) {
	const raw = String(address || '').trim();
	if (!raw || raw.includes('/') || raw.includes('@') || raw.includes('://')) throw new Error('Trojan fallback only supports host:port');
	let hostname = '', portText = '';
	if (raw.startsWith('[')) { const m = raw.match(/^(\[[^\]]+\]):(\d+)$/); if (!m) throw new Error('Invalid IPv6'); hostname = m[1]; portText = m[2]; }
	else { const parts = raw.split(':'); if (parts.length !== 2) throw new Error('Invalid format'); hostname = parts[0]; portText = parts[1]; }
	const port = Number(portText);
	if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
	return { hostname, port };
}
async function connectTrojanFallback(firstPktData, tcpConn, target) {
	if (!target) throw new Error('trojan fallback not configured');
	const socket = tcpConn({ hostname: stripIPv6Brackets(target.hostname), port: target.port });
	let writer = null;
	try {
		if (socket.opened) await socket.opened;
		if (dataLen(firstPktData) > 0) { writer = socket.writable.getWriter(); await writer.write(toUint8Array(firstPktData)); }
		return socket;
	} catch (error) { try { socket?.close?.() } catch (e) { } throw error; }
	finally { try { writer?.releaseLock() } catch (e) { } }
}
function extractTrojanFallbackHandshake(firstPkt, rawData) {
	const fp = toUint8Array(firstPkt), pd = toUint8Array(rawData);
	if (!pd.byteLength) return fp;
	const hsLen = fp.byteLength - pd.byteLength;
	if (hsLen <= 0) return fp;
	for (let i = 0; i < pd.byteLength; i++) { if (fp[hsLen + i] !== pd[i]) return fp; }
	return fp.subarray(0, hsLen);
}
async function forwardTrojanUDPData(chunk, ws, ctx, request) {
	const cur = toUint8Array(chunk);
	if (ctx?.proxyAddr) return forwardTrojanUDPProxy(cur, ws, ctx, request);
	const buf = ctx?.buffer instanceof Uint8Array ? ctx.buffer : new Uint8Array(0);
	const input = buf.byteLength ? concatBytes(buf, cur) : cur;
	let cursor = 0;
	while (cursor < input.byteLength) {
		const ps = cursor, atype = input[cursor]; let ac = cursor + 1, al = 0;
		if (atype === 1) al = 4; else if (atype === 4) al = 16; else if (atype === 3) { if (input.byteLength < ac + 1) break; al = 1 + input[ac]; } else throw new Error(`invalid trojan udp atype: ${atype}`);
		const pc = ac + al;
		if (input.byteLength < pc + 6) break;
		const port = (input[pc] << 8) | input[pc + 1], payloadLen = (input[pc + 2] << 8) | input[pc + 3];
		if (input[pc + 4] !== 0x0d || input[pc + 5] !== 0x0a) throw new Error('invalid trojan udp delimiter');
		const payloadStart = pc + 6, payloadEnd = payloadStart + payloadLen;
		if (input.byteLength < payloadEnd) break;
		const addrHdr = input.slice(ps, pc + 2), payload = input.slice(payloadStart, payloadEnd);
		cursor = payloadEnd;
		if (port !== 53) throw new Error('UDP not supported');
		if (!payload.byteLength) continue;
		let tcpDNS = payload;
		if (payload.byteLength < 2 || ((payload[0] << 8) | payload[1]) !== payload.byteLength - 2) { tcpDNS = new Uint8Array(payload.byteLength + 2); tcpDNS[0] = (payload.byteLength >>> 8) & 0xff; tcpDNS[1] = payload.byteLength & 0xff; tcpDNS.set(payload, 2); }
		const dnsCtx = { buffer: new Uint8Array(0) };
		await forwardUDP(tcpDNS, ws, null, request, (dnsResp) => {
			const rb = toUint8Array(dnsResp);
			const ri = dnsCtx.buffer.byteLength ? concatBytes(dnsCtx.buffer, rb) : rb;
			const frames = []; let rc = 0;
			while (rc + 2 <= ri.byteLength) {
				const dl = (ri[rc] << 8) | ri[rc + 1], ds = rc + 2, de = ds + dl;
				if (de > ri.byteLength) break;
				const dp = ri.slice(ds, de);
				const f = new Uint8Array(addrHdr.byteLength + 4 + dp.byteLength);
				f.set(addrHdr, 0); f[addrHdr.byteLength] = (dp.byteLength >>> 8) & 0xff; f[addrHdr.byteLength + 1] = dp.byteLength & 0xff;
				f[addrHdr.byteLength + 2] = 0x0d; f[addrHdr.byteLength + 3] = 0x0a; f.set(dp, addrHdr.byteLength + 4);
				frames.push(f); rc = de;
			}
			dnsCtx.buffer = ri.slice(rc);
			return frames.length ? frames : new Uint8Array(0);
		});
	}
	if (ctx) ctx.buffer = input.slice(cursor);
}
async function forwardTrojanUDPProxy(chunk, ws, ctx, request) {
	const data = toUint8Array(chunk);
	if (!ctx.proxySocket) {
		const tcpConn = createTCPConnector(request);
		const socket = await connectTrojanFallback(data, tcpConn, ctx.proxyAddr);
		ctx.proxySocket = socket;
		socket.closed.catch(() => { }).finally(() => closeQuietly(ws));
		connectStreams(socket, ws, null, null);
		return;
	}
	if (!data.byteLength) return;
	const writer = ctx.proxySocket.writable.getWriter();
	try { await writer.write(data); } finally { try { writer.releaseLock(); } catch (e) { } }
}
/////////////////////////////////////////////////////// Protocol Parsing ///////////////////////////////////////////////
const UUID_CACHE = new Map();
const vlessTextDecoder = new TextDecoder();
const trojanTextDecoder = new TextDecoder();
const ssTextDecoder = new TextDecoder();
function readHexNibble(code) { if (code >= 48 && code <= 57) return code - 48; code |= 32; if (code >= 97 && code <= 102) return code - 87; return -1; }
function getUUIDBytes(uuid) {
	const key = String(uuid || '');
	let c = UUID_CACHE.get(key); if (c) return c;
	const clean = key.replace(/-/g, '');
	if (clean.length !== 32) return null;
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 16; i++) { const h = readHexNibble(clean.charCodeAt(i * 2)), l = readHexNibble(clean.charCodeAt(i * 2 + 1)); if (h < 0 || l < 0) return null; bytes[i] = (h << 4) | l; }
	if (UUID_CACHE.size >= 32) UUID_CACHE.clear(); UUID_CACHE.set(key, bytes);
	return bytes;
}
function uuidBytesMatch(data, offset, uuid) {
	const expected = getUUIDBytes(uuid);
	if (!expected || data.byteLength < offset + 16) return false;
	for (let i = 0; i < 16; i++) { if (data[offset + i] !== expected[i]) return false; }
	return true;
}
function parseVlessRequest(chunk, token) {
	const data = toUint8Array(chunk), len = data.byteLength;
	if (len < 24) return { hasError: true, message: 'Invalid data' };
	const version = data[0];
	if (!uuidBytesMatch(data, 1, token)) return { hasError: true, message: 'Invalid uuid' };
	const optLen = data[17], cmdIdx = 18 + optLen;
	if (len < cmdIdx + 4) return { hasError: true, message: 'Invalid data' };
	const cmd = data[cmdIdx];
	let isUDP = false;
	if (cmd === 1) { } else if (cmd === 2) { isUDP = true; } else return { hasError: true, message: 'Invalid command' };
	const portIdx = cmdIdx + 1, port = (data[portIdx] << 8) | data[portIdx + 1];
	let addrIdx = portIdx + 3, addrLen = 0, hostname = '';
	const atype = data[portIdx + 2];
	switch (atype) {
		case 1: addrLen = 4; if (len < addrIdx + addrLen) return { hasError: true, message: 'Invalid IPv4' }; hostname = `${data[addrIdx]}.${data[addrIdx+1]}.${data[addrIdx+2]}.${data[addrIdx+3]}`; break;
		case 2: if (len < addrIdx + 1) return { hasError: true, message: 'Invalid domain len' }; addrLen = data[addrIdx]; addrIdx += 1; if (len < addrIdx + addrLen) return { hasError: true, message: 'Invalid domain' }; hostname = vlessTextDecoder.decode(data.subarray(addrIdx, addrIdx + addrLen)); break;
		case 3: addrLen = 16; if (len < addrIdx + addrLen) return { hasError: true, message: 'Invalid IPv6' }; const ipv6 = []; for (let i = 0; i < 8; i++) { const b = addrIdx + i * 2; ipv6.push(((data[b] << 8) | data[b + 1]).toString(16)); } hostname = ipv6.join(':'); break;
		default: return { hasError: true, message: `Invalid atype: ${atype}` };
	}
	if (!hostname) return { hasError: true, message: `Invalid address: ${atype}` };
	return { hasError: false, atype, port, hostname, isUDP, rawClientData: data.subarray(addrIdx + addrLen), version };
}
function parseTrojanRequest(buffer, passwordText) {
	const data = toUint8Array(buffer), sha224Password = sha224(passwordText);
	if (data.byteLength < 58) return { hasError: true, message: "invalid data" };
	const crLfIdx = 56;
	if (data[crLfIdx] !== 0x0d || data[crLfIdx + 1] !== 0x0a) return { hasError: true, message: "invalid header" };
	for (let i = 0; i < crLfIdx; i++) { if (data[i] !== sha224Password.charCodeAt(i)) return { hasError: true, message: "invalid password" }; }
	const s5Idx = crLfIdx + 2;
	if (data.byteLength < s5Idx + 6) return { hasError: true, message: "invalid S5" };
	const cmd = data[s5Idx]; if (cmd !== 1 && cmd !== 3) return { hasError: true, message: "unsupported cmd" };
	const isUDP = cmd === 3, atype = data[s5Idx + 1];
	let cursor = s5Idx + 2, hostname = '';
	switch (atype) {
		case 1: if (data.byteLength < cursor + 4) return { hasError: true }; hostname = `${data[cursor]}.${data[cursor+1]}.${data[cursor+2]}.${data[cursor+3]}`; cursor += 4; break;
		case 3: if (data.byteLength < cursor + 1) return { hasError: true }; const dl = data[cursor]; cursor += 1; if (data.byteLength < cursor + dl + 4) return { hasError: true }; hostname = trojanTextDecoder.decode(data.subarray(cursor, cursor + dl)); cursor += dl; break;
		case 4: if (data.byteLength < cursor + 16) return { hasError: true }; const ipv6 = []; for (let i = 0; i < 8; i++) { const b = cursor + i * 2; ipv6.push(((data[b] << 8) | data[b + 1]).toString(16)); } hostname = ipv6.join(":"); cursor += 16; break;
		default: return { hasError: true, message: `invalid atype ${atype}` };
	}
	if (!hostname) return { hasError: true, message: `empty address ${atype}` };
	if (data.byteLength < cursor + 4) return { hasError: true };
	const port = (data[cursor] << 8) | data[cursor + 1];
	if (data[cursor + 2] !== 0x0d || data[cursor + 3] !== 0x0a) return { hasError: true, message: "invalid delimiter" };
	return { hasError: false, atype, port, hostname, isUDP, rawClientData: data.subarray(cursor + 4) };
}
/////////////////////////////////////////////////////// Shadowsocks AEAD ///////////////////////////////////////////////
const SS_CIPHER_CONFIGS = {
	'aes-128-gcm': { method: 'aes-128-gcm', keyLen: 16, saltLen: 16, maxChunk: 0x3fff, aesLength: 128 },
	'aes-256-gcm': { method: 'aes-256-gcm', keyLen: 32, saltLen: 32, maxChunk: 0x3fff, aesLength: 256 },
};
const SS_AEAD_TAG_LEN = 16, SS_NONCE_LEN = 12;
const SS_SUBKEY_INFO = new TextEncoder().encode('ss-subkey');
const ssTextEncoder = new TextEncoder(), ssMasterKeyCache = new Map();
function ssIncrementNonce(counter) { for (let i = 0; i < counter.length; i++) { counter[i] = (counter[i] + 1) & 0xff; if (counter[i] !== 0) return; } }
async function ssDeriveMasterKey(passwordText, keyLen) {
	const cacheKey = `${keyLen}:${passwordText}`;
	if (ssMasterKeyCache.has(cacheKey)) return ssMasterKeyCache.get(cacheKey);
	const task = (async () => { const pw = ssTextEncoder.encode(passwordText || ''); let prev = new Uint8Array(0), result = new Uint8Array(0); while (result.byteLength < keyLen) { const inp = new Uint8Array(prev.byteLength + pw.byteLength); inp.set(prev, 0); inp.set(pw, prev.length); prev = new Uint8Array(await crypto.subtle.digest('MD5', inp)); result = concatBytes(result, prev); } return result.slice(0, keyLen); })();
	ssMasterKeyCache.set(cacheKey, task);
	try { return await task; } catch (e) { ssMasterKeyCache.delete(cacheKey); throw e; }
}
async function ssDeriveSessionKey(config, masterKey, salt, usages) {
	const hmacOpts = { name: 'HMAC', hash: 'SHA-1' };
	const saltHmac = await crypto.subtle.importKey('raw', salt, hmacOpts, false, ['sign']);
	const prk = new Uint8Array(await crypto.subtle.sign('HMAC', saltHmac, masterKey));
	const prkHmac = await crypto.subtle.importKey('raw', prk, hmacOpts, false, ['sign']);
	const subKey = new Uint8Array(config.keyLen);
	let prev = new Uint8Array(0), written = 0, counter = 1;
	while (written < config.keyLen) { const inp = concatBytes(prev, SS_SUBKEY_INFO, new Uint8Array([counter])); prev = new Uint8Array(await crypto.subtle.sign('HMAC', prkHmac, inp)); const cl = Math.min(prev.byteLength, config.keyLen - written); subKey.set(prev.subarray(0, cl), written); written += cl; counter++; }
	return crypto.subtle.importKey('raw', subKey, { name: 'AES-GCM', length: config.aesLength }, false, usages);
}
async function ssAEADEncrypt(cryptoKey, nonceCounter, plaintext) {
	const iv = nonceCounter.slice();
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, plaintext);
	ssIncrementNonce(nonceCounter);
	return new Uint8Array(ct);
}
async function ssAEADDecrypt(cryptoKey, nonceCounter, ciphertext) {
	const iv = nonceCounter.slice();
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, ciphertext);
	ssIncrementNonce(nonceCounter);
	return new Uint8Array(pt);
}
/////////////////////////////////////////////////////// TCP Forwarding ///////////////////////////////////////////////
async function forwardTCP(host, portNum, rawData, ws, respHdr, remoteWrapper, uuid, request = null, proxyCtx = {}, allowTrojanFallback = false, trojanFirstPkt = null, connectOnly = false) {
	const ctxIP = proxyCtx.proxyIP || '', ctxType = proxyCtx.proxyType !== undefined ? proxyCtx.proxyType : null;
	const ctxGlobal = proxyCtx.proxyGlobal !== undefined ? proxyCtx.proxyGlobal : false;
	const ctxParams = proxyCtx.proxyParams || {}, ctxFallback = proxyCtx.proxyFallback !== undefined ? proxyCtx.proxyFallback : true;
	let proxyArrayIdx = 0;
	log(`[TCP] Target: ${host}:${portNum} | ProxyIP: ${ctxIP} | Fallback: ${ctxFallback} | Type: ${ctxType || 'proxyip'} | Global: ${ctxGlobal}`);
	const CONNECT_TIMEOUT = 1000;
	let firstPktSentViaProxy = false;
	const tcpConn = createTCPConnector(request);
	const useTrojanFallback = allowTrojanFallback && (proxyCtx.trojanProxyAddr || null);
	const trojanTarget = useTrojanFallback ? proxyCtx.trojanProxyAddr : null;
	const trojanHandshake = useTrojanFallback ? extractTrojanFallbackHandshake(trojanFirstPkt, rawData) : null;
	let pendingRespHdr = respHdr;
	const getRespHdr = () => { const h = pendingRespHdr; pendingRespHdr = null; return h; };
	if (!Number.isInteger(remoteWrapper.generation)) remoteWrapper.generation = 0;
	const installConn = async (socket, gen, downDrain, retryFn = null) => {
		try { await downDrain; } catch (e) { if (remoteWrapper.downlinkDrain === downDrain) remoteWrapper.downlinkDrain = Promise.resolve(); try { socket?.close?.(); } catch (_) { } if (remoteWrapper.generation === gen) closeQuietly(ws); throw e; }
		if (remoteWrapper.downlinkDrain === downDrain) remoteWrapper.downlinkDrain = Promise.resolve();
		const isValid = () => remoteWrapper.generation === gen && remoteWrapper.socket === socket;
		if (remoteWrapper.generation !== gen || ws.readyState !== WebSocket.OPEN) { try { socket?.close?.(); } catch (e) { } if (remoteWrapper.generation === gen) remoteWrapper.socket = null; throw new Error('superseded or closed'); }
		remoteWrapper.socket = socket;
		if (connectOnly) return socket;
		connectStreams(socket, ws, getRespHdr, retryFn, isValid, remoteWrapper).catch(err => { if (!isValid()) return; log(`[TCP-down] Error: ${err?.message || err}`); try { socket?.close?.(); } catch (e) { } closeQuietly(ws); });
		return true;
	};
	async function waitOpen(sock, timeoutMs = CONNECT_TIMEOUT) { await Promise.race([sock.opened, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]); }
	async function openTCP(address, port) { const s = tcpConn({ hostname: address, port }); try { await waitOpen(s); return s; } catch (err) { try { s?.close?.(); } catch (e) { } throw err; } }
	async function writeFirstPkt(sock, data) { if (dataLen(data) <= 0) return; const w = sock.writable.getWriter(); try { await w.write(toUint8Array(data)); } finally { try { w.releaseLock(); } catch (e) { } } }
	async function raceCandidates(candidates) {
		if (candidates.length === 1) { return { socket: await openTCP(candidates[0].hostname, candidates[0].port), candidate: candidates[0] }; }
		const attempts = candidates.map(c => openTCP(c.hostname, c.port).then(socket => ({ socket, candidate: c })));
		let winner = null;
		try { winner = await Promise.any(attempts); return winner; }
		finally { if (winner) { attempts.forEach(a => a.then(({ socket }) => { if (socket !== winner.socket) try { socket?.close?.(); } catch (e) { } }).catch(() => { })); } }
	}
	async function buildPreloadCandidates(address, port) {
		if (!PRELOAD_RACE_DIAL || isIPHostname(address)) return null;
		log(`[TCP-direct] Preload race dial for ${address}`);
		const [aRec, aaaaRec] = await Promise.all([doHQuery(address, 'A'), doHQuery(address, 'AAAA')]);
		const ipv4List = [...new Set(aRec.flatMap(r => { const d = r.data; return r.type === 1 && typeof d === 'string' && isIPv4(d) ? [d] : []; }))];
		const ipv6List = [...new Set(aaaaRec.flatMap(r => { const d = r.data; return r.type === 28 && typeof d === 'string' && isIPHostname(d) ? [d] : []; }))];
		const limit = Math.max(1, TCP_CONCURRENT_DIAL | 0);
		const ipList = ipv4List.length >= limit ? ipv4List.slice(0, limit) : ipv4List.concat(ipv6List.slice(0, limit - ipv4List.length));
		if (ipList.length === 0) { log(`[TCP-direct] No DNS results for ${address}, falling back`); return null; }
		log(`[TCP-direct] ${address} A:${ipv4List.length} AAAA:${ipv6List.length} race ${ipList.length}/${limit}: ${ipList.join(', ')}`);
		return ipList.map((h, i) => ({ hostname: h, port, attempt: i, resolvedFrom: address }));
	}
	async function connectDirect(address, port, data = null, usePreload = false) {
		const preload = usePreload ? await buildPreloadCandidates(address, port) : null;
		const candidates = preload || Array.from({ length: TCP_CONCURRENT_DIAL }, (_, i) => ({ hostname: address, port, attempt: i }));
		log(`[TCP-direct] Racing ${candidates.length} paths`);
		let socket = null;
		try {
			const res = await raceCandidates(candidates); socket = res.socket;
			if (preload) log(`[TCP-direct] Winner: ${res.candidate.hostname}:${res.candidate.port}`);
			await writeFirstPkt(socket, data);
			return socket;
		} catch (err) { try { socket?.close?.(); } catch (e) { } throw err; }
	}
	async function connectProxyIP(address, port, data = null, allProxies = null, fallbackEnabled = true) {
		if (allProxies && allProxies.length > 0) {
			const conc = Math.max(1, Math.floor(Number(PROXY_CONCURRENT_DIAL) || 1));
			for (let i = 0; i < allProxies.length; i += conc) {
				const candidates = [];
				for (let j = 0; j < conc && i + j < allProxies.length; j++) { const idx = (proxyArrayIdx + i + j) % allProxies.length; const [addr, p] = allProxies[idx]; candidates.push({ hostname: addr, port: p, index: idx }); }
				try {
					log(`[Proxy] Racing ${candidates.length} paths: ${candidates.map(c => `${c.hostname}:${c.port}`).join(', ')}`);
					const res = await raceCandidates(candidates);
					await writeFirstPkt(res.socket, data);
					log(`[Proxy] Connected: ${res.candidate.hostname}:${res.candidate.port}`);
					proxyArrayIdx = res.candidate.index;
					return res.socket;
				} catch (err) { try { res?.socket?.close?.(); } catch (e) { } log(`[Proxy] Batch failed: ${err.message || err}`); }
			}
		}
		if (fallbackEnabled) return connectDirect(address, port, data, false);
		throw new Error('[Proxy] All failed and no fallback');
	}
	async function connectThroughProxy(allowFirstPkt = true) {
		if (remoteWrapper.connectingPromise) { await remoteWrapper.connectingPromise; return; }
		const { generation: gen, downlinkDrain } = startTCPCGeneration(remoteWrapper);
		let sendPkt = false, firstPktData = null;
		if (useTrojanFallback) {
			if (allowFirstPkt && !firstPktSentViaProxy && dataLen(trojanFirstPkt) > 0) { firstPktData = trojanFirstPkt; sendPkt = dataLen(rawData) > 0; } else firstPktData = trojanHandshake;
		} else { sendPkt = allowFirstPkt && !firstPktSentViaProxy && dataLen(rawData) > 0; firstPktData = sendPkt ? rawData : null; }
		const task = (async () => {
			let ns = null;
			try {
				if (useTrojanFallback) { ns = await connectTrojanFallback(firstPktData, tcpConn, trojanTarget); }
				else if (ctxType === 'socks5') { ns = await socks5Connect(host, portNum, firstPktData, tcpConn, ctxParams); }
				else if (ctxType === 'http') { ns = await httpConnect(host, portNum, firstPktData, false, tcpConn, ctxParams); }
				else if (ctxType === 'https') { ns = isIPHostname(ctxParams.hostname) ? await httpsConnect(host, portNum, firstPktData, tcpConn, ctxParams) : await httpConnect(host, portNum, firstPktData, true, tcpConn, ctxParams); }
				else if (ctxType === 'turn') { ns = await turnConnect(ctxParams, host, portNum, tcpConn); if (dataLen(firstPktData) > 0) { const w = ns.writable.getWriter(); try { await w.write(toUint8Array(firstPktData)); } finally { try { w.releaseLock(); } catch (e) { } } } }
				else if (ctxType === 'sstp') { ns = await sstpConnect(ctxParams, host, portNum, tcpConn); if (dataLen(firstPktData) > 0) { const w = ns.writable.getWriter(); try { await w.write(toUint8Array(firstPktData)); } finally { try { w.releaseLock(); } catch (e) { } } } }
				else { const allProxies = await resolveProxyIPs(ctxIP, host, uuid); ns = await connectProxyIP(`${FEATURE_CODES[0]}.tp1.${FEATURE_CODES[2]}.xyz`, 1, firstPktData, allProxies, ctxFallback); }
				await installConn(ns, gen, downlinkDrain);
				if (sendPkt) firstPktSentViaProxy = true;
			} catch (err) { try { ns?.close?.(); } catch (e) { } if (remoteWrapper.generation === gen) { remoteWrapper.socket = null; closeQuietly(ws); throw err; } }
		})();
		remoteWrapper.connectingPromise = task;
		try { await task; } finally { if (remoteWrapper.connectingPromise === task) remoteWrapper.connectingPromise = null; }
	}
	remoteWrapper.retryConnect = async () => connectThroughProxy(!firstPktSentViaProxy);
	if (ctxType && (ctxGlobal || socks5Whitelist.some(p => new RegExp(`^${p.replace(/\*/g, '.*')}$`, 'i').test(host)))) {
		log(`[TCP] Using ${ctxType} proxy globally`);
		try { await connectThroughProxy(); if (connectOnly) return remoteWrapper.socket; }
		catch (err) { log(`[TCP] ${ctxType} proxy failed: ${err.message}`); throw err; }
	} else {
		let directGen = remoteWrapper.generation;
		try {
			const g = startTCPCGeneration(remoteWrapper); directGen = g.generation;
			const initSock = await connectDirect(host, portNum, rawData, true);
			await installConn(initSock, directGen, g.downlinkDrain, async () => {
				if (remoteWrapper.generation !== directGen || remoteWrapper.socket !== initSock) return;
				await connectThroughProxy();
			});
			if (connectOnly) return initSock;
		} catch (err) {
			log(`[TCP-direct] ${host}:${portNum} failed: ${err.message}`);
			if (remoteWrapper.generation !== directGen) throw err;
			if (ws.readyState !== WebSocket.OPEN) throw err;
			await connectThroughProxy();
			if (connectOnly) return remoteWrapper.socket;
		}
	}
}
/////////////////////////////////////////////////////// UDP Forwarding (DNS over TCP) ///////////////////////////////////////////////
async function forwardUDP(udpChunk, ws, respHdr, request, responseWrapper = null) {
	const req = toUint8Array(udpChunk), reqLen = req.byteLength;
	log(`[UDP] DNS request: ${reqLen}B -> 8.8.4.4:53`);
	try {
		const tcpConn = createTCPConnector(request);
		const tcpSocket = tcpConn({ hostname: '8.8.4.4', port: 53 });
		let vlessHdr = respHdr;
		const writer = tcpSocket.writable.getWriter();
		await writer.write(req);
		log(`[UDP] Written: ${reqLen}B`);
		writer.releaseLock();
		await tcpSocket.readable.pipeTo(new WritableStream({
			async write(chunk) {
				const raw = toUint8Array(chunk);
				log(`[UDP] Response: ${raw.byteLength}B`);
				const wrapped = responseWrapper ? await responseWrapper(raw) : raw;
				const frags = Array.isArray(wrapped) ? wrapped : [wrapped];
				if (!frags.length) return;
				if (ws.readyState !== WebSocket.OPEN) return;
				for (const frag of frags) {
					const r = toUint8Array(frag); if (!r.byteLength) continue;
					if (vlessHdr) { const resp = new Uint8Array(vlessHdr.length + r.byteLength); resp.set(vlessHdr, 0); resp.set(r, vlessHdr.length); await wsSend(ws, resp.buffer); vlessHdr = null; }
					else await wsSend(ws, r);
				}
			},
		}));
	} catch (error) { log(`[UDP] Error: ${error?.message || error}`); }
}
function closeQuietly(socket) { try { if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) socket.close(); } catch (e) { } }
async function wsSend(ws, payload) { const r = ws.send(payload); if (r && typeof r.then === 'function') await r; }
function formatIdentifier(arr, offset = 0) { const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join(''); return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}`; }
/////////////////////////////////////////////////////// Grain Bundling & Write Queue ///////////////////////////////////////////////
function createGrainCollector(capacity, copyResult = false) {
	let queue = [], head = 0, bytes = 0, bundleBuf = null;
	const isEmpty = () => head >= queue.length;
	const compact = () => { if (head > 32 && head * 2 >= queue.length) { queue = queue.slice(head); head = 0; } };
	const dequeue = () => { if (isEmpty()) return null; const item = queue[head]; queue[head++] = undefined; bytes -= item.chunk.byteLength; compact(); return item; };
	return {
		get bytes() { return bytes; },
		get entries() { return queue.length - head; },
		get isEmpty() { return isEmpty(); },
		clear(handler = null) { if (handler) { for (let i = head; i < queue.length; i++) { if (queue[i]) handler(queue[i]); } } queue = []; head = 0; bytes = 0; },
		accept(item) { if (!item?.chunk?.byteLength) return false; queue.push(item); bytes += item.chunk.byteLength; return true; },
		bundle() {
			const first = dequeue(); if (!first) return null; const items = [first];
			if (isEmpty() || first.chunk.byteLength >= capacity) return { chunk: first.chunk, items };
			let total = first.chunk.byteLength, end = head;
			while (end < queue.length) { const nb = total + queue[end].chunk.byteLength; if (nb > capacity) break; total = nb; end++; }
			if (end === head) return { chunk: first.chunk, items };
			const out = (bundleBuf ||= new Uint8Array(capacity)); out.set(first.chunk, 0); let off = first.chunk.byteLength;
			while (head < end) { const next = queue[head]; queue[head++] = undefined; bytes -= next.chunk.byteLength; items.push(next); out.set(next.chunk, off); off += next.chunk.byteLength; }
			compact();
			const bundled = out.subarray(0, total);
			return { chunk: copyResult ? bundled.slice() : bundled, items };
		}
	};
}
function createUpstreamBundleStream(targetBytes = UPSTREAM_BUNDLE_TARGET) {
	const identity = typeof IdentityTransformStream !== 'undefined' ? new IdentityTransformStream() : new TransformStream();
	const writer = identity.writable.getWriter();
	const buf = new Uint8Array(targetBytes); let bufLen = 0;
	let timer = null, inFlight = null, flushChain = Promise.resolve();
	const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
	const serialWrite = async (chunk) => { if (inFlight) await inFlight; inFlight = writer.write(chunk); try { await inFlight; } finally { inFlight = null; } };
	const flush = async () => { if (bufLen) { const c = buf.slice(0, bufLen); bufLen = 0; await serialWrite(c); } };
	const queueFlush = () => { flushChain = flushChain.then(() => flush()).catch(() => { }); };
	const startTimer = () => { if (timer) return; timer = setTimeout(() => { timer = null; queueFlush(); }, 1); };
	return {
		readable: identity.readable,
		write: async (chunk) => {
			const d = toUint8Array(chunk); if (!d.byteLength) return;
			if (d.byteLength >= targetBytes) { clearTimer(); if (bufLen) await flush(); await serialWrite(d); return; }
			if (bufLen + d.byteLength >= targetBytes) { const out = new Uint8Array(bufLen + d.byteLength); out.set(buf.subarray(0, bufLen), 0); out.set(d, bufLen); bufLen = 0; clearTimer(); await serialWrite(out); }
			else { buf.set(d, bufLen); bufLen += d.byteLength; startTimer(); }
		},
		end: async () => { clearTimer(); try { await flushChain; await flush(); await writer.close(); } finally { try { writer.releaseLock(); } catch (e) { } } }
	};
}
function createWriteQueue({ getWriter, getConnectTask = null, releaseWriter, retryConnect, closeConnection, name = 'UP-Queue' }) {
	const grain = createGrainCollector(UPSTREAM_BUNDLE_TARGET);
	let draining = false, closed = false, idleResolvers = [], activeCompletions = null;
	const settleComps = (comps, err = null) => { if (!comps) return; for (const c of comps) { if (err) c.reject(err); else c.resolve(); } };
	const resolveIdle = () => { if (grain.bytes || draining || !idleResolvers.length) return; const r = idleResolvers; idleResolvers = []; for (const resolve of r) resolve(); };
	const clear = (err = null) => { const e = err || (closed ? new Error(`${name}: closed`) : null); if (e) { grain.clear(item => settleComps(item.completions, e)); settleComps(activeCompletions, e); activeCompletions = null; } else grain.clear(); resolveIdle(); };
	const bundle = () => { const p = grain.bundle(); if (!p) return null; let allowRetry = true, comps = null; for (const item of p.items) { allowRetry = allowRetry && item.allowRetry; if (item.completions) comps = comps ? comps.concat(item.completions) : item.completions; } return { chunk: p.chunk, allowRetry, completions: comps }; };
	const waitForWriter = async () => { let w = getWriter(); if (w) return w; const ct = getConnectTask?.(); if (ct) await ct; return getWriter(); };
	const drain = async () => {
		if (draining || closed) return; draining = true;
		try {
			for (;;) {
				if (closed) break; const item = bundle(); if (!item) break;
				const comps = item.completions || null; activeCompletions = comps;
				try {
					let writer = await waitForWriter();
					if (closed) break; if (!writer) throw new Error(`${name}: no writer`);
					try { await writer.write(item.chunk); } catch (err) {
						releaseWriter?.(); if (closed) break;
						if (!item.allowRetry || typeof retryConnect !== 'function') throw err;
						await retryConnect(); if (closed) break;
						writer = getWriter(); if (!writer) throw err; await writer.write(item.chunk);
					}
					settleComps(comps);
				} catch (err) { settleComps(comps, err); throw err; }
				finally { if (activeCompletions === comps) activeCompletions = null; }
			}
		} catch (err) { closed = true; clear(err); log(`[${name}] Write error: ${err?.message || err}`); try { closeConnection?.(err); } catch (_) { } }
		finally { draining = false; if (!closed && !grain.isEmpty) drain(); else resolveIdle(); }
	};
	const enqueue = (data, allowRetry = true, waitForFlush = false) => {
		if (closed) return false;
		if (!getWriter() && !getConnectTask?.()) return false;
		const chunk = toUint8Array(data); if (!chunk.byteLength) return true;
		const nb = grain.bytes + chunk.byteLength, ne = grain.entries + 1;
		if (nb > UPSTREAM_QUEUE_MAX_BYTES || ne > UPSTREAM_QUEUE_MAX_ENTRIES) { closed = true; const err = Object.assign(new Error(`${name}: overflow ${nb}B/${ne}`), { isQueueOverflow: true }); clear(err); log(`[${name}] Overflow`); try { closeConnection?.(err); } catch (_) { } throw err; }
		let completionPromise = null, completions = null;
		if (waitForFlush) { completions = []; completionPromise = new Promise((resolve, reject) => completions.push({ resolve, reject })); }
		grain.accept({ chunk, allowRetry, completions }); if (!draining) drain();
		return waitForFlush ? completionPromise.then(() => true) : true;
	};
	return {
		write(data, allowRetry = true) { return enqueue(data, allowRetry, false); },
		writeAndWait(data, allowRetry = true) { return enqueue(data, allowRetry, true); },
		async waitIdle() { if (!grain.bytes && !draining) return; await new Promise(resolve => idleResolvers.push(resolve)); },
		clear() { closed = true; clear(); }
	};
}
function createDownstreamGrainSender(ws, headerData = null, isActive = null) {
	const cap = DOWNSTREAM_GRAIN_BYTES, tail = DOWNSTREAM_GRAIN_TAIL;
	const grain = createGrainCollector(cap, true);
	let header = typeof headerData === 'function' ? null : headerData;
	const getRespHdr = typeof headerData === 'function' ? headerData : () => { const v = header; header = null; return v; };
	let flushTimer = null, generation = 0, schedGen = 0, waitRounds = 0, flushPromise = null, directSendPromise = null;
	let forceFlush = false, stopped = false, activeSends = 0, activeDirects = 0, sendError = null, sendWaiters = [];
	const waitActiveDone = () => { if (!activeSends && !activeDirects) return Promise.resolve(); return new Promise(r => sendWaiters.push(r)); };
	const markDone = () => { if (activeSends || activeDirects || !sendWaiters.length) return; const r = sendWaiters; sendWaiters = []; for (const resolve of r) resolve(); };
	const checkError = () => { if (!sendError) return; const err = sendError; grain.clear(); throw err; };
	const isValid = () => forceFlush || !isActive || isActive();
	const closeWs = () => { if (isValid()) closeQuietly(ws); };
	const attachHdr = (chunk) => { const h = getRespHdr(); if (!h) return chunk; const m = new Uint8Array(h.length + chunk.byteLength); m.set(h, 0); m.set(chunk, h.length); return m; };
	const sendRaw = async (chunk) => { if (!isValid()) return; if (ws.readyState !== WebSocket.OPEN) throw new Error('ws not open'); chunk = attachHdr(chunk); await wsSend(ws, chunk); };
	const serialSend = async (chunk) => { while (directSendPromise) await directSendPromise; const t = sendRaw(chunk); directSendPromise = t; try { await t; } finally { if (directSendPromise === t) directSendPromise = null; } };
	const doFlush = async () => {
		while (flushPromise) await flushPromise;
		if (flushTimer) clearTimeout(flushTimer); flushTimer = null; waitRounds = 0;
		if (!isValid()) { grain.clear(); return; }
		const task = (async () => { for (;;) { if (!isValid()) { grain.clear(); break; } const p = grain.bundle(); if (!p) break; await serialSend(p.chunk); } })();
		flushPromise = task.catch(err => { sendError ||= err; throw err; }).finally(() => { flushPromise = null; });
		return flushPromise;
	};
	const scheduleFlush = () => {
		if (!isValid()) { grain.clear(); return; }
		if (grain.isEmpty || flushTimer) return;
		if (grain.bytes >= cap || cap - grain.bytes < tail) { doFlush().catch(closeWs); return; }
		flushTimer = setTimeout(() => {
			flushTimer = null; if (!isValid()) { grain.clear(); return; }
			if (grain.isEmpty) return;
			if (grain.bytes >= cap || cap - grain.bytes < tail) { doFlush().catch(closeWs); return; }
			if (waitRounds < DOWNSTREAM_GRAIN_MAX_WAIT && (generation !== schedGen || grain.bytes < DOWNSTREAM_GRAIN_LOW_WATER)) { waitRounds++; schedGen = generation; scheduleFlush(); return; }
			doFlush().catch(closeWs);
		}, 1);
	};
	return {
		async sendDirect(data) { if (stopped || !isValid()) return; activeDirects++; try { const c = toUint8Array(data); if (!c.byteLength) return; await serialSend(c); } catch (err) { sendError ||= err; throw err; } finally { activeDirects--; markDone(); } },
		async send(data) {
			if (stopped || !isValid()) return; activeSends++;
			try {
				const chunk = toUint8Array(data); if (!chunk.byteLength) return;
				let off = 0; const total = chunk.byteLength;
				while (off < total) {
					const rem = total - off;
					if (grain.isEmpty && rem >= cap) { const sb = Math.min(cap, rem); const v = off || sb !== total ? chunk.subarray(off, off + sb) : chunk; await serialSend(v); off += sb; continue; }
					const cb = Math.min(cap - grain.bytes, total - off);
					if (!cb) { await doFlush(); continue; }
					grain.accept({ chunk: off || cb !== total ? chunk.subarray(off, off + cb) : chunk }); off += cb; generation++;
					if (grain.bytes >= cap || cap - grain.bytes < tail) await doFlush(); else scheduleFlush();
				}
			} catch (err) { sendError ||= err; throw err; } finally { activeSends--; markDone(); }
		},
		flush: doFlush,
		async stopAndFlush() {
			if (stopped) { await waitActiveDone(); while (directSendPromise) await directSendPromise; checkError(); await doFlush(); return; }
			stopped = true; forceFlush = true; if (flushTimer) clearTimeout(flushTimer); flushTimer = null;
			await waitActiveDone(); while (directSendPromise) await directSendPromise; checkError(); await doFlush();
		}
	};
}
async function connectStreams(remoteSocket, ws, headerData, retryFn, isValid = null, remoteWrapper = null) {
	let header = headerData, hasData = false, reader, useBYOB = false, readError = null;
	const BYOB_LIMIT = 64 * 1024;
	const stillValid = () => !isValid || isValid();
	const downSender = createDownstreamGrainSender(ws, header, stillValid);
	header = null;
	const downCtrl = { stopAndFlush: () => downSender.stopAndFlush() };
	if (remoteWrapper) remoteWrapper.downlinkController = downCtrl;
	try { remoteSocket.closed?.catch?.(() => { }); } catch (e) { }
	try { reader = remoteSocket.readable.getReader({ mode: 'byob' }); useBYOB = true; } catch (e) { reader = remoteSocket.readable.getReader(); }
	try {
		if (!useBYOB) {
			while (true) { const { done, value } = await reader.read(); if (!stillValid()) break; if (done) break; if (!value || value.byteLength === 0) continue; hasData = true;
				if (value.byteLength >= DOWNSTREAM_GRAIN_BYTES) { await downSender.flush(); await downSender.sendDirect(value); } else await downSender.send(value); }
		} else {
			let rb = new ArrayBuffer(BYOB_LIMIT);
			while (true) { const { done, value } = await reader.read(new Uint8Array(rb, 0, BYOB_LIMIT)); if (!stillValid()) break; if (done) break; if (!value || value.byteLength === 0) continue; hasData = true;
				if (value.byteLength >= DOWNSTREAM_GRAIN_BYTES) { await downSender.flush(); await downSender.sendDirect(value.slice()); rb = new ArrayBuffer(BYOB_LIMIT); } else await downSender.send(value.slice()); rb = value.buffer.byteLength >= BYOB_LIMIT ? value.buffer : new ArrayBuffer(BYOB_LIMIT); }
		}
		if (stillValid()) await downSender.flush();
	} catch (err) { readError = err; }
	finally {
		if (stillValid() && ws.readyState === WebSocket.OPEN) { try { await downSender.stopAndFlush(); } catch (err) { readError ||= err; } }
		if (remoteWrapper?.downlinkController === downCtrl) remoteWrapper.downlinkController = null;
		try { await reader.cancel(); } catch (e) { }
		try { reader.releaseLock(); } catch (e) { }
		try { remoteSocket.close(); } catch (e) { }
	}
	if (!hasData && retryFn && ws.readyState === WebSocket.OPEN && stillValid()) { try { await retryFn(); return; } catch (err) { readError ||= err; } }
	if (!stillValid()) return;
	if (readError) log(`[TCP-down] Read error: ${readError?.message || readError}`);
	closeQuietly(ws);
}
function isSpeedTestSite(hostname) { return ['speed.cloudflare.com', 'cp.cloudflare.com'].some(d => hostname.toLowerCase() === d || hostname.toLowerCase().endsWith('.' + d)); }
function buildLocal204Resp(hdr = null) { const r = new TextEncoder().encode('HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); if (dataLen(hdr) === 0) return r; const ph = toUint8Array(hdr); const resp = new Uint8Array(ph.byteLength + r.byteLength); resp.set(ph, 0); resp.set(r, ph.byteLength); return resp; }
function buildWSLocal204Resp(hdr = null) { const r = new TextEncoder().encode('HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n'); if (dataLen(hdr) === 0) return r; const ph = toUint8Array(hdr); const resp = new Uint8Array(ph.byteLength + r.byteLength); resp.set(ph, 0); resp.set(r, ph.byteLength); return resp; }
/////////////////////////////////////////////////////// Chain Proxies: SOCKS5, HTTP, HTTPS, TURN, SSTP ///////////////////////////////////////////////
async function socks5Connect(targetHost, targetPort, initialData, tcpConn, parsed) {
	const { username, password, hostname, port } = parsed || {};
	const socket = tcpConn({ hostname, port }), writer = socket.writable.getWriter(), reader = socket.readable.getReader();
	try {
		const methods = username && password ? new Uint8Array([0x05, 0x02, 0x00, 0x02]) : new Uint8Array([0x05, 0x01, 0x00]);
		await writer.write(methods);
		let resp = await reader.read(); if (resp.done || resp.value.byteLength < 2) throw new Error('S5 method failed');
		const sel = new Uint8Array(resp.value)[1];
		if (sel === 0x02) {
			if (!username || !password) throw new Error('S5 auth required');
			const ub = new TextEncoder().encode(username), pb = new TextEncoder().encode(password);
			await writer.write(new Uint8Array([0x01, ub.length, ...ub, pb.length, ...pb]));
			resp = await reader.read(); if (resp.done || new Uint8Array(resp.value)[1] !== 0x00) throw new Error('S5 auth failed');
		} else if (sel !== 0x00) throw new Error(`S5 unsupported method: ${sel}`);
		const hb = new TextEncoder().encode(targetHost);
		await writer.write(new Uint8Array([0x05, 0x01, 0x00, 0x03, hb.length, ...hb, targetPort >> 8, targetPort & 0xff]));
		resp = await reader.read(); if (resp.done || new Uint8Array(resp.value)[1] !== 0x00) throw new Error('S5 connect failed');
		if (dataLen(initialData) > 0) await writer.write(initialData);
		writer.releaseLock(); reader.releaseLock(); return socket;
	} catch (error) { try { writer.releaseLock(); } catch (e) { } try { reader.releaseLock(); } catch (e) { } try { socket.close(); } catch (e) { } throw error; }
}
async function httpConnect(targetHost, targetPort, initialData, useHTTPS = false, tcpConn, parsed) {
	const { username, password, hostname, port } = parsed || {};
	const socket = useHTTPS ? tcpConn({ hostname, port }, { secureTransport: 'on', allowHalfOpen: false }) : tcpConn({ hostname, port });
	const writer = socket.writable.getWriter(), reader = socket.readable.getReader();
	const enc = new TextEncoder(), dec = new TextDecoder();
	try {
		if (useHTTPS) await socket.opened;
		const auth = username && password ? `Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}\r\n` : '';
		await writer.write(enc.encode(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}User-Agent: Mozilla/5.0\r\nConnection: keep-alive\r\n\r\n`));
		writer.releaseLock();
		let buf = new Uint8Array(0), hdrEnd = -1, bytesRead = 0;
		while (hdrEnd === -1 && bytesRead < 8192) {
			const { done, value } = await reader.read(); if (done || !value) throw new Error(`${useHTTPS ? 'HTTPS' : 'HTTP'} proxy closed`);
			buf = new Uint8Array([...buf, ...value]); bytesRead = buf.length;
			const idx = buf.findIndex((_, i) => i < buf.length - 3 && buf[i] === 0x0d && buf[i+1] === 0x0a && buf[i+2] === 0x0d && buf[i+3] === 0x0a);
			if (idx !== -1) hdrEnd = idx + 4;
		}
		if (hdrEnd === -1) throw new Error('CONNECT response too long');
		const sm = dec.decode(buf.slice(0, hdrEnd)).split('\r\n')[0].match(/HTTP\/\d\.\d\s+(\d+)/);
		const sc = sm ? parseInt(sm[1], 10) : NaN;
		if (!Number.isFinite(sc) || sc < 200 || sc >= 300) throw new Error(`CONNECT failed: HTTP ${sc}`);
		reader.releaseLock();
		if (dataLen(initialData) > 0) { const w = socket.writable.getWriter(); await w.write(initialData); w.releaseLock(); }
		if (bytesRead > hdrEnd) {
			const { readable, writable } = new TransformStream();
			const tw = writable.getWriter(); await tw.write(buf.subarray(hdrEnd, bytesRead)); tw.releaseLock();
			socket.readable.pipeTo(writable).catch(() => { });
			return { readable, writable: socket.writable, closed: socket.closed, close: () => socket.close() };
		}
		return socket;
	} catch (error) { try { writer.releaseLock(); } catch (e) { } try { reader.releaseLock(); } catch (e) { } try { socket.close(); } catch (e) { } throw error; }
}
async function httpsConnect(targetHost, targetPort, initialData, tcpConn, parsed) {
	const { username, password, hostname, port } = parsed || {};
	const enc = new TextEncoder(), dec = new TextDecoder();
	let tlsSocket = null;
	const tlsSN = isIPHostname(hostname) ? '' : stripIPv6Brackets(hostname);
	const openTLS = async (allowChacha = false) => {
		const ps = tcpConn({ hostname, port });
		try { await ps.opened; const tls = new TlsClient(ps, { serverName: tlsSN, insecure: true, allowChacha }); await tls.handshake(); log(`[HTTPS] TLS${tls.isTls13 ? '1.3' : '1.2'} cipher:0x${tls.cipherSuite.toString(16)}${tls.cipherConfig?.chacha ? ' (ChaCha20)' : ''}`); return tls; }
		catch (error) { try { ps.close(); } catch (e) { } throw error; }
	};
	try {
		try { tlsSocket = await openTLS(false); } catch (error) {
			if (!/cipher|handshake|TLS Alert|ServerHello|Finished|Unsupported|Missing TLS/i.test(error?.message || '')) throw error;
			log(`[HTTPS] AES-GCM failed, fallback ChaCha20: ${error?.message || error}`);
			tlsSocket = await openTLS(true);
		}
		const auth = username && password ? `Proxy-Authorization: Basic ${btoa(`${username}:${password}`)}\r\n` : '';
		await tlsSocket.write(enc.encode(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}User-Agent: Mozilla/5.0\r\nConnection: keep-alive\r\n\r\n`));
		let buf = new Uint8Array(0), hdrEnd = -1, bytesRead = 0;
		while (hdrEnd === -1 && bytesRead < 8192) {
			const val = await tlsSocket.read(); if (!val) throw new Error('HTTPS proxy closed');
			buf = concatBytes(buf, val); bytesRead = buf.length;
			const idx = buf.findIndex((_, i) => i < buf.length - 3 && buf[i] === 0x0d && buf[i+1] === 0x0a && buf[i+2] === 0x0d && buf[i+3] === 0x0a);
			if (idx !== -1) hdrEnd = idx + 4;
		}
		if (hdrEnd === -1) throw new Error('CONNECT response too long');
		const sm = dec.decode(buf.slice(0, hdrEnd)).split('\r\n')[0].match(/HTTP\/\d\.\d\s+(\d+)/);
		const sc = sm ? parseInt(sm[1], 10) : NaN;
		if (!Number.isFinite(sc) || sc < 200 || sc >= 300) throw new Error(`CONNECT failed: HTTP ${sc}`);
		if (dataLen(initialData) > 0) await tlsSocket.write(toUint8Array(initialData));
		const buffered = bytesRead > hdrEnd ? buf.subarray(hdrEnd, bytesRead) : null;
		let closedSettled = false, resolveClosed, rejectClosed;
		const settle = (s, v) => { if (!closedSettled) { closedSettled = true; s(v); } };
		const closed = new Promise((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; });
		const close = () => { try { tlsSocket.close(); } catch (e) { } settle(resolveClosed); };
		const readable = new ReadableStream({ async start(ctrl) { try { if (dataLen(buffered) > 0) ctrl.enqueue(buffered); while (true) { const d = await tlsSocket.read(); if (!d) break; if (d.byteLength > 0) ctrl.enqueue(d); } try { ctrl.close(); } catch (e) { } settle(resolveClosed); } catch (err) { try { ctrl.error(err); } catch (e) { } settle(rejectClosed, err); } }, cancel() { close(); } });
		const writable = new WritableStream({ async write(chunk) { await tlsSocket.write(toUint8Array(chunk)); }, close, abort(err) { close(); if (err) settle(rejectClosed, err); } });
		return { readable, writable, closed, close };
	} catch (error) { try { tlsSocket?.close(); } catch (e) { } throw error; }
}
function createTCPConnector(request) { const r = /** @type {any} */ (request); const f = r?.fetcher; if (!f || typeof f.connect !== 'function') throw new Error('request.fetcher.connect unavailable'); return (options, init) => init === undefined ? f.connect(options) : f.connect(options, init); }
/////////////////////////////////////////////////////// TURN Relay (STUN Protocol) ///////////////////////////////////////////////
const TURN_TIMEOUT = 9999;
const TURN_MAGIC = new Uint8Array([0x21, 0x12, 0xa4, 0x42]);
const TURN_TYPE = { ALLOC_REQ: 0x0003, ALLOC_SUCC: 0x0103, ALLOC_ERR: 0x0113, PERM_REQ: 0x0008, PERM_SUCC: 0x0108, CONN_REQ: 0x000a, CONN_SUCC: 0x010a, BIND_REQ: 0x000b, BIND_SUCC: 0x010b };
const TURN_ATTR = { USERNAME: 0x0006, MSG_INTEG: 0x0008, ERROR_CODE: 0x0009, XOR_PEER: 0x0012, REALM: 0x0014, NONCE: 0x0015, REQ_TRANSPORT: 0x0019, CONN_ID: 0x002a };
async function withTimeout(promise, ms, msg) { let t; try { return await Promise.race([promise, new Promise((_, r) => { t = setTimeout(() => r(new Error(msg)), ms); })]); } finally { clearTimeout(t); } }
function isIPv4(v) { const p = String(v || '').split('.'); return p.length === 4 && p.every(part => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255); }
function stunPad(len) { return -len & 3; }
function stunAttr(type, value) { const body = toUint8Array(value); const attr = new Uint8Array(4 + body.byteLength + stunPad(body.byteLength)); const v = new DataView(attr.buffer); v.setUint16(0, type); v.setUint16(2, body.byteLength); attr.set(body, 4); return attr; }
function stunMsg(type, txId, attrs) { const body = concatBytes(...attrs); const hdr = new Uint8Array(20); const v = new DataView(hdr.buffer); v.setUint16(0, type); v.setUint16(2, body.byteLength); hdr.set(TURN_MAGIC, 4); hdr.set(txId, 8); return concatBytes(hdr, body); }
function parseTurnErrorCode(d) { return d?.byteLength >= 4 ? (d[2] & 7) * 100 + d[3] : 0; }
function randomTxId() { return crypto.getRandomValues(new Uint8Array(12)); }
async function addMsgIntegrity(message, key) { const sm = new Uint8Array(message); const v = new DataView(sm.buffer); v.setUint16(2, v.getUint16(2) + 24); const hk = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']); const sig = await crypto.subtle.sign('HMAC', hk, sm); return concatBytes(sm, stunAttr(TURN_ATTR.MSG_INTEG, new Uint8Array(sig))); }
async function readStunMsg(reader, buffered = null, msg = 'TURN timeout') {
	let buf = dataLen(buffered) ? toUint8Array(buffered) : new Uint8Array(0);
	const pull = async () => { const { done, value } = await withTimeout(reader.read(), TURN_TIMEOUT, msg); if (done) throw new Error('TURN server closed'); if (value?.byteLength) buf = concatBytes(buf, value); };
	while (buf.byteLength < 20) await pull();
	const ml = 20 + ((buf[2] << 8) | buf[3]);
	if (ml > 65555) throw new Error('TURN response too large');
	while (buf.byteLength < ml) await pull();
	const mb = buf.subarray(0, ml);
	if (TURN_MAGIC.some((v, i) => mb[4 + i] !== v)) throw new Error('Invalid TURN response');
	const v = new DataView(mb.buffer, mb.byteOffset, mb.byteLength);
	const attrs = {};
	for (let off = 20; off + 4 <= ml; ) { const t = v.getUint16(off), l = v.getUint16(off + 2); if (off + 4 + l > mb.byteLength) break; attrs[t] = mb.slice(off + 4, off + 4 + l); off += 4 + l + stunPad(l); }
	return { message: { type: v.getUint16(0), attrs }, extraData: buf.byteLength > ml ? buf.subarray(ml) : null };
}
async function writeTurn(writer, bytes, msg) { await withTimeout(writer.write(bytes), TURN_TIMEOUT, msg); }
async function turnConnect(proxy, targetHost, targetPort, tcpConn) {
	proxy = { ...proxy, username: proxy.username ?? null, password: proxy.password ?? null };
	const resolved = stripIPv6Brackets(targetHost);
	let targetIP = isIPv4(resolved) ? resolved : null;
	if (!targetIP) { const recs = await doHQuery(resolved, 'A'); const rd = recs.find(r => r.type === 1 && isIPv4(r.data))?.data; targetIP = typeof rd === 'string' ? rd : null; }
	if (!targetIP) throw new Error(`Cannot resolve ${targetHost} to IPv4 for TURN`);
	const turnHost = stripIPv6Brackets(proxy.hostname);
	let ctrlSock = null, dataSock = null, ctrlW = null, ctrlR = null, dataW = null, dataR = null, dataRRel = false;
	const close = () => { try { ctrlSock?.close?.(); } catch (e) { } try { dataSock?.close?.(); } catch (e) { } };
	const relDataR = () => { if (dataRRel) return; dataRRel = true; try { dataR?.releaseLock?.(); } catch (e) { } };
	try {
		ctrlSock = tcpConn({ hostname: turnHost, port: proxy.port });
		await withTimeout(ctrlSock.opened, TURN_TIMEOUT, 'TURN connection timeout');
		ctrlW = ctrlSock.writable.getWriter(); ctrlR = ctrlSock.readable.getReader();
		const xorPeer = new Uint8Array(8); xorPeer[1] = 1;
		new DataView(xorPeer.buffer).setUint16(2, targetPort ^ 0x2112);
		targetIP.split('.').forEach((v, i) => { xorPeer[4 + i] = Number(v) ^ TURN_MAGIC[i]; });
		const peerAttr = stunAttr(TURN_ATTR.XOR_PEER, xorPeer);
		const reqTransport = new Uint8Array([6, 0, 0, 0]);
		await writeTurn(ctrlW, stunMsg(TURN_TYPE.ALLOC_REQ, randomTxId(), [stunAttr(TURN_ATTR.REQ_TRANSPORT, reqTransport)]), 'TURN Allocate timeout');
		let resp = await readStunMsg(ctrlR, null, 'TURN Allocate resp timeout');
		let msg = resp.message, buf = resp.extraData, intKey = null, authAttrs = [];
		const sign = m => intKey ? addMsgIntegrity(m, intKey) : Promise.resolve(m);
		if (msg.type === TURN_TYPE.ALLOC_ERR && proxy.username !== null && proxy.password !== null && parseTurnErrorCode(msg.attrs[TURN_ATTR.ERROR_CODE]) === 401) {
			const realmB = msg.attrs[TURN_ATTR.REALM], nonce = msg.attrs[TURN_ATTR.NONCE];
			if (!realmB || !nonce?.byteLength) throw new Error('TURN auth missing realm/nonce');
			const realm = new TextDecoder().decode(realmB);
			intKey = new Uint8Array(await crypto.subtle.digest('MD5', new TextEncoder().encode(`${proxy.username}:${realm}:${proxy.password}`)));
			authAttrs = [stunAttr(TURN_ATTR.USERNAME, new TextEncoder().encode(proxy.username)), stunAttr(TURN_ATTR.REALM, new TextEncoder().encode(realm)), stunAttr(TURN_ATTR.NONCE, nonce)];
			const allocReq = await addMsgIntegrity(stunMsg(TURN_TYPE.ALLOC_REQ, randomTxId(), [stunAttr(TURN_ATTR.REQ_TRANSPORT, reqTransport), ...authAttrs]), intKey);
			const pipelined = await Promise.all([sign(stunMsg(TURN_TYPE.PERM_REQ, randomTxId(), [peerAttr, ...authAttrs])), sign(stunMsg(TURN_TYPE.CONN_REQ, randomTxId(), [peerAttr, ...authAttrs]))]);
			await writeTurn(ctrlW, concatBytes(allocReq, ...pipelined), 'TURN auth timeout');
			resp = await readStunMsg(ctrlR, buf, 'TURN auth resp timeout'); msg = resp.message; buf = resp.extraData;
		} else if (msg.type === TURN_TYPE.ALLOC_SUCC) {
			const pipelined = await Promise.all([sign(stunMsg(TURN_TYPE.PERM_REQ, randomTxId(), [peerAttr, ...authAttrs])), sign(stunMsg(TURN_TYPE.CONN_REQ, randomTxId(), [peerAttr, ...authAttrs]))]);
			if (pipelined.length) await writeTurn(ctrlW, concatBytes(...pipelined), 'TURN pipelined timeout');
		}
		if (msg.type !== TURN_TYPE.ALLOC_SUCC) { const ec = parseTurnErrorCode(msg.attrs[TURN_ATTR.ERROR_CODE]); throw new Error(ec ? `TURN Allocate ${ec}` : 'TURN Allocate failed'); }
		dataSock = tcpConn({ hostname: turnHost, port: proxy.port });
		resp = await readStunMsg(ctrlR, buf, 'TURN Perm timeout'); msg = resp.message; buf = resp.extraData;
		if (msg.type !== TURN_TYPE.PERM_SUCC) throw new Error('TURN CreatePermission failed');
		resp = await readStunMsg(ctrlR, buf, 'TURN Connect timeout'); msg = resp.message; buf = resp.extraData;
		if (msg.type !== TURN_TYPE.CONN_SUCC || !msg.attrs[TURN_ATTR.CONN_ID]) throw new Error('TURN CONNECT failed');
		await withTimeout(dataSock.opened, TURN_TIMEOUT, 'TURN data timeout');
		dataW = dataSock.writable.getWriter(); dataR = dataSock.readable.getReader();
		await writeTurn(dataW, await sign(stunMsg(TURN_TYPE.BIND_REQ, randomTxId(), [stunAttr(TURN_ATTR.CONN_ID, msg.attrs[TURN_ATTR.CONN_ID]), ...authAttrs])), 'TURN Bind timeout');
		resp = await readStunMsg(dataR, null, 'TURN Bind resp timeout'); msg = resp.message;
		const extra = resp.extraData;
		if (msg.type !== TURN_TYPE.BIND_SUCC) throw new Error('TURN ConnectionBind failed');
		ctrlW.releaseLock(); ctrlW = null; ctrlR.releaseLock(); ctrlR = null; dataW.releaseLock(); dataW = null;
		const readable = new ReadableStream({ start(ctrl) { if (extra?.byteLength) ctrl.enqueue(extra); }, pull(ctrl) { return dataR.read().then(({ done, value }) => { if (done) { relDataR(); ctrl.close(); } else if (value?.byteLength) ctrl.enqueue(new Uint8Array(value)); }); }, cancel() { try { dataR?.cancel?.(); } catch (e) { } relDataR(); close(); } });
		return { readable, writable: dataSock.writable, closed: dataSock.closed, close };
	} catch (error) { try { ctrlW?.releaseLock?.(); } catch (e) { } try { ctrlR?.releaseLock?.(); } catch (e) { } try { dataW?.releaseLock?.(); } catch (e) { } relDataR(); close(); throw error; }
}
/////////////////////////////////////////////////////// SSTP Tunnel (PPP over HTTPS) ///////////////////////////////////////////////
const SSTP_MSS = 1400, SSTP_EMPTY = new Uint8Array(0);
function readU16(b, o = 0) { return (b[o] << 8) | b[o + 1]; }
function readU32(b, o = 0) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function randomU16() { return readU16(crypto.getRandomValues(new Uint8Array(2))); }
function inetChecksum(bytes, off, len) { let sum = 0; for (let i = off; i < off + len - 1; i += 2) sum += readU16(bytes, i); if (len & 1) sum += bytes[off + len - 1] << 8; while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16); return (~sum) & 0xffff; }
async function sstpConnect(proxy, targetHost, targetPort, tcpConn) {
	proxy = { ...proxy, username: proxy.username ?? null, password: proxy.password ?? null };
	let bufferedBytes = SSTP_EMPTY, pppId = 1, socket = null, reader = null, writer = null;
	let closedSettled = false, resolveClosed, rejectClosed;
	const closed = new Promise((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; });
	const settle = (s, v) => { if (closedSettled) return; closedSettled = true; s(v); };
	const close = () => { try { reader?.cancel?.().catch?.(() => { }); } catch (e) { } try { reader?.releaseLock?.(); } catch (e) { } try { writer?.close?.().catch?.(() => { }); } catch (e) { } try { writer?.releaseLock?.(); } catch (e) { } try { socket?.close?.(); } catch (e) { } settle(resolveClosed); };
	const readChunk = async () => { const { value, done } = await reader.read(); if (done || !value) throw new Error('SSTP closed'); return toUint8Array(value); };
	const readBytes = async len => { while (bufferedBytes.byteLength < len) { const c = await readChunk(); bufferedBytes = bufferedBytes.byteLength ? concatBytes(bufferedBytes, c) : c; } const r = bufferedBytes.subarray(0, len); bufferedBytes = bufferedBytes.subarray(len); return r; };
	const readLine = async () => { for (;;) { const le = bufferedBytes.indexOf(10); if (le >= 0) { const l = new TextDecoder().decode(bufferedBytes.subarray(0, le)); bufferedBytes = bufferedBytes.subarray(le + 1); return l.replace(/\r$/, ''); } const c = await readChunk(); bufferedBytes = bufferedBytes.byteLength ? concatBytes(bufferedBytes, c) : c; } };
	const readPacket = async (timeout = TURN_TIMEOUT) => { const hdr = await withTimeout(readBytes(4), timeout, 'SSTP read timeout'); const len = readU16(hdr, 2) & 0x0fff; if (len < 4) throw new Error('Invalid SSTP len'); return { isControl: (hdr[1] & 1) !== 0, body: len > 4 ? await withTimeout(readBytes(len - 4), timeout, 'SSTP body timeout') : SSTP_EMPTY }; };
	const buildDataPkt = pppF => { const pl = 6 + pppF.byteLength; const p = new Uint8Array(pl); p.set([0x10, 0x00, ((pl >> 8) & 0x0f) | 0x80, pl & 0xff, 0xff, 0x03]); p.set(pppF, 6); return p; };
	const buildPPP = (proto, code, id, opts = []) => { const ol = opts.reduce((s, o) => s + 2 + o.data.byteLength, 0); const f = new Uint8Array(6 + ol); const v = new DataView(f.buffer); v.setUint16(0, proto); f[2] = code; f[3] = id; v.setUint16(4, 4 + ol); opts.reduce((off, o) => { f[off] = o.type; f[off + 1] = 2 + o.data.byteLength; f.set(o.data, off + 2); return off + 2 + o.data.byteLength; }, 6); return f; };
	const parsePPP = d => { const off = d.byteLength >= 2 && d[0] === 0xff && d[1] === 0x03 ? 2 : 0; if (d.byteLength - off < 4) return null; const proto = readU16(d, off); if (proto === 0x0021) return { proto, ipPacket: d.subarray(off + 2) }; if (d.byteLength - off < 6) return null; return { proto, code: d[off + 2], id: d[off + 3], payload: d.subarray(off + 6), raw: d.subarray(off) }; };
	const parseOpts = d => { const opts = []; for (let off = 0; off + 2 <= d.byteLength; ) { const t = d[off], l = d[off + 1]; if (l < 2 || off + l > d.byteLength) break; opts.push({ type: t, data: d.subarray(off + 2, off + l) }); off += l; } return opts; };
	try {
		const host = stripIPv6Brackets(proxy.hostname);
		socket = tcpConn({ hostname: host, port: proxy.port }, { secureTransport: 'on', allowHalfOpen: false });
		await withTimeout(socket.opened, TURN_TIMEOUT, 'SSTP connection timeout');
		reader = socket.readable.getReader(); writer = socket.writable.getWriter();
		const display = host.includes(':') ? `[${host}]` : host;
		const portNum = Number(proxy.port) === 443 ? '' : `:${proxy.port}`;
		await withTimeout(writer.write(concatBytes(
			new TextEncoder().encode(`SSTP_DUPLEX_POST /sra_{BA195980-CD49-458b-9E23-C84EE0ADCD75}/ HTTP/1.1\r\nHost: ${display}${portNum}\r\nContent-Length: 18446744073709551615\r\nSSTPCORRELATIONID: {${crypto.randomUUID()}}\r\n\r\n`),
			(() => { const ep = new Uint8Array(2); new DataView(ep.buffer).setUint16(0, 1); const sstpcr = new Uint8Array(12 + ep.byteLength); const v = new DataView(sstpcr.buffer); sstpcr[0] = 0x10; sstpcr[1] = 0x01; v.setUint16(2, sstpcr.byteLength | 0x8000); v.setUint16(4, 0x0001); v.setUint16(6, 1); sstpcr[9] = 1; v.setUint16(10, 4 + ep.byteLength); sstpcr.set(ep, 12); return sstpcr; })(),
			buildDataPkt(buildPPP(0xc021, 1, pppId++, [{ type: 1, data: new Uint8Array(2).fill(0) }]))
		)), TURN_TIMEOUT, 'SSTP request timeout');
		const statusLine = await withTimeout(readLine(), TURN_TIMEOUT, 'SSTP HTTP timeout');
		for (;;) { const line = await withTimeout(readLine(), TURN_TIMEOUT, 'SSTP header timeout'); if (line === '') break; }
		if (!/HTTP\/\d(?:\.\d)?\s+2\d\d/i.test(statusLine)) throw new Error(`SSTP HTTP failed: ${statusLine}`);
		let localLCPAcked = false, peerLCPAcked = false, papReq = false, papSent = false, papDone = false, ipcpStarted = false, ipcpFinished = false, srcIP = null;
		const sendPap = async () => { if (!localLCPAcked || !peerLCPAcked || !papReq || papSent) return; if (proxy.username === null || proxy.password === null) throw new Error('SSTP PAP required'); const un = new TextEncoder().encode(proxy.username), pw = new TextEncoder().encode(proxy.password); if (un.byteLength > 255 || pw.byteLength > 255) throw new Error('SSTP creds too long'); const pl = 6 + un.byteLength + pw.byteLength; const f = new Uint8Array(2 + pl); const v = new DataView(f.buffer); v.setUint16(0, 0xc023); f[2] = 1; f[3] = pppId++; v.setUint16(4, pl); f[6] = un.byteLength; f.set(un, 7); f[7 + un.byteLength] = pw.byteLength; f.set(pw, 8 + un.byteLength); await withTimeout(writer.write(buildDataPkt(f)), TURN_TIMEOUT, 'SSTP PAP timeout'); papSent = true; };
		const startIPCP = async () => { if (!localLCPAcked || !peerLCPAcked || ipcpStarted || (papReq && !papDone)) return; await withTimeout(writer.write(buildDataPkt(buildPPP(0x8021, 1, pppId++, [{ type: 3, data: new Uint8Array(4) }]))), TURN_TIMEOUT, 'SSTP IPCP timeout'); ipcpStarted = true; };
		for (let round = 0; round < 50 && !ipcpFinished; round++) {
			const pkt = await readPacket(TURN_TIMEOUT); if (pkt.isControl) continue;
			const ppp = parsePPP(pkt.body); if (!ppp) continue;
			if (ppp.proto === 0xc021) {
				if (ppp.code === 1) {
					const authOpt = parseOpts(ppp.payload).find(o => o.type === 3);
					if (authOpt?.data?.byteLength >= 2) { const ap = readU16(authOpt.data); if (ap !== 0xc023) throw new Error(`SSTP unsupported auth: 0x${ap.toString(16)}`); papReq = true; }
					const ack = new Uint8Array(ppp.raw); ack[2] = 2;
					await withTimeout(writer.write(buildDataPkt(ack)), TURN_TIMEOUT, 'SSTP LCP-Ack timeout');
					peerLCPAcked = true; await sendPap(); await startIPCP();
				} else if (ppp.code === 2) { localLCPAcked = true; await sendPap(); await startIPCP(); }
			} else if (ppp.proto === 0xc023) {
				if (ppp.code === 2) { papDone = true; await startIPCP(); }
				else if (ppp.code === 3) throw new Error('SSTP PAP failed');
			} else if (ppp.proto === 0x8021) {
				if (ppp.code === 1) { const ack = new Uint8Array(ppp.raw); ack[2] = 2; await withTimeout(writer.write(buildDataPkt(ack)), TURN_TIMEOUT, 'SSTP IPCP-Ack timeout'); await startIPCP(); }
				else if (ppp.code === 3) { const addrOpt = parseOpts(ppp.payload).find(o => o.type === 3); if (addrOpt?.data?.byteLength === 4) { srcIP = [...addrOpt.data].join('.'); await withTimeout(writer.write(buildDataPkt(buildPPP(0x8021, 1, pppId++, [{ type: 3, data: addrOpt.data }]))), TURN_TIMEOUT, 'SSTP IPCP addr timeout'); ipcpStarted = true; } }
				else if (ppp.code === 2) { const addrOpt = parseOpts(ppp.payload).find(o => o.type === 3); if (addrOpt?.data?.byteLength === 4) srcIP = [...addrOpt.data].join('.'); ipcpFinished = true; }
			}
		}
		if (!srcIP) throw new Error('SSTP no IP assigned');
		const tgt = stripIPv6Brackets(targetHost);
		let tgtIP = isIPv4(tgt) ? tgt : null;
		if (!tgtIP) { const recs = await doHQuery(tgt, 'A'); const rd = recs.find(r => r.type === 1 && isIPv4(r.data))?.data; tgtIP = typeof rd === 'string' ? rd : null; }
		if (!tgtIP) throw new Error(`Cannot resolve ${targetHost} to IPv4 for SSTP`);
		const srcPort = 10000 + (randomU16() % 50000);
		const srcAddr = new Uint8Array(String(srcIP).split('.').map(Number));
		const dstAddr = new Uint8Array(String(tgtIP).split('.').map(Number));
		let seqNum = readU32(crypto.getRandomValues(new Uint8Array(4))), ackNum = 0;
		const ipTpl = new Uint8Array(20); ipTpl.set([0x45, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 64, 6]); ipTpl.set(srcAddr, 12); ipTpl.set(dstAddr, 16);
		const tcpPH = new Uint8Array(1432); tcpPH.set(srcAddr); tcpPH.set(dstAddr, 4); tcpPH[9] = 6;
		const buildTCP = (flags, payload = SSTP_EMPTY) => { const bytes = toUint8Array(payload); const tLen = 20 + bytes.byteLength, iLen = 20 + tLen, sLen = 8 + iLen; const f = new Uint8Array(sLen); const v = new DataView(f.buffer); f.set([0x10, 0x00, ((sLen >> 8) & 0x0f) | 0x80, sLen & 0xff, 0xff, 0x03, 0x00, 0x21]); f.set(ipTpl, 8); v.setUint16(10, iLen); v.setUint16(12, randomU16()); v.setUint16(18, inetChecksum(f, 8, 20)); v.setUint16(28, srcPort); v.setUint16(30, targetPort); v.setUint32(32, seqNum); v.setUint32(36, ackNum); f[40] = 0x50; f[41] = flags; v.setUint16(42, 65535); if (bytes.byteLength) f.set(bytes, 48); tcpPH[10] = tLen >> 8; tcpPH[11] = tLen & 0xff; tcpPH.set(f.subarray(28, 28 + tLen), 12); v.setUint16(44, inetChecksum(tcpPH, 0, 12 + tLen)); return f; };
		const matchIP = ip => { if (ip.byteLength < 40 || ip[9] !== 6) return null; const ihl = (ip[0] & 0x0f) * 4; if (ip.byteLength < ihl + 20) return null; if (readU16(ip, ihl) !== targetPort || readU16(ip, ihl + 2) !== srcPort) return null; return { flags: ip[ihl + 13], seq: readU32(ip, ihl + 4), payloadOff: ihl + ((ip[ihl + 12] >> 4) & 0x0f) * 4 }; };
		await withTimeout(writer.write(buildTCP(0x02)), TURN_TIMEOUT, 'SSTP SYN timeout'); seqNum = (seqNum + 1) >>> 0;
		let tcpReady = false;
		for (let a = 0; a < 30; a++) { const pkt = await readPacket(TURN_TIMEOUT); if (pkt.isControl) continue; const ppp = parsePPP(pkt.body); if (!ppp || ppp.proto !== 0x0021) continue; const tcp = matchIP(ppp.ipPacket); if (!tcp || (tcp.flags & 0x12) !== 0x12) continue; ackNum = (tcp.seq + 1) >>> 0; await withTimeout(writer.write(buildTCP(0x10)), TURN_TIMEOUT, 'SSTP ACK timeout'); tcpReady = true; break; }
		if (!tcpReady) throw new Error('SSTP TCP handshake timeout');
		let streamCtrl = null;
		const readable = new ReadableStream({ start(c) { streamCtrl = c; }, cancel() { close(); } });
		(async () => { try { let pending = [], pendingLen = 0; const flush = () => { if (!pendingLen) return; if (!streamCtrl) throw new Error('SSTP stream not ready'); streamCtrl.enqueue(pending.length === 1 ? pending[0] : concatBytes(...pending)); pending = []; pendingLen = 0; writer.write(buildTCP(0x10)).catch(() => { }); };
			for (;;) { const pkt = await readPacket(60000); if (pkt.isControl) continue; const ppp = parsePPP(pkt.body); if (!ppp || ppp.proto !== 0x0021) continue; const incoming = matchIP(ppp.ipPacket); if (!incoming) continue;
				if (incoming.payloadOff < ppp.ipPacket.byteLength) { const p = ppp.ipPacket.subarray(incoming.payloadOff); if (p.byteLength) { ackNum = (incoming.seq + p.byteLength) >>> 0; pending.push(new Uint8Array(p)); pendingLen += p.byteLength; } }
				if (incoming.flags & 0x01) { flush(); ackNum = (ackNum + 1) >>> 0; writer.write(buildTCP(0x11)).catch(() => { }); try { streamCtrl?.close(); } catch (e) { } close(); return; }
				if (bufferedBytes.byteLength < 4 || pendingLen >= 32768) flush(); }
		} catch (error) { try { streamCtrl?.error(error); } catch (e) { } settle(rejectClosed, error); try { socket?.close?.(); } catch (e) { } } })();
		const writable = new WritableStream({ async write(chunk) { const bytes = toUint8Array(chunk); if (!bytes.byteLength) return; if (bytes.byteLength <= SSTP_MSS) { await writer.write(buildTCP(0x18, bytes)); seqNum = (seqNum + bytes.byteLength) >>> 0; return; } const frames = []; for (let off = 0; off < bytes.byteLength; off += SSTP_MSS) { const seg = bytes.subarray(off, Math.min(off + SSTP_MSS, bytes.byteLength)); frames.push(buildTCP(0x18, seg)); seqNum = (seqNum + seg.byteLength) >>> 0; } await writer.write(concatBytes(...frames)); }, close() { return writer.write(buildTCP(0x11)).catch(() => { }); }, abort(err) { close(); if (err) settle(rejectClosed, err); } });
	return { readable, writable, closed, close };
	} catch (error) { close(); throw error; }
}
/////////////////////////////////////////////////////// Functional Utilities ///////////////////////////////////////////////
function base64SecretEncode(plaintext, secret) {
	const enc = new TextEncoder(); const data = enc.encode(plaintext); const key = enc.encode(secret);
	const mixed = new Uint8Array(data.length); for (let i = 0; i < data.length; i++) mixed[i] = data[i] ^ key[i % key.length];
	let bin = ''; for (let i = 0; i < mixed.length; i++) bin += String.fromCharCode(mixed[i]); return btoa(bin);
}
function base64SecretDecode(encoded, secret) {
	const bin = atob(encoded); const mixed = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) mixed[i] = bin.charCodeAt(i);
	const enc = new TextEncoder(); const key = enc.encode(secret); const data = new Uint8Array(mixed.length);
	for (let i = 0; i < mixed.length; i++) data[i] = mixed[i] ^ key[i % key.length];
	return new TextDecoder().decode(data);
}
function getTransportConfig(cfg = {}) {
	const isGRPC = cfg.transport === 'grpc';
	const { header: padHdr, key: padKey } = getXHTTPPaddingIdent(cfg.UUID);
	const xObj = { "xPaddingObfsMode": true, "xPaddingMethod": "tokenish", "xPaddingPlacement": "queryInHeader", "xPaddingHeader": padHdr, "xPaddingKey": padKey };
	return { type: isGRPC ? (cfg.grpcMode === 'multi' ? 'grpc&mode=multi' : 'grpc&mode=gun') : (cfg.transport === 'xhttp' ? `xhttp&mode=stream-one&extra=${encodeURIComponent(JSON.stringify(xObj))}` : 'ws'), pathField: isGRPC ? 'serviceName' : 'path', hostField: isGRPC ? 'authority' : 'host' };
}
function getTransportPathValue(cfg = {}, nodePath = '/', isBestSubGen = false) { const pv = isBestSubGen ? '/' : (cfg.randomPath ? randomPath(nodePath) : nodePath); if (cfg.transport !== 'grpc') return pv; return pv.split('?')[0] || '/'; }
function log(...args) { if (debugLogEnabled) console.log(...args); }
/////////////////////////////////////////////////////// Subscription Hot Patches ///////////////////////////////////////////////
function clashHotPatch(content, cfg = {}) {
	const uuid = cfg?.UUID, echOn = Boolean(cfg?.ECH), hosts = Array.isArray(cfg?.HOSTS) ? [...cfg.HOSTS] : [];
	const echSNI = cfg?.echConfig?.sni || null, echDNS = cfg?.echConfig?.dns;
	let yaml = content.replace(/mode:\s*Rule\b/g, 'mode: rule');
	const dnsBlock = `dns:\n  enable: true\n  default-nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n    - 114.114.114.114\n  use-hosts: true\n  nameserver:\n    - https://sm2.doh.pub/dns-query\n    - https://dns.alidns.com/dns-query\n  fallback:\n    - 8.8.4.4\n    - 208.67.220.220\n  fallback-filter:\n    geoip: true\n    geoip-code: CN\n    ipcidr:\n      - 240.0.0.0/4\n      - 127.0.0.1/32\n      - 0.0.0.0/32\n    domain:\n      - '+.google.com'\n      - '+.facebook.com'\n      - '+.youtube.com'\n`;
	if (!/^dns:\s*(?:\n|$)/m.test(yaml)) yaml = dnsBlock + yaml;
	if (echSNI && !hosts.includes(echSNI)) hosts.push(echSNI);
	const grpcUA = (typeof cfg?.gRPCUserAgent === 'string' && cfg.gRPCUserAgent.trim()) ? cfg.gRPCUserAgent.trim() : null;
	const needGRPC = cfg?.transport === "grpc" && Boolean(grpcUA);
	if (echOn && hosts.length > 0) {
		const entries = hosts.map(h => `    "${h}": ${echDNS || ''}`).join('\n');
		if (/^\s{2}nameserver-policy:\s*(?:\n|$)/m.test(yaml)) yaml = yaml.replace(/^(\s{2}nameserver-policy:\s*\n)/m, `$1${entries}\n`);
		else { const lines = yaml.split('\n'); let end = -1, inDns = false; for (let i = 0; i < lines.length; i++) { if (/^dns:\s*$/.test(lines[i])) { inDns = true; continue; } if (inDns && /^[a-zA-Z]/.test(lines[i])) { end = i; break; } } if (end !== -1) lines.splice(end, 0, `  nameserver-policy:\n${entries}`); else lines.push(`  nameserver-policy:\n${entries}`); yaml = lines.join('\n'); }
	}
	return yaml;
}
async function singboxHotPatch(content, cfg = {}) {
	const uuid = cfg?.UUID, fp = cfg?.fingerprint || "chrome", echOn = Boolean(cfg?.ECH), echSNI = cfg?.echConfig?.sni || "cloudflare-ech.com";
	const text = content.replace('1.1.1.1', '8.8.8.8').replace('1.0.0.1', '8.8.4.4');
	try {
		const config = JSON.parse(text);
		if (uuid) { config.outbounds?.forEach(ob => { if ((ob.uuid && ob.uuid === uuid) || (ob.password && ob.password === uuid)) { if (!ob.tls) ob.tls = { enabled: true }; if (fp) ob.tls.utls = { enabled: true, fingerprint: fp }; if (echOn) ob.tls.ech = { enabled: true, query_server_name: echSNI }; } }); }
		return JSON.stringify(config, null, 2);
	} catch (e) { return JSON.stringify(JSON.parse(text), null, 2); }
}
function surgeHotPatch(content, url, cfg) {
	const lines = content.includes('\r\n') ? content.split('\r\n') : content.split('\n');
	const fp = cfg.randomPath ? randomPath(cfg.fullPath) : cfg.fullPath;
	let out = "";
	for (let x of lines) {
		if (x.includes('= tro' + 'jan,') && !x.includes('ws=true') && !x.includes('ws-path=')) {
			const host = x.split("sni=")[1].split(",")[0];
			out += x.replace(new RegExp(`sni=${host}, skip-cert-verify=${cfg.skipCertVerify}`, 'g'), `sni=${host}, skip-cert-verify=${cfg.skipCertVerify}, ws=true, ws-path=${fp.replace(/,/g, '%2C')}, ws-headers=Host:"${host}"`).replace("[", "").replace("]", "") + '\n';
		} else out += x + '\n';
	}
	return `#!MANAGED-CONFIG ${url} interval=${cfg.bestSub.subUpdateTime * 60 * 60} strict=false` + out.substring(out.indexOf('\n'));
}
/////////////////////////////////////////////////////// Request Logging & Telegram Notifications ///////////////////////////////////////////////
async function logRequest(env, request, clientIP, reqType = "Get_SUB", cfg, writeKV = true) {
	try {
		const now = new Date();
		const entry = { TYPE: reqType, IP: clientIP, ASN: `AS${request.cf.asn || '0'} ${request.cf.asOrganization || 'Unknown'}`, CC: `${request.cf.country || 'N/A'} ${request.cf.city || 'N/A'}`, URL: request.url, UA: request.headers.get('User-Agent') || 'Unknown', TIME: now.getTime() };
		if (cfg?.TG?.enabled) {
			try {
				const tgTxt = await env.KV.get('tg.json');
				const tgJSON = JSON.parse(tgTxt);
				if (tgJSON?.BotToken && tgJSON?.ChatID) {
					const timeStr = new Date(entry.TIME).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
					const reqURL = new URL(entry.URL);
					const msg = `<b>#${cfg.bestSub.subName} Log</b>\n\n` + `Type: <code>#${entry.TYPE}</code>\nIP: <code>${entry.IP}</code>\nLocation: ${entry.CC}\nASN: ${entry.ASN}\nHost: <code>${reqURL.host}</code>\nPath: <code>${reqURL.pathname + reqURL.search}</code>\nUA: <code>${entry.UA}</code>\nTime: ${timeStr}\n${cfg.CF.Usage.success ? `Usage: ${cfg.CF.Usage.total}/${cfg.CF.Usage.max} ${((cfg.CF.Usage.total / cfg.CF.Usage.max) * 100).toFixed(2)}%\n` : ''}`;
					await fetch(`https://api.telegram.org/bot${tgJSON.BotToken}/sendMessage?chat_id=${tgJSON.ChatID}&parse_mode=HTML&text=${encodeURIComponent(msg)}`, { method: 'GET', headers: { 'Accept': 'text/html', 'User-Agent': entry.UA } });
				}
			} catch (error) { console.error(`TG error: ${error.message}`); }
		}
		writeKV = ['1', 'true'].includes(env.OFF_LOG) ? false : writeKV;
		if (!writeKV) return;
		let logs = [];
		const existing = await env.KV.get('log.json'), KV_LIMIT = 4;
		if (existing) {
			try {
				logs = JSON.parse(existing);
				if (!Array.isArray(logs)) { logs = [entry]; }
				else if (reqType !== "Get_SUB") {
					const thirtyMinAgo = now.getTime() - 30 * 60 * 1000;
					if (logs.some(l => l.TYPE !== "Get_SUB" && l.IP === clientIP && l.URL === request.url && l.UA === entry.UA && l.TIME >= thirtyMinAgo)) return;
					logs.push(entry);
					while (JSON.stringify(logs, null, 2).length > KV_LIMIT * 1024 * 1024 && logs.length > 0) logs.shift();
				} else { logs.push(entry); while (JSON.stringify(logs, null, 2).length > KV_LIMIT * 1024 * 1024 && logs.length > 0) logs.shift(); }
			} catch (e) { logs = [entry]; }
		} else logs = [entry];
		await env.KV.put('log.json', JSON.stringify(logs, null, 2));
	} catch (error) { console.error(`Log failed: ${error.message}`); }
}
function maskSensitive(text, prefix = 3, suffix = 2) {
	if (!text || typeof text !== 'string' || text.length <= prefix + suffix) return text;
	return `${text.slice(0, prefix)}${'*'.repeat(text.length - prefix - suffix)}${text.slice(-suffix)}`;
}
async function doubleMD5(text) {
	const enc = new TextEncoder();
	const h1 = await crypto.subtle.digest('MD5', enc.encode(text));
	const h1hex = Array.from(new Uint8Array(h1)).map(b => b.toString(16).padStart(2, '0')).join('');
	const h2 = await crypto.subtle.digest('MD5', enc.encode(h1hex.slice(7, 27)));
	return Array.from(new Uint8Array(h2)).map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
}
function randomPath(fullPath = "/") {
	const dirs = ["about","account","api","app","archive","auth","blog","book","buy","cart","category","channel","chat","code","collection","community","config","contact","course","data","detail","docs","download","event","faq","favorite","file","files","forum","game","go","group","help","home","hot","html","image","images","index","info","item","join","lang","lib","library","link","links","list","live","login","mag","main","map","media","message","mobile","movie","music","my","new","news","note","online","order","page","pages","pay","pdf","photo","pic","picture","play","player","post","product","profile","program","project","qa","rank","read","register","resource","sale","search","service","setting","settings","share","shop","show","site","sort","source","special","star","static","store","stream","student","study","tag","tags","task","test","thread","tool","topic","trade","travel","tv","type","upload","url","user","version","video","view","vip","vod","watch","web","wiki","work","www","zip"];
	const count = Math.floor(Math.random() * 3 + 1);
	const rp = dirs.sort(() => 0.5 - Math.random()).slice(0, count).join('/');
	if (fullPath === "/") return `/${rp}`;
	return `/${rp + fullPath.replace('/?', '?')}`;
}
function replaceAsterisks(str) {
	if (typeof str !== 'string' || !str.includes('*')) return str;
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return str.replace(/\*/g, () => { let s = ''; for (let i = 0; i < Math.floor(Math.random() * 14) + 3; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; });
}
/////////////////////////////////////////////////////// DoH Client with Caching ///////////////////////////////////////////////
const dohCache = {}, dohMaxEntries = 256;
const DOH_TYPE_MAP = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, SRV: 33, HTTPS: 65 };
async function doHQuery(domain, recordType, resolver = "https://cloudflare-dns.com/dns-query") {
	const norm = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
	const normType = String(recordType || '').trim().toUpperCase();
	const cacheKey = `${norm}:${normType}`, qtype = DOH_TYPE_MAP[normType] || 1;
	const now = Date.now();
	const cached = dohCache[cacheKey];
	if (cached && now < cached.expiry) { log(`[DoH] Cache hit ${domain} ${recordType}`); return cached.data.map(d => ({ type: qtype, data: d })); }
	const startTime = performance.now();
	try {
		const encodeName = (name) => { const parts = name.endsWith('.') ? name.slice(0, -1).split('.') : name.split('.'); const bufs = []; for (const label of parts) { const e = new TextEncoder().encode(label); bufs.push(new Uint8Array([e.length]), e); } bufs.push(new Uint8Array([0])); const total = bufs.reduce((s, b) => s + b.length, 0); const r = new Uint8Array(total); let o = 0; for (const b of bufs) { r.set(b, o); o += b.length; } return r; };
		const qname = encodeName(norm);
		const query = new Uint8Array(12 + qname.length + 4);
		const qv = new DataView(query.buffer);
		qv.setUint16(0, crypto.getRandomValues(new Uint16Array(1))[0]);
		qv.setUint16(2, 0x0100); qv.setUint16(4, 1);
		query.set(qname, 12);
		qv.setUint16(12 + qname.length, qtype); qv.setUint16(12 + qname.length + 2, 1);
		const resp = await fetch(resolver, { method: 'POST', headers: { 'Content-Type': 'application/dns-message', 'Accept': 'application/dns-message' }, body: query });
		if (!resp.ok) return [];
		const buf = new Uint8Array(await resp.arrayBuffer());
		const dv = new DataView(buf.buffer);
		const qdcount = dv.getUint16(4), ancount = dv.getUint16(6);
		const parseName = (pos) => { const labels = []; let p = pos, jumped = false, endPos = -1, safe = 128; while (p < buf.length && safe-- > 0) { const len = buf[p]; if (len === 0) { if (!jumped) endPos = p + 1; break; } if ((len & 0xC0) === 0xC0) { if (!jumped) endPos = p + 2; p = ((len & 0x3F) << 8) | buf[p + 1]; jumped = true; continue; } labels.push(new TextDecoder().decode(buf.slice(p + 1, p + 1 + len))); p += len + 1; } if (endPos === -1) endPos = p + 1; return [labels.join('.'), endPos]; };
		let offset = 12;
		for (let i = 0; i < qdcount; i++) { const [, end] = parseName(offset); offset = end + 4; }
		const answers = [];
		for (let i = 0; i < ancount && offset < buf.length; i++) {
			const [name, nameEnd] = parseName(offset); offset = nameEnd;
			const type = dv.getUint16(offset); offset += 2; offset += 2;
			const ttl = dv.getUint32(offset); offset += 4;
			const rdlen = dv.getUint16(offset); offset += 2;
			const rdata = buf.slice(offset, offset + rdlen); offset += rdlen;
			let data;
			if (type === 1 && rdlen === 4) data = `${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`;
			else if (type === 28 && rdlen === 16) { const segs = []; for (let j = 0; j < 16; j += 2) segs.push(((rdata[j] << 8) | rdata[j + 1]).toString(16)); data = segs.join(':'); }
			else if (type === 16) { let tOff = 0; const parts = []; while (tOff < rdlen) { const tLen = rdata[tOff++]; parts.push(new TextDecoder().decode(rdata.slice(tOff, tOff + tLen))); tOff += tLen; } data = parts.join(''); }
			else if (type === 5) { const [cname] = parseName(offset - rdlen); data = cname; }
			else data = Array.from(rdata).map(b => b.toString(16).padStart(2, '0')).join('');
			answers.push({ name, type, TTL: ttl, data });
		}
		const relevant = answers.filter(a => a.type === qtype);
		const minTTL = relevant.length > 0 ? Math.min(...relevant.map(a => a.TTL)) : 0;
		const cacheTTL = Math.max(minTTL, 5 * 60);
		const cacheData = relevant.map(a => a.data);
		if (cacheData.length > 0 || answers.length === 0) {
			if (Object.keys(dohCache).length >= dohMaxEntries) { for (const [k, v] of Object.entries(dohCache)) { if (now >= v.expiry) delete dohCache[k]; } if (Object.keys(dohCache).length >= dohMaxEntries) delete dohCache[Object.keys(dohCache)[0]]; }
			dohCache[cacheKey] = { data: cacheData, expiry: Date.now() + cacheTTL * 1000 };
		}
		log(`[DoH] ${domain} ${recordType} => ${answers.length} answers (${(performance.now() - startTime).toFixed(1)}ms)`);
		return answers;
	} catch (error) { console.error(`[DoH] ${domain} ${recordType} failed:`, error); return []; }
}
/////////////////////////////////////////////////////// Config Management ///////////////////////////////////////////////
async function readConfig(env, hostname, userID, UA = "Mozilla/5.0", reset = false) {
	const fp = FEATURE_CODES[0], Ali_DoH = "https://dns.alidns.com/dns-query", echSNI = "cloudflare-ech.com", placeholder = '{{IP:PORT}}';
	const initStart = performance.now();
	const defaultConfig = {
		TIME: new Date().toISOString(), HOST: hostname, HOSTS: [hostname], UUID: userID, PATH: "/",
		protocolType: "vless", transport: "ws", grpcMode: "gun", gRPCUserAgent: UA,
		skipCertVerify: false, enable0RTT: false, tlsFragment: null, randomPath: false,
		ech: false, echConfig: { dns: Ali_DoH, sni: echSNI },
		ss: { method: "aes-128-gcm", tls: true },
		fingerprint: "chrome",
		bestSub: { local: true, localIPs: { randomIP: true, randomCount: 16, specificPort: -1 }, sub: null, subName: "ehdbdg", subUpdateTime: 3, token: await doubleMD5(hostname + userID) },
		subConverter: { subAPI: `https://SUBAPI.${FEATURE_CODES[1]}ssss.net`, subConfig: `https://raw.githubusercontent.com/${FEATURE_CODES[1]}/ACL4SSR/refs/heads/main/Clash/config/ACL4SSR_Online_Mini_MultiMode_CF.ini`, subEmoji: false, subList: false, udp: false, xudp: false, tls13: false, appendType: false, sort: false },
		proxy: { [fp]: "auto", socks5: { enabled: null, global: false, account: '', whitelist: socks5Whitelist },
			pathTemplates: { [fp]: "proxyip=" + placeholder, socks5: { global: "socks5://" + placeholder, standard: "socks5=" + placeholder }, http: { global: "http://" + placeholder, standard: "http=" + placeholder }, https: { global: "https://" + placeholder, standard: "https=" + placeholder }, turn: { global: "turn://" + placeholder, standard: "turn=" + placeholder }, sstp: { global: "sstp://" + placeholder, standard: "sstp=" + placeholder } } },
		TG: { enabled: false, BotToken: null, ChatID: null },
		CF: { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null, Usage: { success: false, pages: 0, workers: 0, total: 0, max: 100000 } }
	};
	try {
		let raw = await env.KV.get('config.json');
		if (!raw || reset) { await env.KV.put('config.json', JSON.stringify(defaultConfig, null, 2)); cachedConfig = defaultConfig; }
		else cachedConfig = JSON.parse(raw);
	} catch (error) { cachedConfig = defaultConfig; }
	const cfg = cachedConfig;
	if (!cfg.subConverter.subList) cfg.subConverter.subList = false;
	if (!cfg.subConverter.udp) cfg.subConverter.udp = false;
	if (!cfg.subConverter.xudp) cfg.subConverter.xudp = false;
	if (!cfg.subConverter.tls13) cfg.subConverter.tls13 = false;
	if (!cfg.subConverter.appendType) cfg.subConverter.appendType = false;
	if (!cfg.subConverter.sort) cfg.subConverter.sort = false;
	if (!cfg.gRPCUserAgent) cfg.gRPCUserAgent = UA;
	cfg.HOST = hostname;
	if (!cfg.HOSTS) cfg.HOSTS = [hostname];
	if (env.HOST) cfg.HOSTS = (await splitToArray(env.HOST)).map(h => h.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]);
	cfg.UUID = userID;
	if (!cfg.randomPath) cfg.randomPath = false;
	if (!cfg.enable0RTT) cfg.enable0RTT = false;
	if (env.PATH) cfg.PATH = env.PATH.startsWith('/') ? env.PATH : '/' + env.PATH;
	else if (!cfg.PATH) cfg.PATH = '/';
	if (!cfg.grpcMode) cfg.grpcMode = 'gun';
	if (!cfg.ss) cfg.ss = { method: "aes-128-gcm", tls: false };
	if (!cfg.proxy?.pathTemplates?.[fp]) cfg.proxy = defaultConfig.proxy;
	cfg.bestSub.token = await doubleMD5(hostname + userID);
	// Build full node path
	const proxyType = cfg.proxy?.socks5?.enabled?.toUpperCase();
	let pathProxyParam = '';
	if (proxyType && cfg.proxy.socks5.account) pathProxyParam = (cfg.proxy.socks5.global ? cfg.proxy.pathTemplates[proxyType].global : cfg.proxy.pathTemplates[proxyType].standard).replace(placeholder, cfg.proxy.socks5.account);
	else if (cfg.proxy[fp] !== 'auto') pathProxyParam = cfg.proxy.pathTemplates[fp].replace(placeholder, cfg.proxy[fp]);
	let proxyQueryParam = '';
	if (pathProxyParam.includes('?')) { const [pp, pq] = pathProxyParam.split('?'); pathProxyParam = pp; proxyQueryParam = pq; }
	cfg.PATH = cfg.PATH.replace(pathProxyParam, '').replace('//', '/');
	const np = cfg.PATH === '/' ? '' : cfg.PATH.replace(/\/+(?=\?|$)/, '').replace(/\/+$/, '');
	const [pathPart, ...qArr] = np.split('?');
	const qPart = qArr.length ? '?' + qArr.join('?') : '';
	const finalQ = proxyQueryParam ? (qPart ? qPart + '&' + proxyQueryParam : '?' + proxyQueryParam) : qPart;
	cfg.fullPath = (pathPart || '/') + (pathPart && pathProxyParam ? '/' : '') + pathProxyParam + finalQ + (cfg.enable0RTT ? (finalQ ? '&' : '?') + 'ed=2560' : '');
	if (!cfg.tlsFragment && cfg.tlsFragment !== null) cfg.tlsFragment = null;
	if (!cfg.fingerprint) cfg.fingerprint = "chrome";
	if (!cfg.ech) cfg.ech = false;
	if (!cfg.echConfig) cfg.echConfig = { dns: Ali_DoH, sni: echSNI };
	const echParam = cfg.ech ? `&ech=${encodeURIComponent((cfg.echConfig.sni ? cfg.echConfig.sni + '+' : '') + cfg.echConfig.dns)}` : '';
	const fragParam = cfg.tlsFragment == 'Shadowrocket' ? `&fragment=${encodeURIComponent('1,40-60,30-50,tlshello')}` : cfg.tlsFragment == 'Happ' ? `&fragment=${encodeURIComponent('3,1,tlshello')}` : '';
	const { type: tp, pathField, hostField } = getTransportConfig(cfg);
	const tpv = getTransportPathValue(cfg, cfg.fullPath);
	cfg.LINK = cfg.protocolType === 'ss'
		? `${cfg.protocolType}://${btoa(cfg.ss.method + ':' + userID)}@${hostname}:${cfg.ss.tls ? '443' : '80'}?plugin=v2${encodeURIComponent(`ray-plugin;mode=websocket;host=${hostname};path=${((cfg.fullPath.includes('?') ? cfg.fullPath.replace('?', '?enc=' + cfg.ss.method + '&') : (cfg.fullPath + '?enc=' + cfg.ss.method)) + (cfg.ss.tls ? ';tls' : ''))};mux=0`) + echParam}#${encodeURIComponent(cfg.bestSub.subName)}`
		: `${cfg.protocolType}://${userID}@${hostname}:443?security=tls&type=${tp + echParam}&${hostField}=${hostname}&fp=${cfg.fingerprint}&sni=${hostname}&${pathField}=${encodeURIComponent(tpv) + fragParam}&encryption=none#${encodeURIComponent(cfg.bestSub.subName)}`;
	cfg.TG = { enabled: cfg.TG?.enabled ? cfg.TG.enabled : false, BotToken: null, ChatID: null };
	try { const tgTxt = await env.KV.get('tg.json'); if (!tgTxt) await env.KV.put('tg.json', JSON.stringify({ BotToken: null, ChatID: null }, null, 2)); else { const tg = JSON.parse(tgTxt); cfg.TG.ChatID = tg.ChatID || null; cfg.TG.BotToken = tg.BotToken ? maskSensitive(tg.BotToken) : null; } } catch (e) { }
	cfg.CF = { Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null, Usage: { success: false, pages: 0, workers: 0, total: 0, max: 100000 } };
	try {
		const cfTxt = await env.KV.get('cf.json');
		if (!cfTxt) await env.KV.put('cf.json', JSON.stringify({ Email: null, GlobalAPIKey: null, AccountID: null, APIToken: null, UsageAPI: null }, null, 2));
		else {
			const cf = JSON.parse(cfTxt);
			if (cf.UsageAPI) { try { const r = await fetch(cf.UsageAPI); cfg.CF.Usage = await r.json(); } catch (e) { } }
			else { cfg.CF.Email = cf.Email || null; cfg.CF.GlobalAPIKey = cf.GlobalAPIKey ? maskSensitive(cf.GlobalAPIKey) : null; cfg.CF.AccountID = cf.AccountID ? maskSensitive(cf.AccountID) : null; cfg.CF.APIToken = cf.APIToken ? maskSensitive(cf.APIToken) : null; cfg.CF.Usage = await getCloudflareUsage(cf.Email, cf.GlobalAPIKey, cf.AccountID, cf.APIToken); }
		}
	} catch (e) { }
	cfg.loadTime = (performance.now() - initStart).toFixed(2) + 'ms';
	return cfg;
}
/////////////////////////////////////////////////////// ISP Detection ///////////////////////////////////////////////
function detectISP(request) {
	const cf = request?.cf;
	const asnMap = { '4134': 'ct', '4809': 'ct', '4811': 'ct', '4812': 'ct', '4815': 'ct', '4837': 'cu', '4814': 'cu', '9929': 'cu', '17623': 'cu', '17816': 'cu', '9808': 'cmcc', '24400': 'cmcc', '56040': 'cmcc', '56041': 'cmcc', '56044': 'cmcc' };
	const keywordMap = [{ code: 'ct', pattern: /chinanet|chinatelecom|china telecom|cn2|shtel/ }, { code: 'cmcc', pattern: /cmi|cmnet|chinamobile|china mobile|cmcc|mobile communications/ }, { code: 'cu', pattern: /china169|china unicom|chinaunicom|cucc|cncgroup|cuii|netcom/ }];
	if (String(cf?.country || '').toLowerCase() !== 'cn') return 'cf';
	const org = String(cf?.asOrganization || '').toLowerCase();
	return keywordMap.find(({ pattern }) => pattern.test(org))?.code || asnMap[String(cf?.asn || '')] || 'cf';
}
/////////////////////////////////////////////////////// Random IP Generation from CF CIDR ///////////////////////////////////////////////
async function generateRandomIPs(request, count = 16, specificPort = -1) {
	const url = new URL(request.url);
	const ispParam = String(url.searchParams.get('cnIspCode') || '').toLowerCase();
	const isp = ['ct', 'cu', 'cmcc', 'cf'].includes(ispParam) ? ispParam : detectISP(request);
	const ispNames = { cmcc: 'CF-Mobile', cu: 'CF-Unicom', ct: 'CF-Telecom', cf: 'CF-Official' };
	const cidr_url = isp === 'cf' ? `https://raw.githubusercontent.com/${FEATURE_CODES[1]}/${FEATURE_CODES[1]}/main/CF-CIDR.txt` : `https://raw.githubusercontent.com/${FEATURE_CODES[1]}/${FEATURE_CODES[1]}/main/CF-CIDR/${isp}.txt`;
	const name = ispNames[isp] || 'CF-Official';
	const ports = [443, 2053, 2083, 2087, 2096, 8443];
	let cidrList = [];
	try { const res = await fetch(cidr_url); cidrList = res.ok ? await splitToArray(await res.text()) : ['104.16.0.0/13']; } catch { cidrList = ['104.16.0.0/13']; }
	const genIP = (cidr) => { const [base, prefix] = cidr.split('/'), bits = 32 - parseInt(prefix); const ipInt = base.split('.').reduce((a, p, i) => a | (parseInt(p) << (24 - i * 8)), 0); const mask = (0xFFFFFFFF << bits) >>> 0; const randomIP = (((ipInt & mask) >>> 0) + Math.floor(Math.random() * Math.pow(2, bits))) >>> 0; return [(randomIP >>> 24) & 0xFF, (randomIP >>> 16) & 0xFF, (randomIP >>> 8) & 0xFF, randomIP & 0xFF].join('.'); };
	const ips = Array.from({ length: count }, (_, i) => { const ip = genIP(cidrList[Math.floor(Math.random() * cidrList.length)]); const p = specificPort === -1 ? ports[Math.floor(Math.random() * ports.length)] : specificPort; return `${ip}:${p}#${name}${i + 1}`; });
	return [ips, ips.join('\n')];
}
async function splitToArray(content) { var c = content.replace(/[\t"'\r\n]+/g, ',').replace(/,+/g, ','); if (c.charAt(0) == ',') c = c.slice(1); if (c.charAt(c.length - 1) == ',') c = c.slice(0, c.length - 1); return c.split(','); }
async function getBestSubGenData(host) {
	let ips = [], others = '', fmt = host.replace(/^sub:\/\//i, 'https://').split('#')[0].split('?')[0];
	if (!/^https?:\/\//i.test(fmt)) fmt = `https://${fmt}`;
	try { new URL(fmt); fmt = new URL(fmt).origin; } catch (e) { ips.push(`127.0.0.1:1234#${host} Error: ${e.message}`); return [ips, others]; }
	try {
		const resp = await fetch(`${fmt}/sub?host=example.com&uuid=00000000-0000-4000-8000-000000000000`, { headers: { 'User-Agent': `v2rayN/ehdbdg (https://github.com/${FEATURE_CODES[1]}/ehdbdg)` } });
		if (!resp.ok) { ips.push(`127.0.0.1:1234#${host} Error: ${resp.statusText}`); return [ips, others]; }
		const content = atob(await resp.text());
		const lines = content.includes('\r\n') ? content.split('\r\n') : content.split('\n');
		for (const line of lines) {
			if (!line.trim()) continue;
			if (line.includes('00000000-0000-4000-8000-000000000000') && line.includes('example.com')) {
				const m = line.match(/:\/\/[^@]+@([^?]+)/);
				if (m) { let addr = m[1], remark = ''; const rm = line.match(/#(.+)$/); if (rm) remark = '#' + decodeURIComponent(rm[1]); ips.push(addr + remark); }
			} else others += line + '\n';
		}
	} catch (e) { ips.push(`127.0.0.1:1234#${host} Error: ${e.message}`); }
	return [ips, others];
}
async function fetchPreferredIPs(urls, defaultPort = '443', timeout = 3000) {
	if (!urls?.length) return [[], [], [], []];
	const results = new Set(), proxyPool = new Set();
	let linkContent = '', needSubConvert = [];
	await Promise.allSettled(urls.map(async (url) => {
		const hashIdx = url.indexOf('#');
		const urlClean = hashIdx > -1 ? url.substring(0, hashIdx) : url;
		const apiRemark = hashIdx > -1 ? decodeURIComponent(url.substring(hashIdx + 1)) : null;
		const isProxyIP = url.toLowerCase().includes('proxyip=true');
		if (urlClean.toLowerCase().startsWith('sub://')) {
			try {
				const [genIPs, genOthers] = await getBestSubGenData(urlClean);
				if (apiRemark) { for (const ip of genIPs) { results.add(ip.includes('#') ? `${ip} [${apiRemark}]` : `${ip}#[${apiRemark}]`); if (isProxyIP) proxyPool.add(ip.split('#')[0]); } }
				else { for (const ip of genIPs) { results.add(ip); if (isProxyIP) proxyPool.add(ip.split('#')[0]); } }
				if (genOthers) { if (apiRemark) { linkContent += genOthers.replace(/([a-z][a-z0-9+\-.]*:\/\/[^\r\n]*?)(\r?\n|$)/gi, (m, link, le) => `${link.includes('#') ? link + encodeURIComponent(` [${apiRemark}]`) : link + encodeURIComponent(`#[${apiRemark}]`)}${le}`); } else linkContent += genOthers; }
			} catch (e) { }
			return;
		}
		try {
			const ctrl = new AbortController();
			const tid = setTimeout(() => ctrl.abort(), timeout);
			const resp = await fetch(urlClean, { signal: ctrl.signal }); clearTimeout(tid);
			const buf = await resp.arrayBuffer();
			const ct = (resp.headers.get('content-type') || '').toLowerCase();
			const charset = ct.match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase() || '';
			let text = '';
			let decoders = ['utf-8', 'gb2312'];
			if (charset.includes('gb')) decoders = ['gb2312', 'utf-8'];
			let ok = false;
			for (const d of decoders) { try { const decoded = new TextDecoder(d).decode(buf); if (decoded && decoded.length > 0 && !decoded.includes('\ufffd')) { text = decoded; ok = true; break; } } catch (e) { } }
			if (!ok) text = await resp.text();
			if (!text || text.trim().length === 0) return;
			let preprocessed = text;
			const cleanText = text.replace(/\s/g, '');
			if (cleanText.length > 0 && cleanText.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(cleanText)) { try { preprocessed = new TextDecoder('utf-8').decode(new Uint8Array(atob(cleanText).split('').map(c => c.charCodeAt(0)))); } catch { } }
			if (preprocessed.split('#')[0].includes('://')) {
				if (apiRemark) { linkContent += preprocessed.replace(/([a-z][a-z0-9+\-.]*:\/\/[^\r\n]*?)(\r?\n|$)/gi, (m, link, le) => `${link.includes('#') ? link + encodeURIComponent(` [${apiRemark}]`) : link + encodeURIComponent(`#[${apiRemark}]`)}${le}`) + '\n'; }
				else linkContent += preprocessed + '\n';
				return;
			}
			const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
			const isCSV = lines.length > 1 && lines[0].includes(',');
			const IPV6 = /^[^\[\]]*:[^\[\]]*:[^\[\]]/;
			const pUrl = new URL(urlClean);
			if (!isCSV) {
				lines.forEach(line => { const hi = line.indexOf('#'); const [hp, rm] = hi > -1 ? [line.substring(0, hi), line.substring(hi)] : [line, '']; let hasPort = hp.startsWith('[') ? /\]:(\d+)$/.test(hp) : (() => { const ci = hp.lastIndexOf(':'); return ci > -1 && /^\d+$/.test(hp.substring(ci + 1)); })(); const port = pUrl.searchParams.get('port') || defaultPort; const item = hasPort ? line : `${hp}:${port}${rm}`; if (apiRemark) results.add(item.includes('#') ? `${item} [${apiRemark}]` : `${item}#[${apiRemark}]`); else results.add(item); if (isProxyIP) proxyPool.add(item.split('#')[0]); });
			} else {
				const headers = lines[0].split(',').map(h => h.trim()); const dataLines = lines.slice(1);
				if (headers.includes('IP地址') && headers.includes('端口')) { const ipIdx = headers.indexOf('IP地址'), portIdx = headers.indexOf('端口'); const rmkIdx = headers.indexOf('国家') > -1 ? headers.indexOf('国家') : headers.indexOf('城市') > -1 ? headers.indexOf('城市') : headers.indexOf('数据中心'); const tlsIdx = headers.indexOf('TLS'); dataLines.forEach(line => { const cols = line.split(',').map(c => c.trim()); if (tlsIdx !== -1 && cols[tlsIdx]?.toLowerCase() !== 'true') return; const wIP = IPV6.test(cols[ipIdx]) ? `[${cols[ipIdx]}]` : cols[ipIdx]; const item = `${wIP}:${cols[portIdx]}#${cols[rmkIdx]}`; if (apiRemark) results.add(`${item} [${apiRemark}]`); else results.add(item); if (isProxyIP) proxyPool.add(`${wIP}:${cols[portIdx]}`); }); }
				else if (headers.some(h => h.includes('IP')) && headers.some(h => h.includes('延迟'))) { const ipI = headers.findIndex(h => h.includes('IP')), dI = headers.findIndex(h => h.includes('延迟')), sI = headers.findIndex(h => h.includes('下载速度')); const port = pUrl.searchParams.get('port') || defaultPort; dataLines.forEach(line => { const cols = line.split(',').map(c => c.trim()); const wIP = IPV6.test(cols[ipI]) ? `[${cols[ipI]}]` : cols[ipI]; const item = `${wIP}:${port}#CF ${cols[dI]}ms ${cols[sI]}MB/s`; if (apiRemark) results.add(`${item} [${apiRemark}]`); else results.add(item); if (isProxyIP) proxyPool.add(`${wIP}:${port}`); }); }
			}
		} catch (e) { }
	}));
	const linkArr = linkContent.trim() ? [...new Set(linkContent.split(/\r?\n/).filter(l => l.trim() !== ''))] : [];
	return [Array.from(results), linkArr, needSubConvert, Array.from(proxyPool)];
}
/////////////////////////////////////////////////////// Proxy Context & Parameter Parsing ///////////////////////////////////////////////
async function getProxyContext(url, uuid, defaultIP = '', defaultFallback = true) {
	const { searchParams } = url;
	const pathname = decodeURIComponent(url.pathname);
	const pathLower = pathname.toLowerCase();
	let proxyIP = defaultIP, socks5Type = null, socks5Global = false, socks5Account = '', parsedProxy = {}, fallback = defaultFallback;
	const ctx = { trojanProxyAddr: null, proxyIP, proxyType: null, proxyAccount: '', proxyGlobal: false, proxyParams: {}, proxyFallback: fallback };
	const snapshot = () => { ctx.proxyIP = proxyIP; ctx.proxyType = socks5Type; ctx.proxyAccount = socks5Account; ctx.proxyGlobal = socks5Global; ctx.proxyParams = { ...parsedProxy }; ctx.proxyFallback = fallback; };
	// Chain proxy from /video/ path
	const chainMatch = pathname.match(/\/video\/(.+)$/i);
	if (chainMatch) {
		try {
			const plain = base64SecretDecode(chainMatch[1].replace(/\/+$/, ''), uuid);
			const { type, ...addr } = JSON.parse(plain);
			if (!type || !DEFAULT_PROXY_PORT[String(type).toLowerCase()]) throw new Error('Invalid type');
			if (!addr.hostname || !addr.port) throw new Error('Missing hostname/port');
			socks5Account = ''; proxyIP = 'chain'; fallback = false; socks5Global = true; socks5Type = String(type).toLowerCase();
			parsedProxy = { username: addr.username, password: addr.password, hostname: addr.hostname, port: Number(addr.port) };
			if (isNaN(parsedProxy.port)) throw new Error('Invalid port');
			snapshot(); return ctx;
		} catch (e) { console.error('Chain proxy parse error:', e.message); }
	}
	socks5Account = searchParams.get('socks5') || searchParams.get('http') || searchParams.get('https') || searchParams.get('turn') || searchParams.get('sstp') || null;
	socks5Global = searchParams.has('globalproxy');
	if (searchParams.get('socks5')) socks5Type = 'socks5';
	else if (searchParams.get('http')) socks5Type = 'http';
	else if (searchParams.get('https')) socks5Type = 'https';
	else if (searchParams.get('turn')) socks5Type = 'turn';
	else if (searchParams.get('sstp')) socks5Type = 'sstp';
	const parseProxyURL = (val, forceGlobal = true) => {
		const m = /^(socks5|http|https|turn|sstp):\/\/(.+)$/i.exec(val || '');
		if (!m) return false;
		socks5Type = m[1].toLowerCase(); socks5Account = m[2].split('/')[0];
		if (forceGlobal) socks5Global = true;
		return true;
	};
	const setProxyIP = (val) => { proxyIP = val; socks5Type = null; fallback = false; };
	const trojanMatch = /\/trojan=([^?#\s]+)/i.exec(pathname);
	if (trojanMatch) { try { ctx.trojanProxyAddr = parseTrojanProxyAddr(trojanMatch[1].replace(/\/+$/, '')); } catch (e) { ctx.trojanProxyAddr = null; } }
	const qpIP = searchParams.get('proxyip');
	if (qpIP !== null) { if (!parseProxyURL(qpIP)) { setProxyIP(qpIP); snapshot(); return ctx; } }
	else {
		let m;
		if ((m = /\/(socks5?|http|https|turn|sstp):\/?\/?([^/?#\s]+)/i.exec(pathname))) {
			const t = m[1].toLowerCase(); socks5Type = t === 'sock' || t === 'socks' ? 'socks5' : t; socks5Account = m[2].split('/')[0]; socks5Global = true;
		} else if ((m = /\/(g?s5|socks5|g?http|g?https|g?turn|g?sstp)=([^/?#\s]+)/i.exec(pathname))) {
			const t = m[1].toLowerCase(); socks5Account = m[2].split('/')[0];
			socks5Type = t.includes('sstp') ? 'sstp' : t.includes('turn') ? 'turn' : t.includes('https') ? 'https' : t.includes('http') ? 'http' : 'socks5';
			if (t.startsWith('g')) socks5Global = true;
		} else if ((m = /\/(proxyip[.=]|pyip=|ip=)([^?#\s]+)/.exec(pathLower))) {
			const extractPath = (v) => { if (!v.includes('://')) { const si = v.indexOf('/'); return si > 0 ? v.slice(0, si) : v; } const ps = v.split('://'); if (ps.length !== 2) return v; const si = ps[1].indexOf('/'); return si > 0 ? `${ps[0]}://${ps[1].slice(0, si)}` : v; };
			const pv = extractPath(m[2]);
			if (!parseProxyURL(pv)) { setProxyIP(pv); snapshot(); return ctx; }
		}
	}
	if (!socks5Account) { socks5Type = null; snapshot(); return ctx; }
	try { parsedProxy = await parseProxyAccount(socks5Account, getDefaultProxyPort(socks5Type));
		if (searchParams.get('socks5')) socks5Type = 'socks5';
		else if (searchParams.get('http')) socks5Type = 'http';
		else if (searchParams.get('https')) socks5Type = 'https';
		else if (searchParams.get('turn')) socks5Type = 'turn';
		else if (searchParams.get('sstp')) socks5Type = 'sstp';
		else socks5Type = socks5Type || 'socks5';
	} catch (e) { socks5Type = null; }
	snapshot(); return ctx;
}
const DEFAULT_PROXY_PORT = { socks5: 1080, http: 80, https: 443, turn: 3478, sstp: 443 };
function getDefaultProxyPort(type) { return DEFAULT_PROXY_PORT[String(type || '').toLowerCase()] || 80; }
const B64_REGEX = /^(?:[A-Z0-9+/]{4})*(?:[A-Z0-9+/]{2}==|[A-Z0-9+/]{3}=)?$/i;
function parseProxyAccount(address, defaultPort = 80) {
	address = String(address || '').trim().replace(/^(socks5|http|https|turn|sstp):\/\//i, '').split('#')[0].trim();
	const firstAt = address.lastIndexOf("@");
	if (firstAt !== -1) { let auth = address.slice(0, firstAt).replaceAll("%3D", "="); if (!auth.includes(":") && B64_REGEX.test(auth)) auth = atob(auth); address = `${auth}@${address.slice(firstAt + 1)}`; }
	const atIdx = address.lastIndexOf("@");
	const hostPart = (atIdx === -1 ? address : address.slice(atIdx + 1)).split('/')[0];
	const authPart = atIdx === -1 ? "" : address.slice(0, atIdx);
	const [username, password] = authPart ? authPart.split(":") : [];
	if (authPart && !password) throw new Error('Invalid proxy format');
	let hostname = hostPart, port = defaultPort;
	if (hostPart.includes("]:")) { const [h, p = ""] = hostPart.split("]:"); hostname = h + "]"; port = Number(p.replace(/[^\d]/g, "")); }
	else if (!hostPart.startsWith("[")) { const parts = hostPart.split(":"); if (parts.length === 2) { hostname = parts[0]; port = Number(parts[1].replace(/[^\d]/g, "")); } }
	if (isNaN(port)) throw new Error('Invalid port');
	return { username, password, hostname, port };
}
function stripIPv6Brackets(h = '') { const host = String(h || '').trim(); return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host; }
function isIPHostname(h = '') { const host = stripIPv6Brackets(h); if (/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(host)) return true; if (!host.includes(':')) return false; try { new URL(`http://[${host}]/`); return true; } catch (e) { return false; } }
function isIPv4(value) { const parts = String(value || '').split('.'); return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255); }
/////////////////////////////////////////////////////// Cloudflare Usage Query ///////////////////////////////////////////////
async function getCloudflareUsage(Email, GlobalAPIKey, AccountID, APIToken) {
	const API = "https://api.cloudflare.com/client/v4";
	const sum = (a) => a?.reduce((t, i) => t + (i?.sum?.requests || 0), 0) || 0;
	const cfg = { "Content-Type": "application/json" };
	try {
		if (!AccountID && (!Email || !GlobalAPIKey)) return { success: false, pages: 0, workers: 0, total: 0, max: 100000 };
		if (!AccountID) {
			const r = await fetch(`${API}/accounts`, { method: "GET", headers: { ...cfg, "X-AUTH-EMAIL": Email, "X-AUTH-KEY": GlobalAPIKey } });
			if (!r.ok) throw new Error(`Account fetch failed: ${r.status}`);
			const d = await r.json();
			if (!d?.result?.length) throw new Error("No accounts found");
			const idx = d.result.findIndex(a => a.name?.toLowerCase().startsWith(Email.toLowerCase()));
			AccountID = d.result[idx >= 0 ? idx : 0]?.id;
		}
		const now = new Date(); now.setUTCHours(0, 0, 0, 0);
		const hdr = APIToken ? { ...cfg, "Authorization": `Bearer ${APIToken}` } : { ...cfg, "X-AUTH-EMAIL": Email, "X-AUTH-KEY": GlobalAPIKey };
		const res = await fetch(`${API}/graphql`, { method: "POST", headers: hdr, body: JSON.stringify({
			query: `query { viewer { accounts(filter: {accountTag: "${AccountID}"}) { pagesFunctionsInvocationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: "${now.toISOString()}", datetime_leq: "${new Date().toISOString()}"}) { sum { requests } } workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: "${now.toISOString()}", datetime_leq: "${new Date().toISOString()}"}) { sum { requests } } } } }`
		}) });
		if (!res.ok) throw new Error(`Query failed: ${res.status}`);
		const result = await res.json();
		if (result.errors?.length) throw new Error(result.errors[0].message);
		const acc = result?.data?.viewer?.accounts?.[0];
		if (!acc) throw new Error("No account data");
		const pages = sum(acc.pagesFunctionsInvocationsAdaptiveGroups), workers = sum(acc.workersInvocationsAdaptive);
		return { success: true, pages, workers, total: pages + workers, max: 100000 };
	} catch (error) { console.error('Usage error:', error.message); return { success: false, pages: 0, workers: 0, total: 0, max: 100000 }; }
}
/////////////////////////////////////////////////////// SHA-224 (Pure JS) ///////////////////////////////////////////////
function sha224(s) {
	const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
	const r = (n, b) => ((n >>> b) | (n << (32 - b))) >>> 0;
	s = unescape(encodeURIComponent(s));
	const l = s.length * 8; s += String.fromCharCode(0x80);
	while ((s.length * 8) % 512 !== 448) s += String.fromCharCode(0);
	const h = [0xc1059ed8,0x367cd507,0x3070dd17,0xf70e5939,0xffc00b31,0x68581511,0x64f98fa7,0xbefa4fa4];
	const hi = Math.floor(l / 0x100000000), lo = l & 0xFFFFFFFF;
	s += String.fromCharCode((hi >>> 24) & 0xFF, (hi >>> 16) & 0xFF, (hi >>> 8) & 0xFF, hi & 0xFF, (lo >>> 24) & 0xFF, (lo >>> 16) & 0xFF, (lo >>> 8) & 0xFF, lo & 0xFF);
	const w = []; for (let i = 0; i < s.length; i += 4) w.push((s.charCodeAt(i) << 24) | (s.charCodeAt(i + 1) << 16) | (s.charCodeAt(i + 2) << 8) | s.charCodeAt(i + 3));
	for (let i = 0; i < w.length; i += 16) {
		const x = new Array(64).fill(0); for (let j = 0; j < 16; j++) x[j] = w[i + j];
		for (let j = 16; j < 64; j++) { const s0 = r(x[j-15],7)^r(x[j-15],18)^(x[j-15]>>>3); const s1 = r(x[j-2],17)^r(x[j-2],19)^(x[j-2]>>>10); x[j] = (x[j-16]+s0+x[j-7]+s1)>>>0; }
		let [a,b,c,d,e,f,g,h0] = h;
		for (let j = 0; j < 64; j++) { const S1=r(e,6)^r(e,11)^r(e,25); const ch=(e&f)^(~e&g); const t1=(h0+S1+ch+K[j]+x[j])>>>0; const S0=r(a,2)^r(a,13)^r(a,22); const maj=(a&b)^(a&c)^(b&c); const t2=(S0+maj)>>>0; h0=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0; }
		for (let j = 0; j < 8; j++) h[j] = (h[j]+(j===0?a:j===1?b:j===2?c:j===3?d:j===4?e:j===5?f:j===6?g:h0))>>>0;
	}
	let hex = ''; for (let i = 0; i < 7; i++) for (let j = 24; j >= 0; j -= 8) hex += ((h[i] >>> j) & 0xFF).toString(16).padStart(2, '0');
	return hex;
}
/////////////////////////////////////////////////////// Proxy IP Resolution ///////////////////////////////////////////////
async function resolveProxyIPs(proxyIP, targetDomain = 'dash.cloudflare.com', UUID = '00000000-0000-4000-8000-000000000000') {
	proxyIP = proxyIP.toLowerCase();
	function parseAddrPort(str) { let addr = str, port = 443; if (str.includes(']:')) { const [h, p] = str.split(']:'); addr = h + ']'; port = parseInt(p, 10) || port; } else if ((str.match(/:/g) || []).length === 1 && !str.startsWith('[')) { const ci = str.lastIndexOf(':'); addr = str.slice(0, ci); port = parseInt(str.slice(ci + 1), 10) || port; } return [addr, port]; }
	const items = await splitToArray(proxyIP);
	let allPairs = [];
	const ipv4Re = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
	const ipv6Re = /^\[?(?:[a-fA-F0-9]{0,4}:){1,7}[a-fA-F0-9]{0,4}\]?$/;
	for (const item of items) {
		let [addr, port] = parseAddrPort(item);
		if (item.includes('.tp')) { const m = item.match(/\.tp(\d+)/); if (m) port = parseInt(m[1], 10); }
		if (ipv4Re.test(addr) || ipv6Re.test(addr)) { allPairs.push([addr, port]); continue; }
		const [txtRecs, aRecs] = await Promise.all([doHQuery(addr, 'TXT'), doHQuery(addr, 'A')]);
		const txtData = txtRecs.filter(r => r.type === 16).map(r => r.data);
		const txtAddrs = txtData.flatMap(d => { if (d.startsWith('"') && d.endsWith('"')) d = d.slice(1, -1); return d.replace(/\\010/g, ',').replace(/\n/g, ',').split(',').map(s => s.trim()).filter(Boolean); }).map(s => parseAddrPort(s));
		if (txtAddrs.length > 0) { allPairs.push(...txtAddrs); continue; }
		const ipv4s = aRecs.filter(r => r.type === 1).map(r => r.data);
		if (ipv4s.length > 0) { allPairs.push(...ipv4s.map(ip => [ip, port])); continue; }
		const aaaaRecs = await doHQuery(addr, 'AAAA');
		const ipv6s = aaaaRecs.filter(r => r.type === 28).map(r => `[${r.data}]`);
		if (ipv6s.length > 0) allPairs.push(...ipv6s.map(ip => [ip, port]));
		else allPairs.push([addr, port]);
	}
	const sorted = allPairs.sort((a, b) => a[0].localeCompare(b[0]));
	const targetRoot = targetDomain.includes('.') ? targetDomain.split('.').slice(-2).join('.') : targetDomain;
	let seed = [...(targetRoot + UUID)].reduce((a, c) => a + c.charCodeAt(0), 0);
	const shuffled = [...sorted].sort(() => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
	const result = shuffled.slice(0, 8);
	log(`[ProxyIP] Resolved ${result.length} proxies`);
	return result;
}
/////////////////////////////////////////////////////// HTML Camouflage Pages ///////////////////////////////////////////////
async function nginxPage() {
	return `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and working.</p>
<p>For online documentation and support please refer to <a href="http://nginx.org/">nginx.org</a>.</p>
<p><em>Thank you for using nginx.</em></p>
</body>
</html>`;
}
async function html1101(host, clientIP) {
	const now = new Date();
	const ts = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
	const ray = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
	return `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<!--[if IE 7]>    <html class="no-js ie7 oldie" lang="en-US"> <![endif]-->
<!--[if IE 8]>    <html class="no-js ie8 oldie" lang="en-US"> <![endif]-->
<!--[if gt IE 8]><!--> <html class="no-js" lang="en-US"> <!--<![endif]-->
<head>
<title>Worker threw exception | ${host} | Cloudflare</title>
<meta charset="UTF-8" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta http-equiv="X-UA-Compatible" content="IE=Edge" />
<meta name="robots" content="noindex, nofollow" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" id="cf_styles-css" href="/cdn-cgi/styles/cf.errors.css" />
<!--[if lt IE 9]><link rel="stylesheet" id='cf_styles-ie-css' href="/cdn-cgi/styles/cf.errors.ie.css" /><![endif]-->
<style>body{margin:0;padding:0}</style>
<!--[if gte IE 10]><!-->
<script>if(!navigator.cookieEnabled){window.addEventListener('DOMContentLoaded',function(){document.getElementById('cookie-alert').style.display='block'})}</script>
<!--<![endif]-->
</head>
<body>
<div id="cf-wrapper">
<div class="cf-alert cf-alert-error cf-cookie-error" id="cookie-alert" data-translate="enable_cookies">Please enable cookies.</div>
<div id="cf-error-details" class="cf-error-details-wrapper">
<div class="cf-wrapper cf-header cf-error-overview">
<h1><span class="cf-error-type" data-translate="error">Error</span> <span class="cf-error-code">1101</span> <small class="heading-ray-id">Ray ID: ${ray} &bull; ${ts} UTC</small></h1>
<h2 class="cf-subheadline" data-translate="error_desc">Worker threw exception</h2>
</div>
<section></section>
<div class="cf-section cf-wrapper">
<div class="cf-columns two">
<div class="cf-column"><h2 data-translate="what_happened">What happened?</h2><p>You've requested a page on a website (${host}) that is on the <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=error_100x" target="_blank">Cloudflare</a> network. An unknown error occurred while rendering the page.</p></div>
<div class="cf-column"><h2 data-translate="what_can_i_do">What can I do?</h2><p><strong>If you are the owner of this website:</strong><br />refer to <a href="https://developers.cloudflare.com/workers/observability/errors/" target="_blank">Workers - Errors and Exceptions</a>.</p></div>
</div>
</div>
<div class="cf-error-footer cf-wrapper w-240 lg:w-full py-10 sm:py-4 sm:px-8 mx-auto text-center sm:text-left border-solid border-0 border-t border-gray-300">
<p class="text-13">
<span class="cf-footer-item sm:block sm:mb-1">Cloudflare Ray ID: <strong class="font-semibold">${ray}</strong></span>
<span class="cf-footer-separator sm:hidden">&bull;</span>
<span id="cf-footer-item-ip" class="cf-footer-item hidden sm:block sm:mb-1">Your IP: <button type="button" id="cf-footer-ip-reveal" class="cf-footer-ip-reveal-btn">Click to reveal</button><span class="hidden" id="cf-footer-ip">${clientIP}</span></span>
<span class="cf-footer-separator sm:hidden">&bull;</span>
<span class="cf-footer-item sm:block sm:mb-1"><span>Performance &amp; security by</span> <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing" id="brand_link" target="_blank">Cloudflare</a></span>
</p>
<script>(function(){function d(){var b=document.getElementById("cf-footer-item-ip"),c=document.getElementById("cf-footer-ip-reveal");b&&"classList"in b&&(b.classList.remove("hidden"),c.addEventListener("click",function(){c.classList.add("hidden");document.getElementById("cf-footer-ip").classList.remove("hidden")}))}document.addEventListener&&document.addEventListener("DOMContentLoaded",d)})();</script>
</div>
</div>
</div>
<script>window._cf_translation = {};</script>
</body>
</html>`;
}
/////////////////////////////////////////////////////// Utility Functions: toUint8Array, concatBytes ///////////////////////////////////////////////
function toUint8Array(data) { if (data instanceof Uint8Array) return data; if (data instanceof ArrayBuffer) return new Uint8Array(data); if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength); return new Uint8Array(data || 0); }
function concatBytes(...chunks) { const nonEmpty = chunks.filter(c => c && c.length > 0); const length = nonEmpty.reduce((t, c) => t + c.length, 0); const result = new Uint8Array(length); let offset = 0; for (const chunk of nonEmpty) { result.set(chunk, offset); offset += chunk.length; } return result; }
/////////////////////////////////////////////////////// TLS Client (1.2/1.3) /////////////////////////////////////////////////////

/////////////////////////////////////////////////////// TLS Client (1.2/1.3) /////////////////////////////////////////////////////
const TLS_V10 = 769, TLS_V12 = 771, TLS_V13 = 772;
const CT_CHANGE_CIPHER = 20, CT_ALERT = 21, CT_HANDSHAKE = 22, CT_APP_DATA = 23;
const HS_CLIENT_HELLO = 1, HS_SERVER_HELLO = 2, HS_NEW_SESSION_TICKET = 4, HS_ENCRYPTED_EXT = 8, HS_CERTIFICATE = 11, HS_SERVER_KEY_EXCHANGE = 12, HS_CERT_REQUEST = 13, HS_SERVER_HELLO_DONE = 14, HS_CERT_VERIFY = 15, HS_CLIENT_KEY_EXCHANGE = 16, HS_FINISHED = 20, HS_KEY_UPDATE = 24;
const EXT_SNI = 0, EXT_GROUPS = 10, EXT_EC_POINT = 11, EXT_SIG_ALG = 13, EXT_ALPN = 16, EXT_SUPPORTED_VER = 43, EXT_PSK_MODE = 45, EXT_KEY_SHARE = 51;
const ALERT_CLOSE = 0, ALERT_WARN = 1, ALERT_UNRECOGNIZED = 112;
const shouldIgnoreAlert2 = f => f?.[0] === ALERT_WARN && f?.[1] === ALERT_UNRECOGNIZED;
const tlsTE = new TextEncoder(), tlsTD = new TextDecoder();
const CIPHERS2 = new Map([[4865,{id:4865,keyLen:16,ivLen:12,hash:"SHA-256",tls13:true}],[4866,{id:4866,keyLen:32,ivLen:12,hash:"SHA-384",tls13:true}],[4867,{id:4867,keyLen:32,ivLen:12,hash:"SHA-256",tls13:true,chacha:true}],[49199,{id:49199,keyLen:16,ivLen:4,hash:"SHA-256",kex:"ECDHE"}],[49200,{id:49200,keyLen:32,ivLen:4,hash:"SHA-384",kex:"ECDHE"}],[52392,{id:52392,keyLen:32,ivLen:12,hash:"SHA-256",kex:"ECDHE",chacha:true}],[49195,{id:49195,keyLen:16,ivLen:4,hash:"SHA-256",kex:"ECDHE"}],[49196,{id:49196,keyLen:32,ivLen:4,hash:"SHA-384",kex:"ECDHE"}],[52393,{id:52393,keyLen:32,ivLen:12,hash:"SHA-256",kex:"ECDHE",chacha:true}]]);
const GROUPS2 = new Map([[29,"X25519"],[23,"P-256"]]);
const SIG_ALGS2 = [2052,2053,2054,1025,1281,1537,1027,1283,1539];
const tlsCat = (...c) => { const n = c.filter(x=>x&&x.length>0); const l = n.reduce((t,x)=>t+x.length,0); const r = new Uint8Array(l); let o=0; for(const ch of n){r.set(ch,o);o+=ch.length;} return r; };
const u16be2 = v => [v>>8&255,255&v];
const rU16b = (b,o) => b[o]<<8|b[o+1];
const rU24b = (b,o) => b[o]<<16|b[o+1]<<8|b[o+2];
const randB = l => crypto.getRandomValues(new Uint8Array(l));
const ctEq = (a,b) => { if(!a||!b||a.length!==b.length)return false; let d=0; for(let i=0;i<a.length;i++) d|=a[i]^b[i]; return d===0; };
const hLen2 = h => "SHA-512"===h?64:"SHA-384"===h?48:32;
async function hm2(h,k,d){const ck=await crypto.subtle.importKey("raw",k,{name:"HMAC",hash:h},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",ck,d));}
async function dg2(h,d){return new Uint8Array(await crypto.subtle.digest(h,d));}
async function prf12(s,l,seed,len,h="SHA-256"){const ls=tlsCat(tlsTE.encode(l),seed);let out=new Uint8Array(0),a=ls;for(;out.length<len;){a=await hm2(h,s,a);const b=await hm2(h,s,tlsCat(a,ls));out=tlsCat(out,b);}return out.slice(0,len);}
async function hkdfE2(h,s,ikm){return s&&s.length||(s=new Uint8Array(hLen2(h))),hm2(h,s,ikm);}
async function hkdfL2(h,s,l,ctx,len){const fl=tlsTE.encode("tls13 "+l);const info=(function(l2,fb,cb){const r=new Uint8Array(2+1+fb.length+1+cb.length);const v=new DataView(r.buffer);v.setUint16(0,l2);r[2]=fb.length;r.set(fb,3);r[3+fb.length]=cb.length;r.set(cb,4+fb.length);return r;})(len,fl,ctx);const hl=hLen2(h),rc=Math.ceil(len/hl);let out=new Uint8Array(0),prev=new Uint8Array(0);for(let i=1;i<=rc;i++){prev=await hm2(h,s,tlsCat(prev,info,[i]));out=tlsCat(out,prev);}return out.slice(0,len);}
async function gks2(g="P-256"){const a="X25519"===g?{name:"X25519"}:{name:"ECDH",namedCurve:g};const kp=await crypto.subtle.generateKey(a,true,["deriveBits"]);const pk=new Uint8Array(await crypto.subtle.exportKey("raw",kp.publicKey));return{keyPair:kp,publicKeyRaw:pk};}
async function ds2(priv,peer,g="P-256"){const a="X25519"===g?{name:"X25519"}:{name:"ECDH",namedCurve:g};const pk=await crypto.subtle.importKey("raw",peer,a,false,[]);const b="P-384"===g?384:"P-521"===g?528:256;return new Uint8Array(await crypto.subtle.deriveBits({name:a.name,public:pk},priv,b));}
async function impKey(k,u){return crypto.subtle.importKey("raw",k,{name:"AES-GCM"},false,u);}
async function aesE(ck,iv,pt,ad){return new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:ad,tagLength:128},ck,pt));}
async function aesD(ck,iv,ct,ad){return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:ad,tagLength:128},ck,ct));}
function rotL32(v,b){return(v<<b|v>>>(32-b))>>>0;}
function chQR(s,a,b,c,d){s[a]=s[a]+s[b]>>>0;s[d]=rotL32(s[d]^s[a],16);s[c]=s[c]+s[d]>>>0;s[b]=rotL32(s[b]^s[c],12);s[a]=s[a]+s[b]>>>0;s[d]=rotL32(s[d]^s[a],8);s[c]=s[c]+s[d]>>>0;s[b]=rotL32(s[b]^s[c],7);}
function chBlock(k,c,n){const s=new Uint32Array(16);s[0]=1634760805;s[1]=857760878;s[2]=2036477234;s[3]=1797285236;const kv=new DataView(k.buffer,k.byteOffset,k.byteLength);for(let i=0;i<8;i++)s[4+i]=kv.getUint32(4*i,true);s[12]=c;const nv=new DataView(n.buffer,n.byteOffset,n.byteLength);s[13]=nv.getUint32(0,true);s[14]=nv.getUint32(4,true);s[15]=nv.getUint32(8,true);const w=new Uint32Array(s);for(let r=0;r<10;r++){chQR(w,0,4,8,12);chQR(w,1,5,9,13);chQR(w,2,6,10,14);chQR(w,3,7,11,15);chQR(w,0,5,10,15);chQR(w,1,6,11,12);chQR(w,2,7,8,13);chQR(w,3,4,9,14);}for(let i=0;i<16;i++)w[i]=w[i]+s[i]>>>0;return new Uint8Array(w.buffer.slice(0));}
function chXor(k,n,d){const o=new Uint8Array(d.length);let c=1;for(let i=0;i<d.length;i+=64){const b=chBlock(k,c++,n);const bl=Math.min(64,d.length-i);for(let j=0;j<bl;j++)o[i+j]=d[i+j]^b[j];}return o;}
function p1305(k,m){const rk=(()=>{const c=new Uint8Array(k);c[3]&=15;c[7]&=15;c[11]&=15;c[15]&=15;c[4]&=252;c[8]&=252;c[12]&=252;return c;})(k.slice(0,16));const sk=k.slice(16,32);let acc=[0n,0n,0n,0n,0n];const rL=[0x3ffffffn&BigInt(rk[0]|rk[1]<<8|rk[2]<<16|rk[3]<<24),0x3ffffffn&BigInt(rk[3]>>2|rk[4]<<6|rk[5]<<14|rk[6]<<22),0x3ffffffn&BigInt(rk[6]>>4|rk[7]<<4|rk[8]<<12|rk[9]<<20),0x3ffffffn&BigInt(rk[9]>>6|rk[10]<<2|rk[11]<<10|rk[12]<<18),0x3ffffffn&BigInt(rk[13]|rk[14]<<8|rk[15]<<16)];for(let o=0;o<m.length;o+=16){const ch=m.slice(o,o+16);const p=new Uint8Array(17);p.set(ch);p[ch.length]=1;acc[0]+=BigInt(p[0]|p[1]<<8|p[2]<<16|(3&p[3])<<24);acc[1]+=BigInt(p[3]>>2|p[4]<<6|p[5]<<14|(15&p[6])<<22);acc[2]+=BigInt(p[6]>>4|p[7]<<4|p[8]<<12|(63&p[9])<<20);acc[3]+=BigInt(p[9]>>6|p[10]<<2|p[11]<<10|p[12]<<18);acc[4]+=BigInt(p[13]|p[14]<<8|p[15]<<16|p[16]<<24);const prod=[0n,0n,0n,0n,0n];for(let ai=0;ai<5;ai++)for(let ri=0;ri<5;ri++){const li=ai+ri;li<5?prod[li]+=acc[ai]*rL[ri]:prod[li-5]+=acc[ai]*rL[ri]*5n;}let carry=0n;for(let i=0;i<5;i++){prod[i]+=carry;acc[i]=0x3ffffffn&prod[i];carry=prod[i]>>26n;}acc[0]+=5n*carry;carry=acc[0]>>26n;acc[0]&=0x3ffffffn;acc[1]+=carry;}let tv=acc[0]|acc[1]<<26n|acc[2]<<52n|acc[3]<<78n|acc[4]<<104n;tv=tv+sk.reduce((t,b,i)=>t+(BigInt(b)<<(BigInt(8*i))),0n)&(1n<<128n)-1n;const tag=new Uint8Array(16);for(let i=0;i<16;i++)tag[i]=Number(tv>>(BigInt(8*i))&0xffn);return tag;}
function chEnc(k,n,pt,ad){const pk=chBlock(k,0,n).slice(0,32),ct=chXor(k,n,pt),ap=(16-ad.length%16)%16,cp=(16-ct.length%16)%16,md=new Uint8Array(ad.length+ap+ct.length+cp+16);md.set(ad,0);md.set(ct,ad.length+ap);const lv=new DataView(md.buffer,ad.length+ap+ct.length+cp);lv.setBigUint64(0,BigInt(ad.length),true);lv.setBigUint64(8,BigInt(ct.length),true);return tlsCat(ct,p1305(pk,md));}
function chDec(k,n,ct,ad){if(ct.length<16)throw new Error("Ciphertext too short");const tag=ct.slice(-16),ed=ct.slice(0,-16),pk=chBlock(k,0,n).slice(0,32),ap=(16-ad.length%16)%16,cp=(16-ed.length%16)%16,md=new Uint8Array(ad.length+ap+ed.length+cp+16);md.set(ad,0);md.set(ed,ad.length+ap);const lv=new DataView(md.buffer,ad.length+ap+ed.length+cp);lv.setBigUint64(0,BigInt(ad.length),true);lv.setBigUint64(8,BigInt(ed.length),true);const et=p1305(pk,md);let d=0;for(let i=0;i<16;i++)d|=tag[i]^et[i];if(d!==0)throw new Error("ChaCha20-Poly1305 auth failed");return chXor(k,n,ed);}
const EMPTY = new Uint8Array(0);
const TMAX = 16*1024;
function bRec(t,f,v=TLS_V12){const d=toUint8Array(f);const r=new Uint8Array(5+d.byteLength);r[0]=t;r[1]=v>>8&255;r[2]=v&255;r[3]=d.byteLength>>8&255;r[4]=d.byteLength&255;r.set(d,5);return r;}
function bHS(t,b){return tlsCat(new Uint8Array([t]),new Uint8Array([b.length>>16&255,b.length>>8&255,255&b.length]),b);}
class RP{constructor(){this.buffer=new Uint8Array(0);}feed(c){const b=toUint8Array(c);this.buffer=this.buffer.length?tlsCat(this.buffer,b):b;}next(){if(this.buffer.length<5)return null;const t=this.buffer[0],v=rU16b(this.buffer,1),l=rU16b(this.buffer,3);if(this.buffer.length<5+l)return null;const f=this.buffer.subarray(5,5+l);return this.buffer=this.buffer.subarray(5+l),{type:t,version:v,length:l,fragment:f};}}
class HP{constructor(){this.buffer=new Uint8Array(0);}feed(c){const b=toUint8Array(c);this.buffer=this.buffer.length?tlsCat(this.buffer,b):b;}next(){if(this.buffer.length<4)return null;const t=this.buffer[0],l=rU24b(this.buffer,1);if(this.buffer.length<4+l)return null;const body=this.buffer.subarray(4,4+l),raw=this.buffer.subarray(0,4+l);return this.buffer=this.buffer.subarray(4+l),{type:t,length:l,body,raw};}}
function pSH(b){let o=0;const v=rU16b(b,o);o+=2;const sr=b.slice(o,o+32);o+=32;const sl=b[o++];o+=sl;const cs=rU16b(b,o);o+=2;o++;let sv=v,ks=null,alpn=null;if(o<b.length){const el=rU16b(b,o);o+=2;const ee=o+el;for(;o+4<=ee;){const et=rU16b(b,o);o+=2;const xl=rU16b(b,o);o+=2;const xd=b.slice(o,o+xl);o+=xl;if(et===EXT_SUPPORTED_VER&&xl>=2)sv=rU16b(xd,0);else if(et===EXT_KEY_SHARE&&xl>=4){const g=rU16b(xd,0),kl=rU16b(xd,2);ks={group:g,key:xd.slice(4,4+kl)};}else if(et===EXT_ALPN&&xl>=3&&xd[2]>0)alpn=tlsTD.decode(xd.slice(3,3+xd[2]));}}const hrr=new Uint8Array([207,33,173,116,229,154,97,17,190,29,140,2,30,101,184,145,194,162,17,22,122,187,140,94,7,158,9,226,200,168,51,156]);return{version:v,serverRandom:sr,cipherSuite:cs,selectedVersion:sv,keyShare:ks,alpn,isHRR:ctEq(sr,hrr),isTls13:sv===TLS_V13};}
function pSKE(b){let o=1;const nc=rU16b(b,o);o+=2;const kl=b[o++];const pk=b.slice(o,o+kl);return{namedCurve:nc,serverPublicKey:pk,publicKeyRaw:pk};}
function extCert(b,ctx=0){let o=0;if(ctx){const cl=b[o++];o+=cl;}if(o+3>b.length)return null;const cll=rU24b(b,o);if(o+=3,!cll||o+3>b.length)return null;const cl=rU24b(b,o);return o+=3,cl?b.slice(o,o+cl):null;}
function pEE(b){const p={alpn:null};let o=2;const ee=2+rU16b(b,0);for(;o+4<=ee;){const et=rU16b(b,o);o+=2;const xl=rU16b(b,o);o+=2;if(et===EXT_ALPN&&xl>=3){const pl=b[o+2];if(pl>0&&o+3+pl<=o+xl)p.alpn=tlsTD.decode(b.slice(o+3,o+3+pl));}o+=xl;}return p;}
function bCH(rnd,sni,ks,{tls13=true,tls12=true,alpn=null,chacha=true}={}){const ids=[];tls13&&ids.push(4865,4866,...(chacha?[4867]:[]));tls12&&ids.push(49199,49200,49195,49196,...(chacha?[52392,52393]:[]));const cb=tlsCat(new Uint8Array(ids.flatMap(u16be2)));const exts=[new Uint8Array([255,1,0,1,0])];if(sni){const sb=tlsTE.encode(sni),sl=tlsCat(new Uint8Array([0]),new Uint8Array(u16be2(sb.length)),sb);exts.push(tlsCat(new Uint8Array(u16be2(EXT_SNI)),new Uint8Array(u16be2(sl.length+2)),new Uint8Array(u16be2(sl.length)),sl));}exts.push(tlsCat(new Uint8Array(u16be2(EXT_EC_POINT)),new Uint8Array([0,2,1,0])));exts.push(tlsCat(new Uint8Array(u16be2(EXT_GROUPS)),new Uint8Array([0,6,0,4,0,29,0,23])));const sbytes=tlsCat(new Uint8Array(SIG_ALGS2.flatMap(u16be2)));exts.push(tlsCat(new Uint8Array(u16be2(EXT_SIG_ALG)),new Uint8Array(u16be2(sbytes.length+2)),new Uint8Array(u16be2(sbytes.length)),sbytes));const protos=Array.isArray(alpn)?alpn.filter(Boolean):alpn?[alpn]:[];if(protos.length){const ab=tlsCat(...protos.map(p2=>{const pb=tlsTE.encode(p2);return tlsCat(new Uint8Array([pb.length]),pb);}));exts.push(tlsCat(new Uint8Array(u16be2(EXT_ALPN)),new Uint8Array(u16be2(ab.length+2)),new Uint8Array(u16be2(ab.length)),ab));}if(tls13&&ks){let ksb;exts.push(tls12?tlsCat(new Uint8Array(u16be2(EXT_SUPPORTED_VER)),new Uint8Array([0,5,4,3,4,3,3])):tlsCat(new Uint8Array(u16be2(EXT_SUPPORTED_VER)),new Uint8Array([0,3,2,3,4])));exts.push(tlsCat(new Uint8Array(u16be2(EXT_PSK_MODE)),new Uint8Array([0,2,1,1])));if(ks?.x25519&&ks?.p256)ksb=tlsCat(tlsCat(new Uint8Array([0,29]),new Uint8Array(u16be2(ks.x25519.length)),ks.x25519),tlsCat(new Uint8Array([0,23]),new Uint8Array(u16be2(ks.p256.length)),ks.p256));else if(ks?.x25519)ksb=tlsCat(new Uint8Array([0,29]),new Uint8Array(u16be2(ks.x25519.length)),ks.x25519);else if(ks?.p256)ksb=tlsCat(new Uint8Array([0,23]),new Uint8Array(u16be2(ks.p256.length)),ks.p256);else{if(!(ks instanceof Uint8Array))throw new Error("Invalid keyShares");ksb=tlsCat(new Uint8Array([0,23]),new Uint8Array(u16be2(ks.length)),ks);}exts.push(tlsCat(new Uint8Array(u16be2(EXT_KEY_SHARE)),new Uint8Array(u16be2(ksb.length+2)),new Uint8Array(u16be2(ksb.length)),ksb));}const eb=tlsCat(...exts);return bHS(HS_CLIENT_HELLO,tlsCat(new Uint8Array(u16be2(TLS_V12)),rnd,new Uint8Array([0]),new Uint8Array(u16be2(cb.length)),cb,new Uint8Array([1,0]),new Uint8Array(u16be2(eb.length)),eb));}
const u64be = sn=>{const b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,sn,false);return b;};
const xorNIv=(iv,sn)=>{const n=iv.slice(),sb=u64be(sn);for(let i=0;i<8;i++)n[n.length-8+i]^=sb[i];return n;};
const dTK=(h,s,kl,il)=>Promise.all([hkdfL2(h,s,"key",EMPTY,kl),hkdfL2(h,s,"iv",EMPTY,il)]);
class TlsClient{
	constructor(socket,opts={}){
		this.socket=socket;this.serverName=opts.serverName||"";this.supportTls13=!1!==opts.tls13;this.supportTls12=!1!==opts.tls12;
		this.alpnProtocols=Array.isArray(opts.alpn)?opts.alpn:opts.alpn?[opts.alpn]:null;
		this.allowChacha=opts.allowChacha!==false;this.timeout=opts.timeout??30000;
		this.clientRandom=randB(32);this.serverRandom=null;this.handshakeChunks=[];this.handshakeComplete=false;
		this.negotiatedAlpn=null;this.cipherSuite=null;this.cipherConfig=null;this.isTls13=false;
		this.masterSecret=null;this.handshakeSecret=null;
		this.clientWriteKey=null;this.serverWriteKey=null;this.clientWriteIv=null;this.serverWriteIv=null;
		this.clientHandshakeKey=null;this.serverHandshakeKey=null;this.clientHandshakeIv=null;this.serverHandshakeIv=null;
		this.clientAppKey=null;this.serverAppKey=null;this.clientAppIv=null;this.serverAppIv=null;
		this.clientWriteCryptoKey=null;this.serverWriteCryptoKey=null;
		this.clientHandshakeCryptoKey=null;this.serverHandshakeCryptoKey=null;
		this.clientAppCryptoKey=null;this.serverAppCryptoKey=null;
		this.clientSeqNum=0n;this.serverSeqNum=0n;
		this.recordParser=new RP;this.handshakeParser=new HP;
		this.keyPairs=new Map;this.ecdhKeyPair=null;this.sawCert=false;
	}
	recHS(c){this.handshakeChunks.push(c);}
	transcript(){return 1===this.handshakeChunks.length?this.handshakeChunks[0]:tlsCat(...this.handshakeChunks);}
	getCipherConfig(cs){return CIPHERS2.get(cs)||null;}
	async readChunk(r){return this.timeout?Promise.race([r.read(),new Promise(((_,rej)=>setTimeout(()=>rej(new Error("TLS timeout")),this.timeout)))]):r.read();}
	async readRecsUntil(r,pred,err){for(;;){let rec;for(;rec=this.recordParser.next();)if(await pred(rec))return;const{value,done}=await this.readChunk(r);if(done)throw new Error(err);this.recordParser.feed(value);}}
	async readHSUntil(r,pred,err){for(let m;m=this.handshakeParser.next();)if(await pred(m))return;return this.readRecsUntil(r,async rec=>{if(rec.type===CT_ALERT){if(shouldIgnoreAlert2(rec.fragment))return;throw new Error(`TLS Alert: ${rec.fragment[1]}`);}if(rec.type===CT_HANDSHAKE){this.handshakeParser.feed(rec.fragment);for(let m;m=this.handshakeParser.next();)if(await pred(m))return 1;}},err);}
	async acceptCert(c){if(!c?.length)throw new Error("Empty cert");this.sawCert=true;}
	async handshake(){
		const[p256,x25519]=await Promise.all([gks2("P-256"),gks2("X25519")]);
		this.keyPairs=new Map([[23,p256],[29,x25519]]);this.ecdhKeyPair=p256.keyPair;
		const reader=this.socket.readable.getReader(),writer=this.socket.writable.getWriter();
		try{const ch=bCH(this.clientRandom,this.serverName,{x25519:x25519.publicKeyRaw,p256:p256.publicKeyRaw},{tls13:this.supportTls13,tls12:this.supportTls12,alpn:this.alpnProtocols,chacha:this.allowChacha});this.recHS(ch);await writer.write(bRec(CT_HANDSHAKE,ch,TLS_V10));const sh=await this.recvSH(reader);if(sh.isHRR)throw new Error("HRR not supported");if(sh.keyShare?.group&&this.keyPairs.has(sh.keyShare.group)){const kp=this.keyPairs.get(sh.keyShare.group);this.ecdhKeyPair=kp.keyPair;}sh.isTls13?await this.hs13(reader,writer,sh):await this.hs12(reader,writer);this.handshakeComplete=true;}finally{reader.releaseLock();writer.releaseLock();}
	}
	async recvSH(reader){for(;;){const{value,done}=await this.readChunk(reader);if(done)throw new Error("Closed waiting ServerHello");let rec;for(this.recordParser.feed(value);rec=this.recordParser.next();){if(rec.type===CT_ALERT){if(shouldIgnoreAlert2(rec.fragment))continue;throw new Error(`TLS Alert: ${rec.fragment[1]}`);}if(rec.type!==CT_HANDSHAKE)continue;let msg;for(this.handshakeParser.feed(rec.fragment);msg=this.handshakeParser.next();){if(msg.type!==HS_SERVER_HELLO)continue;this.recHS(msg.raw);const sh=pSH(msg.body);this.serverRandom=sh.serverRandom;this.cipherSuite=sh.cipherSuite;this.cipherConfig=this.getCipherConfig(sh.cipherSuite);this.isTls13=sh.isTls13;this.negotiatedAlpn=sh.alpn||null;if(!this.cipherConfig)throw new Error(`Unsupported cipher: 0x${sh.cipherSuite.toString(16)}`);return sh;}}}}
	async hs12(reader,writer){let skex=null,sawDone=false;if(await this.readHSUntil(reader,async msg=>{switch(msg.type){case HS_CERTIFICATE:{this.recHS(msg.raw);const c=extCert(msg.body,1);if(!c)throw new Error("Missing cert");await this.acceptCert(c);break;}case HS_SERVER_KEY_EXCHANGE:this.recHS(msg.raw);skex=pSKE(msg.body);break;case HS_SERVER_HELLO_DONE:return this.recHS(msg.raw),sawDone=true,1;case HS_CERT_REQUEST:throw new Error("Client cert not supported");default:this.recHS(msg.raw);}},"TLS 1.2 closed"),!this.sawCert)throw new Error("Missing cert");if(!skex)throw new Error("Missing SKE");const cn=GROUPS2.get(skex.namedCurve);if(!cn)throw new Error(`Unsupported curve: 0x${skex.namedCurve.toString(16)}`);const kp=this.keyPairs.get(skex.namedCurve);if(!kp)throw new Error("Missing key pair");const pms=await ds2(kp.keyPair.privateKey,skex.serverPublicKey,cn);const cke=bHS(HS_CLIENT_KEY_EXCHANGE,tlsCat(new Uint8Array([skex.publicKeyRaw.length]),skex.publicKeyRaw));this.recHS(cke);const h=this.cipherConfig.hash;this.masterSecret=await prf12(pms,"master secret",tlsCat(this.clientRandom,this.serverRandom),48,h);const kl=this.cipherConfig.keyLen,il=this.cipherConfig.ivLen;const kb=await prf12(this.masterSecret,"key expansion",tlsCat(this.serverRandom,this.clientRandom),2*kl+2*il,h);this.clientWriteKey=kb.slice(0,kl);this.serverWriteKey=kb.slice(kl,2*kl);this.clientWriteIv=kb.slice(2*kl,2*kl+il);this.serverWriteIv=kb.slice(2*kl+il,2*kl+2*il);if(!this.cipherConfig.chacha)[this.clientWriteCryptoKey,this.serverWriteCryptoKey]=await Promise.all([impKey(this.clientWriteKey,["encrypt"]),impKey(this.serverWriteKey,["decrypt"])]);await writer.write(bRec(CT_HANDSHAKE,cke));await writer.write(bRec(CT_CHANGE_CIPHER,new Uint8Array([1])));const vd=await prf12(this.masterSecret,"client finished",await dg2(h,this.transcript()),12,h);const fm=bHS(HS_FINISHED,vd);this.recHS(fm);await writer.write(bRec(CT_HANDSHAKE,await this.enc12(fm,CT_HANDSHAKE)));let sawCCS=false;await this.readRecsUntil(reader,async rec=>{if(rec.type===CT_ALERT){if(shouldIgnoreAlert2(rec.fragment))return;throw new Error(`TLS Alert: ${rec.fragment[1]}`);}if(rec.type===CT_CHANGE_CIPHER)return void(sawCCS=true);if(rec.type!==CT_HANDSHAKE||!sawCCS)return;const d=await this.dec12(rec.fragment,CT_HANDSHAKE);if(d[0]!==HS_FINISHED)return;const vl=rU24b(d,1),evd=await prf12(this.masterSecret,"server finished",await dg2(h,this.transcript()),12,h);if(!ctEq(d.slice(4,4+vl),evd))throw new Error("TLS 1.2 Finished verify failed");return 1;},"TLS 1.2 Finished closed");}
	async hs13(reader,writer,sh){const gn=GROUPS2.get(sh.keyShare?.group);if(!gn||!sh.keyShare?.key?.length)throw new Error("Missing key_share");const h=this.cipherConfig.hash,hl=hLen2(h),kl=this.cipherConfig.keyLen,il=this.cipherConfig.ivLen;const ss=await ds2(this.ecdhKeyPair.privateKey,sh.keyShare.key,gn);const es=await hkdfE2(h,null,new Uint8Array(hl));const dv=await hkdfL2(h,es,"derived",await dg2(h,EMPTY),hl);this.handshakeSecret=await hkdfE2(h,dv,ss);const th=await dg2(h,this.transcript());const chts=await hkdfL2(h,this.handshakeSecret,"c hs traffic",th,hl);const shts=await hkdfL2(h,this.handshakeSecret,"s hs traffic",th,hl);[this.clientHandshakeKey,this.clientHandshakeIv]=await dTK(h,chts,kl,il);[this.serverHandshakeKey,this.serverHandshakeIv]=await dTK(h,shts,kl,il);if(!this.cipherConfig.chacha)[this.clientHandshakeCryptoKey,this.serverHandshakeCryptoKey]=await Promise.all([impKey(this.clientHandshakeKey,["encrypt"]),impKey(this.serverHandshakeKey,["decrypt"])]);const sfk=await hkdfL2(h,shts,"finished",EMPTY,hl);let sfRcvd=false;const handleMsg=async msg=>{switch(msg.type){case HS_ENCRYPTED_EXT:{const ee=pEE(msg.body);ee.alpn&&(this.negotiatedAlpn=ee.alpn);this.recHS(msg.raw);break;}case HS_CERTIFICATE:{const c=extCert(msg.body);if(!c)throw new Error("Missing cert");await this.acceptCert(c);this.recHS(msg.raw);break;}case HS_CERT_REQUEST:throw new Error("Client cert not supported");case HS_CERT_VERIFY:this.recHS(msg.raw);break;case HS_FINISHED:{const evd=await hm2(h,sfk,await dg2(h,this.transcript()));if(!ctEq(evd,msg.body))throw new Error("TLS 1.3 Finished verify failed");this.recHS(msg.raw);sfRcvd=true;break;}default:this.recHS(msg.raw);}};await this.readRecsUntil(reader,async rec=>{if(rec.type===CT_CHANGE_CIPHER||rec.type===CT_HANDSHAKE)return;if(rec.type===CT_ALERT){if(shouldIgnoreAlert2(rec.fragment))return;throw new Error(`TLS Alert: ${rec.fragment[1]}`);}if(rec.type!==CT_APP_DATA)return;const d=await this.d13HS(rec.fragment);const it=d[d.length-1];const pt=d.slice(0,-1);if(it===CT_HANDSHAKE){this.handshakeParser.feed(pt);for(let m;m=this.handshakeParser.next();)if(await handleMsg(m),sfRcvd)return 1;}},"TLS 1.3 closed");const ath=await dg2(h,this.transcript());const mds=await hkdfL2(h,this.handshakeSecret,"derived",await dg2(h,EMPTY),hl);const ms=await hkdfE2(h,mds,new Uint8Array(hl));const cats=await hkdfL2(h,ms,"c ap traffic",ath,hl);const sats=await hkdfL2(h,ms,"s ap traffic",ath,hl);[this.clientAppKey,this.clientAppIv]=await dTK(h,cats,kl,il);[this.serverAppKey,this.serverAppIv]=await dTK(h,sats,kl,il);if(!this.cipherConfig.chacha)[this.clientAppCryptoKey,this.serverAppCryptoKey]=await Promise.all([impKey(this.clientAppKey,["encrypt"]),impKey(this.serverAppKey,["decrypt"])]);const cfk=await hkdfL2(h,chts,"finished",EMPTY,hl);const cfd=await hm2(h,cfk,await dg2(h,this.transcript()));const cfm=bHS(HS_FINISHED,cfd);this.recHS(cfm);await writer.write(bRec(CT_APP_DATA,await this.e13HS(tlsCat(cfm,new Uint8Array([CT_HANDSHAKE])))));this.clientSeqNum=0n;this.serverSeqNum=0n;}
	async enc12(pt,ct){const sn=this.clientSeqNum++,sb=u64be(sn),ad=tlsCat(sb,new Uint8Array([ct]),new Uint8Array(u16be2(TLS_V12)),new Uint8Array(u16be2(pt.length)));if(this.cipherConfig.chacha){const n=xorNIv(this.clientWriteIv,sn);return chEnc(this.clientWriteKey,n,pt,ad);}const en=randB(8);if(!this.clientWriteCryptoKey)this.clientWriteCryptoKey=await impKey(this.clientWriteKey,["encrypt"]);return tlsCat(en,await aesE(this.clientWriteCryptoKey,tlsCat(this.clientWriteIv,en),pt,ad));}
	async dec12(ct,ct2){const sn=this.serverSeqNum++,sb=u64be(sn);if(this.cipherConfig.chacha){const n=xorNIv(this.serverWriteIv,sn);return chDec(this.serverWriteKey,n,ct,tlsCat(sb,new Uint8Array([ct2]),new Uint8Array(u16be2(TLS_V12)),new Uint8Array(u16be2(ct.length-16))));}const en=ct.subarray(0,8),ed=ct.subarray(8);if(!this.serverWriteCryptoKey)this.serverWriteCryptoKey=await impKey(this.serverWriteKey,["decrypt"]);return aesD(this.serverWriteCryptoKey,tlsCat(this.serverWriteIv,en),ed,tlsCat(sb,new Uint8Array([ct2]),new Uint8Array(u16be2(TLS_V12)),new Uint8Array(u16be2(ed.length-16))));}
	async e13HS(pt){const n=xorNIv(this.clientHandshakeIv,this.clientSeqNum++),ad=tlsCat(new Uint8Array([CT_APP_DATA,3,3]),new Uint8Array(u16be2(pt.length+16)));if(this.cipherConfig.chacha)return chEnc(this.clientHandshakeKey,n,pt,ad);if(!this.clientHandshakeCryptoKey)this.clientHandshakeCryptoKey=await impKey(this.clientHandshakeKey,["encrypt"]);return aesE(this.clientHandshakeCryptoKey,n,pt,ad);}
	async d13HS(ct){const n=xorNIv(this.serverHandshakeIv,this.serverSeqNum++),ad=tlsCat(new Uint8Array([CT_APP_DATA,3,3]),new Uint8Array(u16be2(ct.length)));const d=this.cipherConfig.chacha?await chDec(this.serverHandshakeKey,n,ct,ad):await aesD(this.serverHandshakeCryptoKey||(this.serverHandshakeCryptoKey=await impKey(this.serverHandshakeKey,["decrypt"])),n,ct,ad);let i=d.length-1;for(;i>=0&&!d[i];)i--;return i<0?EMPTY:d.slice(0,i+1);}
	async enc13(data){const pt=tlsCat(data,new Uint8Array([CT_APP_DATA])),n=xorNIv(this.clientAppIv,this.clientSeqNum++),ad=tlsCat(new Uint8Array([CT_APP_DATA,3,3]),new Uint8Array(u16be2(pt.length+16)));if(this.cipherConfig.chacha)return chEnc(this.clientAppKey,n,pt,ad);if(!this.clientAppCryptoKey)this.clientAppCryptoKey=await impKey(this.clientAppKey,["encrypt"]);return aesE(this.clientAppCryptoKey,n,pt,ad);}
	async dec13(ct){const n=xorNIv(this.serverAppIv,this.serverSeqNum++),ad=tlsCat(new Uint8Array([CT_APP_DATA,3,3]),new Uint8Array(u16be2(ct.length)));const pt=this.cipherConfig.chacha?await chDec(this.serverAppKey,n,ct,ad):await aesD(this.serverAppCryptoKey||(this.serverAppCryptoKey=await impKey(this.serverAppKey,["decrypt"])),n,ct,ad);let i=pt.length-1;for(;i>=0&&!pt[i];)i--;if(i<0)return{data:EMPTY,type:0};return{data:pt.slice(0,i),type:pt[i]};}
	async write(data){if(!this.handshakeComplete)throw new Error("Handshake not complete");const pt=toUint8Array(data);if(!pt.byteLength)return;const w=this.socket.writable.getWriter();try{const recs=[];for(let off=0;off<pt.byteLength;off+=TMAX){const c=pt.subarray(off,Math.min(off+TMAX,pt.byteLength));const e=this.isTls13?await this.enc13(c):await this.enc12(c,CT_APP_DATA);recs.push(bRec(CT_APP_DATA,e));}await w.write(recs.length===1?recs[0]:tlsCat(...recs));}finally{w.releaseLock();}}
	async read(){for(;;){let rec;for(;rec=this.recordParser.next();){if(rec.type===CT_ALERT){if(rec.fragment[1]===ALERT_CLOSE)return null;throw new Error(`TLS Alert: ${rec.fragment[1]}`);}if(rec.type!==CT_APP_DATA)continue;if(!this.isTls13)return this.dec12(rec.fragment,CT_APP_DATA);const{data,type}=await this.dec13(rec.fragment);if(type===CT_APP_DATA)return data;if(type===CT_ALERT){if(data[1]===ALERT_CLOSE)return null;throw new Error(`TLS Alert: ${data[1]}`);}if(type!==CT_HANDSHAKE)continue;for(this.handshakeParser.feed(data);(rec=this.handshakeParser.next());)if(rec.type!==HS_NEW_SESSION_TICKET&&rec.type===HS_KEY_UPDATE)throw new Error("KeyUpdate not supported");}const reader=this.socket.readable.getReader();try{const{value,done}=await this.readChunk(reader);if(done)return null;this.recordParser.feed(value);}finally{reader.releaseLock();}}}
	close(){this.socket.close();}
}
