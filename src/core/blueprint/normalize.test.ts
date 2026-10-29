import { describe, expect, it } from "vitest";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { createBlueprint } from "./factory";
import type { ConditionCheck } from "./types";
import { foldThisItemChecks } from "./normalize";

const thisItem: ConditionCheck = { id: "c-thisItem", type: "thisItem", data: {} };
const undead: ConditionCheck = { id: "c1", type: "creatureTypes", data: { values: ["undead"] } };

function withCondition(checks: ConditionCheck[], mode: "all" | "any" = "all") {
  return createBlueprint({
    nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", checks, mode), makeNode("result", "rollBonus", "bonus")],
    edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
  });
}

describe("foldThisItemChecks", () => {
  it("turns an \"only this item\" check in an all-of condition into the condition's tick", () => {
    const folded = foldThisItemChecks(withCondition([thisItem, undead]));
    expect(folded.nodes[1]?.data).toMatchObject({ mode: "all", checks: [undead], thisItem: true });
  });

  it("leaves any-of conditions, where the check means something else, and returns the same blueprint when nothing changes", () => {
    const anyOf = withCondition([thisItem, undead], "any");
    expect(foldThisItemChecks(anyOf)).toBe(anyOf);
    const plain = withCondition([undead]);
    expect(foldThisItemChecks(plain)).toBe(plain);
  });
});
