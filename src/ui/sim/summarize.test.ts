import { describe, expect, it } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import type { BlueprintSource } from "../../core/blueprint/types";
import { runBlueprint, type BlueprintEnv } from "../../core/engine/interpreter";
import { passed } from "../../core/engine/reasons";
import { creatureFacts, rollFacts } from "../../core/testing/facts";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import { summarizeRun } from "./summarize";

const env: BlueprintEnv = {
  evaluateNumber: formula => Number(formula),
  replaceData: text => text,
  runScript: () => null,
  carrierItemUuid: null,
  reach: () => passed("matched"),
  limitAvailable: () => true
};

function at<T extends { position: { x: number; y: number } }>(node: T, x: number, y = 0): T {
  return { ...node, position: { x, y } };
}

const blueprint: BlueprintSource = createBlueprint({
  id: "aB3dE5gH7jK9mN1p",
  nodes: [
    at(makeNode("result", "rollBonus", "fire", { formula: "1d6" }), 600),
    at(makeCondition("undead", [
      { id: "c1", type: "thisItem", data: {} },
      { id: "c2", type: "creatureTypes", data: { values: ["undead"] } }
    ]), 300),
    at(makeNode("event", "damageRoll", "ev"), 0),
    at(makeNode("result", "rollBonus", "unused"), 600, 200)
  ],
  edges: [makeEdge("ev", "out", "undead"), makeEdge("undead", "yes", "fire")]
});

describe("summarizeRun", () => {
  it("lists the reached nodes in reading order and traces the canvas", () => {
    const run = runBlueprint(blueprint, { event: "damageRoll", pins: ["out"] }, rollFacts({ target: creatureFacts({ creatureTypes: ["undead"] }) }), env);
    const summary = summarizeRun(blueprint, run);
    expect(summary.steps.map(step => [step.nodeId, step.status])).toEqual([
      ["ev", "passed"], ["undead", "passed"], ["fire", "passed"]
    ]);
    expect(summary.trace.nodes).toEqual({ ev: "passed", undead: "passed", fire: "passed", unused: "skipped" });
    expect([...summary.trace.edges].sort()).toEqual(["ev-out-undead", "undead-yes-fire"]);
    expect(summary.firstFailure).toBeNull();
  });

  it("points at the first failing check when nothing would apply", () => {
    const run = runBlueprint(blueprint, { event: "damageRoll", pins: ["out"] }, rollFacts(), env);
    const summary = summarizeRun(blueprint, run);
    expect(summary.steps.find(step => step.nodeId === "undead")?.checks.map(check => check.outcome.pass)).toEqual([true, false]);
    expect(summary.firstFailure).toEqual({
      nodeId: "undead", checkId: "c2", reason: { code: "notMatched", values: expect.any(Object) as unknown }
    });
  });

  it("explains a blueprint that is switched off", () => {
    const off = { ...blueprint, enabled: false };
    const summary = summarizeRun(off, runBlueprint(off, { event: "damageRoll", pins: ["out"] }, rollFacts(), env));
    expect(summary.steps).toEqual([]);
    expect(summary.firstFailure).toEqual({ nodeId: null, checkId: null, reason: { code: "disabled" } });
  });

  it("reports an event that is out of reach", () => {
    const far = { ...env, reach: () => ({ pass: false, reason: { code: "outOfReach" as const, values: { actual: "30 ft" } } }) };
    const summary = summarizeRun(blueprint, runBlueprint(blueprint, { event: "damageRoll", pins: ["out"] }, rollFacts(), far));
    expect(summary.firstFailure).toEqual({ nodeId: "ev", checkId: null, reason: { code: "outOfReach", values: { actual: "30 ft" } } });
  });
});
