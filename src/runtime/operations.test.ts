import { describe, expect, it } from "vitest";
import { readCounterStore } from "../core/counters/counters";
import {
  currencyValue, pickSlot, planCostPayment, planCounter, planOperation, quantityValue, readOperation, slotValue, tempHp, usesSpent,
  type PlanContext
} from "./operations";

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
    expect(readOperation({ kind: "chat", actor: "Actor.me", target: "Actor.foe", audience: "target", label: "Aura", text: "Take 5" }))
      .toEqual({ kind: "chat", actor: "Actor.me", target: "Actor.foe", audience: "target", label: "Aura", text: "Take 5" });
  });

  it("refuses missing fields, unknown kinds and paths that reach into other data", () => {
    expect(readOperation({ kind: "status", actor: "Actor.foe", status: "prone" })).toBeNull();
    expect(readOperation({ kind: "delete", actor: "Actor.foe" })).toBeNull();
    expect(readOperation({ kind: "resource", actor: "Actor.foe", item: null, resource: "currency", delta: 5, slot: "", currency: "gp.value" })).toBeNull();
    expect(readOperation({ kind: "counter", actor: "Actor.me", key: "a.b", action: "add", amount: 1, def: {} })).toBeNull();
    expect(readOperation({ kind: "chat", actor: "Actor.me", target: null, audience: "all", label: "X", text: "Y" })).toBeNull();
  });
});

describe("planCounter", () => {
  const blueprint = { id: "aB3dE5gH7jK9mN1p", counters: [{ name: "hits", min: 0, max: 3, initial: 0, reset: "manual" as const }] };
  const store = readCounterStore({ values: { rage: 2, "aB3dE5gH7jK9mN1p:hits": 3 }, defs: { rage: { max: 5 } } });
  const counterCtx = { self: "Actor.me", target: "Actor.foe", blueprint, amount: 2 };

  it("carries the change for my shared counter, with its limits from the actor", () => {
    expect(planCounter({ name: "Rage", scope: "actor", action: "add", who: "self" }, counterCtx, store))
      .toMatchObject({ kind: "counter", actor: "Actor.me", key: "rage", action: "add", amount: 2, def: { max: 5 } });
  });

  it("carries a blueprint counter's limits from the blueprint", () => {
    expect(planCounter({ name: "hits", scope: "blueprint", action: "add", who: "self" }, counterCtx, store))
      .toMatchObject({ kind: "counter", actor: "Actor.me", key: "aB3dE5gH7jK9mN1p:hits", action: "add", amount: 2, def: { max: 3 } });
  });

  it("changes the target's counter, and nothing without a target or a name", () => {
    expect(planCounter({ name: "curse", scope: "actor", action: "set", who: "target" }, counterCtx, store))
      .toMatchObject({ kind: "counter", actor: "Actor.foe", key: "curse", action: "set", amount: 2 });
    expect(planCounter({ name: "curse", scope: "actor", action: "set", who: "target" }, { ...counterCtx, target: null }, store)).toBeNull();
    expect(planCounter({ name: " ", scope: "actor", action: "add", who: "self" }, counterCtx, store)).toBeNull();
  });
});

describe("planCostPayment", () => {
  const baseCost = { type: "none", subtype: "", min: 1, max: null, step: 1, scales: false, formula: "" };
  const option = { value: "2", amount: 2, scale: 1, available: "3" };
  const payCtx = { actor: "Actor.hero", carrier: "Actor.hero.Item.wand", usesSpent: 1, usesMax: 3, autoDestroy: false };

  it("plans resource operations and confirmed deletions uniformly", () => {
    expect(planCostPayment({ ...baseCost, type: "none" }, option, payCtx)).toEqual({ kind: "none" });
    expect(planCostPayment({ ...baseCost, type: "uses" }, option, payCtx))
      .toEqual({ kind: "operation", op: { kind: "resource", actor: "Actor.hero", item: "Actor.hero.Item.wand", resource: "uses", delta: -2, slot: "", currency: "" } });
    expect(planCostPayment({ ...baseCost, type: "uses" }, option, { ...payCtx, autoDestroy: true }))
      .toEqual({ kind: "confirmDelete", target: "Actor.hero.Item.wand" });
    expect(planCostPayment({ ...baseCost, type: "effect" }, option, payCtx))
      .toEqual({ kind: "confirmDelete", target: "Actor.hero.Item.wand" });
    expect(planCostPayment({ ...baseCost, type: "slots" }, { value: "pact", amount: 1, scale: 0, available: "1/1" }, payCtx))
      .toEqual({ kind: "operation", op: { kind: "resource", actor: "Actor.hero", item: null, resource: "slots", delta: -1, slot: "pact", currency: "" } });
    expect(planCostPayment({ ...baseCost, type: "currency", subtype: "gp" }, option, payCtx))
      .toEqual({ kind: "operation", op: { kind: "resource", actor: "Actor.hero", item: null, resource: "currency", delta: -2, slot: "", currency: "gp" } });
    expect(planCostPayment({ ...baseCost, type: "hitdice", subtype: "d8" }, option, payCtx))
      .toEqual({ kind: "operation", op: { kind: "resource", actor: "Actor.hero", item: null, resource: "hitDice", delta: -2, slot: "d8", currency: "" } });
    expect(planCostPayment({ ...baseCost, type: "quantity" }, option, payCtx))
      .toEqual({ kind: "operation", op: { kind: "resource", actor: "Actor.hero", item: "Actor.hero.Item.wand", resource: "quantity", delta: -2, slot: "", currency: "" } });
    expect(planCostPayment({ ...baseCost, type: "inspiration" }, option, payCtx))
      .toEqual({ kind: "operation", op: { kind: "resource", actor: "Actor.hero", item: null, resource: "inspiration", delta: -1, slot: "", currency: "" } });
    expect(quantityValue(1, -3)).toBe(0);
  });
});
