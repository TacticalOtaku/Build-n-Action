import assert from "node:assert/strict";
import test from "node:test";

import {resolveRollTarget, resolveSubjectTarget} from "../scripts/services/roll-target.mjs";

const target = id => ({id});

test("midi workflow target wins over the user's current target", () => {
  const workflowTarget = target("workflow");
  const selectedTarget = target("selected");
  const config = {workflow: {targets: new Set([workflowTarget]), hitTargets: new Set()}};

  assert.equal(resolveRollTarget(config, {userTargets: new Set([selectedTarget])}), workflowTarget);
});

test("damage prefers a confirmed midi hit target", () => {
  const workflowTarget = target("workflow");
  const hitTarget = target("hit");
  const config = {midiOptions: {workflow: {
    targets: new Set([workflowTarget]),
    hitTargets: new Set([hitTarget])
  }}};

  assert.equal(resolveRollTarget(config, {preferHitTargets: true}), hitTarget);
});

test("an authoritative empty midi workflow does not leak a stale user target", () => {
  const config = {workflow: {targets: new Set(), hitTargets: new Set()}};

  assert.equal(resolveRollTarget(config, {userTargets: new Set([target("stale")])}), null);
});

test("native rolls and legacy subjects retain the user-target fallback", () => {
  const selected = target("selected");

  assert.equal(resolveRollTarget({}, {userTargets: new Set([selected])}), selected);
  assert.equal(resolveSubjectTarget({}, new Set([selected])), selected);
  assert.equal(resolveSubjectTarget({target: null}, new Set([selected])), null);
});
