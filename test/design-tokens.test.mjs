import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Design tokens the shipped settings CSS may reference. This list is not a style
// preference: every entry was checked against the token sets the supported runtimes
// actually define — the desktop runtime 0.2.0-rc.2 shell, the 0.1.2-rc.1 shell and the
// theme package. A guessed token name resolves to nothing, which silently drops the
// colour and is exactly how the first version of this page lost its contrast, so an
// unverified name must fail here rather than on someone's screen.
const VERIFIED_SHARED = new Set([
  "bg-layer-2",
  "border-l1",
  "border-l2",
  "border-l4",
  "brand-primary",
  "button-primary-fill",
  "button-primary-hover",
  "interactive-bg-hover",
  "interactive-bg-hover-danger",
  "label-caption",
  "label-primary",
  "label-primary-foreground",
  "label-secondary",
  "label-tertiary",
  "markdown-code-block",
  "markdown-inline-code",
  "state-error-primary",
  "state-success-primary",
  "state-success-tertiary",
  "state-warn-label",
  "state-warn-tertiary",
]);

// Tokens only the newer desktop runtime defines. Each one must carry an inline fallback
// so the same bundle still renders on the older runtime the CLI is pinned to.
const VERIFIED_NEWER_ONLY = new Set(["bg-layer-3"]);

function settingsCss() {
  const bundle = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  const start = bundle.indexOf("    const CSS = [");
  const end = bundle.indexOf('].join("");', start);
  assert.notEqual(start, -1, "the settings CSS block moved");
  assert.notEqual(end, -1, "the settings CSS block moved");
  return bundle.slice(start, end);
}

test("settings CSS references only verified design tokens", () => {
  const css = settingsCss();
  const used = new Set([...css.matchAll(/var\((--dsw-alias-[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.equal(used.size > 10, true, "the settings CSS lost its tokens");
  for (const token of used) {
    const name = token.replace("--dsw-alias-", "");
    assert.equal(
      VERIFIED_SHARED.has(name) || VERIFIED_NEWER_ONLY.has(name),
      true,
      `${token} is not in the verified token set; check it against the supported runtimes first`,
    );
    if (VERIFIED_NEWER_ONLY.has(name))
      assert.match(
        css,
        new RegExp(`var\\(\\s*${token}\\s*,`),
        `${token} exists only on the newer runtime and needs an inline fallback`,
      );
  }
});
