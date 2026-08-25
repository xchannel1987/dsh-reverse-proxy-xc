
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3080,
  path: '/plugins/@deepseek-ai/dsh-client-connection/client.js',
  method: 'GET',
  headers: {
    'Accept-Encoding': 'identity'
  }
};

console.log('Testing DSH client.js...');

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Content-Encoding:', res.headers['content-encoding'] || 'none');
  
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => {
    const data = Buffer.concat(chunks).toString('utf8');
    console.log('Data length:', data.length);
    
    // 搜索关键代码
    const idx = data.indexOf('isLoopbackHostname(pageLocation.hostname)');
    if (idx >= 0) {
      console.log('Pattern found!');
      console.log('Context:', data.slice(idx - 30, idx + 80));
    } else {
      console.log('Pattern NOT found - checking alternatives...');
      if (data.includes('isLoopbackHostname')) {
        console.log('isLoopbackHostname function exists');
      }
      if (data.includes('pageLocation')) {
        console.log('pageLocation exists');
      }
    }
  });
});

req.on('error', (e) => console.log('Error:', e.message));
req.end();
