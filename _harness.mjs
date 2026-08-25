
import { createServer } from 'node:http';
import net from 'node:net';
import { apply } from './lib/index.js';

const PORT = 15201;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let unhandled = [];
process.on('unhandledRejection', (e) => { unhandled.push(String(e && e.stack || e)); });

let settingsCb = null;
const scope = {
  get: () => ({ enabled: true, host: '0.0.0.0', port: PORT, authEnabled: false, authUser: 'admin', authPass: 'x' }),
  watch: (fn) => {},
};
const logs = [];
const logger = { info: (m) => logs.push('INFO ' + m), warn: (m) => logs.push('WARN ' + m), error: (m) => logs.push('ERROR ' + m) };
const fakeCtx = { logger: () => logger, webServer: { port: 3080 }, inject: (svc, cb) => { settingsCb = cb; } };

async function isListening(p) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port: p });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

const blocker = createServer((req, res) => res.end('occupied'));
await new Promise((res) => blocker.listen(PORT, '0.0.0.0', res));
console.log('STEP 1: blocker listening on', PORT);

const disposer = apply(fakeCtx, {});
settingsCb({ settings: { register: () => scope } });
await sleep(400);

const failedLogs = logs.filter((l) => l.includes('proxy start failed'));
console.log('STEP 2: bind-failure logged without crash:', failedLogs.length > 0);
console.log('  first failure:', failedLogs[0] || '(none)');
console.log('  retry scheduled:', logs.some((l) => l.includes('retrying in')));

blocker.close();
console.log('STEP 3: blocker closed; waiting for 1s retry to bind...');
await sleep(1800);

const bound = await isListening(PORT);
console.log('STEP 4: proxy self-healed and listening on', PORT, '=>', bound);
console.log('  ready log:', logs.find((l) => l.includes('proxy ready')) || '(none)');

const t0 = Date.now();
disposer();
let freed = false;
for (let i = 0; i < 20; i++) {
  await sleep(150);
  if (!(await isListening(PORT))) { freed = true; break; }
}
console.log('STEP 5: port released after dispose =>', freed, 'in', Date.now() - t0, 'ms');
console.log('UNHANDLED REJECTIONS:', unhandled.length ? unhandled : 'none');

let settingsCb2 = null;
const scope2 = { get: () => ({ enabled: true, host: '0.0.0.0', port: 15202, authEnabled: false }), watch: () => {} };
const ctx2 = { logger: () => logger, webServer: { port: 3080 }, inject: (s, cb) => { settingsCb2 = cb; } };
const disposer2 = apply(ctx2, {});
settingsCb2({ settings: { register: () => scope2 } });
await sleep(400);
console.log('STEP 6: hot-sync proxy on 15202 listening =>', await isListening(15202));
disposer2();
await sleep(600);
console.log('STEP 7: 15202 released =>', !(await isListening(15202)));

process.exit(unhandled.length === 0 && bound && freed ? 0 : 1);
