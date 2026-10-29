import { describe, expect, it } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import { autoLayout } from "./layout";

describe("autoLayout", () => {
  it("lays chains out left to right without overlaps", async () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("result", "rollBonus", "bonus"),
        makeCondition("if", []),
        makeNode("event", "damageRoll", "ev"),
        makeNode("result", "reminder", "note")
      ],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus"), makeEdge("if", "no", "note")]
    });
    const positions = await autoLayout(blueprint, {});
    expect(Object.keys(positions).sort()).toEqual(["bonus", "ev", "if", "note"]);
    expect(positions.ev!.x).toBeLessThan(positions.if!.x);
    expect(positions.if!.x).toBeLessThan(positions.bonus!.x);
    expect(positions.bonus!.x).toBe(positions.note!.x);
    expect(positions.bonus!.y).not.toBe(positions.note!.y);
  });
});
