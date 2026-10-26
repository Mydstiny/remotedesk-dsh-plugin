import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveRuntime } from "./doctor.mjs";
import { modernPresetDeclaration } from "./native-preset.mjs";
import { isDeepStrictEqual } from "node:util";

// Pure file reads and official patch composition. Does not call loadProfile,
// prepareProfile, --dump-config, healing, initialization, or live roster APIs.
async function readProfileRows({
  runtime,
  profilePath,
  dshHome,
  overlays = [],
}) {
  const anchor = join(runtime, "package.json");
  const require = createRequire(anchor);
  const api = await import(
    pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href
  );
  const label = "remotedesk-overlay";
  const manifest = api.readProfileManifest(label, profilePath);
  const bundles = manifest.dsh?.profile?.bundles;
  if (
    !Array.isArray(bundles) ||
    bundles.some((name) => typeof name !== "string")
  )
    throw new Error("PROFILE_BUNDLES_INVALID");
  const layers = [];
  for (const name of bundles) {
    const directory = api.resolveBundleDir(label, name, anchor, profilePath);
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    );
    const patchFiles = manifest.dsh?.bundle?.patch;
    const files = typeof patchFiles === "string" ? [patchFiles] : patchFiles;
    if (!Array.isArray(files) || !files.length || files.some((file) => typeof file !== "string"))
      throw new Error("PROFILE_BUNDLE_PATCH_REQUIRED");
    for (const file of files)
      layers.push(api.loadOverlayPatches(label, join(directory, file)));
  }
  layers.push(
    api.loadOptionalPatches(
      label,
      join(profilePath, api.PROFILE_PATCH_FILENAME),
    ) ?? [],
  );
  // The home layer comes AFTER the profile layer, just like the native launcher.
  layers.push(
    api.loadOptionalPatches(label, join(dshHome, api.PROFILE_PATCH_FILENAME)) ??
      [],
  );
  for (const file of overlays) layers.push(api.loadOverlayPatches(label, file));
  const rows = api.composeEntries(layers);
  return rows;
}
function presetConfig(rows, allowMissing = false) {
  const matches = [];
  const visit = (rows) => {
    for (const row of rows) {
      if (row.id === "agent-presets") matches.push(row);
      if (row.group === true && Array.isArray(row.config)) visit(row.config);
    }
  };
  visit(rows);
  if (allowMissing && matches.length === 0) return undefined;
  if (
    matches.length !== 1 ||
    matches[0].name !== "@deepseek-ai/dsh-agent-presets" ||
    matches[0].disabled === true
  )
    throw new Error("UNIQUE_ACTIVE_AGENT_PRESETS_ROW_REQUIRED");
  const config = matches[0].config;
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("AGENT_PRESETS_CONFIG_REQUIRED");
  return structuredClone(config);
}
export async function readEffectivePresetConfig(args) {
  return presetConfig(await readProfileRows(args));
}

export async function readNativeProfileOverlay(args, presetRoot, ownedProfile) {
  const rows = await readProfileRows(args);
  const runtime = await resolveRuntime({ runtimeRoot: args.runtime });
  if (runtime.profile.id === "modern-021")
    return modernProfileOverlay(rows, ownedProfile);
  const config = presetConfig(rows, ownedProfile);
  // Same host/agent-plane split as the pinned official web composition, without
  // installing a web server. Applied only to our dedicated profile invocation.
  const agentPlane = [
    "tool-bash",
    "tool-pwsh",
    "tool-jobs",
    "tool-fs",
    "tool-fs-search",
    "tool-str-replace-editor",
    "skill-filesystem",
    "tool-skill",
    "command-goal",
    "tool-goal",
    "plan-mode",
    "compaction-basic",
    "command-compact",
    "tool-result-pruner",
    "tool-subagent-control",
    "tool-subagent-list-agents",
    "tool-subagent",
    "tool-subagent-fork",
    "workflow-worker-thread",
    "tool-workflow",
    "tool-ralph",
    "agent-instructions",
    "tool-todo",
    "tool-web",
  ];
  const ids = new Set();
  const collect = (list) => {
    for (const row of list) {
      ids.add(row.id);
      if (row.group === true && Array.isArray(row.config)) collect(row.config);
    }
  };
  collect(rows);
  const patches = ownedProfile
    ? agentPlane
        .filter((id) => ids.has(id))
        .map((id) => ({ id, disabled: true }))
    : [];
  if (config) patches.push(...nativePresetOverlay(config, presetRoot));
  else
    patches.push({
      insert: [
        {
          id: "agent-presets",
          name: "@deepseek-ai/dsh-agent-presets",
          config: {
            default: "standard",
            roots: [{ path: presetRoot, trust: "system" }],
            includeShippedRoot: true,
            includeUserRoot: true,
          },
        },
      ],
    });
  if (ownedProfile && !ids.has("subagent-model-selection-settings"))
    patches.push({
      insert: [
        {
          id: "subagent-model-selection-settings",
          name: "@deepseek-ai/dsh-tool-subagent/model-selection-settings",
          config: { enabled: false, allowedModels: [] },
        },
      ],
    });
  return patches;
}

export function nativePresetOverlay(config, presetRoot) {
  // Preserve every other config field, including default and include* choices.
  // A dynamic !!js roots expression needs an explicitly supported composition;
  // refusing it is safer than silently replacing that user's expression.
  if (config.roots !== undefined && !Array.isArray(config.roots))
    throw new Error("DYNAMIC_PRESET_ROOTS_REQUIRE_EXPLICIT_SUPPORT");
  const roots = [...(config.roots ?? [])];
  if (!roots.some((root) => root.path === presetRoot))
    roots.push({ path: presetRoot, trust: "system" });
  return [
    {
      id: "agent-presets",
      name: "@deepseek-ai/dsh-agent-presets",
      config: { ...config, roots },
    },
  ];
}

export async function modernProfileOverlay(rows, ownedProfile) {
  const all = [];
  const visit = (list) => { for (const row of list) {
    all.push(row);
    if (row.group === true && Array.isArray(row.config)) visit(row.config);
  } };
  visit(rows);
  const registries = all.filter((r) => r.name === "@deepseek-ai/dsh-agent-preset-registry");
  if (registries.length > 1 || registries.some((r) => r.disabled === true))
    throw new Error("UNIQUE_ACTIVE_AGENT_PRESETS_ROW_REQUIRED");
  if (!registries.length && !ownedProfile) throw new Error("DSH_NATIVE_PRESET_REGISTRY_REQUIRED");
  const definition = await modernPresetDeclaration();
  const collisions = all.filter((r) => r.id === definition.id ||
    (r.name === definition.name && r.config?.id === definition.config.id));
  if (collisions.length && (collisions.length !== 1 || !isDeepStrictEqual(collisions[0], definition)))
    throw new Error("NATIVE_PRESET_SOURCE_MISMATCH");
  const patches = [];
  if (ownedProfile) {
    const agentPlane = new Set(["tool-bash", "tool-pwsh", "tool-jobs", "tool-fs", "tool-fs-search",
      "tool-str-replace-editor", "skill-filesystem", "tool-skill", "command-goal", "tool-goal",
      "plan-mode", "compaction-basic", "command-compact", "tool-result-pruner", "tool-subagent-control",
      "tool-subagent-list-agents", "tool-subagent", "tool-subagent-fork", "workflow-worker-thread",
      "workflow-ptc", "tool-workflow", "tool-ralph", "agent-instructions", "tool-todo", "tool-web"]);
    for (const row of all) if (agentPlane.has(row.id)) patches.push({ id: row.id, disabled: true });
  }
  const insert = [];
  if (!registries.length) insert.push({ id: "agent-preset-registry", name: "@deepseek-ai/dsh-agent-preset-registry",
    config: { default: "remotedesk-native" } });
  if (!collisions.length) insert.push(definition);
  if (insert.length) patches.push({ insert });
  return patches;
}
