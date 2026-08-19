window.__ModuleLoader__.load({
	id: "dsh-lan-proxy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var name = "dsh-lan-proxy";
var inject = ["slots", "connection", "remote", "settingsScope"];
var NS = "dsh-lan-proxy";
var DEFAULTS = {
  enabled: false,
  host: "0.0.0.0",
  port: 15151,
  authEnabled: false,
  authUser: "admin",
  authPass: "lan-proxy-2026"
};
function currentValues(snapshot) {
  const raw = snapshot?.value;
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled,
    host: typeof raw.host === "string" ? raw.host : DEFAULTS.host,
    port: typeof raw.port === "number" ? raw.port : DEFAULTS.port,
    authEnabled: typeof raw.authEnabled === "boolean" ? raw.authEnabled : DEFAULTS.authEnabled,
    authUser: typeof raw.authUser === "string" ? raw.authUser : DEFAULTS.authUser,
    authPass: typeof raw.authPass === "string" ? raw.authPass : DEFAULTS.authPass
  };
}
var LanProxyCardController = class {
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
      }
    };
  }
};
var st = {
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "8px",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
    background: "var(--dsw-alias-bg-base, #ffffff)",
    color: "var(--dsw-alias-label-primary, #0f1115)"
  },
  head: { display: "flex", flexDirection: "column", gap: "2px" },
  title: { margin: 0, fontSize: "14px", lineHeight: "22px", fontWeight: 600 },
  desc: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #81858c)" },
  sep: { height: "1px", margin: "2px 0", background: "var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", border: "0" },
  row: { display: "flex", alignItems: "center", gap: "10px" },
  label: {
    flex: "0 0 132px",
    fontSize: "13px",
    lineHeight: "20px",
    color: "var(--dsw-alias-label-secondary, #61666b)",
    textAlign: "right"
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "5px 10px",
    fontSize: "13px",
    lineHeight: "20px",
    borderRadius: "6px",
    border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))",
    background: "var(--dsw-alias-bg-base, #ffffff)",
    color: "var(--dsw-alias-label-primary, #0f1115)"
  },
  check: { width: "16px", height: "16px", accentColor: "var(--dsw-alias-brand-primary, #3964fe)" },
  footer: { display: "flex", alignItems: "center", gap: "12px" },
  saveBtn: {
    padding: "6px 16px",
    borderRadius: "6px",
    border: "0",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: "#ffffff",
    background: "var(--dsw-alias-brand-primary, #3964fe)"
  },
  saveBtnDisabled: { opacity: 0.5, cursor: "default" },
  status: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #61666b)" },
  error: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-state-error-primary, #d93026)" },
  ok: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-state-success-primary, #1a7f37)" },
  hint: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #81858c)" }
};
function LanProxyCard(props) {
  const snapshot = props.useLanProxy((s) => s);
  const ready = snapshot?.status === "ready";
  const writable = ready && !!snapshot?.writable;
  const [draft, setDraft] = (0, import_react.useState)(() => currentValues(snapshot));
  const [portText, setPortText] = (0, import_react.useState)(() => String(currentValues(snapshot).port));
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [savedMs, setSavedMs] = (0, import_react.useState)(0);
  const [error, setError] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (dirty) return;
    const values = currentValues(snapshot);
    setDraft(values);
    setPortText(String(values.port));
  }, [snapshot?.revision, snapshot?.status, dirty]);
  const setField = (0, import_react.useCallback)((key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setError(null);
  }, []);
  const onSave = (0, import_react.useCallback)(async () => {
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError("\u7AEF\u53E3\u5FC5\u987B\u662F 1\u201365535 \u7684\u6574\u6570");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await props.save({
        enabled: draft.enabled,
        host: draft.host.trim() || "0.0.0.0",
        port,
        authEnabled: draft.authEnabled,
        authUser: draft.authUser,
        authPass: draft.authPass
      });
      setDirty(false);
      setSavedMs(Date.now());
    } catch (err) {
      setError(`\u4FDD\u5B58\u5931\u8D25\uFF1A${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [portText, draft, props.save]);
  let statusNode;
  if (!ready) {
    statusNode = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: st.status, children: "\u914D\u7F6E\u52A0\u8F7D\u4E2D\u2026" });
  } else if (!writable) {
    statusNode = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: st.status, children: "\u5F53\u524D\u8FDE\u63A5\u4E3A\u53EA\u8BFB\uFF08settings \u4EC5\u56DE\u73AF\u8FDE\u63A5\u53EF\u5199\uFF0C\u8FDC\u7A0B/\u8F6C\u53D1\u8FDE\u63A5\u65E0\u6CD5\u4FDD\u5B58\uFF09\u3002" });
  } else if (saving) {
    statusNode = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: st.status, children: "\u4FDD\u5B58\u4E2D\u2026" });
  } else if (savedMs > 0) {
    statusNode = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: st.ok, children: "\u5DF2\u4FDD\u5B58\uFF0C\u8BBE\u7F6E\u5373\u65F6\u751F\u6548\u3002" });
  } else {
    statusNode = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: st.hint, children: "\u66F4\u6539\u540E\u70B9\u51FB\u4FDD\u5B58\uFF0Chost \u4FA7\u7ACB\u5373\u70ED\u542F\u505C\u4EE3\u7406\u3002" });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { style: st.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: st.head, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: st.title, children: "\u5C40\u57DF\u7F51\u53CD\u5411\u4EE3\u7406 (dsh-lan-proxy)" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: st.desc, children: "\u628A\u672C\u673A DSH Web\uFF08127.0.0.1:3080\uFF09\u901A\u8FC7\u6307\u5B9A host:port \u66B4\u9732\u5230\u5C40\u57DF\u7F51\uFF0C\u624B\u673A/\u5176\u4ED6\u7535\u8111\u53EF\u8BBF\u95EE\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: st.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.label, children: "\u542F\u7528\u4EE3\u7406" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          style: st.check,
          checked: !!draft.enabled,
          disabled: !writable,
          onChange: (e) => setField("enabled", e.target.checked)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.hint, children: "\u5173\u95ED\u65F6\u4E0D\u76D1\u542C\u4EFB\u4F55\u7AEF\u53E3" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: st.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.label, children: "\u76D1\u542C\u5730\u5740 (host)" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: st.input,
          value: draft.host,
          disabled: !writable,
          placeholder: "0.0.0.0",
          spellCheck: false,
          onChange: (e) => setField("host", e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: st.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.label, children: "\u76D1\u542C\u7AEF\u53E3 (port)" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: st.input,
          type: "number",
          min: 1,
          max: 65535,
          value: portText,
          disabled: !writable,
          onChange: (e) => {
            setPortText(e.target.value);
            setDirty(true);
            setError(null);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("hr", { style: st.sep }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: st.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.label, children: "\u542F\u7528\u8BBF\u95EE\u8BA4\u8BC1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          style: st.check,
          checked: !!draft.authEnabled,
          disabled: !writable,
          onChange: (e) => setField("authEnabled", e.target.checked)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.hint, children: "\u5F00\u542F\u540E\u8BBF\u95EE\u4EE3\u7406\u9700 Basic \u8BA4\u8BC1" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: st.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.label, children: "\u8BA4\u8BC1\u7528\u6237\u540D" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: st.input,
          value: draft.authUser,
          disabled: !writable,
          autoComplete: "off",
          spellCheck: false,
          onChange: (e) => setField("authUser", e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: st.row, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: st.label, children: "\u8BA4\u8BC1\u5BC6\u7801" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: st.input,
          type: "password",
          value: draft.authPass,
          disabled: !writable,
          autoComplete: "new-password",
          onChange: (e) => setField("authPass", e.target.value)
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: st.footer, children: [
      statusNode,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: { ...st.saveBtn, ...saving || !writable ? st.saveBtnDisabled : {} },
          disabled: saving || !writable,
          onClick: onSave,
          children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
        }
      )
    ] })
  ] });
}
function apply(ctx) {
  const scope = ctx.settingsScope.bind({ namespace: NS });
  const controller = new LanProxyCardController(scope);
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: NS,
    order: 0,
    inject: () => controller.inject()
  }, LanProxyCard));
}
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
