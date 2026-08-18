// dsh-lan-proxy 插件入口：局域网反向代理（带设置开关）
//
// 监听 0.0.0.0:15151，把 Host/Origin 改写为 loopback 后转发到本机 dsh web
//（127.0.0.1:3080），并给 HTML 注入 crypto.randomUUID polyfill（非安全
// 上下文必需）。手机/电脑连同一局域网即可访问。
//
// 设置（DSH 设置面板自动渲染 dsh-proxy 命名空间）：
//   enabled: 是否启动反代（默认 false —— 安装后不监听任何端口，需手动开启）
//   host:    监听地址（默认 0.0.0.0）
//   port:    监听端口（默认 15151）
import z from 'schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { createLanProxy } from './proxy.js';

export const name = 'dsh-lan-proxy';
// 加载契约：仅 webServer。不声明 connection（host 侧可能无此服务，会让
// fiber 卡在解析）；也不声明 settings（可选服务，声明会导致加载失败）。
// settings 在 apply 内用 ctx.inject(["settings"]) 延迟获取（同 dsh-better-sidebar）。
export const inject = ['webServer'];

const NS = 'dsh-proxy';

const ProxySchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('0.0.0.0'),
  port: z.number().min(1).max(65535).default(15151),
});

export function apply(ctx, config = {}) {
  const logger = ctx.logger?.(name) ?? console;
  const dshPort = config.dshPort ?? ctx.webServer?.port;
  if (!dshPort) {
    logger.error(`dsh-lan-proxy: webServer port unavailable — cannot start proxy | 拿不到 dsh web 端口，无法启动代理`);
    return () => {};
  }

  let proxy = null; // { close: () => Promise<void> } | null

  async function stopProxy() {
    if (proxy) {
      const p = proxy;
      proxy = null;
      await p.close().catch(() => {});
    }
  }

  async function startProxy(v) {
    if (proxy) return;
    try {
      proxy = await createLanProxy({
        port: v.port,
        host: v.host,
        upstream: { host: '127.0.0.1', port: dshPort },
      });
      logger.info(`dsh-lan-proxy: proxy ready on ${v.host}:${proxy.port} | 局域网代理已就绪 (http://<本机IP>:${proxy.port})`);
    } catch (err) {
      logger.error(`dsh-lan-proxy: proxy start failed | 代理启动失败: ${err?.message ?? err}`);
      throw err;
    }
  }

  async function sync(v) {
    if (v.enabled) await startProxy(v);
    else await stopProxy();
  }

  // settings 是可选服务（web profile 必有）。注册 dsh-proxy 命名空间后，
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

  return () => {
    void stopProxy();
  };
}