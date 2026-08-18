// dsh-lan-proxy 插件入口（基于 dsh-pocket 精简：去掉隧道/扫码/更新/重启/RPC）
//
// 局域网反向代理：监听 0.0.0.0:15151，把 Host/Origin 改写为 loopback 后
// 转发到本机 dsh web（127.0.0.1:3080），并给 HTML 注入 crypto.randomUUID
// polyfill（非安全上下文必需）。手机/电脑连同一局域网即可访问。
import { createLanProxy } from './proxy.js';

export const name = 'dsh-lan-proxy';
// 与 dsh-pocket 完全一致的加载契约：connection + webServer。
// 注意：不要在此声明 settings —— DSH rc.7 下 settings 是可选服务，
// 声明进顶层 inject 会导致插件 fiber 加载失败（详见 dsh-better-sidebar 的做法）。
export const inject = ['connection', 'webServer'];

/** 默认监听端口（LAN 访问入口）。 */
const DEFAULT_PORT = 15151;

export function apply(ctx, config = {}) {
  const logger = ctx.logger?.(name) ?? console;
  const dshPort = config.dshPort ?? ctx.webServer?.port;
  if (!dshPort) {
    logger.error(`dsh-lan-proxy: webServer port unavailable — cannot start proxy | 拿不到 dsh web 端口，无法启动代理`);
    return () => {};
  }

  const port = config.port ?? DEFAULT_PORT;
  let proxy = null;

  async function startProxy() {
    if (proxy) return proxy;
    try {
      proxy = await createLanProxy({
        port,
        host: '0.0.0.0',
        upstream: { host: '127.0.0.1', port: dshPort },
      });
      logger.info(`dsh-lan-proxy: proxy ready on :${proxy.port} | 局域网代理已就绪 (http://<本机IP>:${proxy.port})`);
      return proxy;
    } catch (err) {
      logger.error(`dsh-lan-proxy: proxy start failed | 代理启动失败: ${err?.message ?? err}`);
      throw err;
    }
  }

  // 代理随插件自动启动（与 dsh-pocket 一致：零配置开箱即用）。
  void startProxy().catch(() => {});

  return () => {
    if (proxy) {
      const p = proxy;
      proxy = null;
      void p.close().catch(() => {});
    }
  };
}