# dsh-lan-proxy 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 `dsh-lan-proxy` — 一个 DSH Web profile 的 cordis bundle 插件，提供可配置的局域网反向代理（默认 `0.0.0.0:13080` → `127.0.0.1:3080`，改写 Host/Origin 为回环以绕过 DSH 信任栅栏），并带 DSH 设置面板开关（`enabled` 默认 `false`，安装后不自动监听）。

**Architecture:** 插件自建 `node:http` server（不注册到主 webServer 路由表），通过 `settingsNamespace('dsh-proxy')` 暴露 `{enabled, host, port}` 设置；DSH 设置面板通过 `settings.describe` 自动渲染该命名空间表单。HTTP/WS 请求转发到 `127.0.0.1:3080` 并把 `Host`/`Origin`/`Referer` 改写为回环。

**Tech Stack:** Node.js（ESM）、DSH cordis bundle 机制（`dsh.bundle.patch`）、`@deepseek-ai/dsh-settings`（settingsNamespace）、`node:http`/`node:net`、无第三方运行时依赖。

## Global Constraints

- 插件名必须为 `dsh-lan-proxy`，命名空间必须为 `dsh-proxy`（小写 kebab-case，符合 `NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/`）。
- `enabled` 默认 **`false`**：安装后不监听任何端口；必须用户手动开启。
- 默认 `host` = `0.0.0.0`，默认 `port` = `13080`；`port` 范围 1–65535，`host` 非空字符串。
- 反代目标固定为 `127.0.0.1:3080`（DSH 主 webServer）。
- 不改主 webServer 绑定，不注册主 webServer 路由，不修改任何 DSH 核心代码。
- 不做开机自启、不做 Windows 服务/计划任务。
- 文件位置：`D:\workspace\dsh-lan-proxy`（所有代码与文档均在此）。
- 安装方式：`dsh plugin --profile web add dsh-lan-proxy`（bundle 通道）。
- `settings.register(ns, schema)` 的 schema 必须是 **schemastery `z` schema**（`z.object({...})`），非裸对象；`applies` 默认 `live`（热启停）。`schemastery` 若未随 DSH 环境可用，作为运行时依赖加入本包并 `npm install`。

---

### Task 1: 项目骨架与 package.json（可安装 bundle）

**Files:**
- Create: `D:\workspace\dsh-lan-proxy\package.json`
- Create: `D:\workspace\dsh-lan-proxy\cordis.patch.yml`

**Interfaces:**
- Produces: 可通过 `dsh plugin --profile web add <path-or-name>` 安装的 bundle 声明（`dsh.bundle.patch` 指向 `cordis.patch.yml`）。

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "dsh-lan-proxy",
  "version": "0.1.0",
  "description": "DSH web plugin: configurable LAN reverse proxy for the DSH web UI (default 0.0.0.0:13080 -> 127.0.0.1:3080, Host/Origin rewritten to loopback to pass the /api trust fence). Exposes a settings namespace so the proxy binds only after the user enables it.",
  "type": "module",
  "main": "lib/index.js",
  "files": [
    "lib",
    "cordis.patch.yml",
    "README.md"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "peerDependencies": {
    "@deepseek-ai/dsh-settings": "^0.1.0-rc.6"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh-settings": {
      "optional": true
    }
  },
  "license": "MIT"
}
```

- [ ] **Step 2: 创建 `cordis.patch.yml`**

```yaml
# dsh-lan-proxy bundle patch
#
# Installed through: dsh plugin --profile web add dsh-lan-proxy
# Mounts one plugin row; the row's apply() builds the reverse proxy and
# registers the 'dsh-proxy' settings namespace.
- insert:
    - id: lan-proxy
      name: 'dsh-lan-proxy'
```

- [ ] **Step 3: 验证 package.json 与 patch 合法**

Run: `node -e "const p=require('./package.json'); console.log(p.name, p.dsh.bundle.patch); console.log(JSON.stringify(p.peerDependencies))"` (workdir `D:\workspace\dsh-lan-proxy`)
Expected: `dsh-lan-proxy ./cordis.patch.yml {"@deepseek-ai/dsh-settings":"^0.1.0-rc.6"}`

- [ ] **Step 4: Commit**

```bash
git init -q
git add package.json cordis.patch.yml
git commit -m "feat: dsh-lan-proxy bundle skeleton"
```

---

### Task 2: 反代核心 `lib/proxy.js`（TDD）

**Files:**
- Create: `D:\workspace\dsh-lan-proxy\lib\proxy.js`
- Create: `D:\workspace\dsh-lan-proxy\lib\proxy.test.mjs`（Node 内置 test runner，零依赖）

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces:
  - `export function rewriteHeaders(inHeaders)` → 输出改写后的头对象：`host` → `127.0.0.1:3080`；`origin`（若存在）→ `http://127.0.0.1:3080`；`referer`（若存在且可解析）→ 同 host 的 URL。
  - `export function createProxyServer(upstream = {host:'127.0.0.1', port:3080})` → 返回一个 `http.Server`，处理 HTTP 请求与 `upgrade` 事件（函数式设计便于单测注入）。

- [ ] **Step 1: 写失败测试**

`lib/proxy.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteHeaders } from './proxy.js';

test('rewriteHeaders rewrites host to loopback upstream', () => {
  const out = rewriteHeaders({ host: '10.100.50.125:13080' });
  assert.equal(out.host, '127.0.0.1:3080');
});

test('rewriteHeaders rewrites origin and referer when present', () => {
  const out = rewriteHeaders({
    host: '10.100.50.125:13080',
    origin: 'http://10.100.50.125:13080',
    referer: 'http://10.100.50.125:13080/some/path',
  });
  assert.equal(out.origin, 'http://127.0.0.1:3080');
  assert.equal(out.referer, 'http://127.0.0.1:3080/some/path');
});

test('rewriteHeaders leaves headers without host untouched aside from additions', () => {
  const out = rewriteHeaders({ 'user-agent': 'curl/8' });
  assert.equal(out['user-agent'], 'curl/8');
  assert.equal(out.host, '127.0.0.1:3080');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test lib/proxy.test.mjs`
Expected: FAIL（`Cannot find module './proxy.js'`）

- [ ] **Step 3: 写 `lib/proxy.js`**

```js
// dsh-lan-proxy reverse-proxy core.
// Forwards HTTP and WebSocket traffic to the DSH loopback webServer while
// rewriting Host/Origin/Referer so the /api browser-trust fence treats
// requests as loopback-origin (privileged methods pass, no 403).
'use strict';
import http from 'node:http';
import net from 'node:net';

const LOOPBACK_AUTH = '127.0.0.1:3080';

export function rewriteHeaders(inHeaders) {
  const out = { ...inHeaders };
  out.host = LOOPBACK_AUTH;
  if (out.origin) out.origin = `http://${LOOPBACK_AUTH}`;
  if (out.referer) {
    try {
      const u = new URL(out.referer);
      u.host = LOOPBACK_AUTH;
      out.referer = u.toString();
    } catch (_) { /* keep as-is */ }
  }
  return out;
}

function writeUpgradeHead(req, headers, extra = '') {
  let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    raw += `${k}: ${Array.isArray(v) ? v.join(', ') : v}\r\n`;
  }
  raw += `\r\n${extra}`;
  return raw;
}

export function createProxyServer(upstream = { host: '127.0.0.1', port: 3080 }) {
  const server = http.createServer((req, res) => {
    const preq = http.request({
      host: upstream.host,
      port: upstream.port,
      path: req.url,
      method: req.method,
      headers: rewriteHeaders(req.headers),
    }, (pres) => {
      res.writeHead(pres.statusCode, pres.headers);
      pres.pipe(res);
    });
    preq.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy error: ${e.message}`);
    });
    req.on('error', () => preq.destroy());
    req.pipe(preq);
  });

  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(upstream.port, upstream.host, () => {
      up.write(writeUpgradeHead(req, rewriteHeaders(req.headers)));
      if (head && head.length) up.write(head);
      socket.pipe(up).pipe(socket);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });

  return server;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test lib/proxy.test.mjs`
Expected: PASS（3 tests）

- [ ] **Step 5: Commit**

```bash
git add lib/proxy.js lib/proxy.test.mjs
git commit -m "feat: reverse proxy core with loopback header rewrite (TDD)"
```

---

### Task 3: 插件主体 `lib/index.js`（cordis apply + settings 热启停）

**Files:**
- Create: `D:\workspace\dsh-lan-proxy\lib\index.js`

**Interfaces:**
- Consumes: `createProxyServer`、`rewriteHeaders`（Task 2）；`@deepseek-ai/dsh-settings` 的 `settingsNamespace`、`ctx.inject(["settings"], ...)`（host 侧）。
- Produces: cordis bundle 的 `name`、`inject`（`["settings"]`）、`apply(ctx, config)`：
  - 注册 `dsh-proxy` 命名空间 schema `{enabled: boolean default false, host: string default '0.0.0.0', port: number default 13080}`。
  - 监听 `scope.watch` 与启动时状态 → 按 `enabled` 起/停 `createProxyServer`（`server.listen(port, host)`），返回 disposer。
  - `ctx.logger?.info` 记录启动/停止/失败，`server.on('error')` 不崩溃。

- [ ] **Step 1: 写 `lib/index.js`**

```js
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
    const scope = sctx.settings.register(ns, ProxySchema); // applies 默认 'live' → 热启停
    sync(scope.get());
    scope.watch(() => sync(scope.get()));
  });

  ctx.on('dispose', () => {
    if (disposer) { disposer(); disposer = null; }
  });
}
```

> 依据：`@deepseek-ai/dsh-settings` 的 `SettingsProvider.register<T>(ns, schema: z<T>, options?)` 第二参是 **schemastery `z` schema**（见 `lib/types/index.d.ts`）。`SettingsScope.watch(callback)` 与 `get()` 已确认存在。`applies` 默认 `'live'`，正好实现改设置即热重启监听。若运行时报 `schemastery` 不可解析（peer 未装），在 bundle 的 `package.json` 增加 `"dependencies": { "schemastery": "^3.x" }` 并用 `npm install` 安装。

- [ ] **Step 2: 语法检查**

Run: `node --check lib/index.js`
Expected: no output, exit 0

- [ ] **Step 3: 手动可运行性冒烟（无 DSH 环境）**

用 `node --input-type=module -e "import('./lib/index.js').then(m => console.log('exports:', m.name, m.inject))"`
Expected: `exports: dsh-lan-proxy settings`

- [ ] **Step 4: Commit**

```bash
git add lib/index.js
git commit -m "feat: plugin host half with dsh-proxy settings namespace and hot start/stop"
```

---

### Task 4: 在真实 DSH profile 安装并端到端验证

**Files:**
- Modify: `D:\workspace\dsh-lan-proxy\README.md`（安装/使用说明）

**Interfaces:**
- Consumes: 已完成的 bundle（Task 1–3）。

- [ ] **Step 1: 用 `dsh plugin` 安装本地发包**

在 `D:\workspace\dsh-lan-proxy` 下（若尚未 publish，用本地路径/本地文件安装）：
```bash
dsh plugin --profile web add dsh-lan-proxy@file:D:/workspace/dsh-lan-proxy
# 或按 dsh-better-sidebar 的模式，本地 pack 后 add：
# npm pack 生成 dsh-lan-proxy-0.1.0.tgz
# dsh plugin --profile web add ./dsh-lan-proxy-0.1.0.tgz
```
> 若 `dsh plugin` 的本地安装语法有差异，按 `dsh plugin --profile web --help` 输出的实际用法为准。

- [ ] **Step 2: 重启 DSH 使 bundle 生效**

重启 `dsh --profile web`（或 DSH Web 进程）。确认启动日志无插件加载错误。
Expected: 插件加载成功；**端口 13080 此时不应监听**（因为 enabled 默认 false）。

- [ ] **Step 3: 验证默认不监听**

Run: `netstat -ano | findstr 13080`
Expected: 无 13080 监听（**安全默认生效**）

- [ ] **Step 4: 通过设置开启反代**

在 DSH 设置面板定位 `dsh-proxy` 分区（自动渲染的 enabled/host/port），开启 enabled（保持 0.0.0.0:13080）。也可直接改 settings 文件验证（位置 `~/.dsh/settings.yaml` 或经 API）：
```yaml
dsh-proxy:
  enabled: true
  host: '0.0.0.0'
  port: 13080
```

- [ ] **Step 5: 验证监听启动 + 全链路**

Run:
```bash
netstat -ano | findstr 13080                      # 应显示 0.0.0.0:13080 LISTENING
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:13080/                     # 200
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' http://127.0.0.1:13080/api/session.list   # 200
curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' http://127.0.0.1:13080/api/settings.describe # 200（特权方法，无403）
```
Expected: 全部 200，`settings.describe` 不再 403。

- [ ] **Step 6: 验证 WebSocket 升级**

Run（真实路径）：`curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" http://127.0.0.1:13080/api/events.mux`（前几行）
Expected: `HTTP/1.1 101 Switching Protocols`

- [ ] **Step 7: 验证从内网 IP 访问（模拟远程）**

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' http://10.100.50.125:13080/api/settings.describe`
Expected: 200（远程访问特权方法也通过）

- [ ] **Step 8: 验证关闭 enabled 即停止监听**

设置 `enabled: false` → Run: `netstat -ano | findstr 13080`
Expected: 无监听（热停生效）

- [ ] **Step 9: 写 README 并提交**

README 含：安装（`dsh plugin --profile web add`）、设置（dsh-proxy 分区、默认不监听）、使用（访问 `http://<内网IP>:13080`）、安全注意（明文、0.0.0.0 暴露范围、enabled 默认关）。

```bash
git add README.md
git commit -m "docs: install/usage/safety README"
```

---

### Task 5: 自审与收尾

**Files:**
- Modify: 可能需要修正 `lib/index.js`（若 Task 4 暴露 schemastery schema 用法问题）。

- [ ] **Step 1: 对照 spec 逐条核对**

| spec 要求 | 计划任务 |
|---|---|
| 插件名 dsh-lan-proxy | Task 1 |
| 可配置 IP/端口（默认 0.0.0.0:13080） | Task 2/3 |
| enabled 默认 false，装后不监听 | Task 3/4 Step 3 |
| 设置面板出现 dsh-proxy 分区 | Task 3（自动渲染）+ Task 4 Step 4 |
| 反代到 127.0.0.1:3080 + 改写 Host/Origin | Task 2 |
| WebSocket 转发 | Task 2 + Step 6 |
| 热启停（改设置生效） | Task 3 `scope.watch` + Step 8 |
| 无开机自启 | 不创建任何自启项（无对应任务） |
| 错误处理不崩溃 | Task 3 `server.on('error')` |

- [ ] **Step 2: 修复发现的问题并重新验证**

若有问题（尤其 Task 4 的 `settings.register` schema 用法），修复 `lib/index.js` 后重跑 Task 4 Step 3–8 的关键验证。

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: finalize dsh-lan-proxy"
```