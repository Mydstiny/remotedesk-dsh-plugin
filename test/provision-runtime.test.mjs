import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionRuntime } from "../bin/provision-dsh-runtime.mjs";

test("provisioning refuses an existing installation without overwriting it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-provision-guard-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), "existing user installation");
  await assert.rejects(provisionRuntime({ destination: root }), /MUST_BE_EMPTY_DIRECTORY/);
  assert.equal(await readFile(join(root, "package.json"), "utf8"), "existing user installation");
});
test("an unknown contract is rejected before creating an installation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-provision-profile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(provisionRuntime({ destination: join(root, "child"), profileId: "latest" }), /SUPPORTED_RUNTIME_PROFILE_REQUIRED/);
  assert.deepEqual(await readdir(root), []);
});
test("provisioning never follows a destination symlink", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-provision-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = join(root, "alias");
  await symlink(root, link, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(provisionRuntime({ destination: link }), /MUST_BE_EMPTY_DIRECTORY/);
  assert.deepEqual(await readdir(root), ["alias"]);
});
