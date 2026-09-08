// Real DSH teardown and Bridge.stop. All homes, state and jobs are test-owned.
import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const source = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(source, "package.json"));
const moduleAt = (path) => import(pathToFileURL(path).href);
const { Bridge } = await moduleAt(require.resolve("@remotedesk/bridge-core"));
const { init, addProject, configuration } = await moduleAt(
  require.resolve("@remotedesk/bridge-core/admin"),
);
const { Store } = await moduleAt(
  require.resolve("@remotedesk/bridge-core/store"),
);
const { DshAdapter } = await moduleAt(join(source, "src/dsh-adapter.mjs"));
const { locateRuntime } = await moduleAt(join(source, "src/doctor.mjs"));
const { boot } = await moduleAt(join(source, "test/native-host.mjs"));
const originalCwd = process.cwd();
const originalHome = process.env.DSH_HOME;
const originalAgentsHome = process.env.DSH_AGENTS_HOME;
const root = await realpath(
  await mkdtemp(join(tmpdir(), "remotedesk-native-shutdown-")),
);
let ctx;
const exists = (path) =>
  access(path).then(
    () => true,
    (error) => {
      if (error.code !== "ENOENT") throw error;
      return false;
    },
  );

try {
  const runtime = await locateRuntime();
  const host = await boot(root, runtime);
  ({ ctx } = host);
  assert.deepEqual(host.inactive, []);
  const { LlmAdapter } = await host.load("@deepseek-ai/dsh-llm");
  class Fixture extends LlmAdapter {
    async resolveModel(provider, id) {
      return { provider, id, name: id, inputModalities: ["text"] };
    }
    async *stream() {
      const text = "DSH_SHUTDOWN_FIXTURE";
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text };
      yield { type: "block-end", index: 0, block: { type: "text", text } };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  ctx.llm.registerAdapter(["fixture"], new Fixture());

  for (const scenario of [
    "completed-cleanup",
    "failed-producer",
    "missing-durable-tail",
  ]) {
    const state = join(root, scenario);
    await init(state, { engine: "dsh" });
    await addProject(state, {
      id: "p",
      path: host.workspace,
      provider: "fixture",
      model: "fixture-a",
    });
    const config = await configuration(state);
    config.port = 0;
    config.coordinationDirectory = join(state, "coordination");
    await writeFile(join(state, "config.json"), JSON.stringify(config));
    const adapter = new DshAdapter(ctx, { runtimeRoot: runtime });
    const bridge = new Bridge(state, adapter);
    let restoreReadFrom;
    try {
      await bridge.start();
      const session = {
        id: "shutdown-" + randomUUID(),
        project: "p",
        title: scenario,
        permissionMode: "read-only",
        created: Date.now(),
        updated: Date.now(),
      };
      await adapter.create(session, bridge.config.projects[0]);
      const handle = adapter.handles.get(session.id);
      assert.ok(handle);
      await bridge.projectLocks.acquire(bridge.config.projects[0], session.id);
      const writerLock = bridge.projectLocks.held.get(session.id).path;
      bridge.store.put("nativeActivity", session.id, {
        id: session.id,
        project: session.project,
        upstream: session.upstream,
        scope: "native-managed-jobs-and-terminals",
        started: Date.now(),
      });

      let cancellations = 0;
      if (scenario !== "missing-durable-tail") {
        let finish;
        const done = new Promise((resolve) => {
          finish = resolve;
        });
        ctx.jobs.start({
          owner: handle.agent,
          kind: "shutdown-fixture",
          label: scenario,
          run() {
            return {
              done,
              cancel() {
                cancellations++;
                if (scenario === "failed-producer")
                  throw new Error(
                    "controlled native producer cancellation failure",
                  );
                setTimeout(() => finish({ status: "killed" }), 10);
              },
            };
          },
        });
      }

      // Force the exact root-shutdown race: native ownership has already
      // disposed and dropped its job records when Bridge.stop begins.
      await handle.dispose();
      assert.equal(
        ctx.jobs
          .list(handle.agent)
          .filter((job) => job.ownerSession === session.id).length,
        0,
      );
      const audit = await handle.lifecycle.jobs;
      if (scenario !== "missing-durable-tail") {
        assert.equal(cancellations, 1);
        assert.equal(audit.length, 1);
        assert.equal(audit[0].status, "fulfilled");
        assert.equal(
          audit[0].value.status,
          scenario === "failed-producer" ? "failed" : "killed",
        );
      }

      if (scenario === "missing-durable-tail") {
        const persistence = ctx.sessionPersistence;
        const original = persistence.readFrom;
        restoreReadFrom = () => {
          persistence.readFrom = original;
        };
        persistence.readFrom = async function (...args) {
          const stored = await original.apply(this, args);
          if (args[0] !== session.id) return stored;
          assert.ok(stored.events.length > 0);
          return { ...stored, events: stored.events.slice(0, -1) };
        };
      }

      const failureExpected = scenario !== "completed-cleanup";
      if (failureExpected)
        await assert.rejects(
          bridge.stop(),
          (error) => error.code === "NATIVE_ACTIVITY_RECONCILIATION_REQUIRED",
        );
      else await bridge.stop();
      restoreReadFrom?.();
      restoreReadFrom = undefined;

      // Bridge.stop closes its SQLite handle. Reopen only this test state to
      // assert the durable activity marker, in addition to both lock files.
      const reopened = new Store(state);
      let activityPresent;
      try {
        activityPresent = !!reopened.get("nativeActivity", session.id);
      } finally {
        reopened.close();
      }
      const serverLockPresent = await exists(join(state, "server.lock"));
      const writerLockPresent = await exists(writerLock);
      assert.equal(activityPresent, failureExpected);
      assert.equal(serverLockPresent, failureExpected);
      assert.equal(writerLockPresent, failureExpected);
      assert.equal(adapter.handles.has(session.id), failureExpected);
      console.log(
        "PASS native shutdown " +
          scenario +
          ": " +
          JSON.stringify({
            activityPresent,
            serverLockPresent,
            writerLockPresent,
            jobResults: audit.map((result) =>
              result.status === "fulfilled" ? result.value.status : "rejected",
            ),
          }),
      );
    } finally {
      restoreReadFrom?.();
      await bridge.stop().catch(() => {});
      // The failure producer is synthetic and never owns an OS process.
      // Evidence above is asserted before removing this fixture's locks.
      await bridge.projectLocks?.close();
    }
  }
} finally {
  await ctx?.fiber.dispose();
  process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = originalHome;
  if (originalAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME;
  else process.env.DSH_AGENTS_HOME = originalAgentsHome;
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
