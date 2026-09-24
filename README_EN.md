# dsh-reverse-proxy-xc

[![npm version](https://img.shields.io/npm/v/dsh-reverse-proxy-xc.svg)](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
[![license](https://img.shields.io/npm/l/dsh-reverse-proxy-xc.svg)](https://github.com/xchannel1987/dsh-reverse-proxy-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-reverse-proxy-xc.svg)](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
[![DSH](https://img.shields.io/badge/DeepSeek-Harness-blue)](https://github.com/deepseek-ai/DeepSeek-Harness)

[中文](README.md) | [English](README_EN.md)

**DSH LAN Reverse Proxy Plugin** — Seamless access to DSH Web GUI from mobile/tablet devices on your local network with the full desktop experience.

> **DSH 0.1.7 compatible (`>=0.1.7-rc.1`)**: adapted to the 0.1.7 breaking changes (`ctx.settings.register` removed, client service `settingsScope` → `configForms`). Settings stay under Settings → LAN Reverse Proxy; saving hot-restarts the proxy via the `/api/dsh-reverse-proxy-xc/control` route.

## ✨ Core Features

### 🌐 Full Feature Access
- **Sidebar Available**: Workspaces and session list display normally
- **Settings Panel**: All settings accessible
- **Credential Management**: API credentials can be managed
- **WebSocket Support**: Real-time event push works properly

### 🔧 Issue Fixes
This plugin resolves critical issues when accessing via reverse proxy:

| Issue | Cause | Solution |
|-------|-------|----------|
| Settings panel won't open | Frontend disables on non-loopback | Proxy injects isLoopback=true |
| randomUUID error | API unavailable under HTTP | Auto-inject polyfill |
| WebSocket disconnects | Proxy not forwarding correctly | Stream passthrough support |
| authentication required prompt | Mobile access lacks launch token | Auto-acquire and inject valid session cookie (bypassToken) |

### 🚀 Technical Implementation
- **Standalone Server**: Listens on `0.0.0.0:3090` by default
- **Request Forwarding**: Forwards to DSH main service at `127.0.0.1:3080`
- **Header Rewriting**: Rewrites Host/Origin to loopback address
- **HTML Injection**: Auto-injects necessary polyfills

### 🔒 Security Design
- **LAN Only**: Designed for trusted internal network use
- **Trust Barrier**: Preserves DSH's original security mechanisms
- **Configurable**: Disabled by default, requires manual activation

## 📦 Installation

```bash
# Using DSH CLI
dsh plugin --profile web add dsh-reverse-proxy-xc

# Or using npm
npm install dsh-reverse-proxy-xc
```

Restart DSH after installation.

## ⚙️ Configuration

1. Open DSH Settings
2. Find "LAN Reverse Proxy" section
3. Enable "Enable Proxy" toggle
4. Configure port (default: 3090)

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| enabled | false | Whether to enable proxy |
| port | 3090 | Listen port |
| host | 0.0.0.0 | Listen address |
| bypassToken | true | Bypass Token Auth (auto-inject valid session cookie, no launch token required) |
| authEnabled | false | Whether to enable Basic access authentication |
| authUser | admin | Auth username |
| authPass | 123456 | Auth password |

## 🎮 Usage

1. Ensure target device and host are on the same LAN or VPN
2. Access from target device browser:

```
http://<host-lan-ip>:3090
```

Example: `http://10.100.50.125:3090`

3. Enjoy the same experience as local `http://127.0.0.1:3080`

## 🔧 How It Works

```
Mobile Browser
    ↓ HTTP/WS
Reverse Proxy (0.0.0.0:3090)
    ↓ Rewrite Headers
DSH Main Service (127.0.0.1:3080)
    ↓ Treats as loopback access
Full features unlocked
```

## ⚠️ Security Notes

- **Don't Expose to Internet**: This plugin is designed for trusted internal networks
- **VPN Recommended**: Use VPN for cross-network access
- **Sensitive Operations**: Involves credentials and settings, ensure network security

## 📄 License

[MIT](LICENSE)

## 🔗 Links

- [GitHub](https://github.com/xchannel1987/dsh-reverse-proxy-xc)
- [npm](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
- [Issues](https://github.com/xchannel1987/dsh-reverse-proxy-xc/issues)
