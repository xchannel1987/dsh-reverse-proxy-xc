import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpCreateServer } from 'node:http';
import { createLanProxy, RANDOM_UUID_POLYFILL } from './proxy.js';

/** 起一个最小假上游，返回 { server, port, hits }。 */
function fakeUpstream(handler) {
  const hits = [];
  const server = httpCreateServer((req, res) => {
    hits.push({ url: req.url, host: req.headers.host, origin: req.headers.origin ?? null });
    handler?.(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, hits }));
  });
}

test('createLanProxy 代理 HTTP 并改写 Host/Origin 为回环', async () => {
  const up = await fakeUpstream((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('hello');
  });
  const proxy = await createLanProxy({ port: 0, host: '127.0.0.1', upstream: { host: '127.0.0.1', port: up.port } });
  try {
    const res = await fetch(`http://127.0.0.1:${proxy.port}/api/x`, {
      headers: { Host: '10.0.0.9:3090', Origin: 'http://10.0.0.9:3090' },
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello');
    // 上游看到 Host/Origin 已被改写为回环
    assert.equal(up.hits[0].host, `127.0.0.1:${up.port}`);
    assert.equal(up.hits[0].origin, `http://127.0.0.1:${up.port}`);
  } finally {
    await proxy.close();
    up.server.close();
  }
});

test('createLanProxy 给 HTML 注入 randomUUID polyfill', async () => {
  const up = await fakeUpstream((req, res) => {
    const html = '<!doctype html><html><head><title>t</title></head><body>x</body></html>';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  const proxy = await createLanProxy({ port: 0, host: '127.0.0.1', upstream: { host: '127.0.0.1', port: up.port } });
  try {
    const res = await fetch(`http://127.0.0.1:${proxy.port}/`);
    const body = await res.text();
    assert.ok(body.includes('randomUUID'), '应注入 polyfill');
    assert.ok(body.includes('data-dsh-reverse-proxy-xc-polyfill'), '应带注入标记');
  } finally {
    await proxy.close();
    up.server.close();
  }
});

test('createLanProxy 上游不可达时返回 502', async () => {
  const proxy = await createLanProxy({ port: 0, host: '127.0.0.1', upstream: { host: '127.0.0.1', port: 1 } });
  try {
    const res = await fetch(`http://127.0.0.1:${proxy.port}/`);
    assert.equal(res.status, 502);
  } finally {
    await proxy.close();
  }
});

test('RANDOM_UUID_POLYFILL 是合法脚本且带标记', () => {
  assert.ok(RANDOM_UUID_POLYFILL.includes('data-dsh-reverse-proxy-xc-polyfill'));
  assert.ok(RANDOM_UUID_POLYFILL.includes('randomUUID'));
});
import { createHash } from 'node:crypto';

test('createLanProxy 开启 bypassToken 时自动换取并注入合法 session cookie', async () => {
  let hitToken = null;
  let hitCookie = null;
  const up = await fakeUpstream((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const token = u.searchParams.get('token');
    if (token) {
      hitToken = token;
      // 模拟 DSH 收到 token 时下发 session cookie
      const authCookieName = 'dsh-auth-' + createHash('sha256').update(req.headers.host).digest('base64url');
      res.writeHead(303, {
        'location': '/',
        'set-cookie': `${authCookieName}=valid_session_secret_xyz; Path=/; HttpOnly`,
      });
      res.end();
      return;
    }
    hitCookie = req.headers.cookie;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('authed_content');
  });

  const proxy = await createLanProxy({
    port: 0,
    host: '127.0.0.1',
    upstream: { host: '127.0.0.1', port: up.port },
    bypassToken: true,
    getLaunchToken: () => 'mock_launch_token_123',
  });

  try {
    // 客户端完全不带 Cookie 请求反代
    const res = await fetch(`http://127.0.0.1:${proxy.port}/api/data`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'authed_content');
    assert.equal(hitToken, 'mock_launch_token_123', '应当使用 mock token 向本地上游换票');
    assert.ok(hitCookie && hitCookie.includes('valid_session_secret_xyz'), '上游收到的请求应当包含自动注入的 session cookie');
  } finally {
    await proxy.close();
    up.server.close();
  }
});

test('createLanProxy 开启 bypassToken 时能替换客户端携带的失效旧 cookie', async () => {
  const up = await fakeUpstream((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const token = u.searchParams.get('token');
    if (token) {
      const authCookieName = 'dsh-auth-' + createHash('sha256').update(req.headers.host).digest('base64url');
      res.writeHead(303, {
        'location': '/',
        'set-cookie': `${authCookieName}=new_valid_cookie; Path=/; HttpOnly`,
      });
      res.end();
      return;
    }
    assert.ok(req.headers.cookie.includes('new_valid_cookie'), '上游收到的 cookie 必须是最新有效的凭证');
    assert.ok(!req.headers.cookie.includes('stale_expired_cookie'), '旧 cookie 应当被替换');
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  });

  const proxy = await createLanProxy({
    port: 0,
    host: '127.0.0.1',
    upstream: { host: '127.0.0.1', port: up.port },
    bypassToken: true,
    getLaunchToken: () => 'token_for_refresh',
  });

  try {
    const authCookieName = 'dsh-auth-' + createHash('sha256').update(`127.0.0.1:${up.port}`).digest('base64url');
    const res = await fetch(`http://127.0.0.1:${proxy.port}/`, {
      headers: {
        cookie: `${authCookieName}=stale_expired_cookie; other=1`,
      },
    });
    assert.equal(res.status, 200);
  } finally {
    await proxy.close();
    up.server.close();
  }
});
test('createLanProxy 开启 bypassToken 时 WebSocket 握手自动注入合法 session cookie', async () => {
  let wsUpstreamCookie = null;
  const up = await fakeUpstream((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const token = u.searchParams.get('token');
    if (token) {
      const authCookieName = 'dsh-auth-' + createHash('sha256').update(req.headers.host).digest('base64url');
      res.writeHead(303, {
        'location': '/',
        'set-cookie': `${authCookieName}=ws_valid_session_cookie; Path=/; HttpOnly`,
      });
      res.end();
      return;
    }
    res.writeHead(200);
    res.end();
  });

  up.server.on('upgrade', (req, socket) => {
    wsUpstreamCookie = req.headers.cookie;
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  });

  const proxy = await createLanProxy({
    port: 0,
    host: '127.0.0.1',
    upstream: { host: '127.0.0.1', port: up.port },
    bypassToken: true,
    getLaunchToken: () => 'ws_token_123',
  });

  try {
    const { connect } = await import('node:net');
    await new Promise((resolve, reject) => {
      const sock = connect(proxy.port, '127.0.0.1', () => {
        sock.write('GET /api/events.mux HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      });
      sock.on('data', (d) => {
        if (d.toString().includes('101 Switching Protocols')) {
          sock.destroy();
          resolve();
        }
      });
      sock.on('error', reject);
    });
    assert.ok(wsUpstreamCookie && wsUpstreamCookie.includes('ws_valid_session_cookie'), 'WebSocket 握手发往上游必须包含有效 session cookie');
  } finally {
    await proxy.close();
    up.server.close();
  }
});
