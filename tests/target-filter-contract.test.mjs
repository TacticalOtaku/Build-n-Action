import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const filteringsUrl = new URL("../scripts/services/filterings.mjs", import.meta.url);
const mutatorsUrl = new URL("../scripts/mutators.mjs", import.meta.url);

test("target filters consume the target captured from the roll context", async () => {
  const [filterings, mutators] = await Promise.all([
    readFile(filteringsUrl, "utf8"),
    readFile(mutatorsUrl, "utf8")
  ]);

  assert.doesNotMatch(filterings, /game\.user\.targets/);
  assert.doesNotMatch(mutators, /game\.user\.targets/);
  assert.match(filterings, /function creatureTypes[\s\S]*?resolveSubjectTarget\(subjects\)/);
  assert.match(filterings, /function targetEffects[\s\S]*?resolveSubjectTarget\(subjects\)/);
  assert.match(mutators, /target: resolveRollTarget\(config\)/);
  assert.match(mutators, /target: resolveRollTarget\(config, \{preferHitTargets: true\}\)/);
  assert.match(mutators, /target: resolveRollTarget\(usageConfig\)/);
});
