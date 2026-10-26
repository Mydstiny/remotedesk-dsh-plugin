#!/usr/bin/env node
// Provisions a separate installation; never replaces a global CLI or Desktop.
import { mkdir, lstat, readdir, realpath, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { runtimeProfiles, supportedNodeVersion, supportedRuntimeNode, doctor } from "../src/runtime-contract.mjs";

export async function npmEntry() {
  const binary = dirname(process.execPath);
  const candidates = [process.env.npm_execpath,
    join(binary, "node_modules", "npm", "bin", "npm-cli.js"),
    join(binary, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    candidates.push(join(dir, "node_modules", "npm", "bin", "npm-cli.js"));
    try { candidates.push(await realpath(join(dir, "npm"))); } catch { /* next installation */ }
  }
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.endsWith("npm-cli.js")) continue;
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error("NPM_CLI_REQUIRED");
}

export async function provisionRuntime({ destination, profileId = "modern-021" }) {
  if (!supportedNodeVersion(process.versions.node)) throw new Error("NODE_VERSION_UNSUPPORTED");
  const profile = runtimeProfiles().find((p) => p.id === profileId && p.enabled !== false);
  if (!profile) throw new Error("SUPPORTED_RUNTIME_PROFILE_REQUIRED");
  if (!supportedRuntimeNode(profile) || (profile.requiresImportMetaMain && typeof import.meta.main !== "boolean"))
    throw new Error("NODE_RUNTIME_PROFILE_UNSUPPORTED");
  if (!destination) throw new Error("RUNTIME_DESTINATION_REQUIRED");
  const root = resolve(destination);
  const npm = await npmEntry();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(root)).length)
    throw new Error("RUNTIME_DESTINATION_MUST_BE_EMPTY_DIRECTORY");
  await writeFile(join(root, "package.json"), JSON.stringify({
    private: true,
    dependencies: { "@deepseek-ai/dsh": profile.cliVersions[0], pnpm: profile.pnpmVersion },
    overrides: profile.components,
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npm, "install", "--prefix", root, "--no-audit", "--no-fund"],
      { shell: false, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exit !== 0) throw new Error("RUNTIME_INSTALL_FAILED_KEEP_DIRECTORY_FOR_DIAGNOSIS");
  const runtimeRoot = join(root, "node_modules", "@deepseek-ai", "dsh");
  if ((await doctor({ runtimeRoot })).status !== "ok") throw new Error("PROVISIONED_RUNTIME_UNVERIFIED");
  return { installed: true, profile: profile.id, version: profile.cliVersions[0], runtimeRoot,
    binDirectory: join(root, "node_modules", ".bin"), globalInstallationChanged: false };
}

const entry = process.argv[1];
if (entry && await realpath(entry).catch(() => "") === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    if (args.length % 2) throw new Error("USAGE_DESTINATION_AND_OPTIONAL_PROFILE");
    for (let i = 0; i < args.length; i += 2) {
      if (!["--destination", "--profile"].includes(args[i]) || options[args[i]] !== undefined || !args[i + 1] || args[i + 1].startsWith("--"))
        throw new Error("USAGE_DESTINATION_AND_OPTIONAL_PROFILE");
      options[args[i]] = args[i + 1];
    }
    console.log(JSON.stringify(await provisionRuntime({ destination: options["--destination"], profileId: options["--profile"] })));
  } catch (error) {
    const safe = /^(NODE_VERSION_UNSUPPORTED|NODE_RUNTIME_PROFILE_UNSUPPORTED|SUPPORTED_RUNTIME_PROFILE_REQUIRED|RUNTIME_DESTINATION_REQUIRED|RUNTIME_DESTINATION_MUST_BE_EMPTY_DIRECTORY|NPM_CLI_REQUIRED|RUNTIME_INSTALL_FAILED_KEEP_DIRECTORY_FOR_DIAGNOSIS|PROVISIONED_RUNTIME_UNVERIFIED|USAGE_DESTINATION_AND_OPTIONAL_PROFILE)$/;
    console.error(JSON.stringify({ installed: false, code: safe.test(error.message) ? error.message : "RUNTIME_PROVISION_FAILED" }));
    process.exitCode = 2;
  }
}
