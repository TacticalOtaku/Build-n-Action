import { describe, expect, it } from "vitest";
import type { ChainEntry, ChainIntent } from "../core/engine/interpreter";
import {
  costAvailable, costOptions, costScales, hitDiceSpend, lowestSlot, readCost, resolveCost, sortIntents, type CostState, type ResolvedCost
} from "./choices";

const entryA = { documentUuid: "Item.a" } as unknown as ChainEntry;
const entryB = { documentUuid: "Item.b" } as unknown as ChainEntry;

function intent(nodeId: string, type: string, common: Partial<ChainIntent["common"]>, entry = entryA): ChainIntent {
  return {
    blueprintId: "aB3dE5gH7jK9mN1p", nodeId, type, data: {}, eventNodeId: "ev", entry,
    common: { optional: false, choiceGroup: nodeId, cost: {}, limit: "none", then: false, ...common }
  };
}

const slotCost = { type: "slots", subtype: "", min: "1", max: "5", step: 1, scales: true, formula: "1d8" };

function state(partial: Partial<CostState> = {}): CostState {
  return {
    owner: true, actorType: "character",
    uses: { value: 3, max: 5, limited: true }, quantity: 4, effect: true,
    slots: [
      { key: "spell1", level: 1, value: 0, max: 4 }, { key: "spell2", level: 2, value: 2, max: 3 },
      { key: "pact", level: 2, value: 1, max: 1 }, { key: "spell3", level: 3, value: 1, max: 2 }
    ],
    hp: { value: 10, temp: 2, max: 20, tempmax: 0 },
    currency: { gp: 25 },
    hitDice: { value: 3, max: 5, bySize: { d8: 2, d10: 1 } },
    inspiration: true,
    currencies: ["gp", "sp"], hitDieTypes: ["d6", "d8", "d10", "d12"],
    ...partial
  };
}

function cost(partial: Partial<ResolvedCost>): ResolvedCost {
  return { type: "none", subtype: "", min: 1, max: null, step: 1, scales: false, formula: "", ...partial };
}

describe("sortIntents", () => {
  it("separates immediate results, choices and reminders", () => {
    const sorted = sortIntents([
      intent("bonus", "rollBonus", {}),
      intent("smite", "rollBonus", { optional: true, choiceGroup: "g", cost: slotCost }),
      intent("crit", "critDamage", { optional: true, choiceGroup: "g" }),
      intent("note", "reminder", {}),
      intent("other", "rollBonus", { optional: true, choiceGroup: "g" }, entryB)
    ]);
    expect(sorted.immediate.map(entry => entry.nodeId)).toEqual(["bonus"]);
    expect(sorted.reminders.map(entry => entry.nodeId)).toEqual(["note"]);
    expect(sorted.choices.map(choice => [choice.key, choice.intents.map(entry => entry.nodeId), choice.cost.type]))
      .toEqual([["0:g", ["smite", "crit"], "slots"], ["1:g", ["other"], "none"]]);
  });
});

describe("costs", () => {
  it("reads and resolves cost data", () => {
    expect(readCost({})).toEqual({ type: "none", subtype: "", min: "", max: "", step: 1, scales: false, formula: "" });
    expect(resolveCost(readCost({ type: "health", min: "", max: "@x" }), () => 7)).toMatchObject({ min: 1, max: 7 });
    expect(resolveCost(readCost({ type: "health", min: "9", max: "3" }), Number)).toMatchObject({ min: 3, max: 9 });
    expect(resolveCost(readCost({ type: "health", min: "x" }), () => null)).toMatchObject({ min: 1, max: null });
  });

  it("knows when a cost can be paid", () => {
    expect(costAvailable(cost({}), state({ owner: false }))).toBe(true);
    expect(costAvailable(cost({ type: "uses", min: 3 }), state())).toBe(true);
    expect(costAvailable(cost({ type: "uses", min: 4 }), state())).toBe(false);
    expect(costAvailable(cost({ type: "uses" }), state({ uses: { value: 3, max: 5, limited: false } }))).toBe(false);
    expect(costAvailable(cost({ type: "quantity" }), state({ quantity: null }))).toBe(false);
    expect(costAvailable(cost({ type: "slots", min: 3 }), state())).toBe(true);
    expect(costAvailable(cost({ type: "slots", min: 4 }), state())).toBe(false);
    expect(costAvailable(cost({ type: "health", min: 12 }), state())).toBe(true);
    expect(costAvailable(cost({ type: "currency", subtype: "gp", min: 30 }), state())).toBe(false);
    expect(costAvailable(cost({ type: "currency", subtype: "pp" }), state())).toBe(false);
    expect(costAvailable(cost({ type: "hitdice", subtype: "d10", min: 1 }), state())).toBe(true);
    expect(costAvailable(cost({ type: "hitdice", subtype: "smallest", min: 4 }), state())).toBe(false);
    expect(costAvailable(cost({ type: "hitdice", subtype: "d8" }), state({ actorType: "npc" }))).toBe(false);
    expect(costAvailable(cost({ type: "inspiration" }), state({ inspiration: false }))).toBe(false);
    expect(costAvailable(cost({ type: "effect" }), state({ effect: false }))).toBe(false);
    expect(costAvailable(cost({ type: "uses" }), state({ owner: false }))).toBe(false);
    expect(costAvailable(cost({ type: "slots", scales: true, min: 3, max: 2 }), state())).toBe(false);
  });

  it("knows which costs scale", () => {
    expect(costScales(cost({ type: "slots", scales: true }), state())).toBe(true);
    expect(costScales(cost({ type: "slots" }), state())).toBe(false);
    expect(costScales(cost({ type: "inspiration", scales: true }), state())).toBe(false);
    expect(costScales(cost({ type: "health", scales: true, step: 0 }), state())).toBe(false);
  });
});

describe("costOptions", () => {
  it("offers one option at the minimum when the cost does not scale", () => {
    expect(costOptions(cost({ type: "uses", min: 2 }), state())).toEqual([{ value: "2", amount: 2, scale: 0, available: "3/5" }]);
    expect(costOptions(cost({ type: "inspiration" }), state())).toEqual([{ value: "1", amount: 1, scale: 0, available: "" }]);
  });

  it("scales item uses between the minimum and the maximum", () => {
    expect(costOptions(cost({ type: "uses", scales: true, min: 1, max: 2 }), state()).map(option => [option.amount, option.scale]))
      .toEqual([[1, 0], [2, 1]]);
  });

  it("offers each spell slot at or above the minimum level", () => {
    const options = costOptions(cost({ type: "slots", scales: true, min: 2, max: 5 }), state());
    expect(options.map(option => [option.value, option.scale, option.available])).toEqual([
      ["pact", 0, "1/1"], ["spell2", 0, "2/3"], ["spell3", 1, "1/2"]
    ]);
  });

  it("uses the lowest slot, preferring pact slots, when slots do not scale", () => {
    expect(lowestSlot(state(), 1)?.key).toBe("pact");
    expect(lowestSlot(state(), 3)?.key).toBe("spell3");
    expect(lowestSlot(state(), 4)).toBeNull();
    expect(costOptions(cost({ type: "slots", min: 1 }), state())).toEqual([{ value: "pact", amount: 1, scale: 0, available: "1/1" }]);
  });

  it("steps through health and currency", () => {
    expect(costOptions(cost({ type: "health", scales: true, min: 5, step: 5 }), state()).map(option => [option.amount, option.scale]))
      .toEqual([[5, 0], [10, 1]]);
    expect(costOptions(cost({ type: "currency", subtype: "gp", scales: true, min: 10, max: 30, step: 10 }), state()).map(option => option.amount))
      .toEqual([10, 20]);
  });

  it("spends hit dice from the right classes", () => {
    const classes = [{ id: "fighter", denomination: "d10", levels: 3, spent: 1 }, { id: "wizard", denomination: "d6", levels: 2, spent: 0 }];
    expect(hitDiceSpend(classes, "d10", 2)).toEqual([{ id: "fighter", spent: 3 }]);
    expect(hitDiceSpend(classes, "smallest", 3)).toEqual([{ id: "wizard", spent: 2 }, { id: "fighter", spent: 2 }]);
    expect(hitDiceSpend(classes, "largest", 1)).toEqual([{ id: "fighter", spent: 2 }]);
    expect(hitDiceSpend(classes, "d8", 1)).toEqual([]);
  });

  it("counts hit dice by size or in total", () => {
    expect(costOptions(cost({ type: "hitdice", subtype: "d8", scales: true, min: 1 }), state()).map(option => option.amount)).toEqual([1, 2]);
    expect(costOptions(cost({ type: "hitdice", subtype: "largest", scales: true, min: 2, max: 3 }), state()).map(option => option.scale))
      .toEqual([0, 1]);
  });
});
