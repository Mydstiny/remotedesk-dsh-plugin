export const name = "remotedesk-ai0-probe";
export const inject = ["agents", "sessions"];

// Native Cordis plugin: no listener, model calls, provider replacement, or
// remote controls. Observe only explicitly selected, exact live Agent objects.
export function apply(ctx) {
  let disposed = false;
  const selected = new Map();
  let acceptedEvents = 0;
  const isLive = (agent) =>
    !disposed &&
    ctx.agents.get(agent.id) === agent &&
    ctx.sessions.get(agent.id) === agent.session;
  const assertActive = () => {
    if (disposed) throw new Error("PROBE_DISPOSED");
  };
  const api = Object.freeze({
    observe(agent) {
      assertActive();
      if (!agent || !isLive(agent))
        throw new Error("AGENT_NOT_EXACT_LIVE_INSTANCE");
      selected.set(agent.id, agent);
      return () => {
        if (selected.get(agent.id) === agent) selected.delete(agent.id);
      };
    },
    status() {
      assertActive();
      return {
        stage: "AI0",
        remoteAccess: false,
        acceptedEvents,
        observedAgents: selected.size,
        userQuestions: "untouched",
        contentRetained: false,
      };
    },
  });
  ctx.provide("remotedeskProbe", api);
  ctx.on("session/event", (session, event) => {
    const agent = selected.get(session.id);
    if (
      agent &&
      isLive(agent) &&
      agent.session === session &&
      Number.isSafeInteger(event.seq)
    )
      acceptedEvents++;
  });
  ctx.on("agent/disposed", ({ agent }) => {
    if (selected.get(agent.id) === agent) selected.delete(agent.id);
  });
  ctx.effect(() => () => {
    disposed = true;
    selected.clear();
    acceptedEvents = 0;
  });
}
