# dsh-lan-proxy

DSH (DeepSeek Harness) web profile 插件：可配置的局域网反向代理，让手机/其他设备在局域网内访问 DSH Web GUI 时获得与本地一致的完整体验（Sidebar / 设置 / 凭据 / 工作区 / 会话全部可用）。

## 工作原理

DSH 的 `/api` 有浏览器信任栅栏：只有回环来源的请求才放行特权方法（`settings.describe`、`credentials.describe`、`agentPreset.read` 等），非回环来源一律 403。且前端按页面地址（`window.location.hostname`）判定 `isLoopback`，非回环时 WebSocket 与设置面板会降级。

本插件启动一个**独立** http 服务器（默认 `0.0.0.0:15151`），把请求转发到 DSH 主服务（`127.0.0.1:3080`），并改写 `Host`/`Origin` 为回环——DSH 始终视作回环访问。同时：
- **支持 HTTP 与 WebSocket**（`/api/events.mux` + `/api/events.host` 流式透传）
- **自动给 HTML 注入 `crypto.randomUUID` polyfill**：DSH 前端在非安全上下文（`http://<LAN-IP>:port`）下 `crypto.randomUUID` 不存在，不注入会抛 "randomUUID is not a function" 导致页面异常（问题根源之一）

实现参考自 `dsh-pocket` 的 `proxy.mjs`（去掉了 tunnel/扫码等无关功能）。

## 安装

```bash
cd D:/workspace/dsh-lan-proxy
npm pack
dsh plugin --profile web add ./dsh-lan-proxy-0.1.0.tgz
```

安装后重启 DSH（`dsh --profile web`）。

## 设置

插件在 DSH 设置面板注册 `dsh-proxy` 命名空间（自动渲染）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | **`false`** | 开关。**安装后默认关闭，不监听任何端口**；需手动开启才启动反代 |
| `host` | `0.0.0.0` | 监听地址 |
| `port` | `15151` | 监听端口（1–65535） |

设置变更即时生效（热启停），无需重启 DSH。

也可直接编辑 `~/.dsh/settings.yaml`：

```yaml
dsh-proxy:
  enabled: true
  host: '0.0.0.0'
  port: 15151
```

## 使用

开启后，局域网内其他设备（手机/电脑，连同一内网或 VPN）浏览器访问：

```
http://<本机内网IP>:15151
```

例：`http://10.100.50.125:15151`——与本地打开 `http://127.0.0.1:3080` 一致（工作区/会话/设置/全部功能）。

## 安全注意

- **明文 HTTP，无认证层**（与 DSH 现状一致）。
- `host: 0.0.0.0` 意味着**所有可达本机的网络**（公司内网、VPN 等）都能访问 15151。
- 默认 `enabled: false`——**装上插件不会暴露任何端口**，必须你显式开启。
- 如需收紧，可把 `host` 改为特定网卡 IP，或关闭 `enabled`。
- 不做开机自启：插件随 DSH 进程生命周期运行，DSH 关闭则监听停止。

## 开发

```bash
node --test lib/proxy.test.mjs   # 单元测试
```