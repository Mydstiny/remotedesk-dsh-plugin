import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctor } from "../src/doctor.mjs";

test("checks actual resolved components and refuses version drift", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-dsh-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.1.2-rc.1" }),
  );
  const compatibility = JSON.parse(await readFile(new URL('../compatibility.json', import.meta.url)));
  for (const name of Object.keys(compatibility.components).map((name) => name.slice('@deepseek-ai/'.length))) {
    const directory = join(root, "node_modules", "@deepseek-ai", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: `@deepseek-ai/${name}`,
        version: name === "cordis" ? "4.0.2" : "0.1.2-rc.1",
      }),
    );
  }
  assert.equal((await doctor({ runtimeRoot: root })).status, "ok");
  await writeFile(
    join(root, "node_modules/@deepseek-ai/dsh-user-questions/package.json"),
    JSON.stringify({
      name: "@deepseek-ai/dsh-user-questions",
      version: "0.1.0-rc.9",
    }),
  );
  const report = await doctor({ runtimeRoot: root });
  assert.equal(report.status, "blocked");
  assert.ok(
    report.checks.some(
      (c) => c.id === "@deepseek-ai/dsh-user-questions" && c.status === "fail",
    ),
  );
  assert.equal(report.capabilities.remoteAccess, false);
});
test("does not leak local paths or metadata parser errors", async () => {
  const report = await doctor({ runtimeRoot: "/nonexistent/SECRET_SENTINEL" });
  assert.equal(report.status, "blocked");
  assert.ok(!JSON.stringify(report).includes("SECRET_SENTINEL"));
});
