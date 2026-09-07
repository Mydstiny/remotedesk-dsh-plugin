import { assertProfile } from "./profile-policy.mjs";
import { locateRuntime } from "./doctor.mjs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import {
  Fault,
  requireThat,
  fields,
  string,
} from "@remotedesk/bridge-core/errors";
import { validateNativeAnswer } from "@remotedesk/bridge-core/native-answers";
const PUBLIC_EVENT =
  /^(user\/message|assistant\/(chunk|message)|tool\/(call|result)|turn\/(start|end)|step\/(start|end)|approval\/(asked|decided)|model\/selection|session\/title|compaction\/|context\/)/;
const BLOCKED_TOOLS = new Set([
  "subagent",
  "subagent_fork",
  "workflow",
  "ralph",
  "run_code",
  "list_agents",
  "control_agent",
]);
const WRITE_TOOLS = new Set(["write", "edit", "bash", "pwsh"]);
const NATIVE_TOOLS = new Set([
  "bash",
  "pwsh",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "read_image",
  "job_output",
  "job_list",
  "job_kill",
  "skill",
  "ask_user_question",
  "web_search",
  "web_fetch",
  "todo_write",
  "get_goal",
  "create_goal",
  "update_goal",
  "exit_plan_mode",
]);
const ACTIVE = new Set(["running", "stopping"]);
async function abortable(promise, signal) {
  let abort;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        abort = () => reject(new Fault("UPSTREAM_REQUEST_STALE"));
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export class DshAdapter {
  capabilities = {
    sessions: true,
    turns: true,
    steer: true,
    cancel: true,
    approvals: true,
    questions: true,
    diffs: true,
    files: "native-tools",
    models: true,
    rename: true,
    fork: true,
    compact: true,
    terminalManagement: true,
    attachments: ["text/plain", "image/png", "image/jpeg"],
    execution: "dsh-native-sandbox",
    permissionModes: ["read-only", "workspace-write"],
    collaborationModes: ["default"],
    approvalDecisions: ["accept", "decline", "cancel"],
    outsideSandboxApproval: false,
    extensions: false,
    delegation: false,
    network: "host-native",
    processScope: "native-managed-jobs-and-terminals",
  };
  constructor(ctx, { runtimeRoot, preset = "remotedesk-native" } = {}) {
    this.ctx = ctx;
    this.runtimeRoot = runtimeRoot;
    this.preset = preset;
    this.handles = new Map();
    this.loading = new Map();
    this.runs = new Map();
    this.catalogs = new Map();
    this.disposers = [];
    this.closed = false;
    this.closing = false;
  }
  checkpoint(s, patch) {
    Object.assign(s, patch);
    this.core.checkpoint?.(s, patch);
  }
  bind(core) {
    this.core = core;
    this.disposers.push(
      this.ctx.on("session/event", (session, event) => {
        const h = this.handles.get(session.id);
        if (
          !h ||
          h.agent.session !== session ||
          this.ctx.agents.get(session.id) !== h.agent
        )
          return;
        if (PUBLIC_EVENT.test(event.type))
          core.emit(session.id, { ...event, type: event.type });
      }),
    );
  }
  async prepare() {
    assertProfile(this.ctx);
    requireThat(
      !this.core.storage.all("container").length,
      "LEGACY_CONTAINER_RECOVERY_REQUIRED",
    );
    requireThat(
      !this.core.storage.all("nativeActivity").length,
      "NATIVE_ACTIVITY_RECONCILIATION_REQUIRED",
    );
    requireThat(
      this.ctx.agentPresets &&
        this.ctx.approval &&
        this.ctx.sessionQuery &&
        this.ctx.sessionTitle,
      "DSH_NATIVE_SERVICES_REQUIRED",
    );
    const require = createRequire(
      join(this.runtimeRoot ?? (await locateRuntime()), "package.json"),
    );
    const load = (name) =>
      import(pathToFileURL(require.resolve("@deepseek-ai/" + name)).href);
    const [agent, sandbox, approval, presets] = await Promise.all([
      load("dsh-agent"),
      load("dsh-sandbox-policy"),
      load("dsh-user-approval"),
      load("dsh-agent-presets"),
    ]);
    this.native = {
      installModelSelection: agent.installModelSelection,
      setSandboxMode: sandbox.setSandboxMode,
      setApprovalPolicy: approval.setApprovalPolicy,
      standingMountFor: presets.standingMountFor,
    };
  }
  project(s) {
    const p = this.core.projects.find((p) => p.id === s.project);
    requireThat(p, "PROJECT_NOT_FOUND");
    return p;
  }
  validateSettings(value) {
    fields(value, [
      "provider",
      "model",
      "reasoningEffort",
      "permissionMode",
      "collaborationMode",
    ]);
    for (const key of ["provider", "model"])
      if (value[key] !== undefined) string(value[key], 200);
    if (value.reasoningEffort !== undefined) string(value.reasoningEffort, 50);
    if (value.permissionMode !== undefined)
      requireThat(
        this.capabilities.permissionModes.includes(value.permissionMode),
        "PERMISSION_MODE_INVALID",
      );
    if (value.collaborationMode !== undefined)
      requireThat(
        value.collaborationMode === "default",
        "COLLABORATION_MODE_UNAVAILABLE",
      );
    return { ...value };
  }
  async selection(p, s = {}) {
    const defaults = this.ctx.agentDefaultModel?.currentSelection() ?? {};
    const requested = {
      provider: s.provider ?? p.provider ?? defaults.provider,
      model: s.model ?? p.model ?? defaults.model,
      ...(s.reasoningEffort ? { reasoningEffort: s.reasoningEffort } : {}),
    };
    requireThat(
      requested.provider && requested.model,
      "MODEL_SELECTION_REQUIRED",
    );
    const value = await this.ctx.llm.resolveCallConfig(requested);
    return {
      provider: value.provider,
      model: value.model,
      ...(value.reasoningEffort
        ? { reasoningEffort: value.reasoningEffort }
        : {}),
    };
  }
  async models(p, { cursor } = {}) {
    const now = Date.now();
    for (const [id, row] of this.catalogs)
      if (row.expires < now) this.catalogs.delete(id);
    let id,
      offset = 0,
      snapshot;
    if (cursor) {
      const match = /^([a-f0-9-]{36}):(\d+)$/.exec(cursor);
      requireThat(match, "CURSOR_INVALID");
      [, id] = match;
      offset = Number(match[2]);
      snapshot = this.catalogs.get(id);
      requireThat(
        snapshot && snapshot.project === p.id && Number.isSafeInteger(offset),
        "CURSOR_EXPIRED",
      );
    } else {
      const data = [],
        unavailable = [];
      for (const provider of this.ctx.llm.listProviders()) {
        if (p.provider && provider.id !== p.provider) continue;
        try {
          for (const model of await this.ctx.llm.listModels(provider.id)) {
            requireThat(data.length < 10000, "MODEL_CATALOG_LIMIT");
            const info = await this.ctx.llm.resolveModelInfo(
              provider.id,
              model.id,
            );
            data.push({
              id: `${provider.id}:${model.id}`,
              provider: provider.id,
              model: model.id,
              displayName: model.name ?? model.id,
              inputModalities: info.inputModalities ?? ["text"],
              defaultReasoningEffort: info.reasoning?.defaultEffort ?? null,
              supportedReasoningEfforts: (info.reasoning?.efforts ?? []).map(
                (effort) => ({
                  reasoningEffort: effort.id,
                  description: effort.description ?? effort.name ?? effort.id,
                }),
              ),
            });
          }
        } catch {
          unavailable.push(provider.id);
        }
      }
      data.sort((a, b) => a.id.localeCompare(b.id));
      id = randomUUID();
      snapshot = { data, unavailable, project: p.id, expires: now + 60000 };
      if (this.catalogs.size >= 32)
        this.catalogs.delete(this.catalogs.keys().next().value);
      this.catalogs.set(id, snapshot);
    }
    return {
      data: snapshot.data.slice(offset, offset + 100),
      nextCursor:
        offset + 100 < snapshot.data.length ? `${id}:${offset + 100}` : null,
      unavailableProviders: snapshot.unavailable,
    };
  }
  owns(s, agent) {
    const h = this.handles.get(s.id);
    return h && h.agent === agent && this.ctx.agents.get(s.id) === agent;
  }
  setup(s, p, selection) {
    return async (agentCtx) => {
      const preset = await this.ctx.agentPresets.resolve(this.preset);
      requireThat(
        (await realpath(preset.path)) ===
          (await realpath(
            fileURLToPath(
              new URL(
                "../presets/remotedesk-native/agent.cordis.yml",
                import.meta.url,
              ),
            ),
          )) && preset.trust === "system",
        "NATIVE_PRESET_SOURCE_MISMATCH",
      );
      await this.ctx.agentPresets.mount(agentCtx, this.preset);
      this.native.setSandboxMode(
        agentCtx.agent.session,
        s.permissionMode ?? "workspace-write",
      );
      this.native.setApprovalPolicy(agentCtx.agent.session, "ask");
      this.native.installModelSelection(agentCtx, selection);
      agentCtx.tools.presentAs("native");
      const mount = this.native.standingMountFor(agentCtx);
      requireThat(mount, "NATIVE_PRESET_MOUNT_REQUIRED");
      const expected = new Map(
        [...NATIVE_TOOLS].flatMap((name) => {
          const definition = agentCtx.tools.get(name, mount.key);
          return definition &&
            definition !== agentCtx.tools.get(name) &&
            !BLOCKED_TOOLS.has(name)
            ? [[name, definition]]
            : [];
        }),
      );
      const nativeJobList = expected.get("job_list");
      if (nativeJobList) {
        const execute = nativeJobList.execute;
        agentCtx.tools.register({
          ...nativeJobList,
          execute: async (args, exec) => {
            const owned = new Set(
              this.ctx.jobs
                .list(exec.agent)
                .filter((job) => job.ownerSession === s.id)
                .map((job) => job.id),
            );
            return (await execute(args, exec)).filter((job) =>
              owned.has(job.id),
            );
          },
        });
        expected.set(
          "job_list",
          agentCtx.tools.get("job_list", agentCtx.agent),
        );
      }
      requireThat(
        expected.has(process.platform === "win32" ? "pwsh" : "bash") &&
          expected.has("read"),
        "NATIVE_PRESET_TOOLS_REQUIRED",
      );
      const executors = new Map(
        [...expected].map(([name, definition]) => [name, definition.execute]),
      );
      agentCtx.tools.restrict({ allow: [...expected.keys()] });
      const accepted = new Set(),
        calls = new Map();
      agentCtx.tools.guard((exec) => {
        const run = this.runs.get(s.id);
        try {
          run?.authorize();
        } catch {
          return "REMOTEDESK_AUTHORIZATION_EXPIRED";
        }
        if (["job_output", "job_kill"].includes(exec.name)) {
          try {
            if (
              this.ctx.jobs.get(exec.arguments?.job_id, exec.agent)
                ?.ownerSession !== s.id
            )
              return "REMOTEDESK_JOB_SCOPE_DENIED";
          } catch {
            return "REMOTEDESK_JOB_SCOPE_DENIED";
          }
        }
        return this.closed ||
          this.closing ||
          !this.owns(s, exec.agent) ||
          !run ||
          run.cancelled ||
          exec.signal?.aborted ||
          BLOCKED_TOOLS.has(exec.name) ||
          !expected.has(exec.name) ||
          agentCtx.tools.get(exec.name, exec.agent) !==
            expected.get(exec.name) ||
          expected.get(exec.name).execute !== executors.get(exec.name) ||
          (exec.arguments &&
            Object.hasOwn(exec.arguments, "sandbox_permissions") &&
            exec.arguments.sandbox_permissions != null) ||
          (WRITE_TOOLS.has(exec.name) && !accepted.has(exec.token))
          ? "REMOTEDESK_TOOL_SCOPE_DENIED"
          : undefined;
      });
      agentCtx.on(
        "tools/pre-execute",
        async (exec, next) => {
          if (!this.owns(s, exec.agent)) return next();
          if (
            exec.arguments &&
            Object.hasOwn(exec.arguments, "sandbox_permissions") &&
            exec.arguments.sandbox_permissions != null
          )
            return {
              kind: "deny",
              reason: "REMOTEDESK_SANDBOX_OVERRIDE_FORBIDDEN",
            };
          const run = this.runs.get(s.id);
          requireThat(run && !run.cancelled, "NO_ACTIVE_TURN");
          run.authorize();
          calls.set(exec.callId, exec);
          const previous = await next();
          if (previous.kind === "deny" || !WRITE_TOOLS.has(exec.name))
            return previous;
          requireThat(
            Buffer.byteLength(JSON.stringify(exec.arguments)) <= 200000,
            "APPROVAL_PAYLOAD_TOO_LARGE",
          );
          const outcome = await this.ctx.approval.request({
            agent: exec.agent,
            toolName: exec.name,
            callId: exec.callId,
            reason:
              previous.reason ?? "Approve this native project operation once.",
            signal: exec.signal,
          });
          run.authorize();
          requireThat(
            !exec.signal?.aborted &&
              this.runs.get(s.id) === run &&
              !run.cancelled,
            "UPSTREAM_REQUEST_STALE",
          );
          if (outcome === "allowed-once") {
            accepted.add(exec.token);
            return { kind: "allow" };
          }
          return {
            kind: "deny",
            reason:
              outcome === "cancelled"
                ? "REMOTEDESK_APPROVAL_CANCELLED"
                : "REMOTEDESK_APPROVAL_DECLINED",
          };
        },
        { prepend: true },
      );
      agentCtx.on("tools/result", (exec, result) => {
        if (["write", "edit"].includes(exec.name))
          this.core.storage.put("nativeDiff", s.id, {
            scope: "native-file-tools",
            toolName: exec.name,
            callId: exec.callId,
            arguments: exec.arguments,
            result,
            available: true,
          });
        accepted.delete(exec.token);
        calls.delete(exec.callId);
      });
      agentCtx.on(
        "approval/request",
        async (request, next) => {
          if (!this.owns(s, request.agent)) return next();
          const run = this.runs.get(s.id);
          if (!run || run.cancelled) return "unavailable";
          try {
            const answer = await this.core.ask(
              s.id,
              {
                kind: "command",
                engine: "dsh",
                grantScope: "once",
                toolName: request.toolName,
                callId: request.callId,
                reason: request.reason,
                arguments: calls.get(request.callId)?.arguments,
              },
              request.signal ?? run.controller.signal,
            );
            requireThat(
              !request.signal?.aborted &&
                !run.controller.signal.aborted &&
                this.runs.get(s.id) === run &&
                !run.cancelled,
              "UPSTREAM_REQUEST_STALE",
            );
            run.authorize();
            if (answer.decision === "cancel")
              request.agent.cancel({ kind: "user" }, { keepInbox: false });
            return (
              {
                accept: "allowed-once",
                decline: "rejected",
                cancel: "cancelled",
              }[answer.decision] ?? "unavailable"
            );
          } catch {
            return "cancelled";
          }
        },
        { prepend: true },
      );
      agentCtx.on(
        "user-questions/request",
        async (request, next) => {
          if (!this.owns(s, request.agent)) return next();
          const run = this.runs.get(s.id);
          requireThat(run && !run.cancelled, "NO_ACTIVE_TURN");
          const answer = await this.core.ask(
            s.id,
            { kind: "questions", engine: "dsh", questions: request.questions },
            request.signal ?? run.controller.signal,
          );
          requireThat(
            !request.signal?.aborted &&
              !run.controller.signal.aborted &&
              this.runs.get(s.id) === run &&
              !run.cancelled,
            "UPSTREAM_REQUEST_STALE",
          );
          run.authorize();
          return {
            answers: request.questions.map((q) => {
              const values = answer.answers[q.id].answers,
                labels = new Set((q.options ?? []).map((o) => o.label));
              const selected = values.filter((v) => labels.has(v)),
                custom = values.filter((v) => !labels.has(v)).join("\n");
              requireThat(
                q.multiSelect ||
                  (selected.length <= 1 && !(selected.length && custom)),
                "QUESTION_SELECTION_INVALID",
              );
              return { id: q.id, selected, ...(custom ? { custom } : {}) };
            }),
          };
        },
        { prepend: true },
      );
      agentCtx.on("agent/pre-step", async (event, next) => {
        requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
        assertProfile(this.ctx);
        const h = this.handles.get(s.id);
        requireThat(h && this.owns(s, h.agent), "AGENT_INSTANCE_CHANGED");
        h.authorize?.();
        if (!this.runs.has(s.id)) {
          requireThat(h.authorize, "NO_ACTIVE_TURN");
          const authorize = h.authorize;
          const stillAuthorized = () => {
            requireThat(
              !event.signal.aborted &&
                !this.closed &&
                !this.closing &&
                this.handles.get(s.id) === h &&
                h.authorize === authorize,
              "UPSTREAM_REQUEST_STALE",
            );
            authorize();
          };
          stillAuthorized();
          await abortable(
            this.core.claimActivity(s, stillAuthorized, () => {
              stillAuthorized();
              if (this.runs.has(s.id)) return;
              const run = this.reserve(s, authorize);
              run.agent = h.agent;
              run.readyResolve();
              this.observeIdle(s, run, h.agent);
            }),
            event.signal,
          );
        }
        return next();
      });
    };
  }
  async connect(s, create = false, seed, authorize = () => {}) {
    assertProfile(this.ctx);
    requireThat(
      !this.closed && (!this.closing || this.handles.has(s.id)),
      "ADAPTER_DISPOSED",
    );
    requireThat(s.upstream || create, "NATIVE_SESSION_RECONCILIATION_REQUIRED");
    const p = this.project(s);
    requireThat((await realpath(p.path)) === p.path, "PROJECT_PATH_CHANGED");
    const old = this.handles.get(s.id);
    if (old) {
      requireThat(
        this.ctx.agents.get(s.id) === old.agent,
        "AGENT_INSTANCE_CHANGED",
      );
      return old;
    }
    requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
    if (this.loading.has(s.id)) return this.loading.get(s.id);
    const pending = (async () => {
      const current = await this.selection(p, s),
        selection = { current, assembled: undefined };
      const info = await this.ctx.llm.resolveModelInfo(
        current.provider,
        current.model,
      );
      requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
      authorize();
      const opts = {
        agentOptions: current,
        setup: this.setup(s, p, selection),
      };
      let handle;
      try {
        handle = await (create
          ? this.ctx.agents.create({
              ...opts,
              sessionId: s.id,
              ...(seed ? { seed, inheritedEventCount: seed.length } : {}),
              meta: {
                cwd: p.path,
                agentPreset: this.preset,
                ...(seed
                  ? { parentSession: s.parentSession, isSeeded: true }
                  : {}),
              },
            })
          : this.ctx.agents.resume({ ...opts, resumeSessionId: s.upstream }));
        if (this.closed || this.closing) {
          await handle.dispose();
          throw new Fault("ADAPTER_DISPOSED");
        }
        handle.selection = selection;
        handle.session = s;
        this.handles.set(s.id, handle);
        this.checkpoint(s, {
          ...current,
          upstream: s.id,
          permissionMode: s.permissionMode ?? "workspace-write",
          executionProfile: "native-v1",
          inputModalities:
            p.vision === true
              ? ["text", "image"]
              : p.vision === false
                ? ["text"]
                : (info.inputModalities ?? ["text"]),
          nativePhase: "ready",
        });
        return handle;
      } catch (e) {
        this.checkpoint(s, { nativePhase: "unknown" });
        throw new Error("NATIVE_SESSION_OUTCOME_UNKNOWN", { cause: e });
      }
    })();
    this.loading.set(s.id, pending);
    try {
      return await pending;
    } finally {
      this.loading.delete(s.id);
    }
  }
  metadata(s) {
    return Object.fromEntries(
      [
        "upstream",
        "provider",
        "model",
        "reasoningEffort",
        "permissionMode",
        "inputModalities",
        "executionProfile",
      ].map((k) => [k, s[k]]),
    );
  }
  async create(s, _p, authorize = () => {}) {
    await this.connect(s, true, undefined, authorize);
    if (s.title) await this.update(s, { title: s.title }, authorize);
    return this.metadata(s);
  }
  async resume(s, authorize = () => {}) {
    await this.connect(s, false, undefined, authorize);
  }
  async read(s, { cursor, turnId } = {}) {
    requireThat(s.upstream, "NATIVE_SESSION_RECONCILIATION_REQUIRED");
    const observed = await this.ctx.sessionQuery.observeSession(s.upstream, {
      projectionMode: "none",
    });
    try {
      let from = 0,
        through = observed.cursor;
      if (turnId !== undefined) {
        string(turnId, 500);
        const start = observed.events.find(
          (e) => e.type === "turn/start" && String(e.data?.turn) === turnId,
        );
        requireThat(start, "TURN_NOT_FOUND");
        from = start.seq;
        through =
          observed.events.find(
            (e) => e.type === "turn/end" && String(e.data?.turn) === turnId,
          )?.seq ?? through;
      }
      const earliest = from,
        latest = through;
      if (cursor) {
        const match = /^(\d+):(-?\d+)$/.exec(cursor);
        requireThat(match, "CURSOR_INVALID");
        from = Number(match[1]);
        through = Number(match[2]);
      }
      requireThat(
        Number.isSafeInteger(from) &&
          Number.isSafeInteger(through) &&
          from >= earliest &&
          through <= latest,
        "CURSOR_INVALID",
      );
      const rows = observed.events.filter(
          (e) => e.seq >= from && e.seq <= through && PUBLIC_EVENT.test(e.type),
        ),
        events = rows.slice(0, 200);
      return {
        ...this.metadata(s),
        format: "native-event-log",
        status: this.runs.has(s.id)
          ? "running"
          : this.core.storage.get("nativeActivity", s.id)
            ? "background"
            : "idle",
        events,
        throughSeq: through,
        nextCursor:
          rows.length > events.length
            ? `${events.at(-1).seq + 1}:${through}`
            : null,
      };
    } finally {
      observed[Symbol.dispose]();
    }
  }
  async items(s, { turnId, cursor } = {}) {
    string(turnId, 500);
    return this.read(s, { cursor, turnId });
  }
  async update(s, value, authorize = () => {}) {
    requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
    await this.quiescent(s);
    const h = await this.connect(s);
    const selected = await this.selection(this.project(s), { ...s, ...value });
    const info = await this.ctx.llm.resolveModelInfo(
      selected.provider,
      selected.model,
    );
    requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
    authorize();
    this.checkpoint(s, { nativePhase: "updating" });
    try {
      if (value.title !== undefined)
        this.checkpoint(s, {
          title: this.ctx.sessionTitle.rename(h.agent.session, value.title)
            .title,
        });
      if (value.permissionMode !== undefined)
        this.native.setSandboxMode(h.agent.session, value.permissionMode);
      h.agent.session.append("model/selection", selected);
      h.selection.current = selected;
      const p = this.project(s);
      this.checkpoint(s, {
        ...selected,
        inputModalities:
          p.vision === true
            ? ["text", "image"]
            : p.vision === false
              ? ["text"]
              : (info.inputModalities ?? ["text"]),
        ...(value.permissionMode
          ? { permissionMode: value.permissionMode }
          : {}),
      });
      await this.ctx.sessions.flush(h.agent.session);
      this.checkpoint(s, { nativePhase: "ready" });
      return { ...this.metadata(s), title: s.title };
    } catch (e) {
      this.checkpoint(s, { nativePhase: "unknown" });
      throw new Error("NATIVE_UPDATE_OUTCOME_UNKNOWN", { cause: e });
    }
  }
  async fork(s, child, { lastTurnId } = {}, authorize = () => {}) {
    const observed = await this.ctx.sessionQuery.observeSession(s.upstream, {
      projectionMode: "none",
    });
    let seed;
    try {
      const boundary =
        lastTurnId === undefined
          ? observed.events.findLast((e) => e.type === "turn/end")
          : observed.events.find(
              (e) =>
                e.type === "turn/end" && String(e.data?.turn) === lastTurnId,
            );
      requireThat(boundary, "COMPLETED_TURN_REQUIRED");
      let cut = observed.events.indexOf(boundary) + 1;
      while (
        cut < observed.events.length &&
        observed.events[cut].type !== "turn/start"
      )
        cut++;
      seed = observed.events.slice(0, cut);
    } finally {
      observed[Symbol.dispose]();
    }
    child.parentSession = s.upstream;
    await this.connect(child, true, seed, authorize);
    await this.update(child, { title: child.title }, authorize);
    return this.metadata(child);
  }
  reserve(s, authorize = () => {}) {
    requireThat(!this.runs.has(s.id), "TURN_ALREADY_RUNNING");
    const run = {
      id: randomUUID(),
      cancelled: false,
      authorize,
      controller: new AbortController(),
    };
    run.ready = new Promise((resolve) => {
      run.readyResolve = resolve;
    });
    this.runs.set(s.id, run);
    this.core.storage.put("nativeActivity", s.id, {
      id: s.id,
      project: s.project,
      upstream: s.upstream,
      scope: "native-managed-jobs-and-terminals",
      started: Date.now(),
    });
    return run;
  }
  observeIdle(s, run, agent) {
    run.done = (async () => {
      for (;;) {
        await agent.whenIdle();
        await this.ctx.sessions.flush(agent.session);
        if (this.runs.get(s.id) !== run) return;
        if (agent.status !== "idle") continue;
        const background =
          this.activity(agent).length > 0 ||
          this.ctx.get("terminals")?.hasOwnerActivity(agent);
        if (!background) this.core.storage.delete("nativeActivity", s.id);
        this.runs.delete(s.id);
        this.core.emit(s.id, {
          type: background ? "execution.background" : "execution.idle",
          processScope: "native-managed-jobs-and-terminals",
        });
        return;
      }
    })().catch(() => {
      this.core.emit(s.id, {
        type: "execution.blocked",
        reason: "NATIVE_ACTIVITY_RECONCILIATION_REQUIRED",
      });
    });
  }
  async start(s, text, attachments = [], settings = {}, authorize = () => {}) {
    if (Object.keys(settings).length) await this.update(s, settings, authorize);
    const h = await this.connect(s);
    requireThat(h.agent.status === "idle", "TURN_ALREADY_RUNNING");
    const images = attachments.filter((a) => a.mime !== "text/plain");
    let refs = [];
    if (images.length) {
      requireThat(
        s.inputModalities?.includes("image"),
        "MODEL_IMAGE_CAPABILITY_UNDECLARED",
      );
      refs = await this.ctx.attachments.saveImages(
        images.map((a) => ({
          data: Buffer.from(a.data, "base64"),
          mediaType: a.mime,
        })),
      );
    }
    requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
    authorize();
    const run = this.reserve(s, authorize);
    h.authorize = authorize;
    try {
      let i = 0;
      const content = [
        { type: "text", text },
        ...attachments.map((a) =>
          a.mime === "text/plain"
            ? {
                type: "text",
                text: Buffer.from(a.data, "base64").toString("utf8"),
              }
            : { type: "image", attachment: refs[i++] },
        ),
      ];
      h.agent.followup({
        id: run.id,
        role: "user",
        source: { kind: "user" },
        content,
      });
      run.agent = h.agent;
      run.readyResolve();
      this.observeIdle(s, run, h.agent);
      await this.ctx.sessions.flush(h.agent.session);
      return { messageId: run.id, accepted: true };
    } finally {
      run.readyResolve();
    }
  }
  async compact(s, authorize = () => {}) {
    const h = await this.connect(s),
      compaction = this.ctx.agentPresets.serviceFor(h.agent, "compaction");
    requireThat(compaction, "COMPACTION_UNAVAILABLE");
    authorize();
    requireThat(!this.closed && !this.closing, "ADAPTER_DISPOSED");
    const run = this.reserve(s, authorize);
    h.authorize = authorize;
    run.agent = h.agent;
    run.readyResolve();
    run.maintenance = compaction.compactNow(h.agent, run.controller.signal);
    void run.maintenance
      .then(
        (result) =>
          this.core.emit(s.id, {
            type: "session.compacted",
            compacted: result !== null,
            result,
          }),
        () =>
          this.core.emit(s.id, {
            type: "session.compaction.failed",
            reason: run.cancelled ? "CANCELLED" : "NATIVE_COMPACTION_FAILED",
          }),
      )
      .finally(() => this.observeIdle(s, run, h.agent));
    return { accepted: true };
  }
  async steer(s, text) {
    const run = this.runs.get(s.id);
    requireThat(
      run?.agent && !run.cancelled && run.agent.status === "running",
      "NO_ACTIVE_TURN",
    );
    run.authorize();
    const id = randomUUID();
    run.agent.steer({
      id,
      role: "user",
      source: { kind: "user" },
      content: [{ type: "text", text }],
    });
    await this.ctx.sessions.flush(run.agent.session);
    return { messageId: id };
  }
  activity(agent) {
    return [
      ...(this.ctx.jobs?.list(agent) ?? [])
        .filter(
          (job) => job.ownerSession === agent.id && ACTIVE.has(job.status),
        )
        .map((job) => ({
          processId: "job:" + job.id,
          kind: "job",
          command: job.label,
          status: job.status,
        })),
      ...(this.ctx.get("terminals")?.list(agent) ?? []).map((terminal) => ({
        processId: "pty:" + terminal.id,
        kind: "pty",
        command: terminal.command,
        cwd: terminal.cwd,
      })),
    ];
  }
  async terminals(s) {
    const h = await this.connect(s);
    return { data: this.activity(h.agent), nextCursor: null };
  }
  async stopTerminal(s, processId) {
    const h = await this.connect(s);
    requireThat(
      this.activity(h.agent).some((row) => row.processId === processId),
      "TERMINAL_NOT_FOUND",
    );
    if (processId.startsWith("job:")) {
      const id = processId.slice(4);
      this.ctx.jobs.kill(id, h.agent, "RemoteDesk stop");
      const result = await this.ctx.jobs.wait(id, 10000, h.agent);
      requireThat(
        result && !ACTIVE.has(result.status) && result.status !== "failed",
        "TERMINAL_STOP_UNCONFIRMED",
      );
    } else
      await this.ctx
        .get("terminals")
        .kill(h.agent, processId.slice(4), "RemoteDesk stop");
    requireThat(
      !this.activity(h.agent).some((row) => row.processId === processId),
      "TERMINAL_STOP_UNCONFIRMED",
    );
    if (
      !this.runs.has(s.id) &&
      !this.activity(h.agent).length &&
      !this.ctx.get("terminals")?.hasOwnerActivity(h.agent)
    )
      this.core.storage.delete("nativeActivity", s.id);
    return { terminated: true };
  }
  async cancel(s) {
    if (!s) return;
    const run = this.runs.get(s.id);
    if (run) {
      run.cancelled = true;
      run.controller.abort();
      await run.ready;
    }
    const h = this.handles.get(s.id);
    if (h) {
      h.authorize = undefined;
      h.agent.cancel({ kind: "user" }, { keepInbox: false });
      await h.agent.whenIdle();
      for (const row of this.activity(h.agent))
        await this.stopTerminal(s, row.processId);
      requireThat(
        !this.ctx.get("terminals")?.hasOwnerActivity(h.agent),
        "TERMINAL_STOP_UNCONFIRMED",
      );
      await this.ctx.sessions.flush(h.agent.session);
    }
    if (run?.maintenance) await run.maintenance.catch(() => {});
    if (run?.done) await run.done;
    if (this.runs.get(s.id) === run) this.runs.delete(s.id);
    this.core.storage.delete("nativeActivity", s.id);
  }
  async quiescent(s) {
    requireThat(!this.runs.has(s.id), "TURN_NOT_QUIESCENT");
    const h = this.handles.get(s.id);
    if (h) requireThat(h.agent.status === "idle", "TURN_NOT_QUIESCENT");
    if (h)
      requireThat(
        !this.activity(h.agent).length &&
          !this.ctx.get("terminals")?.hasOwnerActivity(h.agent),
        "BACKGROUND_TERMINALS_ACTIVE",
      );
    requireThat(
      !this.core.storage.get("nativeActivity", s.id),
      "NATIVE_ACTIVITY_RECONCILIATION_REQUIRED",
    );
  }
  async diff(s) {
    return (
      this.core.storage.get("nativeDiff", s.id) ?? {
        scope: "native-file-tools",
        available: false,
        changes: [],
      }
    );
  }
  validateAnswer(request, answer) {
    validateNativeAnswer(request, answer);
  }
  async deactivate(s) {
    await this.quiescent(s);
    const h = this.handles.get(s.id);
    if (h) {
      await h.dispose();
      this.handles.delete(s.id);
    }
  }
  close() {
    return (this.closePromise ??= this.closeInternal());
  }
  async closeInternal() {
    if (this.closed) return;
    this.closing = true;
    await Promise.allSettled([...this.loading.values()]);
    const results = await Promise.allSettled(
      [...this.handles.values()].map(async (h) => {
        await this.cancel(h.session);
        await this.deactivate(h.session);
      }),
    );
    this.closed = true;
    for (const dispose of this.disposers) dispose();
    if (results.some((r) => r.status === "rejected"))
      throw new Fault("NATIVE_ACTIVITY_RECONCILIATION_REQUIRED");
  }
}
