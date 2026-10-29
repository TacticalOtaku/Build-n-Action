import { describe, expect, it } from "vitest";
import { isBlocked, matchDisposition, reachOutcome, regionTokensOutcome, type SourceContext } from "./reach";

function context(partial: Partial<SourceContext>): SourceContext {
  return {
    kind: "self", sourceDisposition: 1, rollerDisposition: 1, own: false, sourceStatuses: [], sourceImmunities: [],
    evaluateRange: formula => (formula.trim() ? Number(formula) : null),
    withinRange: () => true,
    ...partial
  };
}

const aura = (extra: Record<string, unknown> = {}) => ({
  mode: "aura", range: "30", disposition: "1", includeSelf: true, blockers: [], require: { sight: false, move: false }, ...extra
});

describe("dispositions", () => {
  it("matches any, allies and enemies like v1", () => {
    expect(matchDisposition("2", -1, 1)).toBe(true);
    expect(matchDisposition("1", 1, 1)).toBe(true);
    expect(matchDisposition("1", 0, 1)).toBe(false);
    expect(matchDisposition("-1", -1, 1)).toBe(true);
    expect(matchDisposition("-1", 0, 1)).toBe(false);
    expect(matchDisposition("-1", null, 1)).toBe(false);
  });

  it("blocks unless the creature is immune to the blocker", () => {
    expect(isBlocked(["incapacitated"], ["incapacitated"], [])).toBe(true);
    expect(isBlocked(["incapacitated"], ["incapacitated"], ["incapacitated"])).toBe(false);
    expect(isBlocked([], ["prone"], [])).toBe(false);
  });
});

describe("reachOutcome", () => {
  it("lets self blueprints affect their own rolls", () => {
    expect(reachOutcome({ mode: "self" }, context({})).pass).toBe(true);
    expect(reachOutcome(undefined, context({})).pass).toBe(true);
  });

  it("lets my aura affect me only when it includes me and is not blocked", () => {
    expect(reachOutcome(aura(), context({})).pass).toBe(true);
    expect(reachOutcome(aura({ includeSelf: false }), context({}))).toEqual({ pass: false, reason: { code: "outOfReach", values: { actual: "self" } } });
    expect(reachOutcome(aura({ blockers: ["dead"] }), context({ sourceStatuses: ["dead"] })).reason.values).toEqual({ actual: "blocked" });
  });

  it("leaves template and region blueprints to their template or region", () => {
    expect(reachOutcome({ mode: "template" }, context({})).pass).toBe(false);
    expect(reachOutcome({ mode: "region" }, context({})).pass).toBe(false);
  });

  it("applies another token's aura within range and disposition", () => {
    const token = (partial: Partial<SourceContext> = {}) => context({ kind: "token", ...partial });
    expect(reachOutcome(aura(), token()).pass).toBe(true);
    expect(reachOutcome({ mode: "self" }, token()).reason.values).toEqual({ actual: "self" });
    expect(reachOutcome(aura(), token({ sourceDisposition: -1 })).reason.values).toEqual({ actual: "disposition" });
    expect(reachOutcome(aura(), token({ withinRange: () => false })).reason.values).toEqual({ actual: "range" });
    expect(reachOutcome(aura({ range: "0" }), token()).reason.values).toEqual({ actual: "range" });
    expect(reachOutcome(aura({ range: "" }), token()).reason.values).toEqual({ actual: "range" });
    expect(reachOutcome(aura({ blockers: ["dead"] }), token({ sourceStatuses: ["dead"] })).reason.values).toEqual({ actual: "blocked" });
  });

  it("treats a range of -1 as unlimited and passes requirements to the geometry", () => {
    const calls: [number, readonly string[]][] = [];
    const token = context({ kind: "token", withinRange: (range, require) => { calls.push([range, require]); return true; } });
    expect(reachOutcome(aura({ range: "-1" }), token).pass).toBe(true);
    reachOutcome(aura({ require: { sight: true, move: false, light: true } }), token);
    expect(calls).toEqual([[-1, []], [30, ["sight", "light"]]]);
  });

  it("applies templates by ownership and disposition", () => {
    const template = (partial: Partial<SourceContext> = {}) => context({ kind: "template", ...partial });
    const mode = { mode: "template", disposition: "-1", includeSelf: false };
    expect(reachOutcome(mode, template({ sourceDisposition: -1 })).pass).toBe(true);
    expect(reachOutcome(mode, template({ sourceDisposition: 1 })).pass).toBe(false);
    expect(reachOutcome(mode, template({ own: true })).reason.values).toEqual({ actual: "self" });
    expect(reachOutcome({ ...mode, includeSelf: true }, template({ own: true })).pass).toBe(true);
    expect(reachOutcome(aura(), template()).pass).toBe(false);
  });

  it("applies region blueprints to tokens inside", () => {
    expect(reachOutcome({ mode: "region" }, context({ kind: "region" })).pass).toBe(true);
    expect(reachOutcome({ mode: "self" }, context({ kind: "region" })).pass).toBe(true);
    expect(reachOutcome(aura(), context({ kind: "region" })).pass).toBe(false);
  });
});

describe("regionTokensOutcome", () => {
  it("filters tokens by their own disposition", () => {
    expect(regionTokensOutcome("any", null).pass).toBe(true);
    expect(regionTokensOutcome("friendly", 1).pass).toBe(true);
    expect(regionTokensOutcome("friendly", -1).pass).toBe(false);
    expect(regionTokensOutcome("hostile", -1).pass).toBe(true);
    expect(regionTokensOutcome("hostile", null).pass).toBe(false);
  });
});
