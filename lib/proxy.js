// dsh-lan-proxy reverse-proxy core.
// Forwards HTTP and WebSocket traffic to the DSH loopback webServer while
// rewriting Host/Origin/Referer so the /api browser-trust fence treats
// requests as loopback-origin (privileged methods pass, no 403).
'use strict';
import http from 'node:http';
import net from 'node:net';

const LOOPBACK_AUTH = '127.0.0.1:3080';

export function rewriteHeaders(inHeaders) {
  const out = { ...inHeaders };
  out.host = LOOPBACK_AUTH;
  if (out.origin) out.origin = `http://${LOOPBACK_AUTH}`;
  if (out.referer) {
    try {
      const u = new URL(out.referer);
      u.host = LOOPBACK_AUTH;
      out.referer = u.toString();
    } catch (_) { /* keep as-is */ }
  }
  return out;
}

function writeUpgradeHead(req, headers, extra = '') {
  let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    raw += `${k}: ${Array.isArray(v) ? v.join(', ') : v}\r\n`;
  }
  raw += `\r\n${extra}`;
  return raw;
}

export function createProxyServer(upstream = { host: '127.0.0.1', port: 3080 }) {
  // Every live upgrade tunnel (client socket + upstream socket pair). Upgraded
  // sockets leave `server.connections` tracking, so closeAllConnections() is a
  // no-op for them; we must destroy them explicitly or server.close() hangs.
  const upgradedSockets = new Set();
  const server = http.createServer((req, res) => {
    const preq = http.request({
      host: upstream.host,
      port: upstream.port,
      path: req.url,
      method: req.method,
      headers: rewriteHeaders(req.headers),
    }, (pres) => {
      res.writeHead(pres.statusCode, pres.headers);
      pres.pipe(res);
      pres.on('error', () => res.destroy());
      pres.on('close', () => {
        // Upstream closed before the response completed (mid-response abort):
        // terminate the downstream response instead of leaving it hanging.
        if (!pres.complete) res.destroy();
      });
    });
    preq.on('aborted', () => res.destroy());
    preq.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy error: ${e.message}`);
    });
    res.on('close', () => {
      // Downstream closed before the response finished: tear down the
      // upstream request too so the connection is not left half-open.
      if (!res.writableEnded) preq.destroy();
    });
    req.on('error', () => preq.destroy());
    req.pipe(preq);
  });

  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(upstream.port, upstream.host, () => {
      up.write(writeUpgradeHead(req, rewriteHeaders(req.headers)));
      if (head && head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    upgradedSockets.add(socket);
    upgradedSockets.add(up);
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
    // Tear the tunnel down when either side closes: without this, a client
    // socket closing normally (tab close / refresh) leaves the upstream
    // connection hanging, blocking server.close() from ever finishing.
    // Also drop both sockets from the tracked set so closeTunnels() never
    // destroys already-freed handles. Do not rely on 'close' firing for
    // teardown: a clean FIN only emits 'end' (half-close), so deterministic
    // shutdown comes from server.closeTunnels() destroying tracked sockets.
    socket.on('close', () => {
      upgradedSockets.delete(socket);
      upgradedSockets.delete(up);
      up.destroy();
    });
    up.on('close', () => {
      upgradedSockets.delete(up);
      upgradedSockets.delete(socket);
      socket.destroy();
    });
  });

  server.closeTunnels = () => {
    for (const sock of upgradedSockets) sock.destroy();
    upgradedSockets.clear();
  };

  return server;
}