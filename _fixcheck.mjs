// 回归测试：volatile 配置解包（schemastery >= 3.18.4）
//
// 背景：apply(ctx, config) 收到的 config 是「经 Config schema 解析过」的值，
// 标了 .extra('volatile', true) 的字段被包成引用对象（{ get(), [write] }）。
// 若不解包，normalizeConfig 会得到 enabled=false / port=NaN，表现为插件静默
// 不生效（不监听端口、不报错、无日志）—— 见 CHANGELOG 0.1.8。
//
// 运行方式：需能解析到 @deepseek-ai/schemastery（3.18.4）。
//   方式一：在 DSH profile 目录下建临时目录，把 lib/ 与本文件拷进去再跑；
//   方式二：在本仓库 `npm i` 装齐依赖后直接 node _fixcheck.mjs。
//
// 断言：喂入 volatile 包装后的 config → 代理应真的绑定临时端口 → disposer 后释放。
const PLUGIN = new URL('./lib/index.js', import.meta.url).href;
const TEST_PORT = 15199;

const m = await import(PLUGIN);

// 关键：走 Config schema 解析 —— 这正是宿主 apply 收到的形态（volatile 引用对象）
const parsed = m.Config({
  enabled: true,
  host: '0.0.0.0',
  port: TEST_PORT,
  authEnabled: false,
  authUser: 'xchannel',
  authPass: '8076778',
  bypassToken: true,
});

console.log('== 送入 apply 的 config 形态（应看到 object / 带 .get）==');
console.log('enabled type =', typeof parsed.enabled, '| has .get =', typeof parsed.enabled?.get);
console.log('port    type =', typeof parsed.port, '| Number() =', Number(parsed.port));

const logs = [];
const mkLogger = () => ({
  info: (...a) => logs.push(['INFO', a.join(' ')]),
  warn: (...a) => logs.push(['WARN', a.join(' ')]),
  error: (...a) => logs.push(['ERROR', a.join(' ')]),
});

const ctx = {
  logger: () => mkLogger(),
  webServer: { port: 3080 },
  // 模拟 connection 服务就绪（插件用 ctx.inject(['connection'], cb) 动态注入）
  inject: (deps, cb) => { cb({ connection: { fetch: { register: () => {} } } }); },
};

const dispose = m.apply(ctx, parsed);

await new Promise((r) => setTimeout(r, 2500));

console.log('\n== 插件日志 ==');
for (const [lvl, msg] of logs) console.log(`[${lvl}] ${msg}`);

// 直接检查端口是否真的被绑定
const net = await import('node:net');
const probe = (expectOpen) => new Promise((resolve) => {
  const s = net.connect(TEST_PORT, '127.0.0.1');
  s.on('connect', () => { s.destroy(); resolve(expectOpen); });
  s.on('error', () => resolve(!expectOpen));
  s.setTimeout(1500, () => { s.destroy(); resolve(!expectOpen); });
});

const bound = await probe(true);
console.log(`\n== ${TEST_PORT} 端口可连接 ==`, bound);

const ok = bound && logs.some(([, msg]) => msg.includes('proxy ready'));
console.log('\nRESULT:', ok ? 'PASS ✅ 修复生效' : 'FAIL ❌');

await dispose();
await new Promise((r) => setTimeout(r, 800));
const closed = await probe(false);
console.log('disposer 后端口已释放 ==', closed);
process.exit(ok && closed ? 0 : 1);
