import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init, addProject } from "@remotedesk/bridge-core/admin";
import { stopControlPanel } from "../src/control-panel.mjs";
import { WEB_ROUTES, webRoutes, webSnapshot } from "../src/web-panel.mjs";

// Mirrors the Connection plugin's exact-Fetch-route validation so a typo in a
// path or method fails here instead of at plugin registration.
const SEGMENT = /^[A-Za-z0-9_$.-]+$/;

function assertRegistrable(routes) {
  for (const route of routes) {
    assert.equal(typeof route.fetch, "function", route.path);
    // The Connection plugin picks the request-body mode from this field. A route
    // that omits it takes the streaming path on newer runtimes, where building a
    // body stream for a body-less method throws and the Web server answers its
    // generic empty 400 instead of ever reaching the handler.
    assert.equal(route.requestBody, "buffered", route.path);
    assert.equal(route.path.startsWith("/api/"), true, route.path);
    const endpoint = route.path.slice("/api/".length);
    for (const segment of endpoint.split("/"))
      assert.equal(
        segment !== "" && segment !== "." && segment !== ".." && SEGMENT.test(segment),
        true,
        `${route.path} segment ${segment}`,
      );
    assert.equal(route.methods.length > 0, true, route.path);
    assert.equal(new Set(route.methods).size, route.methods.length, route.path);
  }
}

test("web panel routes are registrable exact Fetch contributions under /api", () => {
  const routes = webRoutes("/tmp/state", "dsh");
  assert.equal(routes.length, 5);
  assertRegistrable(routes);
  assert.deepEqual(
    routes.map((route) => [route.path, route.methods]),
    [
      [WEB_ROUTES.status, ["GET"]],
      [WEB_ROUTES.invite, ["POST"]],
      [WEB_ROUTES.revoke, ["POST"]],
      [WEB_ROUTES.project, ["POST"]],
      [WEB_ROUTES.panel, ["POST"]],
    ],
  );
});

test("web panel serves state, mints a pairing invite, and never echoes secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "remotedesk-dsh-web-"));
  const state = join(root, "state");
  const projectPath = join(root, "project");
  await mkdir(projectPath);
  try {
    await init(state, { engine: "dsh", port: 9443 });
    await addProject(state, { id: "demo", path: projectPath, title: "Demo" });
    const routes = new Map(webRoutes(state, "dsh").map((route) => [route.path, route]));
    const call = (path, init_) =>
      routes.get(path).fetch(new Request("http://127.0.0.1" + path, init_));

    const status = await call(WEB_ROUTES.status);
    assert.equal(status.status, 200);
    const snapshot = await status.json();
    assert.equal(snapshot.engine, "dsh");
    assert.equal(snapshot.projects[0].id, "demo");
    assert.deepEqual(snapshot.devices, []);
    assert.equal(snapshot.invite, null);
    assert.deepEqual(snapshot.panel, { running: false, port: null });

    const created = await call(WEB_ROUTES.invite, {
      method: "POST",
      body: JSON.stringify({ projects: ["demo"], role: "viewer" }),
    });
    assert.equal(created.status, 200);
    const invite = (await created.json()).invite;
    assert.equal(typeof invite.code, "string");
    assert.equal(invite.code.length > 20, true);
    assert.equal(invite.expires > Date.now(), true);

    // The invitation row is keyed by digest(code): status may report the live
    // invitation, but the code itself is only ever returned at creation.
    const after = await (await call(WEB_ROUTES.status)).json();
    assert.deepEqual(Object.keys(after.invite).sort(), ["expires", "projects", "role"]);
    assert.equal(JSON.stringify(await webSnapshot(state, "dsh")).includes(invite.code), false);
    assert.equal(after.invite.projects[0], "demo");

    const badRole = await call(WEB_ROUTES.invite, {
      method: "POST",
      body: JSON.stringify({ projects: ["demo"], role: "owner" }),
    });
    assert.equal(badRole.status, 400);
    assert.deepEqual(await badRole.json(), { error: "ROLE_INVALID" });

    const missingDevice = await call(WEB_ROUTES.revoke, {
      method: "POST",
      body: JSON.stringify({ device: "absent" }),
    });
    assert.equal(missingDevice.status, 400);
    assert.deepEqual(await missingDevice.json(), { error: "DEVICE_NOT_FOUND" });

    const badProject = await call(WEB_ROUTES.project, {
      method: "POST",
      body: JSON.stringify({ id: "bad", path: "/path/that/does/not/exist" }),
    });
    assert.equal(badProject.status, 400);
    assert.equal((await badProject.text()).includes("/path/that/does"), false);

    const malformed = await call(WEB_ROUTES.revoke, { method: "POST", body: "[" });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "JSON_INVALID" });

    const panel = await call(WEB_ROUTES.panel, { method: "POST" });
    assert.equal(panel.status, 200);
    const opened = await panel.json();
    assert.equal(opened.url.startsWith("http://127.0.0.1:"), true);
    assert.equal(opened.reused, false);
    const again = await (await call(WEB_ROUTES.panel, { method: "POST" })).json();
    assert.equal(again.reused, true);
    assert.equal(again.port, opened.port);
    assert.deepEqual((await (await call(WEB_ROUTES.status)).json()).panel, {
      running: true,
      port: opened.port,
    });
  } finally {
    await stopControlPanel();
    await rm(root, { recursive: true, force: true });
  }
});
