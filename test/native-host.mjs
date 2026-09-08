import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export async function boot(root, runtime, options = {}) {
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  await mkdir(join(root, "dsh-home"), { recursive: true });
  await mkdir(join(root, "agents-home"), { recursive: true });
  process.env.DSH_HOME = join(root, "dsh-home");
  process.env.DSH_AGENTS_HOME = join(root, "agents-home");
  process.chdir(workspace);
  const require = createRequire(join(runtime, "package.json"));
  const load = async (name) =>
    import(pathToFileURL(require.resolve(name)).href);
  const presetRoots = [
    {
      path: fileURLToPath(new URL("../presets", import.meta.url)),
      trust: "system",
    },
  ];
  const { Context } = await load("@deepseek-ai/cordis");
  const { default: Loader } = await load("@deepseek-ai/cordis-plugin-loader");
  const ctx = new Context();
  await ctx.plugin(Loader, {
    baseUrl: pathToFileURL(join(runtime, "package.json")).href,
  });
  ctx.loader.builtins.group = (
    await load("@deepseek-ai/cordis-plugin-group")
  ).default;
  ctx.loader.builtins.include = (
    await load("@deepseek-ai/cordis-plugin-include")
  ).default;
  const rows = [
    ["@deepseek-ai/cordis-plugin-timer", {}],
    ["@deepseek-ai/dsh-llm", {}],
    ["@deepseek-ai/dsh-system-prompt", { persona: "" }],
    ["@deepseek-ai/dsh-session", {}],
    ["@deepseek-ai/dsh-session-projection", {}],
    ["@deepseek-ai/dsh-typert-registry", {}],
    ["@deepseek-ai/dsh-agent", {}],
    ["@deepseek-ai/dsh-tools", { mode: "native" }],
    [
      "@deepseek-ai/dsh-session-persistence-jsonl",
      { root: join(root, "sessions"), compression: "none" },
    ],
    [
      "@deepseek-ai/dsh-session-query-sqlite",
      { path: ":memory:", openAt: "never" },
    ],
    [
      "@deepseek-ai/dsh-session-title",
      { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 },
    ],
    [
      "@deepseek-ai/dsh-agent-default-model",
      { provider: "fixture", model: "fixture-a" },
    ],
    ["@deepseek-ai/dsh-user-questions", {}],
    ["@deepseek-ai/dsh-user-approval", { policy: "ask" }],
    ["@deepseek-ai/dsh-subprocess-local", {}],
    ["@deepseek-ai/dsh-sandbox-local", {}],
    [
      "@deepseek-ai/dsh-sandbox-policy",
      { mode: "workspace-write", workspaceRoot: workspace },
    ],
    [
      process.platform === "win32"
        ? "@deepseek-ai/dsh-pwsh-sandbox"
        : "@deepseek-ai/dsh-bash-sandbox",
      { timeoutMs: 60000 },
    ],
    ["@deepseek-ai/dsh-shell-env", {}],
    ["@deepseek-ai/dsh-fs-sandbox", { cwd: workspace }],
    ["@deepseek-ai/dsh-fs-observation-policy", {}],
    ["@deepseek-ai/dsh-jobs-local", {}],
    ["@deepseek-ai/dsh-skill", {}],
    ["@deepseek-ai/dsh-commands", {}],
    ["@deepseek-ai/dsh-goal", {}],
    ["@deepseek-ai/dsh-token-meter", {}],
    ["@deepseek-ai/dsh-subagent", {}],
    ["@deepseek-ai/dsh-subagent-spawn-in-process", { providerName: "spawn" }],
    ["@deepseek-ai/dsh-subagent-fork-in-process", { providerName: "fork" }],
    [
      "@deepseek-ai/dsh-tool-subagent/model-selection-settings",
      { enabled: false, allowedModels: [] },
    ],
    ["@deepseek-ai/dsh-web", {}],
    [
      "@deepseek-ai/dsh-agent-presets",
      {
        default: "standard",
        roots: presetRoots,
        includeShippedRoot: true,
        includeUserRoot: false,
      },
    ],
    ["@deepseek-ai/dsh-agent-loop", { agents: [] }],
  ];
  try {
    for (const [name, config] of rows)
      await ctx.loader.create({ name, config });
    await ctx.loader.await();
    const inactive = [...ctx.loader.entries()]
      .filter((e) => !e.disabled && e.fiber === undefined)
      .map((e) => ({ name: e.options.name }));
    return { ctx, workspace, load, rows, inactive };
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}
