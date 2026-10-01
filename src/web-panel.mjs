/**
 * Authenticated Web settings surface for the DSH host plugin.
 *
 * Every route here is an exact Fetch contribution under the Connection plugin's
 * `/api` prefix. That prefix applies the deployment's Host/Origin fence and the
 * signed browser-session cookie *before* dispatch, so these routes inherit the
 * same trust boundary as the built-in GUI and this module owns no authentication
 * of its own. One policy instead of two is deliberate: a plugin-owned scheme
 * could drift from the host's, and the pairing codes below are exactly the kind
 * of value that must not become readable by an unauthenticated caller.
 *
 * The routes are registered through `ctx.inject(['connection'], ...)` rather
 * than through the plugin's static `inject` list, so a deployment without a Web
 * surface (the native remote profile) still loads the bridge unchanged.
 */
import { configuration, addProject, invite, revoke, status } from "@remotedesk/bridge-core/admin";
import { Store } from "@remotedesk/bridge-core/store";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  controlPanelState,
  deviceSummaries,
  ensureControlPanel,
  serviceState,
  stopControlPanel,
} from "./control-panel.mjs";

const MAX_BODY_BYTES = 100 * 1024;

/**
 * State directory of a management-only deployment: the conventional path the
 * `panel` command documents, used when no explicit state is configured so a Web
 * surface can administer a bridge that another process owns.
 * @returns absolute default state directory.
 */
export function defaultStateDirectory() {
  return join(homedir(), ".remotedesk", "dsh");
}

/** Exact Fetch routes this plugin owns, all under the authenticated `/api` prefix. */
export const WEB_ROUTES = {
  status: "/api/remotedesk.status",
  invite: "/api/remotedesk.invite",
  revoke: "/api/remotedesk.revoke",
  project: "/api/remotedesk.project",
  panel: "/api/remotedesk.panel",
};

function jsonResponse(value, statusCode = 200) {
  return new Response(JSON.stringify(value), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Map a thrown error to an opaque code, never echoing messages or paths.
 * @param error - thrown value from a bridge-core operation.
 * @param statusCode - HTTP status to answer with.
 * @returns JSON response carrying a stable code.
 */
function failureResponse(error, statusCode = 400) {
  const candidate = error && typeof error === "object" ? error.code || error.message : undefined;
  const code =
    typeof candidate === "string" && /^[A-Z][A-Z0-9_]{1,80}$/.test(candidate)
      ? candidate
      : "REQUEST_FAILED";
  return jsonResponse({ error: code }, statusCode);
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw Object.assign(new Error("REQUEST_TOO_LARGE"), { code: "REQUEST_TOO_LARGE" });
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES)
    throw Object.assign(new Error("REQUEST_TOO_LARGE"), { code: "REQUEST_TOO_LARGE" });
  if (text.trim() === "") return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw Object.assign(new Error("JSON_INVALID"), { code: "JSON_INVALID" });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Object.assign(new Error("JSON_OBJECT_REQUIRED"), { code: "JSON_OBJECT_REQUIRED" });
  return parsed;
}

/**
 * Project the single outstanding pairing invite without its code.
 *
 * The invitation row is keyed by `digest(code)`, so the code itself is not
 * recoverable from disk — only the invitation that was just created in this
 * process can be shown, which is also why the settings page fetches it at
 * generation time instead of reading it back from status.
 *
 * @param state - plugin state directory.
 * @returns expiry metadata for the live invite, or null.
 */
export async function outstandingInvite(state) {
  const store = new Store(state);
  try {
    const now = Date.now();
    const row = store
      .all("invite")
      .find((entry) => Number.isSafeInteger(entry.expires) && entry.expires > now);
    if (row === undefined) return null;
    return {
      expires: row.expires,
      role: row.role || "operator",
      projects: Array.isArray(row.projects) ? row.projects : [],
    };
  } finally {
    store.close();
  }
}

/**
 * Compose the settings-page snapshot: the control panel's own read model plus
 * the panel lifecycle facts and the live invitation, none of which carry a
 * secret.
 * @param state - plugin state directory.
 * @param engine - engine this deployment serves (`dsh` or `codex`).
 * @returns JSON-safe snapshot for the Web settings page.
 */
export async function webSnapshot(state, engine) {
  let config;
  try {
    config = await configuration(state);
  } catch (error) {
    // A Web surface can be mounted before the host service has ever run. Report
    // an unconfigured deployment rather than failing the whole settings page;
    // any other read failure still propagates.
    if (error?.code !== "ENOENT") throw error;
    return {
      engine,
      configured: false,
      service: null,
      projects: [],
      devices: [],
      invite: null,
      panel: controlPanelState(),
      sessions: 0,
      operations: 0,
    };
  }
  const current = status(state);
  return {
    engine,
    configured: true,
    service: {
      host: config.host,
      port: config.port,
      ...(await serviceState(state)),
    },
    projects: (config.projects || []).map((project) => ({
      id: project.id,
      path: project.path,
      title: project.title || project.id,
      provider: project.provider || "",
      model: project.model || "",
      vision: project.vision === true,
    })),
    devices: await deviceSummaries(state),
    invite: await outstandingInvite(state),
    panel: controlPanelState(),
    sessions: current.sessions,
    operations: current.operations,
  };
}

/**
 * Build the exact Fetch routes for one state directory.
 *
 * Every route declares `requestBody: 'buffered'`. The Connection plugin reads
 * that field to decide how it hands the socket to the route: without it, a
 * newer runtime takes the streaming path and builds a Request carrying a body
 * stream, which throws for a body-less method — the Web server then answers its
 * generic empty 400. Runtimes that predate the field ignore it and always
 * buffer, so declaring it is correct on both.
 *
 * @param state - plugin state directory.
 * @param engine - engine this deployment serves.
 * @returns route contributions accepted by `ctx.connection.fetch.register`.
 */
export function webRoutes(state, engine) {
  const guard = (handler) => async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      return failureResponse(error, 400);
    }
  };
  return [
    {
      path: WEB_ROUTES.status,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: guard(async () => jsonResponse(await webSnapshot(state, engine))),
    },
    {
      path: WEB_ROUTES.invite,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: guard(async (request) => {
        const input = await readJson(request);
        if (!Array.isArray(input.projects) || input.projects.length === 0)
          return failureResponse({ code: "PROJECTS_REQUIRED" });
        const role = input.role === undefined ? "operator" : input.role;
        if (!["viewer", "operator"].includes(role)) return failureResponse({ code: "ROLE_INVALID" });
        return jsonResponse({ invite: await invite(state, { projects: input.projects, role }) });
      }),
    },
    {
      path: WEB_ROUTES.revoke,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: guard(async (request) => {
        const input = await readJson(request);
        if (typeof input.device !== "string" || input.device === "")
          return failureResponse({ code: "DEVICE_REQUIRED" });
        return jsonResponse({ result: revoke(state, input.device) });
      }),
    },
    {
      path: WEB_ROUTES.project,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: guard(async (request) => {
        const input = await readJson(request);
        if (typeof input.id !== "string" || typeof input.path !== "string")
          return failureResponse({ code: "PROJECT_ARGUMENTS_REQUIRED" });
        const project = { id: input.id, path: input.path };
        for (const key of ["title", "provider", "model"])
          if (input[key] !== undefined) project[key] = input[key];
        if (input.vision !== undefined) {
          if (typeof input.vision !== "boolean") return failureResponse({ code: "VISION_VALUE_INVALID" });
          project.vision = input.vision;
        }
        return jsonResponse({ project: await addProject(state, project) });
      }),
    },
    {
      path: WEB_ROUTES.panel,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: guard(async () => jsonResponse(await ensureControlPanel(state, { engine }))),
    },
  ];
}

/**
 * Contribute the settings routes once a Web surface with Connection exists.
 * @param ctx - plugin context.
 * @param options - state directory and engine.
 */
export function registerWebPanel(ctx, { state, engine = "dsh" }) {
  ctx.inject(["connection"], (connectionCtx) => {
    // Fail closed on an unexpected Connection face: contributing routes that the
    // host would not authenticate is exactly the outcome to avoid, so an absent
    // registry surface skips the section instead of registering an open one.
    const register = connectionCtx.connection?.fetch?.register;
    if (typeof register !== "function") {
      console.log(
        JSON.stringify({
          ready: false,
          surface: "remotedesk-web",
          reason: "CONNECTION_FETCH_REGISTRY_UNAVAILABLE",
        }),
      );
      return;
    }
    for (const route of webRoutes(state, engine))
      connectionCtx.effect(
        () => connectionCtx.connection.fetch.register(route),
        `remotedesk-web: ${route.path}`,
      );
    connectionCtx.effect(() => () => stopControlPanel(), "remotedesk-web: control panel");
  });
}
