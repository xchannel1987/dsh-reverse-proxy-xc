# Changelog

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
