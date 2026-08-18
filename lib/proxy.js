// dsh-lan-proxy reverse-proxy core (inspired by dsh-pocket's proxy.mjs).
// Forwards HTTP and WebSocket traffic to the DSH loopback webServer while
// rewriting Host/Origin to the loopback authority so the /api browser-trust
// fence always sees a loopback request (LAN and remote clients both work
// without touching any DSH configuration). Injects a crypto.randomUUID
// polyfill into the HTML document: the DSH frontend calls
// `crypto.randomUUID` when minting RPC ids, and browsers in insecure
// contexts (http://<LAN-IP>:port) do not expose it — without the polyfill
// the page throws "crypto.randomUUID is not a function".
'use strict';
import { createServer, request as httpRequest } from 'node:http';

const DEFAULT_UPSTREAM = { host: '127.0.0.1', port: 3080 };
const INJECT_MARK = 'data-dsh-lan-proxy-polyfill="1"';

const RANDOM_UUID_POLYFILL = `<script data-dsh-lan-proxy-polyfill="1">!function(){try{if(self.crypto&&!self.crypto.randomUUID){self.crypto.randomUUID=function(){var b=new Uint8Array(16);self.crypto.getRandomValues(b);b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h="";for(var i=0;i<16;i++){var x=b[i].toString(16);h+=(x.length<2?"0":"")+x;if(i===3||i===5||i===7||i===9)h+="-";}return h;}}}catch(e){}}();</script>`;

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

/**
 * Start the LAN proxy.
 * @param {object} opts
 * @param {number} [opts.port] - listen port (default 15151; dsh web stays 3080).
 * @param {string} [opts.host] - listen address (default 0.0.0.0: LAN + tunnel both reachable).
 * @param {{host:string,port:number}} [opts.upstream] - upstream dsh web (default 127.0.0.1:3080).
 * @param {(msg:string)=>void} [opts.log] - optional logger.
 * @param {string} [opts.injectHtml] - HTML to inject (default randomUUID polyfill; pass '' to disable).
 * @returns {Promise<{server:import('node:http').Server, port:number, close:()=>Promise<void>}>}
 */
export function createLanProxy({ port = 15151, host = '0.0.0.0', upstream = DEFAULT_UPSTREAM, log = null, injectHtml = RANDOM_UUID_POLYFILL } = {}) {
  const server = createServer((req, res) => {
    const headers = loopbackAuthority({ ...req.headers }, upstream);
    const proxyReq = httpRequest(
      { host: upstream.host, port: upstream.port, method: req.method, path: req.url, headers, agent: false },
      (proxyRes) => {
        log?.(`${req.method} ${req.url} -> ${proxyRes.statusCode}`);
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
      res.end(`dsh-lan-proxy: cannot reach upstream dsh web (${upstream.host}:${upstream.port}) — start dsh web first | ${err.message}`);
    });
    req.pipe(proxyReq);
  });

  // WebSocket upgrade (DSH /api/events.mux + events.host streams) pass-through.
  server.on('upgrade', (req, socket, head) => {
    const headers = loopbackAuthority({ ...req.headers }, upstream);
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
          for (const s of clientSockets) { try { s.destroy(); } catch { /* ignore */ } }
          server.close(() => r());
        }),
      });
    });
  });
}

export { INJECT_MARK, RANDOM_UUID_POLYFILL };