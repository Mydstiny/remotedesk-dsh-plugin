// Real native DSH preset/loop/tools + mTLS. Only model responses are fixed.
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  access,
  realpath,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Bridge } from "@remotedesk/bridge-core";
import {
  init,
  addProject,
  invite,
  configuration,
} from "@remotedesk/bridge-core/admin";
import { pairClient, loadClient } from "@remotedesk/bridge-core/client";
import { DshAdapter } from "../src/dsh-adapter.mjs";
import { locateRuntime } from "../src/doctor.mjs";
import { boot } from "./native-host.mjs";
const root = await realpath(
  await mkdtemp(join(tmpdir(), "remotedesk-dsh-native-flow-")),
);
const runtime = await locateRuntime(),
  { ctx, workspace, load, inactive } = await boot(root, runtime);
const { LlmAdapter } = await load("@deepseek-ai/dsh-llm");
let action, bridge, renewal, streamAbort, stream, local;
const calls = [],
  events = [];
class Fixture extends LlmAdapter {
  providerInfo(id) {
    return { id, name: "Local fixture" };
  }
  async listModels(provider) {
    return ["fixture-a", "fixture-b"].map((id) => ({ id, provider, name: id }));
  }
  async resolveModel(provider, id) {
    return {
      provider,
      id,
      name: id,
      inputModalities: ["text"],
      context: { contextWindow: 1000000 },
      reasoning: {
        efforts: [
          { id: "low", name: "Low" },
          { id: "high", name: "High" },
        ],
        defaultEffort: "low",
      },
    };
  }
  async *stream(options) {
    calls.push({
      model: options.model,
      effort: options.reasoningEffort,
      tools: (options.tools ?? []).map((t) => t.name),
    });
    const current = action;
    action = current?.next;
    if (current?.hang) {
      if (!options.signal.aborted)
        await new Promise((r) =>
          options.signal.addEventListener("abort", r, { once: true }),
        );
      return;
    }
    if (current?.name) {
      const block = {
        type: "tool-call",
        id: "native-fixture-" + calls.length,
        name: current.name,
        arguments: JSON.stringify(current.args),
      };
      yield { type: "block-start", index: 0, blockType: "tool-call" };
      yield {
        type: "tool-call-delta",
        index: 0,
        id: block.id,
        name: block.name,
        argumentsDelta: block.arguments,
      };
      yield { type: "block-end", index: 0, block };
      yield { type: "finish", reason: { kind: "tool-calls" } };
      return;
    }
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "DSH_NATIVE_OK" };
    yield {
      type: "block-end",
      index: 0,
      block: { type: "text", text: "DSH_NATIVE_OK" },
    };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}
ctx.llm.registerAdapter(["fixture"], new Fixture());
let localQuestions = 0;
ctx.on("approval/request", async () => "rejected");
ctx.on("user-questions/request", async (request) => {
  localQuestions++;
  return {
    answers: request.questions.map((q) => ({
      id: q.id,
      selected: [],
      custom: "LOCAL_ONLY",
    })),
  };
});
const waitFor = async (fn, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("DSH_NATIVE_TIMEOUT");
};
const state = join(root, "state");
try {
  assert.deepEqual(inactive, []);
  local = await ctx.agents.create({
    sessionId: "local-existing",
    meta: { cwd: workspace, agentPreset: "standard" },
    agentOptions: { provider: "fixture", model: "fixture-a" },
    setup: async (agentCtx) => {
      await ctx.agentPresets.mount(agentCtx, "standard");
    },
  });
  await init(state, { engine: "dsh" });
  await addProject(state, {
    id: "p",
    path: workspace,
    provider: "fixture",
    model: "fixture-a",
  });
  const config = await configuration(state);
  config.port = 0;
  config.coordinationDirectory = join(root, "locks");
  await writeFile(join(state, "config.json"), JSON.stringify(config));
  bridge = new Bridge(state, new DshAdapter(ctx, { runtimeRoot: runtime }));
  const { address } = await bridge.start();
  const directory = join(root, "client");
  await pairClient(directory, {
    url: `https://127.0.0.1:${address.port}`,
    invite: await invite(state, { projects: ["p"] }),
  });
  const { client, handshake } = await loadClient(directory);
  const call = (method, params, operationId = randomUUID()) =>
    client.write(method, params, { operationId, epoch: handshake.epoch.id });
  const created = await call("session.create", {
    projectId: "p",
    title: "Native flow",
  });
  assert.equal(created.status, "succeeded", JSON.stringify(created));
  const id = created.result.sessionId;
  const lease = (await call("lease.acquire", { sessionId: id })).result.lease;
  renewal = setInterval(
    () => void call("lease.renew", { sessionId: id, lease }).catch(() => {}),
    30000,
  );
  streamAbort = new AbortController();
  stream = client
    .events({
      cursor: 0,
      runtime: handshake.runtime,
      signal: streamAbort.signal,
      onEvent: (event) => events.push(event),
    })
    .catch(() => {});
  const turn = async (next, answer = { decision: "accept" }) => {
    action = next;
    const op = randomUUID(),
      params = {
        sessionId: id,
        lease,
        text: "Execute the fixed local native fixture.",
      };
    const result = await call("turn.start", params, op);
    assert.equal(result.status, "succeeded", JSON.stringify(result));
    assert.deepEqual(await call("turn.start", params, op), result);
    const pending = answer
      ? await waitFor(
          async () =>
            (await client.read("approval.list", { sessionId: id }))[0],
        )
      : undefined;
    if (pending)
      assert.equal(
        (
          await call("approval.answer", {
            sessionId: id,
            lease,
            approvalId: pending.id,
            answer,
          })
        ).status,
        "succeeded",
      );
    await waitFor(() => !bridge.adapter.runs.has(id));
    return result;
  };
  assert.ok(
    !ctx.tools
      .schemas(ctx.agents.get(id))
      .some((t) =>
        ["subagent", "subagent_fork", "workflow", "ralph"].includes(t.name),
      ),
  );
  assert.ok(
    ctx.tools.schemas(local.agent).some((t) => t.name === "subagent_fork"),
  );
  await turn(
    { name: "write", args: { file_path: "denied.txt", content: "bad" } },
    { decision: "decline" },
  );
  await assert.rejects(access(join(workspace, "denied.txt")));
  await turn({
    name: "write",
    args: { file_path: "native.txt", content: "before\n" },
  });
  assert.equal(
    await readFile(join(workspace, "native.txt"), "utf8"),
    "before\n",
  );
  await turn({
    name: "edit",
    args: {
      file_path: "native.txt",
      old_string: "before",
      new_string: "after",
    },
  });
  assert.equal(
    await readFile(join(workspace, "native.txt"), "utf8"),
    "after\n",
  );
  await turn({ name: "read", args: { file_path: "native.txt" } }, null);
  const shell = process.platform === "win32" ? "pwsh" : "bash";
  await turn({
    name: shell,
    args: {
      command:
        "node -e \"require('fs').writeFileSync('shell.txt','NATIVE_SHELL_OK')\"",
      description: "Native fixed shell",
      workdir: workspace,
    },
  });
  assert.equal(
    await readFile(join(workspace, "shell.txt"), "utf8"),
    "NATIVE_SHELL_OK",
  );
  await turn(
    {
      name: "ask_user_question",
      args: {
        questions: [
          {
            id: "choice",
            question: "Native fixture?",
            options: [{ label: "Yes" }, { label: "No" }],
          },
        ],
      },
    },
    { answers: { choice: { answers: ["Yes"] } } },
  );
  assert.equal(localQuestions, 0);
  assert.ok(events.some((e) => JSON.stringify(e).includes("DSH_NATIVE_OK")));
  console.log(
    "PASS DSH native file/shell tools, once approvals, questions, mTLS stream and operation dedup",
  );
  const models = await client.read("model.list", { projectId: "p" });
  assert.equal(models.data.length, 2);
  const update = await call("session.update", {
    sessionId: id,
    lease,
    title: "Renamed native",
    settings: { model: "fixture-b", reasoningEffort: "high" },
  });
  assert.equal(update.status, "succeeded", JSON.stringify(update));
  await turn(undefined, null);
  assert.equal(calls.at(-1).model, "fixture-b");
  assert.equal(calls.at(-1).effort, "high");
  const forked = await call("session.fork", {
    sessionId: id,
    lease,
    title: "Forked native",
  });
  assert.equal(forked.status, "succeeded", JSON.stringify(forked));
  assert.ok(
    (await client.read("session.read", { sessionId: forked.result.sessionId }))
      .snapshot.events.length,
  );
  action = { hang: true };
  await call("turn.start", {
    sessionId: id,
    lease,
    text: "Cancel the native provider wait.",
  });
  await waitFor(() => ctx.agents.get(id).status === "running");
  assert.equal(
    (await call("turn.cancel", { sessionId: id, lease })).status,
    "succeeded",
  );
  const archived = await call("session.archive", { sessionId: id, lease });
  assert.equal(archived.status, "succeeded", JSON.stringify(archived));
  assert.ok(
    (await client.read("session.read", { sessionId: id })).snapshot.events
      .length,
  );
  assert.equal(
    (await call("session.resume", { sessionId: id, lease })).status,
    "succeeded",
  );
  const snapshot = await client.read("session.read", { sessionId: id });
  assert.equal(snapshot.snapshot.model, "fixture-b");
  assert.equal(snapshot.snapshot.reasoningEffort, "high");
  assert.equal(snapshot.session.title, "Renamed native");
  const compacted = await call("session.compact", { sessionId: id, lease });
  assert.equal(compacted.status, "succeeded", JSON.stringify(compacted));
  await waitFor(() => !bridge.adapter.runs.has(id));
  assert.equal(bridge.store.all("nativeActivity").length, 0);
  assert.equal(ctx.agents.get("local-existing"), local.agent);
  console.log(
    "PASS DSH model/effort, rename, fork, compact, cancel, archived cold read/resume and existing local agent",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  clearInterval(renewal);
  streamAbort?.abort();
  await stream;
  try {
    await bridge?.stop();
  } finally {
    await local?.dispose();
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
}
