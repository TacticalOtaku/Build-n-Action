import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../scripts/applications/character-sheet-tab.mjs", import.meta.url);
const templateUrl = new URL("../templates/subapplications/character-sheet-tab.hbs", import.meta.url);
const imageTemplateUrl = new URL("../templates/sheet-description.hbs", import.meta.url);

test("character-sheet integration does not mutate dnd5e sheet classes", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /\.prototype\b/);
  assert.doesNotMatch(source, /\.TABS\b/);
  assert.doesNotMatch(source, /_filterChildren/);
  assert.match(source, /sheet\.changeTab\(MODULE\.ID, "primary"/);
  assert.match(source, /renderCharacterActorSheet/);
  assert.match(source, /renderNPCActorSheet/);
});

test("character-sheet tab owns its search control", async () => {
  const template = await readFile(templateUrl, "utf8");

  assert.match(template, /data-bna-search/);
  assert.doesNotMatch(template, /item-list-controls/);
});

test("bonus image selection uses the dedicated update action", async () => {
  const template = await readFile(imageTemplateUrl, "utf8");

  assert.match(template, /name="img"/);
  assert.match(template, /data-action="editImage"/);
  assert.doesNotMatch(template, /formGroup fields\.img\.field/);
});
