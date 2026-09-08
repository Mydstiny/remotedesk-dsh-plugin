import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LlmAdapter } from "@deepseek-ai/dsh-llm";
export const name = "remotedesk-profile-fixture";
export const inject = ["llm"];
class Fixture extends LlmAdapter {
  providerInfo(id) {
    return { id, name: "RemoteDesk local test provider" };
  }
  async listModels() {
    return [
      {
        id: "fixture",
        name: "RemoteDesk fixture",
        inputModalities: ["text", "image"],
      },
    ];
  }
  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: "RemoteDesk fixture",
      inputModalities: ["text", "image"],
    };
  }
  async *stream(options) {
    await appendFile(
      join(process.env.REMOTEDESK_PROFILE_TEST_ROOT, "observations.jsonl"),
      JSON.stringify({
        remote:
          options.tools?.some((t) => t.name === "read") &&
          !options.tools?.some((t) => t.name === "subagent_fork"),
        tools: options.tools?.map((t) => t.name) ?? [],
        canary: JSON.stringify(options.messages).includes(
          "REMOTEDESK_OUTSIDE_INSTRUCTION_CANARY",
        ),
      }) + "\n",
    );
    if (JSON.stringify(options.messages).includes("DSH_PROFILE_STOP_ACTIVE")) {
      await writeFile(
        join(process.env.REMOTEDESK_PROFILE_TEST_ROOT, "active-entered"),
        "ready",
      );
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: "DSH_ACTIVE_PARTIAL" };
      if (!options.signal.aborted)
        await new Promise((r) =>
          options.signal.addEventListener("abort", r, { once: true }),
        );
      return;
    }
    const text = "DSH_PROFILE_FIXTURE_OK";
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text };
    yield { type: "block-end", index: 0, block: { type: "text", text } };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}
export function apply(ctx) {
  ctx.llm.registerAdapter(["remotedesk-fixture"], new Fixture());
}
