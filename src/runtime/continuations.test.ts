import { describe, expect, it } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { compileBlueprint } from "../core/engine/compile";
import type { ChainEntry, ChainIntent } from "../core/engine/interpreter";
import { makeEdge, makeNode } from "../core/testing/graph";
import { continuationStarts, startsLater } from "./continuations";

const blueprint = createBlueprint({
  id: "aB3dE5gH7jK9mN1p",
  nodes: [
    makeNode("event", "damageRoll", "ev"),
    makeNode("result", "rollBonus", "smite", { common: { optional: true, choiceGroup: "", cost: { type: "none" }, limit: "none", then: true } }),
    makeNode("result", "rollBonus", "plain"),
    makeNode("result", "applyEffect", "blind")
  ],
  edges: [makeEdge("ev", "out", "smite"), makeEdge("ev", "out", "plain"), makeEdge("smite", "then", "blind")]
});
const entry = { compiled: compileBlueprint(blueprint), documentUuid: "Item.sword", actorUuid: "Actor.hero" } as unknown as ChainEntry;

function intent(nodeId: string, then: boolean): ChainIntent {
  return {
    blueprintId: blueprint.id, nodeId, type: "rollBonus", data: {}, eventNodeId: "ev", entry,
    common: { optional: false, choiceGroup: nodeId, cost: {}, limit: "none", then }
  };
}

describe("continuationStarts", () => {
  it("keeps results with \"And then\" that lead somewhere, keyed by run, target, blueprint and node", () => {
    expect(continuationStarts([intent("smite", true), intent("plain", false), intent("plain", true)], "midi:card", "Token.foe")).toEqual([
      { intent: intent("smite", true), key: "midi:card|Token.foe|aB3dE5gH7jK9mN1p|smite" }
    ]);
  });

  it("keys a run without a target with a dash", () => {
    expect(continuationStarts([intent("smite", true)], "ev1", null)[0]?.key).toBe("ev1|-|aB3dE5gH7jK9mN1p|smite");
  });
});

describe("startsLater", () => {
  it("is true for \"And then\" and for demanded saves", () => {
    expect(startsLater(intent("smite", true))).toBe(true);
    expect(startsLater(intent("plain", false))).toBe(false);
    expect(startsLater({ ...intent("plain", false), type: "demandSave" })).toBe(true);
  });
});
