import { describe, expect, it } from "vitest";
import { readCounterStore } from "../core/counters/counters";
import { planCounter } from "./counters";

const blueprint = { id: "aB3dE5gH7jK9mN1p", counters: [{ name: "hits", min: 0, max: 3, initial: 0, reset: "manual" as const }] };
const store = readCounterStore({ values: { rage: 2, "aB3dE5gH7jK9mN1p:hits": 3 }, defs: { rage: { max: 5 } } });
const ctx = { self: "Actor.me", target: "Actor.foe", blueprint, amount: 2 };

describe("planCounter", () => {
  it("carries the change for my shared counter, with its limits from the actor", () => {
    expect(planCounter({ name: "Rage", scope: "actor", action: "add", who: "self" }, ctx, store))
      .toMatchObject({ kind: "counter", actor: "Actor.me", key: "rage", action: "add", amount: 2, def: { max: 5 } });
  });

  it("carries a blueprint counter's limits from the blueprint", () => {
    expect(planCounter({ name: "hits", scope: "blueprint", action: "add", who: "self" }, ctx, store))
      .toMatchObject({ kind: "counter", actor: "Actor.me", key: "aB3dE5gH7jK9mN1p:hits", action: "add", amount: 2, def: { max: 3 } });
  });

  it("changes the target's counter, and nothing without a target or a name", () => {
    expect(planCounter({ name: "curse", scope: "actor", action: "set", who: "target" }, ctx, store))
      .toMatchObject({ kind: "counter", actor: "Actor.foe", key: "curse", action: "set", amount: 2 });
    expect(planCounter({ name: "curse", scope: "actor", action: "set", who: "target" }, { ...ctx, target: null }, store)).toBeNull();
    expect(planCounter({ name: " ", scope: "actor", action: "add", who: "self" }, ctx, store)).toBeNull();
  });
});
