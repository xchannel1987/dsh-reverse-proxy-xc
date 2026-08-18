import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteHeaders } from './proxy.js';

test('rewriteHeaders rewrites host to loopback upstream', () => {
  const out = rewriteHeaders({ host: '10.100.50.125:13080' });
  assert.equal(out.host, '127.0.0.1:3080');
});

test('rewriteHeaders rewrites origin and referer when present', () => {
  const out = rewriteHeaders({
    host: '10.100.50.125:13080',
    origin: 'http://10.100.50.125:13080',
    referer: 'http://10.100.50.125:13080/some/path',
  });
  assert.equal(out.origin, 'http://127.0.0.1:3080');
  assert.equal(out.referer, 'http://127.0.0.1:3080/some/path');
});

test('rewriteHeaders leaves headers without host untouched aside from additions', () => {
  const out = rewriteHeaders({ 'user-agent': 'curl/8' });
  assert.equal(out['user-agent'], 'curl/8');
  assert.equal(out.host, '127.0.0.1:3080');
});