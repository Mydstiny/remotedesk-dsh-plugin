import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor, locateRuntime, resolveRuntime, supportedNodeVersion } from "../src/doctor.mjs";
const manifest = JSON.parse(await readFile(new URL("../compatibility.json", import.meta.url)));
async function fixture(t, profile, version = profile.cliVersions[0]) {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version }));
  for (const [name, version] of Object.entries(profile.components)) {
    const dir = join(root, "node_modules", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "package.json"), JSON.stringify({ name, version }));
  }
  return root;
}
test("missing components are reported individually without hiding later drift", async (t) => {
  const p = manifest.runtimeProfiles[0], root = await fixture(t, p);
  const names = Object.keys(p.components);
  await rm(join(root, "node_modules", names[0]), { recursive: true });
  await writeFile(join(root, "node_modules", names.at(-1), "package.json"), JSON.stringify({ name: names.at(-1), version: "9.0.0" }));
  const r = await doctor({ runtimeRoot: root });
  assert.equal(r.status, "blocked");
  assert.equal(r.checks.length, names.length + 1);
  assert.equal(r.checks.find((c) => c.id === names[0]).code, "COMPONENT_MISSING");
  assert.equal(r.checks.find((c) => c.id === names.at(-1)).actual, "9.0.0");
  assert.ok(!JSON.stringify(r).includes(root));
});
test("unknown patches are refused even when every component is pinned", async (t) => {
  const root = await fixture(t, manifest.runtimeProfiles[0], "0.1.2-rc.99");
  const r = await doctor({ runtimeRoot: root });
  assert.equal(r.status, "blocked");
  assert.equal(r.checks[0].code, "UNVERIFIED_COMPONENT_VERSION");
});
test("modern metadata selects its own component contract without the removed package", async (t) => {
  const profile = manifest.runtimeProfiles.find((p) => p.id === "modern-021");
  const root = await fixture(t, profile), r = await doctor({ runtimeRoot: root });
  assert.equal(r.runtime.contract, "modern-021");
  assert.ok(!r.checks.some((c) => c.id === "@deepseek-ai/dsh-agent-presets"));
  assert.equal(r.status, profile.enabled ? "ok" : "blocked");
  assert.ok(r.checks.filter((c) => c.id !== "adapter").every((c) => c.status === "pass"));
});
test("an explicit bad root never borrows a valid PATH runtime", async () => {
  await assert.rejects(locateRuntime({ runtimeRoot: "/nonexistent/SECRET_SENTINEL" }), /NOT_DSH_INSTALLATION/);
  const r = await doctor({ runtimeRoot: "/nonexistent/SECRET_SENTINEL" });
  assert.equal(r.status, "blocked");
  assert.ok(r.actions.some((a) => a.code === "USE_SEPARATE_PINNED_CLI_RUNTIME"));
  assert.ok(!JSON.stringify(r).includes("SECRET_SENTINEL"));
});
test("a resolved descriptor stays on its selected runtime after the environment changes", async (t) => {
  const root = await fixture(t, manifest.runtimeProfiles[0]);
  const r = await resolveRuntime({ runtimeRoot: root });
  const previous = process.env.REMOTEDESK_DSH_RUNTIME_ROOT;
  t.after(() => { if (previous === undefined) delete process.env.REMOTEDESK_DSH_RUNTIME_ROOT; else process.env.REMOTEDESK_DSH_RUNTIME_ROOT = previous; });
  process.env.REMOTEDESK_DSH_RUNTIME_ROOT = "/nonexistent/OTHER_RUNTIME";
  assert.equal((await doctor({ runtime: r })).status, "ok");
  assert.equal((await doctor()).status, "blocked");
});
test("the documented Node minimum includes the minor version", () => {
  assert.equal(supportedNodeVersion("22.15.9"), false);
  assert.equal(supportedNodeVersion("22.16.0"), true);
  assert.equal(supportedNodeVersion("24.18.0"), true);
  assert.equal(supportedNodeVersion("21.99.0"), false);
});
