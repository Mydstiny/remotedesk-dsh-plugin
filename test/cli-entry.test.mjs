import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const profiles = JSON.parse(await readFile(new URL("../compatibility.json", import.meta.url))).runtimeProfiles;
for (const profile of profiles) test(`${profile.id} CLI entry validates its native runner before executing literal arguments`, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-cli-entry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version: profile.cliVersions[0], type: "module" }));
  for (const [name, version] of Object.entries(profile.components)) {
    const p = join(root, "node_modules", name);
    await mkdir(p, { recursive: true });
    await writeFile(join(p, "package.json"), JSON.stringify({ name, version }));
  }
  await mkdir(join(root, "lib"));
  const report = 'console.log(JSON.stringify({ args: process.argv.slice(2) }));';
  await writeFile(join(root, "lib/bin.js"), profile.id === "modern-021" ?
    `export async function runCli() { ${report} }\nif (import.meta.main) await runCli();\n` : report);
  const args = ["plugin", "--profile", "literal & spaces", "add", "file:literal.tgz"];
  if (profile.requiresImportMetaMain && typeof import.meta.main !== "boolean") {
    await assert.rejects(exec(process.execPath, [fileURLToPath(new URL("../bin/native-cli-entry.mjs", import.meta.url)), root, ...args]),
      (error) => /DSH_RUNTIME_UNVERIFIED/.test(error.stderr));
    return;
  }
  const result = await exec(process.execPath, [fileURLToPath(new URL("../bin/native-cli-entry.mjs", import.meta.url)), root, ...args]);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]).args, args);
});
