import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("optional rows carry the bonus uuid the click handler looks up", async () => {
  const template = await read("templates/subapplications/optional-selector.hbs");
  const source = await read("scripts/applications/optional-selector.mjs");

  // The handler resolves the clicked bonus from this attribute, and getData exposes the
  // bonus under "buildNAction"; a stale path there silently disabled every optional bonus.
  assert.match(source, /container\.dataset\.bonusUuid/);
  assert.match(source, /buildNAction: bonus/);
  assert.doesNotMatch(template, /\{\{build-n-action\./);
  assert.equal(template.match(/data-bonus-uuid="\{\{buildNAction\.uuid\}\}"/g)?.length, 2);
});

test("the selector refuses to inject a second copy of itself", async () => {
  const source = await read("scripts/applications/optional-selector.mjs");

  // Applying a bonus rebuilds the dialog and re-fires the render hook.
  assert.match(source, /if \(root\?\.querySelector\(`\.\$\{MODULE\.ID\}\.optionals`\)\) return;/);
});
