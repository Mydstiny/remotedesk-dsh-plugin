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
  await assert.rejects(provisionRuntime({ destination: root, profileId: "legacy-012" }), /MUST_BE_EMPTY_DIRECTORY/);
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
  await assert.rejects(provisionRuntime({ destination: link, profileId: "legacy-012" }), /MUST_BE_EMPTY_DIRECTORY/);
  assert.deepEqual(await readdir(root), ["alias"]);
});

test("modern provisioning checks runner support before any destination write", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-provision-node-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (typeof import.meta.main !== "boolean") {
    await assert.rejects(provisionRuntime({ destination: join(root, "modern"), profileId: "modern-021" }), /NODE_RUNTIME_PROFILE_UNSUPPORTED/);
    assert.deepEqual(await readdir(root), []);
  } else {
    await assert.rejects(provisionRuntime({ profileId: "modern-021" }), /RUNTIME_DESTINATION_REQUIRED/);
  }
});
