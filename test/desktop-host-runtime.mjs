// Run with the installed Desktop's Electron in RUN_AS_NODE mode. All runtime
// homes, projects and state are isolated; no Desktop GUI or user stores load.
import assert from "node:assert/strict";
import { mkdtemp, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolveDesktopRuntime } from "../src/doctor.mjs";
import { apply, shutdown } from "../src/index.mjs";
import { boot } from "./native-host.mjs";
import { init, addProject, configuration, invite } from "@remotedesk/bridge-core/admin";
import { pairClient, loadClient } from "@remotedesk/bridge-core/client";
const cwd = process.cwd();
const root = await realpath(await mkdtemp(join(tmpdir(), "remotedesk-desktop-host-")));
let ctx, local;
// A former CLI-only shutdown must never schedule the Desktop process to exit.
process.exit = () => { throw new Error("DESKTOP_PROCESS_EXIT_FORBIDDEN"); };
try {
  const runtime = await resolveDesktopRuntime();
  const host = await boot(root, runtime, { skipRemotePreset: true, defaultPreset: "standard" });
  ({ ctx } = host);
  const { LlmAdapter } = await host.load("@deepseek-ai/dsh-llm");
  class Fixture extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, inputModalities: ["text"] }; }
    async *stream() { throw new Error("NO_MODEL_REQUEST_EXPECTED"); }
  }
  ctx.llm.registerAdapter(["fixture"], new Fixture());
  let exitRequests = 0;
  ctx.provide("appExit", () => exitRequests++);
  local = await ctx.agents.create({ sessionId: "desktop-local-fixture", meta: { cwd: host.workspace },
    setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, "standard"); } });
  const state = join(root, "state");
  await init(state, { engine: "dsh" });
  await addProject(state, { id: "p", path: host.workspace, provider: "fixture", model: "fixture-a" });
  const config = await configuration(state);
  const portProbe = createServer();
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  config.port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  config.coordinationDirectory = join(root, "locks");
  await writeFile(join(state, "config.json"), JSON.stringify(config));
  await apply(ctx, { stateDirectory: state });
  assert.equal(ctx.agentPresets.defaultId, "standard");
  await pairClient(join(root, "client"), { url: `https://127.0.0.1:${config.port}`,
    invite: await invite(state, { projects: ["p"] }) });
  const { client, handshake } = await loadClient(join(root, "client"));
  const result = await client.write("session.create", { projectId: "p", title: "Desktop native fixture" },
    { operationId: randomUUID(), epoch: handshake.epoch.id });
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  await shutdown(state);
  await new Promise((resolve) => setTimeout(resolve, 5500));
  assert.equal(exitRequests, 0);
  assert.equal(ctx.agents.get("desktop-local-fixture"), local.agent);
  assert.equal(ctx.agentPresets.defaultId, "standard");
  console.log("PASS actual Desktop plugin entry registers its native declaration, preserves the local preset/agent, and stops only its own bridge");
} finally {
  await local?.dispose();
  await ctx?.fiber.dispose();
  process.chdir(cwd);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
