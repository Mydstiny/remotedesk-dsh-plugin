/**
 * Browser half: the RemoteDesk control panel inside DSH Web settings.
 *
 * Hand-written against the frozen platform module table (react,
 * react/jsx-runtime), so this package needs no bundler step. Every request goes
 * to an exact `/api/remotedesk.*` route owned by this package's host half, which
 * the Connection plugin authenticates with the same Host/Origin fence and signed
 * browser-session cookie as the built-in GUI.
 */
window.__ModuleLoader__.load({
  id: "@remotedesk/dsh-plugin",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const NS = "remotedesk.settings";
    const ROUTES = {
      status: "/api/remotedesk.status",
      invite: "/api/remotedesk.invite",
      revoke: "/api/remotedesk.revoke",
      project: "/api/remotedesk.project",
      panel: "/api/remotedesk.panel",
    };
    const PANEL_PROPS = { name: "settings.section", id: "remotedesk", order: 40, locale: NS };

    const zh = {
      "nav": "RemoteDesk",
      "subtitle": "本机远程桥接服务：状态、项目、已配对设备与配对码。",
      "refresh": "刷新",
      "loading": "正在读取状态…",
      "loadError": "读取失败：{message}",
      "actionError": "操作失败：{message}",
      "service.title": "服务",
      "service.unconfigured": "该 state 目录尚未初始化：先用 panel 命令或原生 host 启动一次服务，再回到这里。",
      "service.host": "监听地址",
      "service.lock": "锁文件",
      "service.running": "运行中（PID {pid}）",
      "service.stopped": "未运行",
      "service.lockMissing": "缺失",
      "service.lockStale": "已失效",
      "service.lockActive": "有效",
      "service.sessions": "会话",
      "service.operations": "进行中的操作",
      "service.sessionCount": "{count} 个",
      "panel.title": "本机控制面板",
      "panel.hint": "在浏览器中打开插件自带的本机控制面板（仅 127.0.0.1，带一次性令牌）。",
      "panel.open": "打开本机控制面板",
      "panel.opening": "正在启动面板…",
      "panel.running": "面板已在 {port} 端口运行",
      "panel.reused": "已复用正在运行的面板（{port}）",
      "pair.title": "配对码",
      "pair.hint": "生成一个 120 秒有效的邀请。配对角色的权限在服务端校验。",
      "pair.role": "角色",
      "pair.roleViewer": "viewer（只读）",
      "pair.roleOperator": "operator（可操作）",
      "pair.projects": "授权项目",
      "pair.generate": "生成配对码",
      "pair.generating": "正在生成…",
      "pair.live": "已生成，剩余 {time}",
      "pair.pending": "存在一个未过期的邀请，剩余 {time}（配对码只在生成时显示一次）",
      "pair.expired": "配对码已过期，请重新生成。",
      "pair.none": "当前没有未过期的邀请，刷新页面也无法再取回已生成的配对码。",
      "pair.empty": "还没有项目，请先在下方添加。",
      "pair.copy": "复制配对码",
      "pair.copied": "已复制",
      "pair.details": "完整配对信息（JSON，供客户端导入）",
      "pair.caWarning": "完整信息里含 CA 证书，同样只在生成时显示一次。",
      "projects.title": "项目",
      "projects.empty": "尚未配置项目。",
      "projects.id": "ID",
      "projects.name": "名称",
      "projects.path": "本机路径",
      "projects.model": "模型",
      "projects.vision": "视觉",
      "projects.add": "添加项目",
      "projects.adding": "正在添加…",
      "projects.addedHint": "已写入插件 state，服务重启后加载新项目。",
      "projects.idPlaceholder": "项目 ID",
      "projects.pathPlaceholder": "本机绝对路径",
      "projects.titlePlaceholder": "显示名称（可选）",
      "devices.title": "已配对设备",
      "devices.empty": "尚未配对设备。",
      "devices.name": "设备",
      "devices.role": "角色",
      "devices.projects": "授权项目",
      "devices.status": "状态",
      "devices.paired": "已配对",
      "devices.revoked": "已撤销",
      "devices.expired": "已过期",
      "devices.expires": "到期",
      "devices.revoke": "撤销",
      "devices.revoking": "正在撤销…",
      "devices.revokeConfirm": "撤销设备 {name} 的远程访问？",
      "devices.noHeartbeat": "协议没有在线心跳：这里显示的是授权状态，不代表设备此刻在线。",
      "yes": "是",
      "no": "否",
    };

    const en = {
      "nav": "RemoteDesk",
      "subtitle": "Local remote-bridge service: status, projects, paired devices and pairing codes.",
      "refresh": "Refresh",
      "loading": "Reading status…",
      "loadError": "Read failed: {message}",
      "actionError": "Action failed: {message}",
      "service.title": "Service",
      "service.unconfigured": "This state directory is not initialized yet: start the service once (panel command or native host) and come back.",
      "service.host": "Listener",
      "service.lock": "Lock file",
      "service.running": "Running (PID {pid})",
      "service.stopped": "Not running",
      "service.lockMissing": "missing",
      "service.lockStale": "stale",
      "service.lockActive": "active",
      "service.sessions": "Sessions",
      "service.operations": "Operations in flight",
      "service.sessionCount": "{count}",
      "panel.title": "Local control panel",
      "panel.hint": "Open the plugin's own loopback control panel in a browser (127.0.0.1 only, one-time token).",
      "panel.open": "Open local control panel",
      "panel.opening": "Starting the panel…",
      "panel.running": "Panel already running on port {port}",
      "panel.reused": "Reused the running panel ({port})",
      "pair.title": "Pairing code",
      "pair.hint": "Mint an invitation valid for 120 seconds. The paired role is enforced by the host.",
      "pair.role": "Role",
      "pair.roleViewer": "viewer (read only)",
      "pair.roleOperator": "operator (may act)",
      "pair.projects": "Authorized projects",
      "pair.generate": "Generate pairing code",
      "pair.generating": "Generating…",
      "pair.live": "Generated, {time} left",
      "pair.pending": "An unexpired invitation exists, {time} left (a code is shown only when it is minted)",
      "pair.expired": "The pairing code expired. Generate a new one.",
      "pair.none": "No unexpired invitation. A minted code cannot be read back after a reload.",
      "pair.empty": "No projects yet — add one below first.",
      "pair.copy": "Copy code",
      "pair.copied": "Copied",
      "pair.details": "Full pairing payload (JSON, for the client)",
      "pair.caWarning": "The full payload carries the CA certificate and is likewise shown only once.",
      "projects.title": "Projects",
      "projects.empty": "No projects configured.",
      "projects.id": "ID",
      "projects.name": "Name",
      "projects.path": "Local path",
      "projects.model": "Model",
      "projects.vision": "Vision",
      "projects.add": "Add project",
      "projects.adding": "Adding…",
      "projects.addedHint": "Written to plugin state; the service loads new projects after a restart.",
      "projects.idPlaceholder": "Project ID",
      "projects.pathPlaceholder": "Absolute local path",
      "projects.titlePlaceholder": "Display name (optional)",
      "devices.title": "Paired devices",
      "devices.empty": "No paired devices.",
      "devices.name": "Device",
      "devices.role": "Role",
      "devices.projects": "Projects",
      "devices.status": "Status",
      "devices.paired": "paired",
      "devices.revoked": "revoked",
      "devices.expired": "expired",
      "devices.expires": "Expires",
      "devices.revoke": "Revoke",
      "devices.revoking": "Revoking…",
      "devices.revokeConfirm": "Revoke remote access for {name}?",
      "devices.noHeartbeat": "The protocol has no liveness heartbeat: this shows authorization state, not whether a device is online right now.",
      "yes": "yes",
      "no": "no",
    };

    const CSS = [
      ".rd_root{display:flex;flex-direction:column;gap:18px;padding:16px 0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}",
      ".rd_sub{color:var(--dsw-alias-label-tertiary);margin:0}",
      ".rd_card{border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;background:var(--dsw-alias-bg-layer-3)}",
      ".rd_head{display:flex;align-items:center;gap:10px}",
      ".rd_title{font-size:13px;font-weight:600;flex:1;margin:0}",
      ".rd_row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
      ".rd_field{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".rd_label{color:var(--dsw-alias-label-tertiary);font-size:12px}",
      ".rd_value{word-break:break-all}",
      ".rd_mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
      ".rd_code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:600;letter-spacing:.04em;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);word-break:break-all}",
      ".rd_btn{font:inherit;font-size:13px;height:30px;padding:0 12px;border-radius:8px;cursor:pointer;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}",
      ".rd_btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}",
      ".rd_btn:disabled{opacity:.5;cursor:default}",
      ".rd_primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}",
      ".rd_danger{color:var(--dsw-alias-label-error);border-color:var(--dsw-alias-label-error)}",
      ".rd_input{font:inherit;font-size:13px;height:30px;padding:0 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);min-width:0}",
      ".rd_input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}",
      ".rd_select{font:inherit;font-size:13px;height:30px;padding:0 8px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}",
      ".rd_table{width:100%;border-collapse:collapse;font-size:12px}",
      ".rd_table th{text-align:left;font-weight:500;color:var(--dsw-alias-label-tertiary);padding:6px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2)}",
      ".rd_table td{padding:6px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);vertical-align:top;word-break:break-all}",
      ".rd_badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}",
      ".rd_badgeErr{color:var(--dsw-alias-label-error)}",
      ".rd_hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}",
      ".rd_error{margin:0;color:var(--dsw-alias-label-error);font-size:12px}",
      ".rd_details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px}",
      ".rd_json{margin:8px 0 0;padding:10px;border-radius:10px;background:var(--dsw-alias-bg-module-platform);max-height:220px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all}",
      ".rd_checks{display:flex;gap:12px;flex-wrap:wrap}",
      ".rd_check{display:flex;align-items:center;gap:6px}",
    ].join("");

    function ensureStyles() {
      if (typeof document === "undefined") return;
      const id = "@remotedesk/dsh-plugin/panel.css";
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(id) + "]") !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "@remotedesk/dsh-plugin";
      tag.dataset.pluginCss = id;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    async function call(path, body) {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (!response.ok) throw new Error(data.error || "HTTP_" + String(response.status));
      return data;
    }

    function formatRemaining(expires, now) {
      const seconds = Math.max(0, Math.ceil((expires - now) / 1000));
      return String(Math.floor(seconds / 60)) + ":" + String(seconds % 60).padStart(2, "0");
    }

    function formatTime(value) {
      if (!Number.isSafeInteger(value)) return "—";
      return new Date(value).toLocaleString();
    }

    function Card({ title, action, children }) {
      return React.createElement(
        "section",
        { className: "rd_card" },
        React.createElement(
          "div",
          { className: "rd_head" },
          React.createElement("h3", { className: "rd_title" }, title),
          action,
        ),
        children,
      );
    }

    function Field({ label, children }) {
      return React.createElement(
        "div",
        { className: "rd_field" },
        React.createElement("span", { className: "rd_label" }, label),
        React.createElement("span", { className: "rd_value" }, children),
      );
    }

    function RemoteDeskSection({ copy }) {
      const t = copy;
      const [snapshot, setSnapshot] = React.useState(null);
      const [error, setError] = React.useState("");
      const [busy, setBusy] = React.useState("");
      const [notice, setNotice] = React.useState("");
      const [invite, setInvite] = React.useState(null);
      const [role, setRole] = React.useState("operator");
      const [selectedProjects, setSelectedProjects] = React.useState([]);
      const [draft, setDraft] = React.useState({ id: "", path: "", title: "" });
      const [now, setNow] = React.useState(() => Date.now());

      const refresh = React.useCallback(async () => {
        try {
          setSnapshot(await call(ROUTES.status));
          setError("");
        } catch (failure) {
          setError(t("loadError", { message: failure.message }));
        }
      }, [t]);

      React.useEffect(() => {
        ensureStyles();
        refresh();
      }, [refresh]);

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, []);

      const run = async (key, action) => {
        setBusy(key);
        setNotice("");
        try {
          await action();
        } catch (failure) {
          setError(t("actionError", { message: failure.message }));
        } finally {
          setBusy("");
        }
      };

      const generate = () =>
        run("invite", async () => {
          const result = await call(ROUTES.invite, { projects: selectedProjects, role });
          setInvite(result.invite);
          setNow(Date.now());
          await refresh();
        });

      const revoke = (device) =>
        run("revoke:" + device.id, async () => {
          if (typeof window !== "undefined" && !window.confirm(t("devices.revokeConfirm", { name: device.name || device.id })))
            return;
          await call(ROUTES.revoke, { device: device.id });
          await refresh();
        });

      const addProject = () =>
        run("project", async () => {
          await call(ROUTES.project, {
            id: draft.id,
            path: draft.path,
            ...(draft.title === "" ? {} : { title: draft.title }),
          });
          setDraft({ id: "", path: "", title: "" });
          setNotice(t("projects.addedHint"));
          await refresh();
        });

      const openPanel = () =>
        run("panel", async () => {
          const result = await call(ROUTES.panel, {});
          setNotice(t("panel.reused", { port: String(result.port) }));
          if (typeof window !== "undefined") window.open(result.url, "_blank", "noopener,noreferrer");
          await refresh();
        });

      const copyText = (value) =>
        run("copy", async () => {
          if (typeof navigator !== "undefined" && navigator.clipboard !== undefined)
            await navigator.clipboard.writeText(value);
          setNotice(t("pair.copied"));
        });

      const toggleProject = (id) =>
        setSelectedProjects((current) =>
          current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
        );

      const projects = snapshot === null ? [] : snapshot.projects;
      const devices = snapshot === null ? [] : snapshot.devices;
      const live = invite !== null && invite.expires > now;
      const pending = live ? null : snapshot === null ? null : snapshot.invite;
      const service = snapshot === null ? null : snapshot.service;
      const panelRunning = snapshot !== null && snapshot.panel.running;
      const serviceCard =
        service === null
          ? React.createElement(
              Card,
              { title: t("service.title") },
              React.createElement("p", { className: "rd_hint" }, t("service.unconfigured")),
            )
          : React.createElement(
              Card,
              {
                title: t("service.title"),
                action: React.createElement(
                  "button",
                  { type: "button", className: "rd_btn", onClick: openPanel, disabled: busy !== "" },
                  busy === "panel" ? t("panel.opening") : t("panel.open"),
                ),
              },
              React.createElement(
                "div",
                { className: "rd_row" },
                React.createElement(Field, { label: t("service.host") },
                  React.createElement("span", { className: "rd_mono" }, service.host + ":" + String(service.port))),
                React.createElement(Field, { label: t("service.lock") },
                  service.lock === "active"
                    ? t("service.lockActive")
                    : service.lock === "missing"
                      ? t("service.lockMissing")
                      : t("service.lockStale")),
                React.createElement(Field, { label: t("service.sessions") },
                  t("service.sessionCount", { count: String(snapshot.sessions ?? 0) })),
                React.createElement(Field, { label: t("service.operations") },
                  String(snapshot.operations ?? 0)),
              ),
              React.createElement(
                "p",
                { className: "rd_hint" },
                service.running === true
                  ? t("service.running", { pid: String(service.pid ?? "") })
                  : t("service.stopped"),
              ),
              panelRunning
                ? React.createElement("p", { className: "rd_hint" }, t("panel.running", { port: String(snapshot.panel.port) }))
                : React.createElement("p", { className: "rd_hint" }, t("panel.hint")),
            );

      return React.createElement(
        "div",
        { className: "rd_root" },
        React.createElement(
          "div",
          { className: "rd_row" },
          React.createElement("p", { className: "rd_sub", style: { flex: "1" } }, t("subtitle")),
          React.createElement(
            "button",
            { type: "button", className: "rd_btn", onClick: refresh, disabled: busy !== "" },
            t("refresh"),
          ),
        ),
        error !== "" ? React.createElement("p", { className: "rd_error" }, error) : null,
        notice !== "" ? React.createElement("p", { className: "rd_hint" }, notice) : null,
        snapshot === null
          ? React.createElement("p", { className: "rd_hint" }, t("loading"))
          : React.createElement(
              React.Fragment,
              null,
              serviceCard,
              React.createElement(
                Card,
                { title: t("pair.title") },
                projects.length === 0
                  ? React.createElement("p", { className: "rd_hint" }, t("pair.empty"))
                  : React.createElement(
                      React.Fragment,
                      null,
                      React.createElement(
                        "div",
                        { className: "rd_row" },
                        React.createElement("span", { className: "rd_label" }, t("pair.role")),
                        React.createElement(
                          "select",
                          { className: "rd_select", value: role, onChange: (event) => setRole(event.target.value) },
                          React.createElement("option", { value: "viewer" }, t("pair.roleViewer")),
                          React.createElement("option", { value: "operator" }, t("pair.roleOperator")),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "rd_field" },
                        React.createElement("span", { className: "rd_label" }, t("pair.projects")),
                        React.createElement(
                          "div",
                          { className: "rd_checks" },
                          projects.map((project) =>
                            React.createElement(
                              "label",
                              { className: "rd_check", key: project.id },
                              React.createElement("input", {
                                type: "checkbox",
                                checked: selectedProjects.includes(project.id),
                                onChange: () => toggleProject(project.id),
                              }),
                              project.title,
                            ),
                          ),
                        ),
                      ),
                      React.createElement(
                        "div",
                        { className: "rd_row" },
                        React.createElement(
                          "button",
                          {
                            type: "button",
                            className: "rd_btn rd_primary",
                            onClick: generate,
                            disabled: busy !== "" || selectedProjects.length === 0,
                          },
                          busy === "invite" ? t("pair.generating") : t("pair.generate"),
                        ),
                      ),
                    ),
                live
                  ? React.createElement(
                      React.Fragment,
                      null,
                      React.createElement("p", { className: "rd_hint" }, t("pair.live", { time: formatRemaining(invite.expires, now) })),
                      React.createElement("div", { className: "rd_code" }, invite.code),
                      React.createElement(
                        "div",
                        { className: "rd_row" },
                        React.createElement(
                          "button",
                          { type: "button", className: "rd_btn", onClick: () => copyText(invite.code), disabled: busy !== "" },
                          t("pair.copy"),
                        ),
                        React.createElement(
                          "button",
                          {
                            type: "button",
                            className: "rd_btn",
                            onClick: () => copyText(JSON.stringify(invite, null, 2)),
                            disabled: busy !== "" ,
                          },
                          t("pair.details"),
                        ),
                      ),
                      React.createElement(
                        "details",
                        { className: "rd_details" },
                        React.createElement("summary", null, t("pair.details")),
                        React.createElement("pre", { className: "rd_json" }, JSON.stringify(invite, null, 2)),
                      ),
                      React.createElement("p", { className: "rd_hint" }, t("pair.caWarning")),
                    )
                  : pending !== null
                    ? React.createElement(
                        "p",
                        { className: "rd_hint" },
                        t("pair.pending", { time: formatRemaining(pending.expires, now) }),
                      )
                    : React.createElement(
                        "p",
                        { className: "rd_hint" },
                        invite !== null ? t("pair.expired") : t("pair.none"),
                      ),
              ),
              React.createElement(
                Card,
                { title: t("projects.title") },
                projects.length === 0
                  ? React.createElement("p", { className: "rd_hint" }, t("projects.empty"))
                  : React.createElement(
                      "table",
                      { className: "rd_table" },
                      React.createElement(
                        "thead",
                        null,
                        React.createElement(
                          "tr",
                          null,
                          React.createElement("th", null, t("projects.id")),
                          React.createElement("th", null, t("projects.name")),
                          React.createElement("th", null, t("projects.path")),
                          React.createElement("th", null, t("projects.model")),
                        ),
                      ),
                      React.createElement(
                        "tbody",
                        null,
                        projects.map((project) =>
                          React.createElement(
                            "tr",
                            { key: project.id },
                            React.createElement("td", { className: "rd_mono" }, project.id),
                            React.createElement("td", null, project.title),
                            React.createElement("td", { className: "rd_mono" }, project.path),
                            React.createElement(
                              "td",
                              null,
                              (project.model || "—") + (project.vision ? " · " + t("projects.vision") : ""),
                            ),
                          ),
                        ),
                      ),
                    ),
                React.createElement(
                  "div",
                  { className: "rd_row" },
                  React.createElement("input", {
                    className: "rd_input",
                    placeholder: t("projects.idPlaceholder"),
                    value: draft.id,
                    onChange: (event) => setDraft({ ...draft, id: event.target.value }),
                  }),
                  React.createElement("input", {
                    className: "rd_input",
                    style: { flex: "1", minWidth: "220px" },
                    placeholder: t("projects.pathPlaceholder"),
                    value: draft.path,
                    onChange: (event) => setDraft({ ...draft, path: event.target.value }),
                  }),
                  React.createElement("input", {
                    className: "rd_input",
                    placeholder: t("projects.titlePlaceholder"),
                    value: draft.title,
                    onChange: (event) => setDraft({ ...draft, title: event.target.value }),
                  }),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "rd_btn",
                      onClick: addProject,
                      disabled: busy !== "" || draft.id === "" || draft.path === "",
                    },
                    busy === "project" ? t("projects.adding") : t("projects.add"),
                  ),
                ),
              ),
              React.createElement(
                Card,
                { title: t("devices.title") },
                devices.length === 0
                  ? React.createElement("p", { className: "rd_hint" }, t("devices.empty"))
                  : React.createElement(
                      "table",
                      { className: "rd_table" },
                      React.createElement(
                        "thead",
                        null,
                        React.createElement(
                          "tr",
                          null,
                          React.createElement("th", null, t("devices.name")),
                          React.createElement("th", null, t("devices.role")),
                          React.createElement("th", null, t("devices.projects")),
                          React.createElement("th", null, t("devices.status")),
                          React.createElement("th", null, t("devices.expires")),
                          React.createElement("th", null, ""),
                        ),
                      ),
                      React.createElement(
                        "tbody",
                        null,
                        devices.map((device) =>
                          React.createElement(
                            "tr",
                            { key: device.id },
                            React.createElement(
                              "td",
                              null,
                              (device.name || "—") + " ",
                              React.createElement("span", { className: "rd_mono rd_label" }, device.id.slice(0, 12)),
                            ),
                            React.createElement("td", null, device.role),
                            React.createElement("td", null, device.projects.join(", ") || "—"),
                            React.createElement(
                              "td",
                              null,
                              React.createElement(
                                "span",
                                { className: device.status === "paired" ? "rd_badge" : "rd_badge rd_badgeErr" },
                                t("devices." + device.status),
                              ),
                            ),
                            React.createElement("td", null, formatTime(device.expires)),
                            React.createElement(
                              "td",
                              null,
                              device.revoked
                                ? null
                                : React.createElement(
                                    "button",
                                    {
                                      type: "button",
                                      className: "rd_btn rd_danger",
                                      disabled: busy !== "",
                                      onClick: () => revoke(device),
                                    },
                                    busy === "revoke:" + device.id ? t("devices.revoking") : t("devices.revoke"),
                                  ),
                            ),
                          ),
                        ),
                      ),
                    ),
                React.createElement("p", { className: "rd_hint" }, t("devices.noHeartbeat")),
              ),
            ),
      );
    }

    /** Services this browser plugin requires. */
    const inject = ["slots", "locale"];

    function apply(ctx) {
      ensureStyles();
      const copy = ctx.locale.bind(NS);
      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        "remotedesk-settings: section dictionaries",
      );
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            ...PANEL_PROPS,
            label: () => copy("nav"),
            inject: () => ({ copy }),
          },
          RemoteDeskSection,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
