> **实现说明**: 本文档是实施前的设计稿。实际实现已简化——`lib/client.js` 未单独实现（DSH 设置面板对注册的命名空间自动渲染表单），设置 schema 内联在 `lib/index.js` 而非独立 `config.ts`，依赖收敛为 `schemastery` + `@deepseek-ai/dsh-settings`。功能与设计一致。

# dsh-lan-proxy 设计文档

- **日期**: 2026-08-18
- **状态**: 待审阅
- **插件名**: `dsh-lan-proxy`
- **类型**: DSH Web profile 插件（cordis bundle），通过 `dsh plugin --profile web add` 安装

## 1. 背景与问题

用户在电脑上运行 DeepSeek Harness（DSH）Web GUI（默认监听 `127.0.0.1:3080`）。
- 用户通过 EasyConnect 接入公司内网，其他电脑可访问本机内网 IP `10.100.50.125`。
- DSH 的 `/api` 有一个浏览器信任栅栏：**只有回环（loopback）来源的请求才放行特权方法**（`settings.describe`、`credentials.describe`、`agentPreset.read` 等），非回环来源一律 403。
- 因此，其他电脑直接访问 `10.100.50.125:3080` 只能看到空壳 UI（Home/非特权 API 可用），Sidebar / 设置 / 凭据全部 403。

**已有验证结论**：一个把请求转发到 `127.0.0.1:3080` 并把 `Host`/`Origin` 改写为回环的代理，可以让 DSH 认为请求来自回环，从而**全部功能可用（含特权方法）**。当前用独立 Node 脚本 `proxy-3080.js` 实现了这一点，运行时验证通过（HTTP 200 全端点 + WebSocket 101）。

## 2. 目标

把"局域网反代"从独立脚本**固化成一个 DSH 官方插件**，具备：
1. 通过 `dsh plugin --profile web add` 安装（标准 bundle 机制）。
2. 独立 http server 监听可配置的 IP 与端口（**默认 `0.0.0.0:13080`**），把请求反代到主 DSH（`127.0.0.1:3080`），并改写 `Host`/`Origin`/`Referer` 为回环。
3. 提供 DSH **设置面板菜单**（命名空间 `dsh-proxy`）：
   - `enabled`（布尔，**默认 `false`**——安装插件后**不自动启动反代**，必须用户在设置面板手动开启）
   - `host`（字符串，默认 `0.0.0.0`）
   - `port`（数字，默认 `13080`）
4. 支持 WebSocket 升级转发（DSH 前端依赖 `/api/events.mux`、`/api/events.host`）。
5. **不做开机自启**（用户明确要求）；插件随 DSH 进程生命周期运行。

## 3. 非目标（YAGNI）

- 不做 TLS/认证（与 DSH 现状一致；文档保留风险提示）。
- 不做主 webServer 的 `host` 修改（不碰 127.0.0.1 主绑定）。
- 不做公网暴露/隧道（只服务局域网/Tailscale 可达的设备）。
- 不做 Windows 服务/计划任务（不要开机自启）。

## 4. 架构

```
┌─────────────────── DSH web profile 进程 ───────────────────┐
│                                                             │
│  主 webServer (127.0.0.1:3080)  ←─ 现有 DSH UI / API        │
│      └── /api 路由（连接插件所有，含信任栅栏）                │
│                                                             │
│  【新增】dsh-lan-proxy 插件 (bundle)                        │
│      └── 独立 http.Server（仅当 enabled=true 时监听）        │
│          → 默认 0.0.0.0:13080，可配置                        │
│           ├─ HTTP:  改写 Host/Origin/Referer → 127.0.0.1:3080
│           ├─ WS:    upgrade 转发（同改写）                   │
│           └─ 设置: settingsNamespace('dsh-proxy')           │
└─────────────────────────────────────────────────────────────┘
```

- 插件**自建第二个 http server**（不占用、不修改主 webServer 的绑定），因此与主 3080 完全隔离，端口冲突风险独立。
- 反代逻辑与已验证的 `proxy-3080.js` 同构（生产可复用手写实现，无需引入额外依赖）。

## 5. 组件与文件

```
D:\workspace\dsh-lan-proxy\
├── package.json          # name=dsh-lan-proxy, type=module, dsh.bundle.patch
├── cordis.patch.yml      # insert 插件行（id: lan-proxy, name: dsh-lan-proxy）
├── lib\
│   ├── index.js          # 插件 apply(ctx, config)：读设置、起 server、注册路由
│   ├── proxy.js          # 反代核心（buildProxyHandler：HTTP+WS 改写转发）
│   ├── config.ts         # schemastery schema（enabled/host/port）
│   └── client.js         # 浏览器端：设置面板 UI（读/写 dsh-proxy 命名空间）
├── docs\
│   └── 2026-08-18-dsh-lan-proxy-design.md
└── README.md
```

### 5.1 `package.json` 关键字段

```json
{
  "name": "dsh-lan-proxy",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.0-rc.7",
    "@deepseek-ai/dsh-client-runtime": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-web-react": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-host-webserver": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-settings": "^0.1.0-rc.6"
  }
}
```

依赖 `@deepseek-ai/dsh-host-webserver` 主要为**类型/服务契约**（WebServer 服务引用），实际反代用 `node:http` 自建 server，不注册到主 webserver（避免占 3080 的路由表）。

### 5.2 `cordis.patch.yml`

```yaml
- insert:
    - id: lan-proxy
      name: 'dsh-lan-proxy'
```

参照 `dsh-better-sidebar` 的 bundle 通道（安装后自动入栈，无需改 profile 文件）。

### 5.3 设置命名空间

沿用 `dsh-better-sidebar` 的 `settingsNamespace(NS)` 模式：

```ts
// lib/config.ts
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { Schema } from '@deepseek-ai/schemastery';

const NS = 'dsh-proxy';
const ns = settingsNamespace(NS);
ns.schema({
  enabled: Schema.boolean().default(false),
  host: Schema.string().default('0.0.0.0'),
  port: Schema.number().min(1).max(65535).default(13080),
});
export { NS, ns };
```

- host 侧 `apply` 读取该命名空间；**`enabled=false`（默认）时不监听任何端口**，只有用户开启后才建立反代 server。
- **设置变更 → 热重启监听**（dispose 旧 server → 按新值起新的；绑定失败仅日志，不影响主 DSH）。关闭 `enabled` 即停止监听。

### 5.4 反代核心 `lib/proxy.js`

与已验证脚本同构：

- `http.createServer` 监听 `{host}:{port}`。
- 每个请求：
  - 构造上游请求到 `127.0.0.1:3080`，`headers.host = '127.0.0.1:3080'`。
  - 改写 `origin`（若存在）→ `http://127.0.0.1:3080`；改写 `referer`（若存在）→ 同 host 的 URL。
  - 透传 method/path/body；响应流式回传。
  - 服务端错误 → 502。
- `server.on('upgrade')`：TCP 连到 `127.0.0.1:3080`，改写后的请求头发起 upgrade 握手，成功后双向 pipe（已验证 101 + 数据流）。

### 5.5 客户端设置 UI `lib/client.js`

参照 `dsh-better-sidebar` / DSH 客户端插件机制：
- 通过客户端运行时（`@deepseek-ai/dsh-client-runtime`）挂载进浏览器 roster。
- 在 DSH 设置面板注册一个"反向代理"分区：`enabled` 开关、`host`、`port` 输入，读/写 `dsh-proxy` 命名空间（settings RPC）。
- 显示当前监听状态（运行中/失败、实际监听地址）。

## 6. 数据流

1. 用户（公司内网其他电脑）访问 `http://10.100.50.125:13080/`。
2. 插件 http server 收到 → 改写 `Host/Origin/Referer` → 转发 `127.0.0.1:3080`。
3. DSH 视作回环请求 → 首页 / API（含特权方法）/ WebSocket 全通 → **无 403**，Sidebar/设置/凭据可用。
4. 设置面板修改 `port` → 命名空间写库 → 插件热重启监听 → 用户访问新端口。

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| 端口被占用 / 绑定失败 | console.warn + 状态标记"失败"，主 DSH 不受影响；设置面板显示错误 |
| 上游 DSH 未就绪（启动竞态） | 请求返回 502；连接建立后即正常（插件不阻塞 DSH 启动） |
| 上游连接中断 | 502，不崩溃 |
| 设置非法（port 越界等） | schema 校验拒绝写入，面板提示 |
| 反代 server 异常 | catch + 日志，不退出进程 |

## 8. 安全说明

- 与 DSH 现状一致：**无认证层、明文 HTTP**。绑定 `0.0.0.0` 意味着所有可达本机的网络（公司内网、Tailscale）都能访问。
- **默认 `enabled=false`，安装后不暴露任何端口**；用户需在设置面板显式开启才监听 `0.0.0.0:13080`（可改绑到特定网卡或关闭）。文档/README 中明确风险。
- **不做开机自启**；插件随 DSH 生命周期，DSH 关闭则监听停止（与用户"不要开机自启"一致）。

## 9. 测试计划

1. **单元**：`proxy.js` 的 Host/Origin/Referer 改写函数（输入请求头 → 断言输出）。
2. **集成（本机）**：
   - 起 DSH（127.0.0.1:3080），装插件，访问 `127.0.0.1:13080`：首页 200、`/api/session.list` 200、`/api/settings.describe` 200、WS `/api/events.mux` 101。
   - 从 `10.100.50.125:13080` 访问（模拟远程）：验证无 403、特权方法可读。
3. **设置**：出厂默认 `enabled=false`（装插件后**端口无监听**，验证安全默认值）；面板开启 → 监听启动；改 `port` → 热重启；改 `enabled=false` → 监听停止；改非法值 → 拒绝。
4. **回归**：主 DSH 3080 不受插件安装影响（未装时行为一致）。

## 10. 里程碑

- M1: 项目骨架 + 可安装 bundle（最小反代，`enabled` 默认 false 不监听，验证插件机制通）。
- M2: 设置命名空间 + 设置面板 UI + 热重启。
- M3: 完整测试 + README + 安装文档。

## 11. 关键实现决策（实现前确认）

### 11.1 插件命名空间 vs 直接配置
- **选择**：`settingsNamespace('dsh-proxy')`（用户可改的运行期设置）
- **备选**：`cordis.patch.yml` 里写死 config（`config: {host, port}`），不可在面板改
- **理由**：用户明确要求"设置页面增加菜单"，面板可调更符合诉求。

### 11.2 反代 server 的归属
- **选择**：插件自建 `node:http` server（不注册到主 webServer 的路由表）
- **备选**：在 `0.0.0.0:13080` 上用主 webServer（需改主绑定，风险高）
- **理由**：主 webServer 只支持 `127.0.0.1` 或 `0.0.0.0` 单绑定，改它会影响 3080 主界面；自建独立 server 隔离、可热重启、不影响 3080。

### 11.3 端口默认值
- **选择**：`13080`（已确认），避免与 3080 冲突。

### 11.4 安装与生命周期
- 用户要求走 **`dsh plugin --profile web add dsh-lan-proxy`**（bundle 通道）。
- **不做开机自启**，不注册 Windows 服务/计划任务；插件随 DSH 进程运行。