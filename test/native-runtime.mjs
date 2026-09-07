// Run explicitly against a doctor-accepted local DSH installation; no model,
// profile, network listener, or real session data is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { doctor, locateRuntime } from '../src/doctor.mjs';
import * as plugin from '../src/index.mjs';

const root = process.argv[2] ?? await locateRuntime();
assert.equal((await doctor({ runtimeRoot: root })).status, 'ok', 'Unverified runtime');
const require = createRequire(join(root, 'package.json'));
const load = name => import(pathToFileURL(require.resolve(name)).href);
const { Context } = await load('@deepseek-ai/cordis');
const { default: SessionStore } = await load('@deepseek-ai/dsh-session');
const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent');
const { default: UserQuestions } = await load('@deepseek-ai/dsh-user-questions');
const { default: ApprovalService } = await load('@deepseek-ai/dsh-user-approval');
const ctx = new Context();
try {
  await ctx.plugin(SessionStore);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(UserQuestions);
  await ctx.plugin(ApprovalService, { policy: 'ask' });
  const originalProvider = ctx.userQuestions.registerProvider({ ask: async () => ({ answers: [] }) });
  const fiber = await ctx.plugin(plugin);
  const api = ctx.remotedeskProbe;
  assert.equal(api.status().remoteAccess, false);
  const session = ctx.sessions.create('remotedesk-ai0-fixture');
  // A deterministic fixture in the real registry/store. No model loop is claimed.
  const agent = { id: session.id, session, ctx, options: {} };
  const unregister = ctx.agents.register(agent);
  api.observe(agent);
  session.append('turn/start', {});
  assert.equal(api.status().acceptedEvents, 1);
  assert.equal(await ctx.approval.request({ agent, toolName: 'fixture' }), 'unavailable');
  const deny = ctx.on('approval/request', async () => 'rejected');
  assert.equal(await ctx.approval.request({ agent, toolName: 'fixture' }), 'rejected');
  deny();
  let lateAnswer;
  const controller = new AbortController();
  const pendingAnswerer = ctx.on('approval/request', async () => new Promise(resolve => { lateAnswer = resolve; }));
  const decision = ctx.approval.request({ agent, toolName: 'fixture', signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert.equal(await decision, 'cancelled');
  lateAnswer('allowed-once');
  pendingAnswerer();
  assert.deepEqual(session.events.filter(e => e.type === 'approval/decided').map(e => e.data.outcome),
    ['unavailable', 'rejected', 'cancelled']);
  assert.deepEqual(await ctx.userQuestions.ask({ questions: [{ id: 'probe', question: 'AI0 fixture?', options: [] }] }), { answers: [] });
  await unregister();
  assert.equal(api.status().observedAgents, 0);
  assert.throws(() => api.observe(agent), /EXACT_LIVE/);
  const replacement = { ...agent };
  const unregisterReplacement = ctx.agents.register(replacement);
  api.observe(replacement);
  assert.equal(api.status().observedAgents, 1);
  await fiber.dispose();
  assert.throws(() => api.status(), /PROBE_DISPOSED/);
  session.append('turn/end', {});
  await unregisterReplacement();
  originalProvider();
  console.log('PASS native Cordis load, real registry/session event, approval fail-closed/deny/abort/late-answer audit, existing question provider, unload fencing (fixture; no model loop)');
} finally { await ctx.fiber.dispose(); }
