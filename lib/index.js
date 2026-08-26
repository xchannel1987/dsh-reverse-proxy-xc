// dsh-reverse-proxy-xc 插件入口：局域网反向代理（带设置开关）
//
// 监听 0.0.0.0:3090，把 Host/Origin 改写为 loopback 后转发到本机 dsh web
//（127.0.0.1:3080），并给 HTML 注入 crypto.randomUUID polyfill（非安全
// 上下文必需）。手机/电脑连同一局域网即可访问。
//
// 设置（DSH 设置面板自动渲染 dsh-reverse-proxy-xc 命名空间）：
//   enabled: 是否启动反代（默认 false —— 安装后不监听任何端口，需手动开启）
//   host:    监听地址（默认 0.0.0.0）
//   port:    监听端口（默认 3090）
//
// 重启健壮性（两端）：
// 1) 启动端：代理端口被占用（旧实例收尾未完成、或他进程占用 3090）时绑定
//    失败绝不崩溃 DSH —— 只记错误日志并按退避重试，等端口释放后自动起来。
//    否则 EADDRINUSE 会以未处理的 Promise rejection 形式被 DSH 当作
//    "dsh: fatal load failure" 直接 process.exit(1)，整个 DSH 启动失败。
// 2) 退出端：apply 返回的 disposer 必须让 cordis 等到代理真正关闭（见文末），
//    否则宿主优雅退出后事件循环残留 3090 监听 handle，进程挂着不退——重启
//    helper（dsh-power-button / dsh-version-update）等旧进程消失等不到而放弃，
//    表现为"dsh 关了但 lan-proxy 端口还占着"，重启直接失败。
import z from 'schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { createLanProxy } from './proxy.js';

export const name = 'dsh-reverse-proxy-xc';
// 加载契约：仅 webServer。不声明 connection（host 侧可能无此服务，会让
// fiber 卡在解析）；也不声明 settings（可选服务，声明会导致加载失败）。
// settings 在 apply 内用 ctx.inject(["settings"]) 延迟获取（同 dsh-better-sidebar）。
export const inject = ['webServer'];

const NS = 'dsh-reverse-proxy-xc';

// 端口被占用（EADDRINUSE）时的退避重试计划（ms）。覆盖"旧进程还在收尾、
// 端口将很快释放"的重启窗口，使重启自愈；总时长约 7s。重试不会阻塞 DSH
// 启动（startProxy 以 void 方式运行）。
const RETRY_DELAYS = [1000, 2000, 4000];

const ProxySchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('0.0.0.0'),
  port: z.number().min(1).max(65535).default(3090),
  authEnabled: z.boolean().default(false),
  authUser: z.string().default('admin'),
  authPass: z.string().default('123456'),
});

export function apply(ctx, config = {}) {
  const logger = ctx.logger?.(name) ?? console;
  const dshPort = config.dshPort ?? ctx.webServer?.port;
  if (!dshPort) {
    logger.error(`dsh-reverse-proxy-xc: webServer port unavailable — cannot start proxy | 拿不到 dsh web 端口，无法启动代理`);
    return () => {};
  }

  let proxy = null; // { close: () => Promise<void> } | null
  // 版本号：每次 sync/stop 自增，令旧的启动/重试请求作废（防并发双绑同一
  // 端口导致的自我 EADDRINUSE，也防旧重试在配置变更后再冒出来抢占）。
  let seq = 0;
  let retryTimer = null; // 延迟重试的 setTimeout 句柄

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
      });
      if (mySeq !== seq) { await p.close().catch(() => {}); return; } // 绑定期间被新 sync 取代
      proxy = p;
      logger.info(`dsh-reverse-proxy-xc: proxy ready on ${v.host}:${proxy.port} | 局域网代理已就绪 (http://<本机IP>:${proxy.port})${v.authEnabled ? ' [auth on]' : ''}`);
    } catch (err) {
      logger.error(`dsh-reverse-proxy-xc: proxy start failed on ${v.host}:${v.port} | 代理启动失败: ${err?.message ?? err}`);
      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        logger.warn(`dsh-reverse-proxy-xc: port ${v.host}:${v.port} busy — retrying in ${delay}ms (${attempt + 1}/${RETRY_DELAYS.length}) | 端口被占用，${delay}ms 后重试`);
        retryTimer = setTimeout(() => { retryTimer = null; void startProxy(v, mySeq, attempt + 1); }, delay);
      } else {
        logger.error(`dsh-reverse-proxy-xc: gave up after ${RETRY_DELAYS.length} retries — port ${v.host}:${v.port} still in use. Free the port or change the port setting, then toggle the proxy off/on. | 重试 ${RETRY_DELAYS.length} 次后放弃，端口仍被占用。请释放端口或修改设置后重新开关代理。`);
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

  // settings 是可选服务（web profile 必有）。注册 dsh-reverse-proxy-xc 命名空间后，
  // 按开关启停：改设置即热启停（applies: 'live'）。config（cordis 插件配置，
  // 如 --port 覆盖）优先于 schema 默认值。
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(settingsNamespace(NS), ProxySchema, {
      applies: 'live',
      base: {
        enabled: typeof config.enabled === 'boolean' ? config.enabled : undefined,
        host: config.host,
        port: config.port,
      },
    });
    void sync(scope.get());
    scope.watch(() => { void sync(scope.get()); });
  });

  // cordis 的 fiber.dispose() 会 await 插件 apply 返回的 disposer（_unload 里
  // runDisposable）。这里必须返回 stopProxy() 而不是 void stopProxy() —— 否则
  // 宿主优雅退出（appExit → fiber.dispose() 完成后 process.exitCode 自然退出）
  // 不等代理关闭就继续，事件循环里残留 3090 的监听 handle，进程"挂着不退出"：
  // 表现为 3080 已释放、3090 仍被占（用户看到的"lan-proxy 进程没退出"），重启
  // helper 等不到旧进程消失而 giving up，DSH 起不来。proxy.close() 自带 1.5s
  // 超时兜底，这里最多多等 1.5s，换来端口必然释放、进程必然干净退出。
  return () => {
    seq += 1;
    return stopProxy();
  };
}
