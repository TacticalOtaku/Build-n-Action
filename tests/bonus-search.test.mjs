import assert from "node:assert/strict";
import test from "node:test";

import {matchesBonusSearch} from "../scripts/services/bonus-search.mjs";

test("matchesBonusSearch is trimmed and case-insensitive", () => {
  assert.equal(matchesBonusSearch("[BnA] Цепеш Жажда Крови", "  жАжДа  ", "ru"), true);
  assert.equal(matchesBonusSearch("[BnA] Цепеш Жажда Крови", "лечение", "ru"), false);
});

test("matchesBonusSearch keeps all rows for an empty query", () => {
  assert.equal(matchesBonusSearch("Any bonus", "   ", "en"), true);
});
