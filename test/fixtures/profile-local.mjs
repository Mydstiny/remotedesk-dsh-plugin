import { writeFile } from "node:fs/promises";
import { join } from "node:path";
export const name = "remotedesk-local-preset-fixture";
export const inject = ["agents", "sessions", "agentPresets"];
export function apply(ctx) {
  ctx.effect(() => {
    let handle;
    const run = (async () => {
      handle = await ctx.agents.create({
        sessionId: "local-preset-fixture",
        meta: {
          cwd: join(process.env.REMOTEDESK_PROFILE_TEST_ROOT, "project"),
        },
        agentOptions: { provider: "remotedesk-fixture", model: "fixture" },
        setup: async (agentCtx) => {
          await ctx.agentPresets.mount(agentCtx, "standard");
        },
      });
      handle.agent.followup({
        id: "local-preset-message",
        role: "user",
        source: { kind: "user" },
        content: [{ type: "text", text: "Reply with the test marker." }],
      });
      await handle.agent.whenIdle();
      await ctx.sessions.flush(handle.agent.session);
      await writeFile(
        join(process.env.REMOTEDESK_PROFILE_TEST_ROOT, "local-result.json"),
        JSON.stringify({ status: handle.agent.status }),
      );
    })();
    void run.catch(() =>
      writeFile(
        join(process.env.REMOTEDESK_PROFILE_TEST_ROOT, "local-result.json"),
        '{"failed":true}',
      ),
    );
    return async () => {
      await run.catch(() => {});
      await handle?.dispose();
    };
  });
}
