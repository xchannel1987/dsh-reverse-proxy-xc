// dsh-lan-proxy host half: registers the 'dsh-proxy' settings namespace and
// runs the reverse proxy server only while enabled. Installing the bundle
// does NOT bind anything: enabled defaults to false.
'use strict';
import z from 'schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { createProxyServer } from './proxy.js';

export const name = 'dsh-lan-proxy';
export const inject = ['settings'];

const NS = 'dsh-proxy';

const ProxySchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().default('0.0.0.0'),
  port: z.number().min(1).max(65535).default(13080),
});

function startServer(v, ctx) {
  if (!v.enabled) return null;
  const server = createProxyServer();
  let started = false;
  server.on('error', (e) => {
    ctx.logger?.warn(`[dsh-lan-proxy] listen failed on ${v.host}:${v.port}: ${e.message}`);
  });
  server.listen(v.port, v.host, () => {
    started = true;
    ctx.logger?.info(`[dsh-lan-proxy] reverse proxy listening on http://${v.host}:${v.port} -> http://127.0.0.1:3080`);
  });
  return () => {
    // Destroy tracked upgrade tunnels first (explicit, deterministic — 'close'
    // events are unreliable for detached upgraded sockets), then force-close
    // remaining server connections and let server.close() complete.
    server.closeTunnels?.();
    if (started) server.closeAllConnections?.();
    server.close(() => {});
  };
}

export function apply(ctx) {
  let disposer = null;

  const sync = (v) => {
    if (disposer) { disposer(); disposer = null; }
    disposer = startServer(v, ctx);
  };

  ctx.inject(['settings'], (sctx) => {
    const ns = settingsNamespace(NS);
    const scope = sctx.settings.register(ns, ProxySchema); // applies default 'live' -> hot restart
    sync(scope.get());
    scope.watch(() => sync(scope.get()));
  });

  ctx.on('dispose', () => {
    if (disposer) { disposer(); disposer = null; }
  });
}