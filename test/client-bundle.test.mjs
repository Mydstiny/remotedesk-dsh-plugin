import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The bundle is authored against the browser platform module table. Node can
// still exercise its registration path: stub the loader facade and React, then
// run the plugin's `apply` against a recording browser context.
function fakeReact() {
  const element = (type, props, ...children) => ({ type, props, children });
  return {
    createElement: element,
    Fragment: Symbol("Fragment"),
    useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useId: () => "test",
    useRef: (value) => ({ current: value }),
  };
}

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params !== undefined && key in params ? String(params[key]) : match,
  );
}

async function loadBundle() {
  const entries = [];
  globalThis.window = {
    __ModuleLoader__: { load: (entry) => entries.push(entry) },
  };
  await import("../lib/client.js");
  assert.equal(entries.length, 1);
  const [entry] = entries;
  const modules = {
    react: fakeReact(),
    "react/jsx-runtime": { jsx: () => {}, jsxs: () => {}, Fragment: Symbol("Fragment") },
  };
  return { entry, exports: entry.factory((name) => modules[name]) };
}

test("client bundle registers one settings section with balanced dictionaries", async () => {
  const { entry, exports } = await loadBundle();
  assert.equal(entry.id, "@remotedesk/dsh-plugin");
  assert.equal(typeof exports.apply, "function");
  assert.deepEqual(exports.inject, ["slots", "locale"]);

  const dictionaries = new Map();
  const injections = [];
  const registrations = [];
  const effects = [];
  const ctx = {
    effect: (factory, label) => {
      effects.push(label);
      factory();
      return () => {};
    },
    locale: {
      register: (ns, dicts) => {
        dictionaries.set(ns, dicts);
        return () => {};
      },
      bind: (ns) => (key, params) => {
        const dicts = dictionaries.get(ns);
        assert.ok(dicts, `locale namespace ${ns} was not registered`);
        const template = dicts.zh[key];
        assert.notEqual(template, undefined, `missing zh copy for ${key}`);
        return interpolate(template, params);
      },
    },
    slots: {
      // The real slots service runs the callback once the slot is live; running
      // it here records exactly what lands in the ledger.
      inject: (slot, register) => {
        injections.push({ slot });
        register();
      },
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      },
    },
  };

  exports.apply(ctx);

  assert.deepEqual(
    injections.map((row) => row.slot),
    ["settings.section"],
  );
  assert.equal(registrations.length, 1);
  const [{ options, component }] = registrations;
  assert.equal(options.name, "settings.section");
  assert.equal(options.id, "remotedesk");
  assert.equal(typeof options.order, "number");
  assert.equal(typeof component, "function");
  assert.equal(options.label(), "RemoteDesk");

  const dicts = dictionaries.get("remotedesk.settings");
  assert.notEqual(dicts, undefined);
  const zhKeys = Object.keys(dicts.zh).sort();
  assert.deepEqual(zhKeys, Object.keys(dicts.en).sort(), "zh and en dictionaries drifted");
  // Composed at call time from `device.status`, so a missing entry would render
  // a raw key in the UI.
  for (const key of ["devices.paired", "devices.revoked", "devices.expired"])
    assert.ok(zhKeys.includes(key), `missing ${key}`);
  assert.equal(zhKeys.includes("nav"), true);

  // Injected props carry the bound copy function the section renders with.
  const injected = options.inject();
  assert.equal(typeof injected.copy, "function");
  assert.equal(injected.copy("nav"), "RemoteDesk");
  assert.equal(
    injected.copy("loadError", { message: "boom" }),
    "读取失败：boom",
  );

  const bundle = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  assert.match(bundle, /pair\.methodQr/);
  assert.match(bundle, /pair\.methodLink/);
  assert.equal(bundle.includes("remotedesk://pair?data="), true);
  assert.match(bundle, /JSON\.stringify\(nextInvite\)/);
  assert.match(bundle, /createSvgTag/);
  assert.match(bundle, /Array\.isArray\(snapshot\.sessions\)/);
  assert.match(bundle, /Object\.values\(snapshot\.operations\)/);
  assert.equal(bundle.includes("String(snapshot.sessions ?? 0)"), false);
  assert.equal(bundle.includes("String(snapshot.operations ?? 0)"), false);

  assert.deepEqual(effects, ["remotedesk-settings: section dictionaries"]);
});
