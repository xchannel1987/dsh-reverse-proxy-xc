// dsh-lan-proxy 的浏览器端（client half）插件。
//
// 作用：在 DSH 设置面板 "Plugins" 页的 settings.plugin.item 槽位（按 settings
// 命名空间 keyed 分派）为 dsh-lan-proxy 命名空间注册一张可编辑配置卡片。
//
// 数据通路（与 host 侧 lib/index.js 的 ProxySchema 字段一一对应）：
//   - 读取：ctx.settingsScope.bind({ namespace: 'dsh-lan-proxy' }) 返回
//     SettingsScopeController（@deepseek-ai/dsh-client-ui-settings 的
//     settingsScope 服务），提供 getSnapshot()/subscribe()/set(field, value)/
//     unset(field)。bind 内部会挂 connection 的 settings RPC 与 remote 的
//     settings/document-updated 失效通知，并在插件卸载时自动 dispose。
//   - 写入：scope.set(field, value) 内部经 api.settings.mutate（排队 +
//     expectedRevision 乐观并发控制）落到 host settings，host 侧 applies:
//     'live'，改完即热启停代理。
//
// 注意事项：
//   - 浏览器端 React 由 DSH 客户端运行时的 seed 表提供（platform 模块），
//     构建（client/build.mjs）时 external，不打包进产物。
//   - 不引入复杂 schema-form 组件库：手写受控表单（useState 草稿 + scope
//     快照初始值 + 保存按钮逐字段 scope.set），保持构建链简单。

import { useState, useEffect, useCallback } from 'react';

export const name = 'dsh-lan-proxy';

// 浏览器端 cordis fiber 注入的"服务名"（不是包名）：
//   slots        — @deepseek-ai/dsh-client-runtime 提供（ctx.slots.inject/register）
//   connection   — @deepseek-ai/dsh-client-connection 提供（settings RPC 传输；settingsScope.bind 内部要用）
//   remote       — @deepseek-ai/dsh-api-remotes 提供（settings 失效通知；settingsScope.bind 内部要用）
//   settingsScope— @deepseek-ai/dsh-client-ui-settings 提供（命名空间读写服务）
export const inject = ['slots', 'connection', 'remote', 'settingsScope'];

const NS = 'dsh-lan-proxy';

// 与 host 侧 ProxySchema 默认值保持一致（enabled=false 等）。
const DEFAULTS = {
  enabled: false,
  host: '0.0.0.0',
  port: 15151,
  authEnabled: false,
  authUser: 'admin',
  authPass: 'lan-proxy-2026',
};

/** 从 scope 快照取"有效配置"（snapshot.value 是 base+user 合并并经 schema 校验后的值）。 */
function currentValues(snapshot) {
  const raw = snapshot?.value;
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
    host: typeof raw.host === 'string' ? raw.host : DEFAULTS.host,
    port: typeof raw.port === 'number' ? raw.port : DEFAULTS.port,
    authEnabled: typeof raw.authEnabled === 'boolean' ? raw.authEnabled : DEFAULTS.authEnabled,
    authUser: typeof raw.authUser === 'string' ? raw.authUser : DEFAULTS.authUser,
    authPass: typeof raw.authPass === 'string' ? raw.authPass : DEFAULTS.authPass,
  };
}

/** 卡片控制器：持有一个命名空间 scope，向注册的卡片暴露 hooks 与保存动作。 */
class LanProxyCardController {
  constructor(scope) {
    this.scope = scope;
  }
  /**
   * 注册时注入的 face：hooks 里的源会成为组件的 useLanProxy(selector) 选择器
   * 钩子（渲染器用 useSyncExternalStore 桥接）；其余字段原样成为组件 props。
   */
  inject() {
    return {
      hooks: { lanProxy: this.scope },
      // 保存：逐字段 scope.set（内部 api.settings.mutate，带 expectedRevision 排队写）。
      save: async (fields) => {
        for (const field of Object.keys(fields)) {
          await this.scope.set(field, fields[field]);
        }
      },
    };
  }
}

// —— 简单受控表单的样式（沿用 DSW 设计 token，全部带兜底色，缺 token 也不难看）——
const st = {
  card: {
    display: 'flex', flexDirection: 'column', gap: '12px',
    padding: '14px 16px', borderRadius: '8px',
    border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))',
    background: 'var(--dsw-alias-bg-base, #ffffff)',
    color: 'var(--dsw-alias-label-primary, #0f1115)',
  },
  head: { display: 'flex', flexDirection: 'column', gap: '2px' },
  title: { margin: 0, fontSize: '14px', lineHeight: '22px', fontWeight: 600 },
  desc: { margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #81858c)' },
  sep: { height: '1px', margin: '2px 0', background: 'var(--dsw-alias-border-l2, rgba(0,0,0,0.12))', border: '0' },
  row: { display: 'flex', alignItems: 'center', gap: '10px' },
  label: {
    flex: '0 0 132px', fontSize: '13px', lineHeight: '20px',
    color: 'var(--dsw-alias-label-secondary, #61666b)', textAlign: 'right',
  },
  input: {
    flex: 1, minWidth: 0, padding: '5px 10px', fontSize: '13px', lineHeight: '20px',
    borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))',
    background: 'var(--dsw-alias-bg-base, #ffffff)',
    color: 'var(--dsw-alias-label-primary, #0f1115)',
  },
  check: { width: '16px', height: '16px', accentColor: 'var(--dsw-alias-brand-primary, #3964fe)' },
  footer: { display: 'flex', alignItems: 'center', gap: '12px' },
  saveBtn: {
    padding: '6px 16px', borderRadius: '6px', border: '0', cursor: 'pointer',
    fontSize: '13px', fontWeight: 600, color: '#ffffff',
    background: 'var(--dsw-alias-brand-primary, #3964fe)',
  },
  saveBtnDisabled: { opacity: 0.5, cursor: 'default' },
  status: { margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #61666b)' },
  error: { margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary, #d93026)' },
  ok: { margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-success-primary, #1a7f37)' },
  hint: { margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary, #81858c)' },
};

/** 设置卡片组件：受控表单 + 初始值来自 scope 快照 + 保存触发逐字段写。 */
function LanProxyCard(props) {
  // useLanProxy 由控制器 inject 的 hooks 生成：订阅 scope 快照
  const snapshot = props.useLanProxy((s) => s);
  const ready = snapshot?.status === 'ready';
  const writable = ready && !!snapshot?.writable;

  // 草稿状态：布尔/字符串字段用一个对象，port 单独用文本（允许输入中间态）。
  const [draft, setDraft] = useState(() => currentValues(snapshot));
  const [portText, setPortText] = useState(() => String(currentValues(snapshot).port));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMs, setSavedMs] = useState(0);
  const [error, setError] = useState(null);

  // scope 快照 revision 变化（含自己保存成功后）→ 若当前没有未保存草稿，
  // 把表单重置为最新配置；用户正在输入（dirty）时不覆盖。
  useEffect(() => {
    if (dirty) return;
    const values = currentValues(snapshot);
    setDraft(values);
    setPortText(String(values.port));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在状态变化时同步
  }, [snapshot?.revision, snapshot?.status, dirty]);

  const setField = useCallback((key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setError(null);
  }, []);

  const onSave = useCallback(async () => {
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError('端口必须是 1–65535 的整数');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await props.save({
        enabled: draft.enabled,
        host: draft.host.trim() || '0.0.0.0',
        port,
        authEnabled: draft.authEnabled,
        authUser: draft.authUser,
        authPass: draft.authPass,
      });
      setDirty(false);
      setSavedMs(Date.now());
    } catch (err) {
      setError(`保存失败：${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [portText, draft, props.save]);

  // 未就绪 / 只读提示
  let statusNode;
  if (!ready) {
    statusNode = <p style={st.status}>配置加载中…</p>;
  } else if (!writable) {
    statusNode = <p style={st.status}>当前连接为只读（settings 仅回环连接可写，远程/转发连接无法保存）。</p>;
  } else if (saving) {
    statusNode = <p style={st.status}>保存中…</p>;
  } else if (savedMs > 0) {
    statusNode = <p style={st.ok}>已保存，设置即时生效。</p>;
  } else {
    statusNode = <p style={st.hint}>更改后点击保存，host 侧立即热启停代理。</p>;
  }

  return (
    <li style={st.card}>
      <div style={st.head}>
        <h3 style={st.title}>局域网反向代理 (dsh-lan-proxy)</h3>
        <p style={st.desc}>
          把本机 DSH Web（127.0.0.1:3080）通过指定 host:port 暴露到局域网，手机/其他电脑可访问。
        </p>
      </div>
      <label style={st.row}>
        <span style={st.label}>启用代理</span>
        <input type="checkbox" style={st.check} checked={!!draft.enabled} disabled={!writable}
          onChange={(e) => setField('enabled', e.target.checked)} />
        <span style={st.hint}>关闭时不监听任何端口</span>
      </label>
      <label style={st.row}>
        <span style={st.label}>监听地址 (host)</span>
        <input style={st.input} value={draft.host} disabled={!writable}
          placeholder="0.0.0.0" spellCheck={false}
          onChange={(e) => setField('host', e.target.value)} />
      </label>
      <label style={st.row}>
        <span style={st.label}>监听端口 (port)</span>
        <input style={st.input} type="number" min={1} max={65535} value={portText} disabled={!writable}
          onChange={(e) => { setPortText(e.target.value); setDirty(true); setError(null); }} />
      </label>
      <hr style={st.sep} />
      <label style={st.row}>
        <span style={st.label}>启用访问认证</span>
        <input type="checkbox" style={st.check} checked={!!draft.authEnabled} disabled={!writable}
          onChange={(e) => setField('authEnabled', e.target.checked)} />
        <span style={st.hint}>开启后访问代理需 Basic 认证</span>
      </label>
      <label style={st.row}>
        <span style={st.label}>认证用户名</span>
        <input style={st.input} value={draft.authUser} disabled={!writable}
          autoComplete="off" spellCheck={false}
          onChange={(e) => setField('authUser', e.target.value)} />
      </label>
      <label style={st.row}>
        <span style={st.label}>认证密码</span>
        <input style={st.input} type="password" value={draft.authPass} disabled={!writable}
          autoComplete="new-password"
          onChange={(e) => setField('authPass', e.target.value)} />
      </label>
      <div style={st.footer}>
        {statusNode}
        <button type="button" style={{ ...st.saveBtn, ...(saving || !writable ? st.saveBtnDisabled : {}) }}
          disabled={saving || !writable} onClick={onSave}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </li>
  );
}

/**
 * 插件入口：绑定命名空间 scope，向 settings.plugin.item 槽位注册卡片。
 * 槽位声明由 @deepseek-ai/dsh-client-ui-settings-plugins 的 Plugins 页提供，
 * ctx.slots.inject 会等声明出现后再注册；插件卸载时注册随 fiber 自动销毁。
 */
export function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NS });
  const controller = new LanProxyCardController(scope);

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    order: 0,
    inject: () => controller.inject(),
  }, LanProxyCard));
}