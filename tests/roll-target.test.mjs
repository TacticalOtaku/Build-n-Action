import assert from "node:assert/strict";
import test from "node:test";

import {resolveRollTarget, resolveSubjectTarget} from "../scripts/services/roll-target.mjs";

test("resolveRollTarget prefers the Midi workflow target over stale user targeting", () => {
  const workflowTarget = {id: "workflow-target"};
  const staleUserTarget = {id: "stale-user-target"};

  const target = resolveRollTarget({
    workflow: {
      hitTargets: new Set(),
      targets: new Set([workflowTarget])
    }
  }, {userTargets: new Set([staleUserTarget])});

  assert.equal(target, workflowTarget);
});

test("resolveRollTarget prefers confirmed hits for a Midi damage roll", () => {
  const selectedTarget = {id: "selected-target"};
  const hitTarget = {id: "hit-target"};

  const target = resolveRollTarget({
    workflow: {
      hitTargets: new Set([hitTarget]),
      targets: new Set([selectedTarget])
    }
  }, {preferHitTargets: true});

  assert.equal(target, hitTarget);
});

test("resolveRollTarget ignores stale hit results outside a Midi damage roll", () => {
  const selectedTarget = {id: "selected-target"};
  const previousHitTarget = {id: "previous-hit-target"};

  const target = resolveRollTarget({
    workflow: {
      hitTargets: new Set([previousHitTarget]),
      targets: new Set([selectedTarget])
    }
  });

  assert.equal(target, selectedTarget);
});

test("resolveRollTarget does not leak a user target into an empty Midi workflow", () => {
  const staleUserTarget = {id: "stale-user-target"};

  const target = resolveRollTarget({
    workflow: {
      hitTargets: new Set(),
      targets: new Set()
    }
  }, {userTargets: new Set([staleUserTarget])});

  assert.equal(target, null);
});

test("resolveRollTarget falls back to native Foundry user targeting", () => {
  const userTarget = {id: "user-target"};

  assert.equal(resolveRollTarget({}, {userTargets: new Set([userTarget])}), userTarget);
  assert.equal(resolveRollTarget({workflow: {id: "foreign-workflow"}}, {
    userTargets: new Set([userTarget])
  }), userTarget);
});

test("resolveSubjectTarget preserves an explicit target or explicit absence", () => {
  const rollTarget = {id: "roll-target"};
  const staleUserTarget = {id: "stale-user-target"};
  const userTargets = new Set([staleUserTarget]);

  assert.equal(resolveSubjectTarget({target: rollTarget}, userTargets), rollTarget);
  assert.equal(resolveSubjectTarget({target: null}, userTargets), null);
  assert.equal(resolveSubjectTarget({}, userTargets), staleUserTarget);
});
