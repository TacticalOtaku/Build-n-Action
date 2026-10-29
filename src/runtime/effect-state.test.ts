import { describe, expect, it } from "vitest";
import { effectSummary } from "./effect-state";

describe("effectSummary", () => {
  it("reads the state as the collector does", () => {
    expect(effectSummary({ disabled: false, active: true, modifiesActor: true }).state).toBe("active");
    expect(effectSummary({ disabled: true, active: false, modifiesActor: true }).state).toBe("disabled");
    expect(effectSummary({ disabled: false, active: false, modifiesActor: true }).state).toBe("suppressed");
    expect(effectSummary({ disabled: false, active: false, modifiesActor: true, duration: { expired: true } }).state).toBe("expired");
    expect(effectSummary({ disabled: false, active: false, modifiesActor: true, duration: { expired: false }, _source: { duration: { expired: true } } }).state).toBe("expired");
    expect(effectSummary({ disabled: false, active: true, modifiesActor: false }).state).toBe("suppressed");
    expect(effectSummary({ disabled: false, active: true, modifiesActor: false, isAppliedEnchantment: true }).state).toBe("active");
  });

  it("reads DAE's conditions and special durations", () => {
    const summary = effectSummary({
      disabled: false, active: true, modifiesActor: true,
      flags: { dae: { disableCondition: " @attributes.hp.value <= 0 ", enableCondition: "", specialDuration: ["zeroHP", "turnStart"] } }
    });
    expect(summary).toEqual({
      state: "active", disableCondition: "@attributes.hp.value <= 0", enableCondition: null, specialDurations: ["zeroHP", "turnStart"]
    });
  });

  it("copes with an effect without DAE flags", () => {
    expect(effectSummary({ disabled: false, active: true, modifiesActor: true })).toMatchObject({
      disableCondition: null, enableCondition: null, specialDurations: []
    });
  });
});
