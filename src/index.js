// dsh-reverse-proxy-xc 插件入口：局域网反向代理（带设置开关）— DSH 0.1.7 适配
//
// 监听 0.0.0.0:3090，把 Host/Origin 改写为 loopback 后转发到本机 dsh web
//（127.0.0.1:3080），并给 HTML 注入 crypto.randomUUID polyfill（非安全
// 上下文必需）。手机/电脑连同一局域网即可访问。
//
// DSH 0.1.7 设置/配置机制变化（2026-09-22 适配）：
//   1) ctx.settings.register(ns, schema, {applies:'live'}) 已随 0.1.7 移除。
//      设置命名空间改为宿主插件「导出的 Config」声明（id = profile 条目 id），
//      字段必须标 volatile 才会被投影为可配置命名空间（见 dsh-settings 的
//      volatileForm/describe）。
//   2) config 值经 apply(ctx, config) 的 config 参数注入；设置编辑走客户端
//      configForms.set → 写 profile 条目 config（configEditor.edit 不会重载
//      已运行的插件实例，也没有旧版 scope.watch）。故「启停代理」改为
//      「配置驱动的控制路由」：客户端保存后 POST /api/dsh-reverse-proxy-xc/control
//      （connection.fetch.register 精确路由，复用官方 /api 认证围栏，与
//      dsh-token-usage-xc / dsh-session-xc 0.1.5+ 已验证模式同构），宿主据此
//      热启停（含端口/认证变更）。apply 时也按当前 config 初始化一次。
//
// 重启健壮性（两端，保留原逻辑）：
// 1) 启动端：代理端口被占用（旧实例收尾未完成、或他进程占用 3090）时绑定
//    失败绝不崩溃 DSH —— 只记错误日志并按退避重试，等端口释放后自动起来。
// 2) 退出端：apply 返回的 disposer 必须让 cordis 等到代理真正关闭，否则宿主
//    优雅退出后事件循环残留 3090 监听 handle，进程挂着不退。
import z from '@deepseek-ai/schemastery';
import { createLanProxy } from './proxy.js';

export const name = 'dsh-reverse-proxy-xc';
// 0.1.7：不再声明 settings（旧服务接口已移除）；webServer 仅用于读上游端口；
// connection 在 apply 内用 ctx.inject(['connection']) 动态获取（同 litellm/token-usage 已验证模式）。
export const inject = ['webServer'];

const NS = 'dsh-reverse-proxy-xc';

// 端口被占用（EADDRINUSE）时的退避重试计划（ms）。覆盖"旧进程还在收尾、
// 端口将很快释放"的重启窗口，使重启自愈；总时长约 7s。重试不会阻塞 DSH
// 启动（startProxy 以 void 方式运行）。
const RETRY_DELAYS = [1000, 2000, 4000];

const ProxySchema = z.object({
  enabled: z.boolean().default(false).extra('volatile', true),
  host: z.string().default('0.0.0.0').extra('volatile', true),
  port: z.number().min(1).max(65535).default(3090).extra('volatile', true),
  authEnabled: z.boolean().default(false).extra('volatile', true),
  authUser: z.string().default('admin').extra('volatile', true),
  authPass: z.string().default('123456').extra('volatile', true),
  bypassToken: z.boolean().default(true).extra('volatile', true),
});
/** 0.1.7：宿主插件导出的 Config 声明设置命名空间（id = profile 条目 id）。 */
export const Config = ProxySchema;

/**
 * 解包 volatile 字段引用：schemastery >= 3.18.4 把标了 `.extra('volatile', true)`
 * 的字段的「解析后值」包成不可变引用（官方插件写 `this.config.x.get()`），
 * 3.18.1 则是普通值。两种都归一化为普通值。
 *
 * 关键：apply(ctx, config) 收到的 config 是「经 Config schema 解析过」的值，
 * 故 volatile 字段是引用对象而非普通值。不解包会导致
 * `input.enabled === true` 恒为 false、`Number(input.port)` 恒为 NaN 回落默认
 * 3090，表现为插件静默不生效（不监听端口、不报错、无任何日志）。
 */
function readField(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value;
}

/** 归一化整份配置为普通值对象（逐字段解包 volatile 引用；普通对象原样返回）。 */
function readConfig(config) {
  const out = {};
  for (const key of Object.keys(config ?? {})) out[key] = readField(config[key]);
  return out;
}

/** 归一化一份配置（apply 的 config 或控制路由 payload）为运行参数。 */
function normalizeConfig(input = {}) {
  const plain = readConfig(input);
  const port = Number(plain.port);
  return {
    enabled: plain.enabled === true,
    host: String(plain.host || '0.0.0.0').trim() || '0.0.0.0',
    port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 3090,
    authEnabled: plain.authEnabled === true,
    authUser: String(plain.authUser ?? ''),
    authPass: String(plain.authPass ?? ''),
    bypassToken: plain.bypassToken !== false,
  };
}

export function apply(ctx, config = {}) {
  const logger = ctx.logger?.(NS) ?? console;
  const dshPort = config.dshPort ?? ctx.webServer?.port;
  if (!dshPort) {
    logger.error(`[dsh-reverse-proxy-xc] webServer port unavailable — cannot start proxy | 拿不到 dsh web 端口，无法启动代理`);
    return () => {};
  }

  let proxy = null; // { close: () => Promise<void> } | null
  // 版本号：每次 sync/stop 自增，令旧的启动/重试请求作废（防并发双绑同一
  // 端口导致的自我 EADDRINUSE，也防旧重试在配置变更后再冒出来抢占）。
  let seq = 0;
  let retryTimer = null; // 延迟重试的 setTimeout 句柄
  // 当前生效的运行参数（初始来自 apply 的 config；之后由控制路由更新）。
  let current = normalizeConfig(config);
  // 把「解析后的实际运行参数」打出来：这是本插件过去唯一会静默失效的环节
  // （配置没读对 → enabled=false → 不监听、不报错、无日志），显式留痕。
  logger.info(`[dsh-reverse-proxy-xc] config resolved: enabled=${current.enabled} host=${current.host} port=${current.port} auth=${current.authEnabled} bypassToken=${current.bypassToken} | 已解析运行参数`);
  // 启动令牌：从 connection 服务读取（browserAuth.launchToken），由代理在首页
  // 请求附上或注入 loopback session cookie 换取 authority 绑定。connection 是
  // 可选服务：拿不到令牌时按旧行为工作（代理仍转发，但不做令牌交换）。
  let launchToken = null;
  function resolveLaunchToken(conn) {
    if (!conn) return null;
    return conn.browserAuth?.launchToken
      || (conn.authenticatedUrl ? new URL(conn.authenticatedUrl('http://127.0.0.1')).searchParams.get('token') : null)
      || null;
  }
  ctx.inject(['connection'], (c) => {
    launchToken = resolveLaunchToken(c.connection) || launchToken;
  });

  function clearRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  async function stopProxy() {
    clearRetry();
    if (proxy) {
      const p = proxy;
      proxy = null;
      await p.close().catch(() => {});
    }
  }

  // 启动代理（带退避重试）。mySeq 与当前 seq 不一致说明已被更新的 sync 取代。
  // 绑定失败只记日志并按退避重试，绝不 throw —— 避免 EADDRINUSE 升级成 DSH
  // 的 "fatal load failure"（整进程退出）。
  async function startProxy(v, mySeq, attempt = 0) {
    if (mySeq !== seq || proxy) return;
    try {
      const p = await createLanProxy({
        port: v.port,
        host: v.host,
        upstream: { host: '127.0.0.1', port: dshPort },
        auth: {
          enabled: v.authEnabled,
          user: v.authUser,
          pass: v.authPass,
        },
        bypassToken: v.bypassToken !== false,
        getLaunchToken: () => {
          if (launchToken) return launchToken;
          launchToken = resolveLaunchToken(ctx.connection);
          return launchToken;
        },
      });
      if (mySeq !== seq) { await p.close().catch(() => {}); return; } // 绑定期间被新 sync 取代
      proxy = p;
      logger.info(`[dsh-reverse-proxy-xc] proxy ready on ${v.host}:${proxy.port} | 局域网代理已就绪 (http://<本机IP>:${proxy.port})${v.authEnabled ? ' [auth on]' : ''}${v.bypassToken !== false ? ' [bypass token on]' : ''}`);
    } catch (err) {
      logger.error(`[dsh-reverse-proxy-xc] proxy start failed on ${v.host}:${v.port} | 代理启动失败: ${err?.message ?? err}`);
      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        logger.warn(`[dsh-reverse-proxy-xc] port ${v.host}:${v.port} busy — retrying in ${delay}ms (${attempt + 1}/${RETRY_DELAYS.length}) | 端口被占用，${delay}ms 后重试`);
        retryTimer = setTimeout(() => { retryTimer = null; void startProxy(v, mySeq, attempt + 1); }, delay);
      } else {
        logger.error(`[dsh-reverse-proxy-xc] gave up after ${RETRY_DELAYS.length} retries — port ${v.host}:${v.port} still in use. Free the port or change the port setting, then toggle the proxy off/on. | 重试 ${RETRY_DELAYS.length} 次后放弃，端口仍被占用。请释放端口或修改设置后重新开关代理。`);
      }
    }
  }

  async function sync(v) {
    // 每次 sync 让之前的启动/重试作废：避免并发 startProxy 双双绑定同一端口
    //（一个成功、另一个 EADDRINUSE）以及旧重试在新配置生效后再冒出来。
    seq += 1;
    await stopProxy();
    if (v.enabled) void startProxy(v, seq, 0);
  }

  // 控制路由：客户端保存后 POST /api/dsh-reverse-proxy-xc/control（body =
  // {enabled, host, port, authEnabled, authUser, authPass, bypassToken}）→
  // 宿主应用新配置并热启停。connection.fetch.register 的 effect 体只写连接
  // 服务内部 Map，第三方 fiber 可注册（0.1.2-alpha.3 起存在，形态稳定）。
  ctx.inject(['connection'], (c) => {
    if (c.connection?.fetch?.register) {
      try {
        c.connection.fetch.register({
          path: '/api/dsh-reverse-proxy-xc/control',
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            try {
              const body = await request.json().catch(() => null);
              if (!body || typeof body !== 'object') {
                return Response.json({ ok: false, error: 'bad control payload' }, { status: 400 });
              }
              const next = normalizeConfig({
                enabled: body.enabled,
                host: body.host,
                port: body.port,
                authEnabled: body.authEnabled,
                authUser: body.authUser,
                authPass: body.authPass,
                bypassToken: body.bypassToken,
              });
              current = next;
              await sync(next);
              return Response.json({ ok: true, enabled: next.enabled, host: next.host, port: next.port });
            } catch (err) {
              return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
            }
          },
        });
      } catch (err) {
        console.error('[dsh-reverse-proxy-xc] control route registration failed:', err);
      }
    }
    // 初始按 apply 的 config 启停（改设置后宿主若因 profile 热重载重跑 apply，
    // 这里也会以最新 config 重新同步；客户端保存路径另有控制路由兜底）。
    void sync(current);
  });

  // cordis 的 fiber.dispose() 会 await 插件 apply 返回的 disposer（_unload 里
  // runDisposable）。这里必须返回 stopProxy() 而不是 void stopProxy() —— 否则
  // 宿主优雅退出（appExit → fiber.dispose() 完成后 process.exitCode 自然退出）
  // 不等代理关闭就继续，事件循环里残留 3090 的监听 handle，进程"挂着不退出"。
  // proxy.close() 自带 1.5s 超时兜底，这里最多多等 1.5s，换来端口必然释放。
  return () => {
    seq += 1;
    return stopProxy();
  };
}
