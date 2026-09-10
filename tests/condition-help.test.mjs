import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {getConditionHelp} from "../scripts/services/condition-help.mjs";

test("every runtime filter has concrete bilingual help", () => {
  const source = fs.readFileSync(new URL("../scripts/services/filterings.mjs", import.meta.url), "utf8");
  const keys = source.match(/export const filters = \{([\s\S]*?)\};/)[1].split(",").map(s => s.trim()).filter(Boolean);
  for (const language of ["en", "ru"]) {
    const data = JSON.parse(fs.readFileSync(new URL(`../lang/${language}.json`, import.meta.url)));
    const localize = key => key.split(".").reduce((value, part) => value?.[part], data);
    for (const id of keys) {
      const help = getConditionHelp(id, localize);
      assert.ok(help.description.length > 10, `${language}/${id}/description`);
      assert.ok(help.example.length > 20, `${language}/${id}/example`);
      assert.ok(help.context.length > 5, `${language}/${id}/context`);
    }
  }
});
