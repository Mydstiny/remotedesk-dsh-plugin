import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/ai0-probe.mjs';

function harness() {
  const events = new Map();
  const live = new Map();
  const sessions = new Map();
  const ctx = {
    agents: { get: id => live.get(id) }, sessions: { get: id => sessions.get(id) },
    provide: (key, value) => { ctx[key] = value; },
    on: (name, listener) => events.set(name, listener),
    effect: setup => events.set('dispose', setup())
  };
  apply(ctx);
  return { ctx, live, sessions, emit: (name, ...args) => events.get(name)?.(...args) };
}
test('does not observe unselected sessions or retain content', () => {
  const h = harness(); const session = { id: 'one' }; const agent = { id: 'one', session };
  h.live.set('one', agent); h.sessions.set('one', session);
  h.emit('session/event', session, { seq: 0, data: 'SECRET_SENTINEL' });
  assert.equal(h.ctx.remotedeskProbe.status().acceptedEvents, 0);
  h.ctx.remotedeskProbe.observe(agent);
  h.emit('session/event', session, { seq: 1, data: 'SECRET_SENTINEL' });
  assert.equal(h.ctx.remotedeskProbe.status().acceptedEvents, 1);
  assert.ok(!JSON.stringify(h.ctx.remotedeskProbe.status()).includes('SECRET_SENTINEL'));
});
test('rejects stale or forged agents and sessions with reused IDs', () => {
  const h = harness(); const session = { id: 'one' }; const agent = { id: 'one', session };
  h.live.set('one', agent); h.sessions.set('one', session);
  assert.throws(() => h.ctx.remotedeskProbe.observe({ ...agent }), /EXACT_LIVE/);
  h.ctx.remotedeskProbe.observe(agent);
  h.emit('session/event', { id: 'one' }, { seq: 0 });
  h.live.set('one', { ...agent });
  h.emit('session/event', session, { seq: 1 });
  assert.equal(h.ctx.remotedeskProbe.status().acceptedEvents, 0);
});
test('revokes retained plugin handles on dispose', () => {
  const h = harness(); const api = h.ctx.remotedeskProbe;
  h.emit('dispose');
  assert.throws(() => api.status(), /PROBE_DISPOSED/);
  assert.throws(() => api.observe({ id: 'one' }), /PROBE_DISPOSED/);
});
test('releases the exact disposed agent without evicting a replacement', () => {
  const h = harness(); const session = { id: 'one' }; const first = { id: 'one', session };
  h.live.set('one', first); h.sessions.set('one', session);
  h.ctx.remotedeskProbe.observe(first);
  h.emit('agent/disposed', { agent: first });
  assert.equal(h.ctx.remotedeskProbe.status().observedAgents, 0);
  const replacement = { id: 'one', session };
  h.live.set('one', replacement);
  h.ctx.remotedeskProbe.observe(replacement);
  h.emit('agent/disposed', { agent: first });
  assert.equal(h.ctx.remotedeskProbe.status().observedAgents, 1);
});
