# dsh-reverse-proxy-xc

[![npm version](https://img.shields.io/npm/v/dsh-reverse-proxy-xc.svg)](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
[![license](https://img.shields.io/npm/l/dsh-reverse-proxy-xc.svg)](https://github.com/xchannel1987/dsh-reverse-proxy-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-reverse-proxy-xc.svg)](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**DSH 局域网反向代理插件** —— 让手机/平板等设备在局域网内无缝访问 DSH Web GUI，获得与本地完全一致的体验。

## ✨ 核心特性

### 🌐 完整功能访问
- **侧边栏可用**：工作区、会话列表正常显示
- **设置面板**：可访问所有设置项
- **凭据管理**：可管理 API 凭据
- **WebSocket 支持**：实时事件推送正常工作

### 🔧 问题修复
本插件修复了通过反向代理访问时的关键问题：

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 设置面板无法打开 | 前端判断非回环环境禁用 | 代理层注入 isLoopback=true |
| randomUUID 报错 | HTTP 下 API 不可用 | 自动注入 polyfill |
| WebSocket 断开 | 代理未正确转发 | 流式透传支持 |

### 🚀 技术实现
- **独立服务**：默认监听 `0.0.0.0:3090`
- **请求转发**：转发到 DSH 主服务 `127.0.0.1:3080`
- **Header 改写**：改写 Host/Origin 为回环地址
- **HTML 注入**：自动注入必要的 polyfill

### 🔒 安全设计
- **局域网限定**：仅在内网/VPN 环境使用
- **信任栅栏**：保留 DSH 原有安全机制
- **配置可控**：默认禁用，需手动开启

## 📦 安装

```bash
# 使用 DSH CLI
dsh plugin --profile web add dsh-reverse-proxy-xc

# 或使用 npm
npm install dsh-reverse-proxy-xc
```

安装后重启 DSH。

## ⚙️ 配置

1. 打开 DSH 设置
2. 找到「局域网反向代理」分区
3. 打开「启用代理」开关
4. 配置端口（默认 3090）

### 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| enabled | false | 是否启用代理 |
| port | 3090 | 监听端口 |
| host | 0.0.0.0 | 监听地址 |

## 🎮 使用

1. 确保目标设备与主机在同一局域网或 VPN
2. 在目标设备浏览器访问：

```
http://<主机内网IP>:3090
```

例如：`http://10.100.50.125:3090`

3. 享受与本地 `http://127.0.0.1:3080` 完全一致的体验

## 🔧 工作原理

```
手机浏览器
    ↓ HTTP/WS
反向代理 (0.0.0.0:3090)
    ↓ 改写 Header
DSH 主服务 (127.0.0.1:3080)
    ↓ 视为回环访问
完整功能解锁
```

## ⚠️ 安全注意

- **不要暴露到公网**：此插件设计用于可信内网环境
- **VPN 推荐**：跨网访问建议使用 VPN
- **敏感操作**：涉及凭据和设置，请确保网络安全

## 📄 许可证

[MIT](LICENSE)

## 🔗 链接

- [GitHub](https://github.com/xchannel1987/dsh-reverse-proxy-xc)
- [npm](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
- [问题反馈](https://github.com/xchannel1987/dsh-reverse-proxy-xc/issues)
