# Changelog

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
