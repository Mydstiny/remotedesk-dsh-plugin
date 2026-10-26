import { access, readFile, realpath } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const compatibility = JSON.parse(
  await readFile(new URL("../compatibility.json", import.meta.url)),
);
const metadata = async (path) => JSON.parse(await readFile(path, "utf8"));
export const runtimeProfiles = () => compatibility.runtimeProfiles ?? [{
  id: "legacy-012", enabled: true,
  cliVersions: compatibility.cliVersions, components: compatibility.components,
}];
const safeVersion = (v) => typeof v === "string" && v.length <= 80 &&
  /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(v) ? v : null;

export function supportedNodeVersion(version) {
  const [major, minor] = String(version).split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 16);
}

export async function locateRuntime({ runtimeRoot } = {}) {
  const explicitRoot = runtimeRoot ?? process.env.REMOTEDESK_DSH_RUNTIME_ROOT;
  if (explicitRoot) {
    try {
      const root = await realpath(explicitRoot);
      if ((await metadata(join(root, "package.json"))).name === "@deepseek-ai/dsh")
        return root;
    } catch { /* explicit roots never fall through to PATH */ }
    throw new Error("NOT_DSH_INSTALLATION");
  }
  // Executable installations only: never inspect profiles, accounts or history.
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const executable = join(directory, process.platform === "win32" ? "dsh.cmd" : "dsh");
    try {
      await access(executable, constants.X_OK);
      if (process.platform === "win32") {
        const root = join(directory, "node_modules", "@deepseek-ai", "dsh");
        try {
          if ((await metadata(join(root, "package.json"))).name === "@deepseek-ai/dsh")
            return await realpath(root);
        } catch { /* inspect executable ancestors next */ }
      }
      let candidate = dirname(await realpath(executable));
      for (let i = 0; i < 4; i++) {
        try {
          if ((await metadata(join(candidate, "package.json"))).name === "@deepseek-ai/dsh")
            return candidate;
        } catch { /* keep walking */ }
        candidate = dirname(candidate);
      }
    } catch { /* try next PATH entry */ }
  }
  throw new Error("DSH_RUNTIME_NOT_FOUND_USE_RUNTIME_ROOT");
}

// The descriptor is private to this process. Reports expose no installation paths.
export async function resolveRuntime({ runtimeRoot } = {}) {
  const root = await locateRuntime({ runtimeRoot });
  const anchor = join(root, "package.json");
  const pkg = await metadata(anchor);
  if (pkg.name !== "@deepseek-ai/dsh") throw new Error("NOT_DSH_INSTALLATION");
  const version = safeVersion(pkg.version);
  if (!version) throw new Error("RUNTIME_METADATA_UNAVAILABLE");
  const profiles = runtimeProfiles();
  const profile = profiles.find((p) => p.cliVersions.includes(version)) ??
    profiles.find((p) => p.cliVersions.some((v) => v.split(".").slice(0, 2).join(".") === version.split(".").slice(0, 2).join("."))) ?? profiles[0];
  const require = createRequire(anchor);
  const checks = [];
  const versions = { "@deepseek-ai/dsh": version };
  for (const [name, expected] of Object.entries(profile.components)) {
    try {
      const pkg = await metadata(require.resolve(`${name}/package.json`));
      if (pkg.name !== name) {
        checks.push({ id: name, status: "fail", code: "COMPONENT_IDENTITY_MISMATCH", expected, actual: null });
        continue;
      }
      const actual = safeVersion(pkg.version);
      versions[name] = actual;
      checks.push({ id: name, status: actual === expected ? "pass" : "fail",
        code: actual === expected ? "PINNED_VERSION" : "UNVERIFIED_COMPONENT_VERSION", expected, actual });
    } catch (error) {
      versions[name] = null;
      checks.push({ id: name, status: "fail", expected, actual: null,
        code: error.code === "MODULE_NOT_FOUND" || error.code === "ENOENT" ? "COMPONENT_MISSING" : "COMPONENT_METADATA_UNAVAILABLE" });
    }
  }
  return Object.freeze({ root, anchor, kind: "cli", version, profile, checks, versions,
    entry: join(root, "lib", "bin.js"),
    load: async (name) => import(pathToFileURL(require.resolve(name)).href),
    resolve: (name) => require.resolve(name),
  });
}

export async function inspectRuntime(root) {
  return (await resolveRuntime({ runtimeRoot: root })).versions;
}

export async function doctor({ runtimeRoot, runtime } = {}) {
  const report = {
    schemaVersion: 1, status: "blocked", changed: false,
    componentVersions: { adapter: compatibility.adapterVersion, node: process.versions.node },
    checks: [], actions: [], requiresUserAction: [],
    warnings: ["NATIVE_SANDBOX_AND_APPROVALS", "PROVIDER_AUTHENTICATION_STAYS_ON_HOST"],
    capabilities: { remoteAccess: false, remoteProtocol: 1, proEntitlement: "pro.lifetime" },
    supportedRuntimes: runtimeProfiles().map((p) => ({ id: p.id, versions: p.cliVersions, enabled: p.enabled !== false })),
  };
  try {
    if (!supportedNodeVersion(process.versions.node)) throw new Error("NODE_VERSION_UNSUPPORTED");
    const resolved = runtime ?? await resolveRuntime({ runtimeRoot });
    Object.assign(report.componentVersions, resolved.versions);
    report.runtime = { kind: resolved.kind, version: resolved.version, contract: resolved.profile.id };
    const cliMatch = resolved.profile.cliVersions.includes(resolved.version);
    report.checks.push({ id: "@deepseek-ai/dsh", status: cliMatch ? "pass" : "fail",
      code: cliMatch ? "PINNED_VERSION" : "UNVERIFIED_COMPONENT_VERSION",
      expected: resolved.profile.cliVersions, actual: resolved.version }, ...resolved.checks);
    if (resolved.profile.enabled === false)
      report.checks.push({ id: "adapter", status: "fail", code: "NATIVE_ADAPTER_NOT_VERIFIED" });
    report.status = report.checks.every((c) => c.status === "pass") ? "ok" : "blocked";
  } catch (error) {
    const safe = new Set(["DSH_RUNTIME_NOT_FOUND_USE_RUNTIME_ROOT", "NOT_DSH_INSTALLATION", "NODE_VERSION_UNSUPPORTED"]);
    report.checks.push({ id: "runtime", status: "fail", code: safe.has(error.message) ? error.message : "RUNTIME_METADATA_UNAVAILABLE" });
  }
  if (report.status !== "ok") {
    report.requiresUserAction.push("CHECK_EXACT_COMPONENT_VERSIONS");
    report.actions.push({ code: "USE_SEPARATE_PINNED_CLI_RUNTIME",
      message: "Desktop alone is not a standalone CLI installation. Keep Desktop installed; provision a supported exact CLI in a separate directory and set REMOTEDESK_DSH_RUNTIME_ROOT to its @deepseek-ai/dsh package directory.",
      expectedLayout: "<installation>/node_modules/@deepseek-ai/dsh/package.json" });
  }
  return report;
}
