import { describe, expect, it } from "vitest";
import { createBlueprint } from "../blueprint/factory";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import {
  counterDef, counterKey, counterName, counterResets, counterValue, formulaScope, nextCounterValue, readCounterStore,
  resetsOn, substituteCounters, substituteDeep, usedCounters
} from "./counters";

const rage = { name: "rage", min: 0, max: 3, initial: 0, reset: "longRest" } as const;
const store = readCounterStore({
  values: { rage: 2, "aB3dE5gH7jK9mN1p:hits": 1 },
  defs: { rage }
});
const blueprint = { id: "aB3dE5gH7jK9mN1p", counters: [{ name: "hits", min: 0, max: null, initial: 0, reset: "turnStart" as const }] };

describe("counter names and keys", () => {
  it("normalizes names into safe keys", () => {
    expect(counterName("  Ярость ")).toBe("ярость");
    expect(counterName("Curse  stacks.v2")).toBe("curse_stacks_v2");
  });

  it("keys shared counters by name and blueprint counters by blueprint", () => {
    expect(counterKey("actor", "rage", "aB3dE5gH7jK9mN1p")).toBe("rage");
    expect(counterKey("blueprint", "hits", "aB3dE5gH7jK9mN1p")).toBe("aB3dE5gH7jK9mN1p:hits");
  });
});

describe("counter values", () => {
  it("reads stored values, else the initial value, else 0", () => {
    expect(counterValue(store, "actor", "rage", blueprint)).toBe(2);
    expect(counterValue(store, "blueprint", "hits", blueprint)).toBe(1);
    expect(counterValue(store, "actor", "unknown", blueprint)).toBe(0);
    expect(counterValue(readCounterStore({ defs: { ki: { initial: 4 } } }), "actor", "ki", blueprint)).toBe(4);
  });

  it("finds definitions of both kinds, with defaults for unknown names", () => {
    expect(counterDef(store, "actor", "rage", blueprint)).toEqual(rage);
    expect(counterDef(store, "blueprint", "hits", blueprint).reset).toBe("turnStart");
    expect(counterDef(store, "actor", "nope", blueprint)).toEqual({ name: "nope", min: 0, max: null, initial: 0, reset: "manual" });
  });

  it("looks up formula names in the blueprint first, then shared", () => {
    expect(formulaScope(store, "hits", blueprint)).toBe("blueprint");
    expect(formulaScope(store, "rage", blueprint)).toBe("actor");
  });

  it("adds, subtracts, sets and resets within the limits", () => {
    expect(nextCounterValue(2, "add", 5, rage)).toBe(3);
    expect(nextCounterValue(2, "subtract", 5, rage)).toBe(0);
    expect(nextCounterValue(2, "set", 1, rage)).toBe(1);
    expect(nextCounterValue(2, "reset", 9, rage)).toBe(0);
    expect(nextCounterValue(2, "add", 1.7, { ...rage, max: null })).toBe(3);
  });
});

describe("counter resets", () => {
  it("resets short-rest counters on both rests", () => {
    expect(resetsOn("shortRest", "shortRest")).toBe(true);
    expect(resetsOn("longRest", "shortRest")).toBe(true);
    expect(resetsOn("shortRest", "longRest")).toBe(false);
    expect(resetsOn("turnStart", "turnStart")).toBe(true);
    expect(resetsOn("longRest", "manual")).toBe(false);
  });

  it("lists the values a rest or a turn resets", () => {
    expect(counterResets(store, [blueprint], "longRest")).toEqual({ rage: 0 });
    expect(counterResets(store, [blueprint], "turnStart")).toEqual({ "aB3dE5gH7jK9mN1p:hits": 0 });
  });
});

describe("formulas", () => {
  it("replaces my and the target's counters with numbers", () => {
    const mine = (name: string) => ({ rage: 2, ярость: 3 } as Record<string, number>)[name] ?? 0;
    expect(substituteCounters("1d6 + @counters.rage + @counters.Ярость", mine, null)).toBe("1d6 + 2 + 3");
    expect(substituteCounters("@target.counters.curse * 2", mine, name => (name === "curse" ? 4 : 0))).toBe("4 * 2");
    expect(substituteCounters("@target.counters.curse", mine, null)).toBe("0");
    expect(substituteCounters("@abilities.str.mod", mine, null)).toBe("@abilities.str.mod");
  });

  it("replaces inside nested data", () => {
    expect(substituteDeep({ a: "@counters.x", b: [{ c: "@counters.x + 1" }], n: 3 }, text => text.replace("@counters.x", "7")))
      .toEqual({ a: "7", b: [{ c: "7 + 1" }], n: 3 });
  });
});

describe("usedCounters", () => {
  it("lists counters from nodes and formulas once", () => {
    const source = createBlueprint({
      id: "aB3dE5gH7jK9mN1p",
      counters: [{ name: "hits", min: 0, max: null, initial: 0, reset: "turnStart" }],
      nodes: [
        makeNode("event", "afterAttack", "ev"),
        makeCondition("if", [{ id: "c1", type: "counter", data: { name: "Rage", scope: "actor", whose: "self", operator: "GE", value: "1" } }]),
        makeNode("result", "counter", "add", { name: "hits", scope: "blueprint", action: "add", amount: "1", who: "self" }),
        makeNode("result", "rollBonus", "bonus", { formula: "@counters.hits + @counters.rage" })
      ],
      edges: [makeEdge("ev", "hit", "if"), makeEdge("if", "yes", "add")]
    });
    expect(usedCounters(source)).toEqual([{ name: "rage", scope: "actor" }, { name: "hits", scope: "blueprint" }]);
  });
});
