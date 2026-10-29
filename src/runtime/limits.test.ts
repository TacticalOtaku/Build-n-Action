import { describe, expect, it } from "vitest";
import { limitAvailable, usageKey, type UsageClock } from "./limits";

const clock = (partial: Partial<UsageClock> = {}): UsageClock => ({
  combatId: "c1", round: 2, turn: 3, shortRests: 1, longRests: 1, ...partial
});

describe("limitAvailable", () => {
  it("is available before the first use", () => {
    expect(limitAvailable(null, clock(), "turn")).toBe(true);
  });

  it("allows once per turn", () => {
    expect(limitAvailable(clock(), clock(), "turn")).toBe(false);
    expect(limitAvailable(clock(), clock({ turn: 4 }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ round: 3, turn: 3 }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ combatId: "c2" }), "turn")).toBe(true);
  });

  it("allows once per round", () => {
    expect(limitAvailable(clock(), clock({ turn: 5 }), "round")).toBe(false);
    expect(limitAvailable(clock(), clock({ round: 3 }), "round")).toBe(true);
  });

  it("does not limit turns and rounds outside combat", () => {
    expect(limitAvailable(clock({ combatId: null }), clock({ combatId: null }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ combatId: null }), "round")).toBe(true);
  });

  it("resets on rests, a long rest counting as a short one", () => {
    expect(limitAvailable(clock(), clock(), "shortRest")).toBe(false);
    expect(limitAvailable(clock(), clock({ shortRests: 2 }), "shortRest")).toBe(true);
    expect(limitAvailable(clock(), clock({ longRests: 2 }), "shortRest")).toBe(true);
    expect(limitAvailable(clock(), clock({ shortRests: 2 }), "longRest")).toBe(false);
    expect(limitAvailable(clock(), clock({ longRests: 2 }), "longRest")).toBe(true);
  });

  it("builds flag-safe keys", () => {
    expect(usageKey("aB3dE5gH7jK9mN1p", "rollBonus")).toBe("aB3dE5gH7jK9mN1p_rollBonus");
  });
});
