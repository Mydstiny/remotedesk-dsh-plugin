// Native package installation and full dedicated/web profile regression.
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  realpath,
  symlink,
  copyFile,
  rm,
  access,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import {
  init,
  addProject,
  configuration,
  invite,
} from "@remotedesk/bridge-core/admin";
import { pairClient, loadClient } from "@remotedesk/bridge-core/client";
import { requestStop } from "@remotedesk/bridge-core/service";
import { locateRuntime } from "../src/doctor.mjs";
const exec = promisify(execFile),
  source = dirname(dirname(fileURLToPath(import.meta.url)));
const cli = join(source, "bin/remotedesk-dsh.mjs"),
  native = join(await locateRuntime(), "lib/bin.js");
const scratch = await realpath(
  await mkdtemp(join(tmpdir(), "remotedesk-profile-test-")),
);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const port = async () => {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
};
async function command(bin, args, options = {}) {
  try {
    return await exec(bin, args, { maxBuffer: 4e6, ...options });
  } catch {
    throw new Error(
      "PROFILE_FIXTURE_COMMAND_FAILED_" +
        (args.includes("plugin-install")
          ? "plugin-install"
          : args.includes("pack")
            ? "pack"
            : "native-install"),
    );
  }
}
try {
  const packed = JSON.parse(
    (
      await command(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", scratch],
        {
          cwd: source,
        },
      )
    ).stdout,
  )[0];
  for (const profile of ["remotedesk-test", "web"]) {
    const root = join(scratch, profile),
      state = join(root, "state"),
      project = join(root, "project"),
      fixture = join(root, "provider");
    await mkdir(project, { recursive: true });
    await mkdir(fixture);
    await writeFile(
      join(root, "outside.txt"),
      "REMOTEDESK_OUTSIDE_INSTRUCTION_CANARY",
    );
    await symlink(join(root, "outside.txt"), join(project, "AGENTS.md"));
    const env = {
      ...process.env,
      DSH_HOME: join(root, "dsh-home"),
      REMOTEDESK_PROFILE_TEST_ROOT: root,
    };
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify({
        name: "remotedesk-profile-fixture",
        version: "0.0.0",
        type: "module",
        exports: { ".": "./index.mjs", "./local": "./local.mjs" },
        dsh: { bundle: { patch: "./cordis.patch.yml" } },
        dependencies: { "@deepseek-ai/dsh-llm": "0.1.2-rc.1" },
      }),
    );
    await copyFile(
      join(source, "test/fixtures/profile-provider.mjs"),
      join(fixture, "index.mjs"),
    );
    await copyFile(
      join(source, "test/fixtures/profile-local.mjs"),
      join(fixture, "local.mjs"),
    );
    await writeFile(
      join(fixture, "cordis.patch.yml"),
      "- insert:\n    - id: profile-fixture\n      name: remotedesk-profile-fixture\n" +
        (profile === "web"
          ? "    - id: profile-local-fixture\n      name: remotedesk-profile-fixture/local\n"
          : ""),
    );
    const httpsPort = await port(),
      webPort = await port();
    await init(state, { engine: "dsh", port: httpsPort });
    await addProject(state, {
      id: "test",
      path: project,
      provider: "remotedesk-fixture",
      model: "fixture",
    });
    const config = await configuration(state);
    config.coordinationDirectory = join(root, "coordination");
    await writeFile(join(state, "config.json"), JSON.stringify(config));
    if (profile === "remotedesk-test") {
      const fakeBin = join(root, "failing-pnpm");
      await mkdir(fakeBin);
      await writeFile(join(fakeBin, "pnpm"), "#!/bin/sh\nexit 7\n");
      await chmod(join(fakeBin, "pnpm"), 0o700);
      await assert.rejects(
        command(
          process.execPath,
          [
            cli,
            "plugin-install",
            "--state",
            state,
            "--profile",
            profile,
            "--package",
            join(scratch, packed.filename),
          ],
          { env: { ...env, PATH: fakeBin + ":" + env.PATH } },
        ),
      );
      await access(join(env.DSH_HOME, "profiles", profile, "package.json"));
    }
    await command(
      process.execPath,
      [
        cli,
        "plugin-install",
        "--state",
        state,
        "--profile",
        profile,
        "--package",
        join(scratch, packed.filename),
        ...(profile === "web" ? ["--web-port", String(webPort)] : []),
      ],
      { env },
    );
    const fp = JSON.parse(
      (
        await command(
          "npm",
          ["pack", "--json", "--ignore-scripts", "--pack-destination", root],
          {
            cwd: fixture,
            env,
          },
        )
      ).stdout,
    )[0];
    await command(
      process.execPath,
      [native, "plugin", "--profile", profile, "add", join(root, fp.filename)],
      { env },
    );
    let output = "",
      child,
      exited;
    const start = () => {
      output = "";
      child = spawn(process.execPath, [cli, "serve", "--state", state], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (d) => {
        if (output.length < 1e6) output += d;
      });
      child.stderr.on("data", (d) => {
        if (output.length < 1e6) output += d;
      });
      exited = new Promise((resolve) => child.once("exit", resolve));
    };
    const ready = async () => {
      const until = Date.now() + 60000;
      while (
        !output.includes('"ready":true') &&
        Date.now() < until &&
        child.exitCode === null
      )
        await delay(100);
      assert.ok(output.includes('"ready":true'), "native profile must start");
    };
    const stop = async () => {
      await requestStop(state);
      await exited;
      assert.equal(child.exitCode, 0, "native profile must exit cleanly");
      await assert.rejects(access(join(state, "server.lock")), {
        code: "ENOENT",
      });
    };
    start();
    try {
      await ready();
      const directory = join(root, "client");
      await pairClient(directory, {
        url: "https://127.0.0.1:" + httpsPort,
        invite: await invite(state, { projects: ["test"] }),
      });
      const { client, handshake } = await loadClient(directory),
        call = (method, params) =>
          client.write(method, params, {
            operationId: randomUUID(),
            epoch: handshake.epoch.id,
          });
      const created = await call("session.create", {
        projectId: "test",
        title: "Profile acceptance",
      });
      assert.equal(created.status, "succeeded");
      const id = created.result.sessionId,
        lease = (await call("lease.acquire", { sessionId: id })).result.lease;
      for (let i = 0; i < 2; i++) {
        assert.equal(
          (
            await call("turn.start", {
              sessionId: id,
              lease,
              text: "Reply with test marker.",
            })
          ).status,
          "succeeded",
        );
        let snapshot;
        const end = Date.now() + 30000;
        while (Date.now() < end) {
          snapshot = (await client.read("session.read", { sessionId: id }))
            .snapshot;
          if (
            snapshot.status === "idle" &&
            JSON.stringify(snapshot).includes("DSH_PROFILE_FIXTURE_OK")
          )
            break;
          await delay(100);
        }
        assert.equal(snapshot.status, "idle");
        assert.ok(JSON.stringify(snapshot).includes("DSH_PROFILE_FIXTURE_OK"));
        if (!i) {
          assert.equal(
            (await call("session.archive", { sessionId: id, lease })).status,
            "succeeded",
          );
          assert.equal(
            (await call("session.resume", { sessionId: id, lease })).status,
            "succeeded",
          );
        }
      }
      const rows = (await readFile(join(root, "observations.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map(JSON.parse);
      assert.ok(rows.some((r) => r.remote));
      for (const row of rows.filter((r) => r.remote)) {
        assert.equal(
          row.canary,
          true,
          "native scoped project instructions retain native read behavior",
        );
        for (const name of ["read", "write", "edit", "ask_user_question"])
          assert.ok(row.tools.includes(name));
        assert.ok(
          !row.tools.some((name) =>
            ["subagent", "subagent_fork", "run_code", "workflow"].includes(
              name,
            ),
          ),
        );
      }
      if (profile === "web") {
        assert.ok(
          rows.some((r) => !r.remote && r.canary),
          "local standard preset must retain its own AGENTS instructions",
        );
        assert.equal(
          JSON.parse(await readFile(join(root, "local-result.json"))).status,
          "idle",
        );
      }
      const beforeStop = (await client.read("session.read", { sessionId: id }))
        .snapshot;
      assert.equal(beforeStop.nextCursor, null);
      await stop();
      start();
      await ready();
      const { client: coldClient, handshake: coldHandshake } =
        await loadClient(directory);
      assert.equal(coldHandshake.instance, handshake.instance);
      const restored = (
        await coldClient.read("session.read", { sessionId: id })
      ).snapshot;
      assert.deepEqual(
        restored.events,
        beforeStop.events,
        "cold native history must preserve every event",
      );
      const coldCall = (method, params) =>
        coldClient.write(method, params, {
          operationId: randomUUID(),
          epoch: coldHandshake.epoch.id,
        });
      const coldLease = (await coldCall("lease.acquire", { sessionId: id }))
        .result.lease;
      assert.equal(
        (await coldCall("session.resume", { sessionId: id, lease: coldLease }))
          .status,
        "succeeded",
      );
      assert.equal(
        (
          await coldCall("turn.start", {
            sessionId: id,
            lease: coldLease,
            text: "DSH_PROFILE_STOP_ACTIVE",
          })
        ).status,
        "succeeded",
      );
      const activeUntil = Date.now() + 30000;
      let activeEntered = false;
      while (Date.now() < activeUntil) {
        try {
          await access(join(root, "active-entered"));
          activeEntered = true;
          break;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        await delay(100);
      }
      assert.ok(activeEntered, "stop test must enter the native model stream");
      await stop();
      start();
      await ready();
      const { client: afterActive } = await loadClient(directory);
      const activeHistory = (
        await afterActive.read("session.read", { sessionId: id })
      ).snapshot;
      const userEvent = activeHistory.events.findLast(
        (e) =>
          e.type === "user/message" &&
          JSON.stringify(e).includes("DSH_PROFILE_STOP_ACTIVE"),
      );
      assert.ok(userEvent);
      assert.ok(
        activeHistory.events.some(
          (e) => e.type === "turn/end" && e.seq > userEvent.seq,
        ),
        "managed stop must persist the active turn's final event",
      );
      await stop();
      console.log(
        "PASS native packed DSH profile " +
          profile +
          ": mTLS sessions, model turns, archive/resume, clean shutdown and cold native history, native remote tools and native project instructions" +
          (profile === "web" ? ", local standard instructions preserved" : ""),
      );
    } catch (e) {
      await writeFile(join(root, "failure.log"), output, { mode: 0o600 });
      console.error(output.slice(-16000));
      throw e;
    } finally {
      if (child.exitCode === null) {
        await requestStop(state).catch(() => child.kill("SIGTERM"));
        await Promise.race([exited, delay(20000)]);
        if (child.exitCode === null) child.kill("SIGKILL");
      }
      await exited;
    }
  }
} finally {
  if (process.env.REMOTEDESK_KEEP_TEST === "1")
    console.error("FIXTURE_DIRECTORY", scratch);
  else await rm(scratch, { recursive: true, force: true });
}
