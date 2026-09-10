import test from "node:test";
import assert from "node:assert/strict";
import {evaluateTrialCondition} from "../scripts/services/blueprint-trial.mjs";

test("trial never executes scripts or formula comparisons which can roll dice", () => {
  let calls = 0;
  const registry = {customScripts: () => calls++, arbitraryComparisons: () => calls++};
  for (const id of Object.keys(registry)) {
    assert.equal(evaluateTrialCondition(id, {filters: {}}, registry, {actor: {}}).result, null);
  }
  assert.equal(calls, 0);
});
test("missing target or item produces unknown before a filter can silently pass", () => {
  let calls = 0;
  for (const id of ["targetEffects", "itemTypes", "skillIds"]) {
    const result = evaluateTrialCondition(id, {filters: {}}, {[id]: () => ++calls}, {actor: {}});
    assert.deepEqual(result, {result: null, reason: "MissingContext"});
  }
  assert.equal(calls, 0);
});
test("trial calls known readonly filters with draft receiver, supplied target, and typed value", () => {
  const bonus = {filters: {healthPercentages: {value: 50, type: 0}}};
  const subjects = {actor: {hp: 20}, target: null};
  const registry = {healthPercentages(s, value) { assert.equal(this, bonus); assert.equal(s.target, null); return s.actor.hp <= value.value; }};
  assert.deepEqual(evaluateTrialCondition("healthPercentages", bonus, registry, subjects), {result: true});
});
test("throwing and unknown third-party filters remain unknown", () => {
  assert.equal(evaluateTrialCondition("healthPercentages", {filters: {}}, {healthPercentages() {throw Error();}}, {actor: {}}).reason, "EvaluationError");
  assert.equal(evaluateTrialCondition("extension", {filters: {}}, {extension() {throw Error();}}, {actor: {}}).result, null);
});
