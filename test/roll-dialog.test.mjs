import assert from "node:assert/strict";
import test from "node:test";

import {requireOptionalRollDialog} from "../scripts/services/roll-dialog.mjs";

test("optional BnA bonuses override fast-forward dialog suppression", () => {
  const dialog = {configure: false};

  assert.equal(requireOptionalRollDialog(dialog, {optionals: new Set(["bonus"])}), true);
  assert.equal(dialog.configure, true);
});

test("roll dialog remains untouched without optional bonuses", () => {
  const dialog = {configure: false};

  assert.equal(requireOptionalRollDialog(dialog, {optionals: new Set()}), false);
  assert.equal(dialog.configure, false);
});
