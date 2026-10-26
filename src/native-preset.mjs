import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { requireThat } from "@remotedesk/bridge-core/errors";

export async function modernPresetRows(platform = process.platform) {
  const rows = JSON.parse(await readFile(new URL("../presets/modern-native.json", import.meta.url), "utf8"));
  for (const row of rows) {
    if (row.id === "tool-bash") row.disabled = platform === "win32";
    if (row.id === "tool-pwsh") row.disabled = platform !== "win32";
  }
  return rows;
}

export async function modernPresetDeclaration() {
  return { id: "remotedesk-native-definition", name: "@deepseek-ai/dsh-agent-preset",
    config: { id: "remotedesk-native", name: "RemoteDesk Native", plugins: await modernPresetRows() } };
}

// Desktop already owns its registry/default. Register only this declaration,
// and release exactly it when this plugin scope unloads.
export async function ensureModernPreset(ctx, runtime) {
  const declaration = await modernPresetDeclaration();
  const rows = [...ctx.loader.entries()].map((e) => e.options).filter((r) =>
    r.id === declaration.id || (r.name === declaration.name && r.config?.id === declaration.config.id));
  if (rows.length) {
    requireThat(rows.length === 1 && rows[0].name === declaration.name &&
      isDeepStrictEqual(rows[0].config, declaration.config), "NATIVE_PRESET_SOURCE_MISMATCH");
    return;
  }
  let release;
  try {
    const registration = ctx.extend({ baseUrl: pathToFileURL(runtime.anchor).href });
    release = await registration.agentPresets.register(declaration.config);
  }
  catch { throw new Error("NATIVE_PRESET_SOURCE_MISMATCH"); }
  ctx.effect(() => release, "RemoteDesk native preset declaration");
}

async function validateModernDeclaration(registry, runtime, preset) {
  const doc = await registry.readDocument(preset);
  const yaml = await runtime.load("js-yaml");
  const actual = (yaml.default ?? yaml).load(doc.content);
  requireThat(isDeepStrictEqual(actual, await modernPresetRows()), "NATIVE_PRESET_SOURCE_MISMATCH");
}

export async function mountModernPreset(agentCtx, registry, runtime, preset) {
  requireThat(preset === "remotedesk-native", "NATIVE_PRESET_SOURCE_MISMATCH");
  await validateModernDeclaration(registry, runtime, preset);
  await registry.mount(agentCtx, preset);
  await validateModernDeclaration(registry, runtime, preset);
  const inspection = registry.inspectCompositions(agentCtx);
  requireThat(inspection.length === 1 && inspection[0].id === preset &&
    inspection[0].leakedServices.length === 0, "NATIVE_PRESET_MOUNT_REQUIRED");
  const names = new Set();
  const collect = (rows) => { for (const row of rows) {
    if (row.disabled === true) continue;
    if (row.group === true) collect(row.config);
    else names.add(row.name);
  } };
  collect(await modernPresetRows());
  const seen = new Set();
  for (const module of inspection[0].modules) {
    if (module.moduleName === "cordis:group") continue;
    requireThat(names.has(module.moduleName), "NATIVE_PRESET_MODULE_DENIED");
    const name = module.moduleName.split("/").slice(0, 2).join("/");
    requireThat(runtime.versions[name] === runtime.profile.components[name], "NATIVE_PRESET_MODULE_UNVERIFIED");
    // The registry declares whether application-base or configuration-base
    // resolution was used. Prove it agrees with the verified installation.
    const expected = await realpath(runtime.resolve(module.moduleName));
    requireThat(typeof module.baseUrl === "string" && module.baseUrl.startsWith("file:"),
      "NATIVE_PRESET_MODULE_SOURCE_MISMATCH");
    const resolved = await realpath(createRequire(module.baseUrl).resolve(module.moduleName));
    requireThat(resolved === expected, "NATIVE_PRESET_MODULE_SOURCE_MISMATCH");
    seen.add(module.moduleName);
  }
  requireThat([...names].every((name) => seen.has(name)), "NATIVE_PRESET_MODULES_REQUIRED");
  const { scopeOf, scopeParentOf } = await runtime.load("@deepseek-ai/dsh-scope");
  const key = scopeParentOf(scopeOf(agentCtx));
  requireThat(key && registry.composedPreset(agentCtx) === preset, "NATIVE_PRESET_MOUNT_REQUIRED");
  return { key };
}
