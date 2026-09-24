// dsh-reverse-proxy-xc 浏览器端 bundle（手写，无构建步骤）——照 dsh-litellm-key-usage 同构。
//
// 与 DSH 内置客户端插件同构：window.__ModuleLoader__.load({ id, factory })。
// 只 require() 平台静态模块（react），其余协作全部走 cordis 服务注入
// （connection / slots / configForms）。
//
// 展示：设置页新增分区「局域网反向代理」（settings.section）——enabled/host/port
// authEnabled/authUser/authPass 六字段编辑表单，保存逐字段写 host settings，再经
// /api/dsh-reverse-proxy-xc/control 控制路由让宿主热启停（DSH>=0.1.7）。
window.__ModuleLoader__.load({
  id: "dsh-reverse-proxy-xc",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useCallback = React.useCallback;

    var NS = "dsh-reverse-proxy-xc";
    var DEFAULTS = {
      enabled: false,
      host: "0.0.0.0",
      port: 3090,
      authEnabled: false,
      authUser: "admin",
      authPass: "123456",
      bypassToken: true,
    };

    function currentValues(snapshot) {
      var raw = snapshot && snapshot.value;
      if (!raw || typeof raw !== "object") return { ...DEFAULTS };
      return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled,
        host: typeof raw.host === "string" ? raw.host : DEFAULTS.host,
        port: typeof raw.port === "number" ? raw.port : DEFAULTS.port,
        authEnabled: typeof raw.authEnabled === "boolean" ? raw.authEnabled : DEFAULTS.authEnabled,
        authUser: typeof raw.authUser === "string" ? raw.authUser : DEFAULTS.authUser,
        authPass: typeof raw.authPass === "string" ? raw.authPass : DEFAULTS.authPass,
        bypassToken: typeof raw.bypassToken === "boolean" ? raw.bypassToken : DEFAULTS.bypassToken,
      };
    }

    // —— 样式（沿用 DSW 设计 token，全部带兜底色）——
    var st = {
      card: { display: "flex", flexDirection: "column", gap: "12px", padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", background: "var(--dsw-alias-bg-base, #ffffff)", color: "var(--dsw-alias-label-primary, #0f1115)" },
      title: { margin: 0, fontSize: "14px", lineHeight: "22px", fontWeight: 600 },
      desc: { margin: "2px 0 0", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #81858c)" },
      sep: { height: "1px", margin: "2px 0", background: "var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", border: "0" },
      row: { display: "flex", alignItems: "center", gap: "10px" },
      label: { flex: "0 0 132px", fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-secondary, #61666b)", textAlign: "right" },
      input: { flex: 1, minWidth: 0, padding: "5px 10px", fontSize: "13px", lineHeight: "20px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))", background: "var(--dsw-alias-bg-base, #ffffff)", color: "var(--dsw-alias-label-primary, #0f1115)" },
      check: { width: "16px", height: "16px", accentColor: "var(--dsw-alias-brand-primary, #3964fe)" },
      hint: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary, #81858c)" },
      footer: { display: "flex", alignItems: "center", gap: "12px" },
      statusText: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #61666b)", flex: "1", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      saveBtn: { flex: "none", padding: "6px 16px", borderRadius: "6px", border: "0", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#fff", background: "var(--dsw-alias-brand-primary, #3964fe)" },
      saveBtnDisabled: { opacity: 0.5, cursor: "default" },
      status: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-secondary, #61666b)" },
      error: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-state-error-primary, #d93026)" },
      ok: { margin: 0, fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-state-success-primary, #1a7f37)" },
    };

    // —— 输入子组件：定义在模块顶层（不能在渲染函数内定义组件，否则每次
    // 渲染产生新组件身份，React 会卸载重建 input —— 表现为输 1 个字符失焦）——
    function Field(props) {
      return React.createElement("label", { style: st.row },
        React.createElement("span", { style: st.label }, props.label),
        React.createElement("input", {
          style: st.input,
          type: props.type || "text",
          value: props.value,
          disabled: !props.writable,
          autoComplete: props.autoComplete || "off",
          spellCheck: false,
          onChange: function (e) { props.onChange(e.target.value); },
        })
      );
    }

    function Checkbox(props) {
      return React.createElement("label", { style: st.row },
        React.createElement("input", { type: "checkbox", style: st.check, checked: !!props.value, disabled: !props.writable, onChange: function (e) { props.onChange(e.target.checked); } }),
        React.createElement("span", { style: st.hint }, props.label)
      );
    }

    function LanProxySection(props) {
      var scope = props.scope;
      var snapshot = props.useLanProxy ? props.useLanProxy(function (s) { return s; }) : scope.getSnapshot();
      var ready = snapshot && snapshot.status === "ready";
      var writable = ready && !!snapshot.writable;

      var initial = currentValues(snapshot);
      var draftState = useState(initial);
      var portTextState = useState(String(initial.port));
      var dirtyState = useState(false);
      var errorState = useState(null);
      var statusState = useState(null);

      var draft = draftState[0];
      var setDraft = draftState[1];
      var portText = portTextState[0];
      var setPortText = portTextState[1];
      var dirty = dirtyState[0];
      var setDirty = dirtyState[1];
      var error = errorState[0];
      var setError = errorState[1];
      var status = statusState[0];
      var setStatus = statusState[1];

      // snapshot 变化且无未保存草稿 -> 同步表单
      useEffect(function () {
        if (dirty) return;
        var values = currentValues(snapshot);
        setDraft(values);
        setPortText(String(values.port));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [snapshot && snapshot.revision, snapshot && snapshot.status, dirty]);

      function setField(key, value) {
        setDraft(function (d) { var n = {}; for (var k in d) n[k] = d[k]; n[key] = value; return n; });
        setDirty(true);
        setError(null);
      }

      function onSave() {
        var port = Number(portText);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          setError("端口必须是 1–65535 的整数");
          return;
        }
        setError(null);
        setStatus("保存中…");
        var fields = {
          enabled: !!draft.enabled,
          host: String(draft.host || "0.0.0.0").trim() || "0.0.0.0",
          port: port,
          authEnabled: !!draft.authEnabled,
          authUser: String(draft.authUser || ""),
          authPass: String(draft.authPass || ""),
          bypassToken: draft.bypassToken !== false,
        };
        var all = Object.keys(fields).map(function (f) { return scope.set(f, fields[f]); });
        Promise.all(all).then(function () {
          setDirty(false);
          setStatus("正在热启停代理…");
          // DSH >= 0.1.7：宿主插件不再 watch 设置，需显式经控制路由热启停
          //（/api/dsh-reverse-proxy-xc/control，复用官方 /api 认证围栏）。
          fetch("/api/dsh-reverse-proxy-xc/control", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(fields),
          }).then(function (res) {
            if (res.ok) setStatus("已保存，代理已按新配置热启停。");
            else setError("已保存，但代理热启停失败（HTTP " + res.status + "）。");
          }).catch(function () {
            setError("已保存，但代理热启停失败（网络错误）。");
          });
        }).catch(function (err) {
          setStatus(null);
          setError("保存失败：" + (err && err.message ? err.message : String(err)));
        });
      }

      var statusNode;
      if (error) statusNode = React.createElement("p", { style: Object.assign({}, st.statusText, { color: "var(--dsw-alias-state-error-primary, #d93026)" }) }, error);
      else if (!ready) statusNode = React.createElement("p", { style: st.statusText }, "配置加载中…");
      else if (!writable) statusNode = React.createElement("p", { style: st.statusText }, "当前连接为只读（settings 仅回环连接可写）。");
      else if (status === "保存中…") statusNode = React.createElement("p", { style: st.statusText }, status);
      else if (status) statusNode = React.createElement("p", { style: Object.assign({}, st.statusText, { color: "var(--dsw-alias-state-success-primary, #1a7f37)" }) }, status);
      else statusNode = React.createElement("p", { style: st.statusText }, "更改后点击保存，host 侧立即热启停代理（含端口/认证变更）。");

      return React.createElement("div", { style: st.card },
        React.createElement("div", null,
          React.createElement("h3", { style: st.title }, "局域网反向代理 (dsh-reverse-proxy-xc)"),
          React.createElement("p", { style: st.desc }, "把本机 DSH Web（127.0.0.1:3080）通过指定 host:port 暴露到局域网，手机/其他电脑可访问。")
        ),
        React.createElement(Checkbox, { field: "enabled", label: "启用代理（关闭时不监听任何端口）", value: draft.enabled, writable: writable, onChange: function (v) { setField("enabled", v); } }),
        React.createElement(Field, { field: "host", label: "监听地址 (host)", value: draft.host, writable: writable, onChange: function (v) { setField("host", v); } }),
        React.createElement(Field, { field: "port", label: "监听端口 (port)", value: portText, numeric: true, writable: writable, onChange: function (v) { setPortText(v); setDirty(true); setError(null); } }),
        React.createElement(Checkbox, { field: "bypassToken", label: "免 Token 认证（反代流量自动注入本机凭据，手机免输启动 Token）", value: draft.bypassToken, writable: writable, onChange: function (v) { setField("bypassToken", v); } }),
        React.createElement("hr", { style: st.sep }),
        React.createElement(Checkbox, { field: "authEnabled", label: "启用访问认证（Basic）", value: draft.authEnabled, writable: writable, onChange: function (v) { setField("authEnabled", v); } }),
        React.createElement(Field, { field: "authUser", label: "认证用户名", value: draft.authUser, writable: writable, onChange: function (v) { setField("authUser", v); } }),
        React.createElement(Field, { field: "authPass", label: "认证密码", value: draft.authPass, type: "password", autoComplete: "new-password", writable: writable, onChange: function (v) { setField("authPass", v); } }),
        React.createElement("div", { style: st.footer },
          statusNode,
          React.createElement("button", { type: "button", style: Object.assign({}, st.saveBtn, (!writable || status === "保存中…") ? st.saveBtnDisabled : {}), disabled: !writable || status === "保存中…", onClick: onSave },
            status === "保存中…" ? "保存中…" : "保存")
        )
      );
    }

    var inject = ["connection", "slots", "configForms"];

    function apply(ctx) {
      // DSH >= 0.1.7：settingsScope 服务更名为 configForms，get(namespace) 直接
      // 返回同形态命名空间 scope（getSnapshot / set / subscribe / writable）。
      var scope = ctx.configForms && typeof ctx.configForms.get === "function"
        ? ctx.configForms.get(NS)
        : (ctx.get && typeof ctx.get === "function" && ctx.get("configForms") && ctx.get("configForms").get)
          ? ctx.get("configForms").get(NS)
          : null;
      // 设置页新增分区（settings.section 整页，0.1.7 保留的挂载点）
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "dsh-reverse-proxy-xc",
          order: 90,
          label: function () { return "局域网反向代理"; },
          inject: function () { return { scope: scope }; },
        }, LanProxySection);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});