import { describe, expect, it } from "vitest";
import type { BlueprintSource, ConditionCheck } from "../blueprint/types";
import { convertLegacyBonus } from "./adapter";
import { LEGACY_FIXTURES } from "./fixtures";
import { repairMigratedBlueprint } from "./repair";

const HEALTH: ConditionCheck = { id: "c-healthPercentages", type: "healthPercentages", data: { value: 50, type: "atMost" } };
const SIZE: ConditionCheck = { id: "c-tokenSizes", type: "tokenSizes", data: { size: 2, type: "atLeast", self: false } };

function original(filters: Record<string, unknown>) {
  return { ...LEGACY_FIXTURES.attackAura, filters };
}

function converted(raw: unknown): BlueprintSource {
  const { blueprint } = convertLegacyBonus(raw, "item");
  if (!blueprint) throw new Error("not converted");
  return blueprint;
}

/** What 2.0.0 made of a bonus whose default hit-point and size filters were off: the fixed conversion plus stale checks. */
function asMigratedByTwoZero(raw: unknown, stale: ConditionCheck[]): BlueprintSource {
  const fixed = converted(raw);
  const condition = fixed.nodes.find(node => node.id === "condition");
  if (condition) {
    return {
      ...fixed,
      nodes: fixed.nodes.map(node => (node === condition)
        ? { ...node, data: { ...node.data, checks: [...(node.data.checks as ConditionCheck[]), ...stale] } }
        : node)
    };
  }
  return {
    ...fixed,
    nodes: [...fixed.nodes, { id: "condition", kind: "condition", type: "condition", position: { x: 324, y: 0 }, data: { mode: "all", checks: stale } }],
    edges: [
      { id: "event-out-condition", source: "event", sourcePin: "out", target: "condition", targetPin: "in" },
      ...fixed.edges.map(edge => ({ ...edge, id: `condition-yes-${edge.target}`, source: "condition", sourcePin: "yes" as const }))
    ]
  };
}

const OFF = { healthPercentages: { value: 50, type: null }, tokenSizes: { size: 2, type: null, self: false } };

describe("repairMigratedBlueprint", () => {
  it("drops the stale checks and keeps the real ones", () => {
    const raw = original({ ...OFF, creatureTypes: ["undead"] });
    const repaired = repairMigratedBlueprint(asMigratedByTwoZero(raw, [HEALTH, SIZE]), raw);
    const condition = repaired?.nodes.find(node => node.id === "condition");
    expect((condition?.data.checks as ConditionCheck[]).map(check => check.type)).toEqual(["creatureTypes"]);
  });

  it("removes a condition left empty and wires the event straight to the results, as the fixed conversion does", () => {
    const raw = original(OFF);
    const repaired = repairMigratedBlueprint(asMigratedByTwoZero(raw, [HEALTH, SIZE]), raw);
    const fixed = converted(raw);
    expect(repaired?.nodes.map(node => node.id).sort()).toEqual(fixed.nodes.map(node => node.id).sort());
    expect(repaired?.edges).toEqual(fixed.edges);
  });

  it("keeps an empty condition that has an otherwise branch", () => {
    const raw = original(OFF);
    const migrated = asMigratedByTwoZero(raw, [HEALTH]);
    const withBranch = { ...migrated, edges: [...migrated.edges, { id: "condition-no-critRange", source: "condition", sourcePin: "no" as const, target: "critRange", targetPin: "in" as const }] };
    const repaired = repairMigratedBlueprint(withBranch, raw);
    expect(repaired?.nodes.find(node => node.id === "condition")?.data.checks).toEqual([]);
  });

  it("leaves checks the GM changed, filters v1 had on, and blueprints not made by the migration", () => {
    const raw = original(OFF);
    const edited = asMigratedByTwoZero(raw, [{ ...HEALTH, data: { value: 30, type: "atMost" } }]);
    expect(repairMigratedBlueprint(edited, raw)).toBeNull();

    const on = original({ healthPercentages: { value: 50, type: 0 } });
    expect(repairMigratedBlueprint(converted(on), on)).toBeNull();

    const migrated = asMigratedByTwoZero(raw, [HEALTH]);
    expect(repairMigratedBlueprint({ ...migrated, flags: {} }, raw)).toBeNull();
  });
});
