# dsh-lan-proxy

DSH (DeepSeek Harness) web profile 插件：可配置的局域网反向代理，让其他设备访问 DSH Web GUI 时不再受 `/api` 信任栅栏的 403 限制（Sidebar / 设置 / 凭据等特权方法全部可用）。

## 工作原理

DSH 的 `/api` 有一个浏览器信任栅栏：只有回环来源的请求才放行特权方法（`settings.describe`、`credentials.describe`、`agentPreset.read` 等），非回环来源一律 403。

本插件启动一个**独立**的 http 服务器（默认 `0.0.0.0:13080`），把请求转发到 DSH 主服务（`127.0.0.1:3080`），并把 `Host`/`Origin`/`Referer` 改写为回环——DSH 视作回环访问，全部功能可用。支持 HTTP 与 WebSocket。

## 安装

```bash
# 本地 tgz（开发者模式）
cd D:/workspace/dsh-lan-proxy
npm pack
dsh plugin --profile web add ./dsh-lan-proxy-0.1.0.tgz

# 或发布到 registry 后安装（当前尚未 publish，先用上面的 tgz 方式）
dsh plugin --profile web add dsh-lan-proxy@^0.1.0
```

安装后重启 DSH（`dsh --profile web`）。

## 设置

插件在 DSH 设置面板注册 `dsh-proxy` 命名空间（自动渲染）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | **`false`** | 开关。**安装后默认关闭，不监听任何端口**；需手动开启才启动反代 |
| `host` | `0.0.0.0` | 监听地址 |
| `port` | `13080` | 监听端口（1–65535） |

设置变更即时生效（热启停），无需重启 DSH。

也可直接编辑 `~/.dsh/settings.yaml`：

```yaml
dsh-proxy:
  enabled: true
  host: '0.0.0.0'
  port: 13080
```

## 使用

开启后，局域网/Tailscale 内其他设备浏览器访问：

```
http://<本机内网IP>:13080
```

例如 `http://10.100.50.125:13080`——和本机打开 `http://127.0.0.1:3080` 效果一致，Sidebar / 设置 / 凭据 / Agent Preset 全部可用。

## 安全注意

- **明文 HTTP，无认证层**（与 DSH 现状一致）。
- `host: 0.0.0.0` 意味着**所有可达本机的网络**（公司内网、Tailscale 等）都能访问 13080。
- 默认 `enabled: false`——**装上插件不会暴露任何端口**，必须你显式开启。
- 如需收紧，可把 `host` 改为特定网卡 IP，或关闭 `enabled`。
- 不做开机自启：插件随 DSH 进程生命周期运行，DSH 关闭则监听停止。

## 开发

```bash
node --test lib/proxy.test.mjs   # 单元测试
```