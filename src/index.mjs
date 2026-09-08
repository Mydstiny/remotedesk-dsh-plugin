import { resolve } from "node:path";
import { requireThat } from "@remotedesk/bridge-core/errors";
import { assertProfile } from "./profile-policy.mjs";
import { Bridge } from "@remotedesk/bridge-core";
import { doctor } from "./doctor.mjs";
import { DshAdapter } from "./dsh-adapter.mjs";
const hosts = new Map();
export async function shutdown(directory) {
  const host = hosts.get(resolve(directory));
  requireThat(host, "NATIVE_SHUTDOWN_NOT_READY");
  try {
    await host.bridge.stop();
  } catch (error) {
    host.exit(1);
    throw error;
  }
  host.exit(0);
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
    ctx.provide("remotedeskBridge", {
      status: () => ({ configured: false, listening: false }),
    });
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
  ctx.provide("remotedeskBridge", {
    status: () => ({
      configured: true,
      listening: !bridge.stopping,
      protocol: 1,
    }),
  });
}
