
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3090,  // 通过代理端口
  path: '/plugins/@deepseek-ai/dsh-client-connection/client.js',
  method: 'GET',
  headers: {
    'Accept-Encoding': 'identity'
  }
};

console.log('Testing via PROXY (port 3090)...');

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Cache-Control:', res.headers['cache-control'] || 'not set');
  
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const data = Buffer.concat(chunks).toString('utf8');
    console.log('Data length:', data.length);
    
    // 搜索原始模式
    const originalIdx = data.indexOf('isLoopbackHostname(pageLocation.hostname)');
    // 搜索 patch 后的模式
    const patchedIdx = data.indexOf('pageLocation === void 0 || true');
    
    if (patchedIdx >= 0) {
      console.log('SUCCESS! Patch applied!');
      console.log('Patched context:', data.slice(patchedIdx - 20, patchedIdx + 50));
    } else if (originalIdx >= 0) {
      console.log('FAIL! Original code found (not patched)');
      console.log('Original context:', data.slice(originalIdx - 20, originalIdx + 60));
    } else {
      console.log('Neither pattern found - checking...');
      console.log('Contains isLoopbackHostname:', data.includes('isLoopbackHostname'));
    }
  });
});

req.on('error', (e) => console.log('Error:', e.message));
req.end();
