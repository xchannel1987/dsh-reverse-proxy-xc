# Changelog

## [0.1.8] - 2026-09-24

### Fixed
- **修复设置项全部失效（插件静默不生效：不监听端口、不报错、无日志）**：
  0.1.7 起 `apply(ctx, config)` 收到的 config 是**经 `Config` schema 解析后**的值，
  而 schemastery **>= 3.18.4** 会把标了 `.extra('volatile', true)` 的字段包成
  不可变引用 `{ get(), [write] }`（官方插件写法是 `this.config.x.get()`）。
  旧代码直接读 `input.enabled === true` / `Number(input.port)` 全部落空：
  `enabled` 恒为 `false`、`port` 恒为 `NaN` 回落默认 3090 —— 于是启动时
  `sync()` 判定为「不启用」，直接 return，端口永不监听。
  现在新增 `readField()` / `readConfig()` 逐字段解包（兼容 3.18.1 的普通值形态
  与未知字段），`normalizeConfig()` 先摊平再取值。
- 新增启动日志 `config resolved: enabled=… host=… port=…`：把上述「静默失效」
  环节显式留痕，便于日后一眼定位配置未生效的问题。
- 新增回归测试 `_fixcheck.mjs`：喂入 volatile 包装后的 config，断言代理真正绑定
  端口且 disposer 后释放。

### Chore
- **工程化规范化：补回构建脚本 + 修复 `src/` 落后一个版本的漂移**（无运行时改动，运行时行为不受影响）：
  - 新增 `build.ps1`，对齐 `dsh-session-xc` / `dsh-token-usage-xc` / `dsh-notify-xc` 同族插件的仓库约定：以 `lib/` 为准校验并同步 `src/`，然后 `npm pack`；`-NoSync` 只校验、发现漂移即报错退出，供 CI 与发布前把关。**只清理「当前版本」的同名 tgz**，历史版本一律保留（profile 的 `file:` 依赖可能正指向旧版本文件，删掉会打断依赖解析）。
  - **修复 `src/` 与 `lib/` 的版本漂移**：0.1.6 的 `bypassToken` 免 Token 特性（`lib/proxy.js` 137 行、`lib/proxy.test.mjs`）当年只落在 `lib/`，`src/` 未同步。现已以 `lib/` 为准同步，`index.js` / `client.js` / `proxy.js` / `proxy.test.mjs` 四个文件与 `lib/` 逐字节一致。
  - CI（`.github/workflows/ci.yml`）改为统一模板：`lib/` 产物存在性 + `src/` ↔ `lib/` 逐字节一致性门禁 + 单元测试步骤（`node --test`）。
  - `CLAUDE.md` 更正 `src/`、`lib/` 的权威关系（`lib/` 为权威主本、`src/` 为同源镜像）与构建/安装流程。

## [0.1.7] - 2026-09-24

### Fixed
- **适配 DSH 0.1.7（本版本前在 0.1.7 上无法加载/无法配置）**：
  - 修复模块加载崩溃：`import z from 'schemastery'`（无前缀包不可解析，`MODULE_NOT_FOUND`）
    → 改用 `@deepseek-ai/schemastery` 并在 package.json 声明依赖。
  - 设置接口迁移：`ctx.settings.register()` 已在 0.1.7 移除 → 改由宿主导出 `Config`
    （各字段标 `volatile` 以投影到设置页），配置值经 `apply(ctx, config)` 注入。
  - 启停改为「控制路由」驱动：客户端保存后 POST `/api/dsh-reverse-proxy-xc/control`
    （`connection.fetch.register` 精确路由，复用官方 /api 认证围栏）热启停代理；客户端设置
    服务 `settingsScope` → `configForms`。
- `engines.dsh`：`>=0.1.2-alpha.3` → `>=0.1.7-rc.1`。

## [0.1.6] - 2026-09-16

### Added
- 新增 `bypassToken` 配置项（默认开启）：反向代理在转发 HTTP 与 WebSocket 流量时自动在请求头注入合法的 loopback 会话凭证（`dsh-auth-*`），手机及远程设备访问免去输入启动 Token，彻底解决页面提示 `dsh web authentication required` 的问题。
- 在 Web 设置面板（`lib/client.js`）中增加「免 Token 认证」复选框设置项。

### Fixed
- 修复手机端携带失效旧 Cookie 时代理不再附加 Token 导致持续 401 拦截的死循环缺陷。
- 修复 WebSocket upgrade 时可能冲掉原有 Cookie 导致握手 401 的缺陷。

## [0.1.5] - 2026-09-08

### Added
- package.json 声明 `engines.dsh: ">=0.1.2-alpha.3"`，供 dsh-market 展示宿主版本要求并参与兼容性过滤；无功能改动。

## [0.1.4] - 2026-09-01

### Fixed
- 适配新 DSH 鉴权：转发启动令牌换取 authority 绑定 cookie。

## [0.1.3] - 2026-09-01

### Fixed
- Host 端不再依赖旧版 dsh-settings 的 `installSettingsSection` / `settingsNamespace` 导出（新版 0.1.2-alpha.3 已移除），改为直接经 `ctx.settings.register` 服务接口注册设置命名空间。

All notable changes to this project will be documented in this file.

## [0.1.2] - 2025-01-20

### Changed
- Changed default proxy port to 3090

## [0.1.1] - 2025-01-15

### Added
- Basic auth support for LAN access
- Settings panel configuration

## [0.1.0] - 2025-01-10

### Added
- Initial release
- LAN reverse proxy for DSH Web GUI
- Host/Origin header rewriting
- crypto.randomUUID polyfill
