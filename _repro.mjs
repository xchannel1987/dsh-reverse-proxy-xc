
import { createServer } from 'node:http';
import { createLanProxy } from './lib/proxy.js';
const PORT = 15200;
const blocker = createServer((req,res)=>res.end('occupied'));
await new Promise((res)=>blocker.listen(PORT,'0.0.0.0',res));
console.log('blocker listening on', PORT);
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION (would become "dsh: fatal load failure"):');
  console.log(err instanceof Error ? (err.stack||err.message) : err);
  process.exit(2);
});
try {
  const p = await createLanProxy({ port: PORT, host: '0.0.0.0', upstream: {host:'127.0.0.1',port:3080} });
  console.log('proxy started (unexpected!)', p.port);
} catch (e) {
  console.log('caught rejection: code=' + e.code + ' msg=' + e.message);
}
blocker.close();
