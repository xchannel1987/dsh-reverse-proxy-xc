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
      headers: { Host: '10.0.0.9:15151', Origin: 'http://10.0.0.9:15151' },
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
    assert.ok(body.includes('data-dsh-lan-proxy-polyfill'), '应带注入标记');
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
  assert.ok(RANDOM_UUID_POLYFILL.includes('data-dsh-lan-proxy-polyfill'));
  assert.ok(RANDOM_UUID_POLYFILL.includes('randomUUID'));
});