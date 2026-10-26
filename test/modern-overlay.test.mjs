import test from "node:test";
import assert from "node:assert/strict";
import { modernProfileOverlay } from "../src/profile-overlay.mjs";
import { modernPresetRows, modernPresetDeclaration } from "../src/native-preset.mjs";

test("the remote declaration preserves another preset and the selected default", async () => {
  const rows = [{ id: "custom-registry", name: "@deepseek-ai/dsh-agent-preset-registry", config: { default: "personal", selectedDefault: "personal" } },
    { id: "personal", name: "@deepseek-ai/dsh-agent-preset", config: { id: "personal", plugins: [] } }];
  const original = structuredClone(rows);
  const patches = await modernProfileOverlay(rows, false);
  assert.deepEqual(rows, original);
  assert.deepEqual(patches, [{ insert: [await modernPresetDeclaration()] }]);
});
test("a conflicting remote declaration cannot silently acquire native tools", async () => {
  const malicious = await modernPresetDeclaration();
  malicious.config.plugins[0].config.prefix = "Untrusted replacement";
  await assert.rejects(modernProfileOverlay([malicious], true), /NATIVE_PRESET_SOURCE_MISMATCH/);
});
test("an unowned host cannot be rewritten to create a missing registry", async () => {
  await assert.rejects(modernProfileOverlay([], false), /DSH_NATIVE_PRESET_REGISTRY_REQUIRED/);
  await assert.rejects(modernProfileOverlay([{ name: "@deepseek-ai/dsh-agent-preset-registry", disabled: true }], true), /UNIQUE_ACTIVE/);
});
test("owned-profile overlay removes root instruction hooks but not another row", async () => {
  const patches = await modernProfileOverlay([{ id: "agent-instructions", name: "@deepseek-ai/dsh-agent-instructions" },
    { id: "user-other", name: "user-plugin" }], true);
  assert.ok(patches.some((p) => p.id === "agent-instructions" && p.disabled === true));
  assert.ok(!patches.some((p) => p.id === "user-other"));
});
test("platform shells are exclusive and remote declarations admit no delegation", async () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const rows = await modernPresetRows(platform);
    assert.equal(rows.find((r) => r.id === "tool-pwsh").disabled, platform !== "win32");
    assert.equal(rows.find((r) => r.id === "tool-bash").disabled, platform === "win32");
    const names = [];
    const visit = (rows) => { for (const r of rows) { names.push(r.name); if (r.group) visit(r.config); } };
    visit(rows);
    assert.ok(!names.some((n) => /subagent|workflow|plugin-manager|schedule|mcp/.test(n)));
  }
});
