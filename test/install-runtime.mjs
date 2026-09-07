// Native package install/start gate on all OSes, including paths with spaces.
// An empty project allowlist never calls a model.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { init, configuration } from "@remotedesk/bridge-core/admin";
import { requestStop } from "@remotedesk/bridge-core/service";
const exec = promisify(execFile),
  source = dirname(dirname(fileURLToPath(import.meta.url)));
const archive = resolve(
  process.argv[2] ?? join(source, "remotedesk-dsh-plugin-0.3.0.tgz"),
);
await access(archive);
const root = await mkdtemp(join(tmpdir(), "remotedesk-native-install-")),
  state = join(root, "private state & literal"),
  env = { ...process.env, DSH_HOME: join(root, "dsh home & literal") };
const cli = join(source, "bin/remotedesk-dsh.mjs");
let child,
  exited,
  output = "";
try {
  await init(state, { engine: "dsh" });
  const config = await configuration(state);
  config.port = 0;
  config.coordinationDirectory = join(root, "coordination");
  await writeFile(join(state, "config.json"), JSON.stringify(config));
  try {
    await exec(
      process.execPath,
      [
        cli,
        "plugin-install",
        "--state",
        state,
        "--profile",
        "remotedesk-install-test",
        "--package",
        archive,
      ],
      { env, maxBuffer: 4e6, timeout: 180000 },
    );
  } catch (error) {
    // Only package-manager diagnostic lines; no runtime logs or credentials.
    const text = String(error.stdout ?? "") + String(error.stderr ?? "");
    console.error(
      text
        .split("\n")
        .filter((line) =>
          /ERR_|error|pnpm not found|PLUGIN_INSTALL|LOCAL_COMMAND_FAILED/.test(
            line,
          ),
        )
        .map((line) => line.replaceAll(root, "<fixture>"))
        .join("\n")
        .slice(0, 4000),
    );
    throw new Error("NATIVE_PROFILE_INSTALL_FAILED");
  }
  child = spawn(process.execPath, [cli, "serve", "--state", state], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  exited = new Promise((r) => child.once("exit", r));
  child.stdout.on("data", (d) => {
    if (output.length < 1e6) output += d;
  });
  child.stderr.on("data", (d) => {
    if (output.length < 1e6) output += d;
  });
  const until = Date.now() + 45000;
  while (
    !output.includes('"ready":true') &&
    Date.now() < until &&
    child.exitCode === null
  )
    await new Promise((r) => setTimeout(r, 100));
  assert.ok(
    output.includes('"ready":true'),
    "installed native bundle must start its TLS bridge",
  );
  const identity = JSON.parse(await readFile(join(state, "server.lock")));
  assert.equal(identity.pid, child.pid);
  await requestStop(state);
  await exited;
  await assert.rejects(access(join(state, "server.lock")));
  console.log(
    "PASS actual packed DSH native installation, startup and graceful shutdown with spaces and ampersands in state/profile paths (" +
      process.platform +
      "); empty projects, native runtime, no model request.",
  );
} finally {
  if (child?.exitCode === null) {
    await requestStop(state).catch(() => child.kill("SIGTERM"));
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await exited;
  }
  await rm(root, { recursive: true, force: true });
}
