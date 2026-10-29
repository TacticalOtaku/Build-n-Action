import { describe, expect, it } from "vitest";
import { currencyValue, pickSlot, planOperation, readOperation, slotValue, tempHp, usesSpent, type PlanContext } from "./operations";

const ctx: PlanContext = {
  self: "Actor.hero", target: "Actor.foe", carrierItem: "Actor.hero.Item.mace", origin: "Actor.hero.Item.mace", amount: 3
};

describe("planOperation", () => {
  it("applies statuses and copies item effects, to the target by default", () => {
    expect(planOperation("applyEffect", { source: "status", status: "prone" }, ctx))
      .toEqual({ kind: "status", actor: "Actor.foe", status: "prone", active: true });
    expect(planOperation("applyEffect", { source: "itemEffect", effectId: "fx1", who: "self" }, ctx))
      .toEqual({ kind: "copyEffect", actor: "Actor.hero", effect: "Actor.hero.Item.mace.ActiveEffect.fx1", origin: "Actor.hero.Item.mace" });
    expect(planOperation("applyEffect", { source: "status", status: "" }, ctx)).toBeNull();
    expect(planOperation("applyEffect", { source: "itemEffect", effectId: "fx1" }, { ...ctx, carrierItem: null })).toBeNull();
  });

  it("removes statuses or effects by name, from me by default", () => {
    expect(planOperation("removeEffect", { match: "status", status: "poisoned" }, ctx))
      .toEqual({ kind: "status", actor: "Actor.hero", status: "poisoned", active: false });
    expect(planOperation("removeEffect", { match: "name", name: " Hex ", who: "target" }, ctx))
      .toEqual({ kind: "removeEffects", actor: "Actor.foe", name: "Hex" });
  });

  it("spends and restores resources", () => {
    expect(planOperation("resource", { action: "spend", resource: "uses" }, ctx))
      .toEqual({ kind: "resource", actor: "Actor.hero", item: "Actor.hero.Item.mace", resource: "uses", delta: -3, slot: "", currency: "gp" });
    expect(planOperation("resource", { action: "restore", resource: "tempHp", who: "target" }, ctx))
      .toMatchObject({ actor: "Actor.foe", resource: "tempHp", delta: 3, item: null });
    expect(planOperation("resource", { action: "spend", resource: "slots", slotLevel: "spell2" }, ctx)).toMatchObject({ slot: "spell2", delta: -3 });
    expect(planOperation("resource", { resource: "uses" }, { ...ctx, carrierItem: null })).toBeNull();
    expect(planOperation("resource", { resource: "hp" }, { ...ctx, amount: 0 })).toBeNull();
    expect(planOperation("resource", { resource: "mana" }, ctx)).toBeNull();
  });

  it("skips results aimed at a missing target and roll results", () => {
    expect(planOperation("applyEffect", { status: "prone" }, { ...ctx, target: null })).toBeNull();
    expect(planOperation("rollBonus", { formula: "1" }, ctx)).toBeNull();
  });
});

describe("resource maths", () => {
  it("keeps uses, slots, temporary HP and currency in range", () => {
    expect(usesSpent(1, 3, -1)).toBe(2);
    expect(usesSpent(3, 3, -1)).toBe(3);
    expect(usesSpent(2, 3, 5)).toBe(0);
    expect(slotValue(1, 2, 3)).toBe(2);
    expect(slotValue(1, 2, -3)).toBe(0);
    expect(tempHp(5, 8)).toBe(8);
    expect(tempHp(10, 8)).toBe(10);
    expect(tempHp(5, -8)).toBe(0);
    expect(currencyValue(10, -25)).toBe(0);
  });

  it("picks the requested slot, else the lowest one that can change", () => {
    const slots = [
      { key: "spell1", level: 1, value: 0, max: 2 }, { key: "spell2", level: 2, value: 1, max: 1 }, { key: "pact", level: 2, value: 0, max: 1 }
    ];
    expect(pickSlot(slots, "spell2", -1)).toBe("spell2");
    expect(pickSlot(slots, "spell9", -1)).toBeNull();
    expect(pickSlot(slots, "", -1)).toBe("spell2");
    expect(pickSlot(slots, "", 1)).toBe("spell1");
  });
});

describe("readOperation", () => {
  it("keeps a well-formed operation and normalises a counter's limits", () => {
    expect(readOperation({ kind: "status", actor: "Actor.foe", status: "prone", active: true }))
      .toEqual({ kind: "status", actor: "Actor.foe", status: "prone", active: true });
    expect(readOperation({ kind: "counter", actor: "Actor.me", key: "ярость", action: "add", amount: 1, def: { max: 3 } }))
      .toMatchObject({ key: "ярость", amount: 1, def: { min: 0, max: 3, initial: 0 } });
  });

  it("refuses missing fields, unknown kinds and paths that reach into other data", () => {
    expect(readOperation({ kind: "status", actor: "Actor.foe", status: "prone" })).toBeNull();
    expect(readOperation({ kind: "delete", actor: "Actor.foe" })).toBeNull();
    expect(readOperation({ kind: "resource", actor: "Actor.foe", item: null, resource: "currency", delta: 5, slot: "", currency: "gp.value" })).toBeNull();
    expect(readOperation({ kind: "counter", actor: "Actor.me", key: "a.b", action: "add", amount: 1, def: {} })).toBeNull();
  });
});
