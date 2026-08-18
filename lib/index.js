// dsh-lan-proxy host half: registers the 'dsh-proxy' settings namespace and
// runs the reverse proxy server only while enabled. Installing the bundle
// does NOT bind anything: enabled defaults to false.
'use strict';
import z from 'schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { createLanProxy } from './proxy.js';

export const name = 'dsh-lan-proxy';
// settings 是可选服务：不要放进顶层 inject（DSH 里 settings 服务若在解析期
// 不可用会导致整个插件 fiber 失败）。settings 通过 ctx.inject 延迟获取，
// 与 dsh-better-sidebar 的做法一致。
export const inject = ['webServer'];

const NS = 'dsh-proxy';

const ProxySchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('0.0.0.0'),
  port: z.number().min(1).max(65535).default(15151),
});

export function apply(ctx) {
  let handle = null; // { close: () => Promise<void> } | null

  const sync = (v) => {
    const stop = async () => {
      if (handle) { const h = handle; handle = null; await h.close(); }
    };
    const start = async () => {
      if (!v.enabled) return;
      const upstream = { host: '127.0.0.1', port: ctx.webServer?.port ?? 3080 };
      try {
        handle = await createLanProxy({ port: v.port, host: v.host, upstream, log: (m) => ctx.logger?.info(`[dsh-lan-proxy] ${m}`) });
        ctx.logger?.info(`[dsh-lan-proxy] reverse proxy listening on http://${v.host}:${handle.port} -> http://${upstream.host}:${upstream.port}`);
      } catch (e) {
        ctx.logger?.warn(`[dsh-lan-proxy] listen failed on ${v.host}:${v.port}: ${e?.message ?? e}`);
      }
    };
    void (async () => { await stop(); await start(); })();
  };

  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(ns, ProxySchema); // applies default 'live' -> hot restart
    sync(scope.get());
    scope.watch(() => sync(scope.get()));
  });

  ctx.on('dispose', () => {
    const h = handle; handle = null;
    void h?.close();
  });
}