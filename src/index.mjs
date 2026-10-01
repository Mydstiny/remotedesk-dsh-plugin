import { resolve } from "node:path";
import { requireThat } from "@remotedesk/bridge-core/errors";
import { assertProfile } from "./profile-policy.mjs";
import { Bridge } from "@remotedesk/bridge-core";
import { doctor } from "./doctor.mjs";
import { DshAdapter } from "./dsh-adapter.mjs";
import { ensureControlPanel } from "./control-panel.mjs";
import { registerWebPanel, webSnapshot, defaultStateDirectory } from "./web-panel.mjs";
// DSH can load the package once for the launcher and once through the profile
// loader. Keep the lifecycle registry process-wide so the launcher's stop
// callback reaches the Bridge instance created by the mounted plugin.
const hosts =
  globalThis[Symbol.for("remotedesk.dsh.bridge.hosts")] ??=
    new Map();
const scheduleProcessExit = (code) => {
  // DSH's appExit records the exit code and starts profile disposal, but some
  // upstream watchers can keep the process alive after the bridge is closed.
  // Keep the normal disposal path and bound the remaining process lifetime.
  const timer = setTimeout(() => process.exit(code), 5000);
  timer.unref();
};
export async function shutdown(directory) {
  const host = hosts.get(resolve(directory));
  requireThat(host, "NATIVE_SHUTDOWN_NOT_READY");
  try {
    await host.bridge.stop();
  } catch (error) {
    host.exit(1);
    scheduleProcessExit(1);
    throw error;
  }
  host.exit(0);
  scheduleProcessExit(0);
}
export const name = "remotedesk-bridge";
export const inject = [
  "loader",
  "llm",
  "agentDefaultModel",
  "attachments",
  "agents",
  "sessions",
  "agentLoop",
  "tools",
  "sessionPersistence",
  "agentPresets",
  "approval",
  "sessionQuery",
  "sessionTitle",
  "jobs",
];
// Native Cordis plugin in the host's runtime. A configured state directory is
// required; merely installing the plugin never opens a listener.
export async function apply(ctx, config = {}) {
  const directory = config.stateDirectory ?? process.env.REMOTEDESK_DSH_STATE;
  if (!directory) {
    // Management-only deployment: another process owns the bridge, so this
    // profile contributes the authenticated Web surface for that state and
    // never opens a listener of its own.
    const state = defaultStateDirectory();
    ctx.provide("remotedeskBridge", {
      status: () => ({ configured: false, listening: false, state }),
      snapshot: () => webSnapshot(state, "dsh"),
      panel: () => ensureControlPanel(state, { engine: "dsh" }),
    });
    registerWebPanel(ctx, { state, engine: "dsh" });
    return;
  }
  if ((await doctor()).status !== "ok")
    throw new Error("DSH_RUNTIME_UNVERIFIED");
  assertProfile(ctx, { requireLoader: true });
  const exit = ctx.get("appExit");
  requireThat(typeof exit === "function", "NATIVE_SHUTDOWN_UNAVAILABLE");
  const adapter = new DshAdapter(ctx);
  const bridge = new Bridge(directory, adapter);
  const key = resolve(directory);
  requireThat(!hosts.has(key), "NATIVE_HOST_ALREADY_REGISTERED");
  const host = { bridge, exit };
  hosts.set(key, host);
  ctx.effect(() => async () => {
    try {
      await bridge.stop();
    } finally {
      if (hosts.get(key) === host) hosts.delete(key);
    }
  });
  await bridge.start();
  console.log(JSON.stringify({ ready: true, engine: "dsh", protocol: 1 }));
  // Web settings surface: contributed only when this deployment provides a
  // Connection service, so the native remote profile is unaffected.
  registerWebPanel(ctx, { state: directory, engine: "dsh" });
  ctx.provide("remotedeskBridge", {
    status: () => ({
      configured: true,
      listening: !bridge.stopping,
      protocol: 1,
    }),
    snapshot: () => webSnapshot(directory, "dsh"),
    panel: () => ensureControlPanel(directory, { engine: "dsh" }),
  });
}
