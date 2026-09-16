// dsh-reverse-proxy-xc reverse-proxy core.
// Forwards HTTP and WebSocket traffic to the DSH loopback webServer while
// rewriting Host/Origin to the loopback authority so the /api browser-trust
// fence always sees a loopback request (LAN and remote clients both work
// without touching any DSH configuration). Injects a crypto.randomUUID
// polyfill into the HTML document: the DSH frontend calls
// `crypto.randomUUID` when minting RPC ids, and browsers in insecure
// contexts (http://<LAN-IP>:port) do not expose it — without the polyfill
// the page throws "crypto.randomUUID is not a function".
//
// Additionally patches the dsh-client-connection bundle to force isLoopback=true,
// enabling settings/credentials panels in LAN proxy mode.
'use strict';
import { createServer, request as httpRequest } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

const DEFAULT_UPSTREAM = { host: '127.0.0.1', port: 3080 };
const INJECT_MARK = 'data-dsh-reverse-proxy-xc-polyfill="1"';
// 认证 cookie 名（HttpOnly + 持久）。
const AUTH_COOKIE = 'dsh_reverse_proxy_xc_auth';
// 认证 token 的固定盐。内部系统从简：token 只与 user:pass + 本盐相关，
// 不含进程 pid / 随机数 —— 因此重启后签出的 token 不变，已发 cookie
// 依旧有效，无需重新认证。（改动此盐会使所有已发 cookie 失效。）
const AUTH_SALT = 'dsh-reverse-proxy-xc:v1';
// crypto.randomUUID polyfill（非安全上下文必需）
const RANDOM_UUID_POLYFILL = `<script data-dsh-reverse-proxy-xc-polyfill="1">!function(){try{if(self.crypto&&!self.crypto.randomUUID){self.crypto.randomUUID=function(){var b=new Uint8Array(16);self.crypto.getRandomValues(b);b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h="";for(var i=0;i<16;i++){var x=b[i].toString(16);h+=(x.length<2?"0":"")+x;if(i===3||i===5||i===7||i===9)h+="-";}return h;}}}catch(e){}}();</script>`;

// client-connection bundle 中需要 patch 的路径
const CLIENT_CONNECTION_PATH = '/plugins/@deepseek-ai/dsh-client-connection/client.js';
// isLoopback 判断的代码模式：isLoopbackHostname(pageLocation.hostname)
// 替换为 true（让前端认为在 loopback 环境）
const ISLOOPBACK_PATCH_PATTERN = /isLoopbackHostname\(pageLocation\.hostname\)/g;
const ISLOOPBACK_PATCH_REPLACEMENT = 'true';

/** 判断请求路径是否是 client-connection bundle */
function isClientConnectionBundle(url) {
  // 匹配 /plugins/@deepseek-ai/dsh-client-connection/client.js
  // 可能有查询参数如 ?rev=xxx
  const path = url.split('?')[0];
  return path === CLIENT_CONNECTION_PATH;
}

/** patch client-connection bundle 内容 */
function patchClientConnectionBundle(content) {
  // 将 isLoopbackHostname(pageLocation.hostname) 替换为 true
  // 这样前端会认为在 loopback 环境，启用 settings/credentials 面板
  if (!ISLOOPBACK_PATCH_PATTERN.test(content)) return content;
  return content.replace(ISLOOPBACK_PATCH_PATTERN, ISLOOPBACK_PATCH_REPLACEMENT);
}

/** HMAC-SHA256 签名（固定盐，确定性）：token 跨进程/重启稳定。 */
function makeSigner(secret = AUTH_SALT) {
  const key = createHash('sha256').update(String(secret)).digest();
  return (payload) => createHash('sha256').update(`${payload}.${key.toString('hex')}`).digest('hex').slice(0, 32);
}

/** 解析 Basic 头 -> {user, pass} 或 null。 */
function parseBasic(header) {
  if (typeof header !== 'string') return null;
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch { return null; }
}

/** 认证检查：返回 {ok:true} 或 {ok:false, token?}。token 存在时表示应种 cookie。 */
function checkAuth(req, auth, sign) {
  if (!auth || !auth.enabled) return { ok: true };
  const expectedUser = String(auth.user ?? '');
  const expectedPass = String(auth.pass ?? '');

  // 1) cookie 优先
  const cookies = String(req.headers.cookie ?? '');
  for (const part of cookies.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === AUTH_COOKIE) {
      const payload = `${expectedUser}:${expectedPass}`;
      const expected = sign(payload);
      const a = Buffer.from(String(value ?? ''));
      const b = Buffer.from(String(expected ?? ''));
      if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
    }
  }

  // 2) Basic 头
  const basic = parseBasic(req.headers.authorization);
  if (basic && basic.user === expectedUser && basic.pass === expectedPass) {
    // Basic 正确 -> 签发 cookie token
    const token = sign(`${expectedUser}:${expectedPass}`);
    return { ok: true, token };
  }

  return { ok: false };
}

/** 401 响应（Basic 挑战）。 */
function sendUnauthorized(res) {
  const body = 'Authentication required';
  res.writeHead(401, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'www-authenticate': 'Basic realm="dsh-reverse-proxy-xc"',
    'cache-control': 'no-store',
  });
  res.end(body);
}

/** 种认证 cookie 的 Set-Cookie 头（HttpOnly、持久 30 天）。 */
function authCookieHeader(token) {
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toUTCString();
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

/** 把认证 cookie 追加到响应头（保留上游已有的 set-cookie）。 */
function appendSetCookie(headers, cookie) {
  if (!cookie) return;
  const existing = headers['set-cookie'];
  headers['set-cookie'] = existing
    ? [cookie, ...(Array.isArray(existing) ? existing : [existing])]
    : [cookie];
}

/** Whether the upstream response is compressed (text injection corrupts it). */
function isCompressed(headers) {
  return /(^|,\s*)(gzip|br|deflate)(\s*,|$)/i.test(String(headers['content-encoding'] ?? ''));
}

/** Rewrite browser-visible authority to the loopback authority (Host + Origin). */
function loopbackAuthority(headers, upstream) {
  const authority = `${upstream.host}:${upstream.port}`;
  const out = { ...headers };
  out.host = authority;
  if (out.origin) out.origin = `http://${authority}`;
  if (out.Origin) out.Origin = `http://${authority}`;
  return out;
}

/** 新 DSH (0.1.2-alpha.3) 的浏览器会话 cookie 名：dsh-auth-<sha256(authority) base64url>。
 *  与 @deepseek-ai/dsh-client-connection 的 cookieName() 完全一致，用于判断
 *  代理链路是否已持有 loopback authority 的鉴权 cookie。 */
function loopbackAuthCookieName(upstream) {
  const authority = `${upstream.host}:${upstream.port}`;
  return 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url');
}

/** 请求 Cookie 中是否已携带指定名（authority 绑定）的会话 cookie。 */
function cookieHas(rawCookie, name) {
  if (!rawCookie) return false;
  for (const part of String(rawCookie).split(';')) {
    const eq = part.indexOf('=');
    const n = eq === -1 ? part.trim() : part.slice(0, eq).trim();
    if (n === name) return true;
  }
  return false;
}

/** 将指定名和值的 cookie 注入到 cookie 字符串中（若存在同名 cookie 则替换，否则追加）。 */
function setOrReplaceCookie(rawCookie, name, value) {
  const parts = rawCookie ? String(rawCookie).split(';').map((p) => p.trim()).filter(Boolean) : [];
  let found = false;
  const next = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    const n = eq === -1 ? part : part.slice(0, eq).trim();
    if (n === name) {
      next.push(`${name}=${value}`);
      found = true;
    } else {
      next.push(part);
    }
  }
  if (!found) {
    next.push(`${name}=${value}`);
  }
  return next.join('; ');
}

/**
 * Start the LAN proxy.
 * @param {object} opts
 * @param {number} [opts.port] - listen port (default 3090; dsh web stays 3080).
 * @param {string} [opts.host] - listen address (default 0.0.0.0: LAN + tunnel both reachable).
 * @param {{host:string,port:number}} [opts.upstream] - upstream dsh web (default 127.0.0.1:3080).
 * @param {(msg:string)=>void} [opts.log] - optional logger.
 * @param {string} [opts.injectHtml] - HTML to inject (default randomUUID polyfill; pass '' to disable).
 * @param {{enabled:boolean,user:string,pass:string}} [opts.auth] - optional Basic-auth gate.
 * @param {()=>string|null} [opts.getLaunchToken] - resolver for DSH launchToken.
 * @param {boolean} [opts.bypassToken] - automatically inject valid loopback session cookie for proxy traffic.
 * @returns {Promise<{server:import('node:http').Server, port:number, close:()=>Promise<void>}>}
 */
export function createLanProxy({ port = 3090, host = '0.0.0.0', upstream = DEFAULT_UPSTREAM, log = null, injectHtml = RANDOM_UUID_POLYFILL, auth = null, getLaunchToken = null, bypassToken = true } = {}) {
  // token 由固定盐 + user:pass 确定性签出，跨进程/重启稳定：
  // 已签发的 cookie 在 DSH 重启后依然有效，无需重新认证。
  const sign = makeSigner();
  // 新 DSH 鉴权：loopback authority 的浏览器会话 cookie 名（与上游一致）。
  const authCookieName = loopbackAuthCookieName(upstream);

  // bypassToken 模式：服务端缓存与自动刷新上游会话凭证
  let cachedSessionCookie = null; // { cookieValue: string, expiresAt: number } | null
  let exchangePromise = null;

  async function fetchLoopbackSessionCookie() {
    const launchToken = typeof getLaunchToken === 'function' ? getLaunchToken() : null;
    if (!launchToken) return null;

    return new Promise((resolve) => {
      const exchangeReq = httpRequest({
        host: upstream.host,
        port: upstream.port,
        method: 'GET',
        path: `/?token=${encodeURIComponent(launchToken)}`,
        headers: {
          host: `${upstream.host}:${upstream.port}`,
        },
        agent: false,
      }, (exchangeRes) => {
        const setCookies = exchangeRes.headers['set-cookie'];
        const list = Array.isArray(setCookies) ? setCookies : (setCookies ? [setCookies] : []);
        for (const sc of list) {
          const match = new RegExp(`^${authCookieName}=([^;]+)`).exec(sc);
          if (match) {
            const maxAgeMatch = /Max-Age=(\d+)/i.exec(sc);
            const maxAgeSec = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 30 * 24 * 3600;
            const expiresAt = Date.now() + Math.max(1, maxAgeSec - 60) * 1000;
            exchangeRes.resume();
            resolve({ cookieValue: match[1], expiresAt });
            return;
          }
        }
        exchangeRes.resume();
        resolve(null);
      });
      exchangeReq.on('error', (err) => {
        log?.(`[dsh-reverse-proxy-xc] fetchLoopbackSessionCookie failed: ${err.message}`);
        resolve(null);
      });
      exchangeReq.end();
    });
  }

  async function getValidSessionCookie() {
    const now = Date.now();
    if (cachedSessionCookie && cachedSessionCookie.expiresAt > now) {
      return cachedSessionCookie.cookieValue;
    }
    if (exchangePromise) {
      return exchangePromise;
    }
    exchangePromise = (async () => {
      try {
        const res = await fetchLoopbackSessionCookie();
        if (res) {
          cachedSessionCookie = res;
          log?.(`[dsh-reverse-proxy-xc] loopback session cookie acquired and cached`);
          return res.cookieValue;
        }
        return null;
      } finally {
        exchangePromise = null;
      }
    })();
    return exchangePromise;
  }

  const server = createServer(async (req, res) => {
    // 认证闸门（HTTP）
    const gate = checkAuth(req, auth, sign);
    if (!gate.ok) return sendUnauthorized(res);
    const setCookie = gate.token ? authCookieHeader(gate.token) : null;
    const headers = loopbackAuthority({ ...req.headers }, upstream);
    // 凭据只在代理层校验，不转发给上游（避免 Basic 明文进入 dsh web 进程/日志）。
    if (auth?.enabled) delete headers.authorization;

    let proxyPath = req.url;
    if (bypassToken) {
      // 免 Token 模式：自动注入有效 session cookie，使上游 3080 认证永远通过
      const validCookieVal = await getValidSessionCookie();
      if (validCookieVal) {
        headers.cookie = setOrReplaceCookie(headers.cookie, authCookieName, validCookieVal);
      }
    } else {
      // 传统模式：未开启 bypassToken 时按旧逻辑换取 cookie
      const launchToken = typeof getLaunchToken === 'function' ? getLaunchToken() : null;
      const method = String(req.method || 'GET').toUpperCase();
      if (launchToken && (method === 'GET' || method === 'HEAD')) {
        const u = new URL(req.url, 'http://dsh.invalid');
        if ((u.pathname === '/' || u.pathname === '') && !cookieHas(req.headers.cookie, authCookieName)) {
          u.searchParams.set('token', launchToken);
          proxyPath = u.pathname + u.search;
        }
      }
    }

    // 检查是否是 client-connection bundle 请求，需要 patch
    const isBundle = isClientConnectionBundle(req.url);

    // 对于 client-connection bundle，请求未压缩的内容以便 patch
    if (isBundle) {
      headers['accept-encoding'] = 'identity';
    }

    const proxyReq = httpRequest(
      { host: upstream.host, port: upstream.port, method: req.method, path: proxyPath, headers, agent: false },
      (proxyRes) => {
        // 首次 Basic 验证成功：认证 cookie 以 Set-Cookie 响应头随上游真实内容
        // 一起下发，浏览器落地即进入真实页面。此前用 200 + "ok" 占位短路，导致
        // 页面只渲染 "ok" 两个字、必须手动刷新（刷新请求带上 cookie）才能打开。
        appendSetCookie(proxyRes.headers, setCookie);
        log?.(`${req.method} ${req.url} -> ${proxyRes.statusCode}`);

        // 处理 client-connection bundle：patch isLoopback 判断
        if (isBundle && proxyRes.statusCode === 200) {
          const contentType = String(proxyRes.headers['content-type'] ?? '');
          const isJs = contentType.includes('javascript') || contentType.includes('text/plain');
          if (isJs && !isCompressed(proxyRes.headers)) {
            const chunks = [];
            proxyRes.on('data', (c) => chunks.push(c));
            proxyRes.on('end', () => {
              let js = Buffer.concat(chunks).toString('utf8');
              const originalLen = js.length;
              const patched = patchClientConnectionBundle(js);
              const patchedLen = patched.length;
              const out = Buffer.from(patched, 'utf8');
              const outHeaders = { ...proxyRes.headers };
              delete outHeaders['content-length'];
              delete outHeaders['transfer-encoding'];
              delete outHeaders['etag']; // 删除 ETag 防止缓存
              outHeaders['content-length'] = String(out.length);
              outHeaders['cache-control'] = 'no-store, no-cache, must-revalidate';
              res.writeHead(proxyRes.statusCode ?? 200, outHeaders);
              res.end(out);
              log?.(`[dsh-reverse-proxy-xc] patched client-connection bundle (isLoopback=true): ${originalLen} -> ${patchedLen} bytes`);
            });
            proxyRes.on('error', () => res.destroy());
            return;
          }
          log?.(`[dsh-reverse-proxy-xc] bundle skipped: contentType=${contentType}, compressed=${isCompressed(proxyRes.headers)}`);
        }

        const contentType = String(proxyRes.headers['content-type'] ?? '');
        // Inject only into un-compressed HTML documents (SSE/WS/JS/CSS pass through).
        if (injectHtml && contentType.includes('text/html') && !isCompressed(proxyRes.headers)) {
          const chunks = [];
          proxyRes.on('data', (c) => chunks.push(c));
          proxyRes.on('end', () => {
            let html = Buffer.concat(chunks).toString('utf8');
            if (!html.includes(INJECT_MARK)) {
              html = html.replace(/<head[^>]*>/i, (m) => `${m}${injectHtml}`);
            }
            const out = Buffer.from(html, 'utf8');
            const outHeaders = { ...proxyRes.headers };
            delete outHeaders['content-length'];
            delete outHeaders['transfer-encoding'];
            outHeaders['content-length'] = String(out.length);
            res.writeHead(proxyRes.statusCode ?? 200, outHeaders);
            res.end(out);
          });
          proxyRes.on('error', () => res.destroy());
          return;
        }
        if (bypassToken && proxyRes.statusCode === 401 && cachedSessionCookie) {
          log?.(`[dsh-reverse-proxy-xc] upstream 401 received with bypassToken, invalidating cached session cookie`);
          cachedSessionCookie = null;
        }
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
        // Either side closing must clean up the other (no stale connections).
        res.on('close', () => proxyRes.destroy());
        proxyRes.on('error', () => res.destroy());
        proxyRes.on('close', () => { if (!res.writableEnded) res.destroy(); });
      },
    );
    proxyReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`dsh-reverse-proxy-xc: cannot reach upstream dsh web (${upstream.host}:${upstream.port}) — start dsh web first | ${err.message}`);
    });
    req.pipe(proxyReq);
  });

  // WebSocket upgrade (DSH /api/events.mux + events.host streams) pass-through.
  server.on('upgrade', async (req, socket, head) => {
    // 认证闸门（WS）：浏览器 upgrade 不带 Authorization，但会带 cookie。
    const gate = checkAuth(req, auth, sign);
    if (!gate.ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="dsh-reverse-proxy-xc"\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const headers = loopbackAuthority({ ...req.headers }, upstream);
    if (auth?.enabled) delete headers.authorization;
    if (gate.token) {
      headers.cookie = setOrReplaceCookie(headers.cookie, AUTH_COOKIE, gate.token);
    }
    if (bypassToken) {
      const validCookieVal = await getValidSessionCookie();
      if (validCookieVal) {
        headers.cookie = setOrReplaceCookie(headers.cookie, authCookieName, validCookieVal);
      }
    }
    const proxyReq = httpRequest({
      host: upstream.host, port: upstream.port, method: req.method, path: req.url, headers, agent: false,
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      const raw = [];
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        raw.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      }
      socket.write(`${raw.join('\r\n')}\r\n\r\n`);
      if (proxyHead?.length) socket.write(proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
      const teardown = () => { try { proxySocket.destroy(); } catch { /* ignore */ } try { socket.destroy(); } catch { /* ignore */ } };
      proxySocket.on('close', teardown);
      socket.on('close', teardown);
    });
    // Upstream answered a normal HTTP response (not 101): write status/headers back then close.
    proxyReq.on('response', (proxyRes) => {
      if (proxyRes.statusCode === 101) return;
      try {
        const raw = [`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage ?? ''}`.trim()];
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          raw.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        }
        socket.end(raw.join('\r\n') + '\r\n\r\n');
        proxyRes.resume();
      } catch { socket.destroy(); }
    });
    proxyReq.on('error', () => socket.destroy());
    // The browser may emit its first frame (e.g. the mux stream's initial RPC)
    // right after the handshake; node puts it in the upgrade event's `head`.
    // Write it into proxyReq before end() so the upstream sees it inside the
    // upgrade event (same as a direct connection). Writing after the 101
    // arrives turns it into late socket data DSH's mux protocol may miss.
    if (head?.length) proxyReq.write(head);
    proxyReq.end();
    socket.on('error', () => socket.destroy());
  });

  // Track all TCP connections (incl. post-upgrade sockets — node's
  // closeAllConnections does not include them); without manual destroy,
  // close() waits forever.
  const clientSockets = new Set();
  server.on('connection', (sock) => {
    clientSockets.add(sock);
    sock.on('close', () => clientSockets.delete(sock));
    sock.on('error', () => { /* prevent unhandled error crash */ });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actualPort = server.address().port;
      resolve({
        server,
        port: actualPort,
        close: () => new Promise((r) => {
          // server.close() 会等所有连接结束才回调；已升级为 WebSocket 的
          // socket 不在 closeAllConnections() 覆盖内，所以仍要手动 destroy
          // 已跟踪的 clientSockets。加超时兜底：即使某条连接迟迟不关闭，
          // close() 也保证 resolve —— 避免 DSH 关机/热停时进程卡在 dispose，
          // 让旧进程一直占用代理端口（重启时新实例 EADDRINUSE 的根源之一）。
          const settle = () => r();
          const timer = setTimeout(() => { settle(); }, 1500);
          if (typeof timer.unref === 'function') timer.unref();
          for (const s of clientSockets) { try { s.destroy(); } catch { /* ignore */ } }
          server.closeAllConnections?.();
          server.close(() => { clearTimeout(timer); settle(); });
        }),
      });
    });
  });
}

export { INJECT_MARK, RANDOM_UUID_POLYFILL };