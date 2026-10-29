import { describe, expect, it } from "vitest";
import { compileBlueprint } from "../core/engine/compile";
import { createRider, readRiders, riderApplies, riderBlueprint, riderExpired, useRider, type RiderClock } from "./riders";

const clock = (partial: Partial<RiderClock> = {}): RiderClock => ({
  time: 1000, combatId: "c1", round: 2, turn: 1, combatants: 4, shortRests: 0, longRests: 0, ...partial
});

const source = { name: "Divine Smite", origin: "Actor.hero.Item.smite", blueprintId: "aB3dE5gH7jK9mN1p", nodeId: "rider" };

function rider(data: Record<string, unknown>, now = clock(), activation: string | null = "midi:card") {
  const created = createRider({
    effect: { type: "rollBonus", data: { formula: "2d8", damageTypes: ["radiant"] } },
    scope: "sameActivation", roll: "attackRoll", who: "self", duration: { unit: "uses", value: 1 }, ...data
  }, { id: "RiderRiderRider01", activation, clock: now, source });
  if (!created) throw new Error("no rider");
  return created;
}

describe("createRider", () => {
  it("builds a same-activation rider with uses", () => {
    expect(rider({})).toEqual({
      id: "RiderRiderRider01", created: 1000,
      effect: { type: "rollBonus", data: { formula: "2d8", damageTypes: ["radiant"] } },
      scope: "sameActivation", roll: null, activation: "midi:card", uses: 1, until: null, source
    });
  });

  it("builds next-roll riders with their roll", () => {
    expect(rider({ scope: "nextRoll", roll: "savingThrow" })).toMatchObject({ scope: "nextRoll", roll: "savingThrow", activation: null });
    expect(rider({ scope: "nextRoll", roll: "hitDie" }).roll).toBe("attackRoll");
  });

  it("measures rounds and turns in the current combat, or lasts one use outside combat", () => {
    expect(rider({ duration: { unit: "rounds", value: 2 } }).until).toEqual({ kind: "rounds", count: 2, combatId: "c1", round: 2, turn: 1, combatants: 4 });
    expect(rider({ duration: { unit: "turns", value: 3 } }, clock({ combatId: null }))).toMatchObject({ uses: 1, until: null });
    expect(rider({ duration: { unit: "untilRest" } }).until).toEqual({ kind: "rest", shortRests: 0, longRests: 0 });
  });

  it("only carries roll changes", () => {
    expect(createRider({ effect: { type: "applyEffect", data: {} } }, { id: "x", activation: null, clock: clock(), source })).toBeNull();
    expect(createRider({ effect: null }, { id: "x", activation: null, clock: clock(), source })).toBeNull();
  });
});

describe("riderExpired", () => {
  it("ends when uses run out", () => {
    expect(riderExpired(rider({}), clock())).toBe(false);
    expect(riderExpired(useRider(rider({})), clock())).toBe(true);
  });

  it("ends rounds and turns riders after enough turns in the same combat", () => {
    const rounds = rider({ duration: { unit: "rounds", value: 1 } });
    expect(riderExpired(rounds, clock({ round: 2, turn: 3 }))).toBe(false);
    expect(riderExpired(rounds, clock({ round: 3, turn: 1 }))).toBe(true);
    const turns = rider({ duration: { unit: "turns", value: 2 } });
    expect(riderExpired(turns, clock({ turn: 2 }))).toBe(false);
    expect(riderExpired(turns, clock({ turn: 3 }))).toBe(true);
    expect(riderExpired(turns, clock({ combatId: "c2" }))).toBe(true);
  });

  it("ends rest riders on any rest and drops stale same-activation riders", () => {
    const rest = rider({ duration: { unit: "untilRest" } });
    expect(riderExpired(rest, clock({ shortRests: 1 }))).toBe(true);
    expect(riderExpired(rider({}), clock({ time: 1000 + 3_600_001 }))).toBe(true);
  });
});

describe("riderApplies", () => {
  it("matches the same activation on compatible rolls", () => {
    const smite = rider({});
    expect(riderApplies(smite, "damageRoll", "midi:card")).toBe(true);
    expect(riderApplies(smite, "damageRoll", "midi:other")).toBe(false);
    expect(riderApplies(smite, "hitDie", "midi:card")).toBe(true);
    expect(riderApplies(rider({ effect: { type: "critRange", data: { critical: "1" } } }), "damageRoll", "midi:card")).toBe(false);
    expect(riderApplies(rider({}, clock(), null), "damageRoll", null)).toBe(false);
  });

  it("matches the next roll of its kind", () => {
    const next = rider({ scope: "nextRoll", roll: "attackRoll" });
    expect(riderApplies(next, "attackRoll", null)).toBe(true);
    expect(riderApplies(next, "damageRoll", null)).toBe(false);
  });
});

describe("rider storage and blueprint", () => {
  it("becomes a blueprint with one path for the roll", () => {
    const blueprint = riderBlueprint(rider({}), "damageRoll");
    expect(blueprint).toMatchObject({ id: "RiderRiderRider01", name: "Divine Smite", enabled: true });
    const paths = compileBlueprint(blueprint).pathsFor("damageRoll");
    expect(paths).toHaveLength(1);
    expect(paths[0]?.result.data).toMatchObject({ formula: "2d8", common: { optional: false, limit: "none" } });
  });

  it("reads stored riders and drops malformed entries", () => {
    expect(readRiders([rider({}), null, { id: 3 }, { id: "x", effect: {}, scope: "nextRoll" }])).toEqual([rider({})]);
    expect(readRiders("nope")).toEqual([]);
    expect(readRiders({ [rider({}).id]: rider({}), junk: { id: 3 } })).toEqual([rider({})]);
  });
});
