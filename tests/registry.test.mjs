import assert from "node:assert/strict";
import test from "node:test";

let counter = 0;
globalThis.foundry = {utils: {randomID: () => `id-${counter++}`}};

const {default: registry} = await import("../scripts/registry.mjs");

test("registered roll configurations stay retrievable", () => {
  registry.clear();
  const id = registry.register({bonuses: "collection"});

  assert.deepEqual(registry.get(id), {bonuses: "collection"});
});

test("a roll that never opens a dialog cannot grow the registry without bound", () => {
  registry.clear();
  const max = registry.constructor.MAX_ENTRIES;
  const ids = Array.from({length: max + 5}, () => registry.register({}));

  assert.equal(registry.size, max);
  // The oldest entries are the ones dropped; the newest are all still present.
  assert.equal(ids.slice(0, 5).some(id => registry.has(id)), false);
  assert.equal(ids.slice(5).every(id => registry.has(id)), true);
});
