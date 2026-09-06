import assert from "node:assert/strict";
import test from "node:test";

import {getTokenShape, templateContainsPoint} from "../scripts/utils/canvas-shapes.mjs";

test("a token's geometry comes from getShape, which works before the placeable is drawn", () => {
  const computed = {contains: () => true};
  // Foundry v14 only assigns Token#shape while refreshing the placeable.
  const undrawn = {shape: undefined, getShape: () => computed};

  assert.equal(getTokenShape(undrawn), computed);
  assert.equal(getTokenShape(null), null);
});

test("a token from an older core release still resolves through the cached shape", () => {
  const cached = {contains: () => true};

  assert.equal(getTokenShape({shape: cached}), cached);
});

test("an undrawn template contains nothing instead of throwing", () => {
  // Reading .shape here used to throw and abort the whole bonus collection.
  assert.equal(templateContainsPoint({shape: undefined, testPoint: () => true}, {x: 0, y: 0}), false);
  assert.equal(templateContainsPoint(null, {x: 0, y: 0}), false);
});

test("a drawn template is tested through the public testPoint API", () => {
  const asked = [];
  const template = {
    shape: {contains: () => false},
    document: {x: 10, y: 20},
    testPoint: point => {
      asked.push(point);
      return true;
    }
  };

  assert.equal(templateContainsPoint(template, {x: 30, y: 40}), true);
  assert.deepEqual(asked, [{x: 30, y: 40}]);
});
