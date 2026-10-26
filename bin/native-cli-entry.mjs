#!/usr/bin/env node
// Invoke the pinned CLI export explicitly. import.meta.main is absent on
// Node 22.16/22.17, so merely spawning the upstream 0.2.1 bin can exit silently.
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveRuntime, doctor } from "../src/doctor.mjs";
const [root, ...args] = process.argv.slice(2);
if (!root || !isAbsolute(root)) throw new Error("NATIVE_CLI_RUNTIME_ROOT_REQUIRED");
const runtime = await resolveRuntime({ runtimeRoot: root });
if ((await doctor({ runtime })).status !== "ok") throw new Error("DSH_RUNTIME_UNVERIFIED");
process.env.REMOTEDESK_DSH_RUNTIME_ROOT = runtime.root;
process.argv = [process.execPath, runtime.entry, ...args];
const cli = await import(pathToFileURL(runtime.entry).href);
if (runtime.profile.id === "modern-021") {
  if (typeof cli.runCli !== "function") throw new Error("NATIVE_CLI_ENTRY_UNAVAILABLE");
  await cli.runCli();
}
