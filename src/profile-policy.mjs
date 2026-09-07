import { requireThat } from '@remotedesk/bridge-core/errors';
// Root instruction hooks read through the host filesystem, outside the remote
// tool guard. Web's local presets keep their separately scoped instruction hook.
export function assertProfile(ctx, { requireLoader = false } = {}) {
  const loader = ctx.get?.('loader') ?? ctx.loader;
  requireThat(loader || !requireLoader, 'DSH_PROFILE_LOADER_REQUIRED');
  if (!loader) return;
  for (const entry of loader.entries())
    if (entry.options.name === '@deepseek-ai/dsh-agent-instructions')
      requireThat(entry.disabled, 'DSH_GLOBAL_INSTRUCTIONS_MUST_BE_DISABLED');
}
