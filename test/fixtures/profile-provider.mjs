import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
export const name = 'remotedesk-profile-fixture';
export const inject = ['llm'];
class Fixture extends LlmAdapter {
  providerInfo(id) {
    return { id, name: 'RemoteDesk local test provider' };
  }
  async listModels() {
    return [{ id: 'fixture', name: 'RemoteDesk fixture', inputModalities: ['text', 'image'] }];
  }
  async resolveModel(provider, model) {
    return { provider, id: model, name: 'RemoteDesk fixture', inputModalities: ['text', 'image'] };
  }
  async *stream(options) {
    await appendFile(
      join(process.env.REMOTEDESK_PROFILE_TEST_ROOT, 'observations.jsonl'),
      JSON.stringify({
        remote: options.tools?.some((t) => t.name === 'remotedesk_workspace_exec') ?? false,
        tools: options.tools?.map((t) => t.name) ?? [],
        canary: JSON.stringify(options.messages).includes('REMOTEDESK_OUTSIDE_INSTRUCTION_CANARY'),
      }) + '\n',
    );
    const text = 'DSH_PROFILE_FIXTURE_OK';
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}
export function apply(ctx) {
  ctx.llm.registerAdapter(['remotedesk-fixture'], new Fixture());
}
