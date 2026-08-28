# dsh-reverse-proxy-xc

[![npm version](https://img.shields.io/npm/v/dsh-reverse-proxy-xc.svg)](https://www.npmjs.com/package/dsh-reverse-proxy-xc)
[![license](https://img.shields.io/npm/l/dsh-reverse-proxy-xc.svg)](https://github.com/keyiadiannao/dsh-reverse-proxy-xc/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/dsh-reverse-proxy-xc.svg)](https://www.npmjs.com/package/dsh-reverse-proxy-xc)

A configurable LAN reverse proxy for DSH Web GUI, allowing mobile/other devices to access DSH with the same experience as localhost.

## Features

- **Reverse Proxy**: Default `0.0.0.0:3090` → `127.0.0.1:3080`
- **Host/Origin Rewrite**: Automatically rewrites headers to loopback
- **crypto.randomUUID Polyfill**: Injected for browser compatibility
- **Basic Auth Support**: Optional authentication for LAN access
- **Settings Panel**: Configuration via DSH settings UI

## Installation

```bash
dsh plugin --profile web add dsh-reverse-proxy-xc
```

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| enabled | boolean | true | Enable/disable proxy |
| host | string | "0.0.0.0" | Listen host |
| port | number | 3090 | Listen port |
| authEnabled | boolean | false | Enable basic auth |
| authUser | string | "" | Auth username |
| authPass | string | "" | Auth password |

## Usage

1. Install the plugin
2. Configure settings in DSH settings panel
3. Access DSH from other devices via `http://<your-ip>:3090`

## Requirements

- Node.js >= 18
- DSH >= 0.1.0-rc.2

## License

[MIT](LICENSE)
