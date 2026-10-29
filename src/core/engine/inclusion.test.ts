import { describe, expect, it } from "vitest";
import { hasIncluded, matchValues, splitSelection } from "./inclusion";

describe("splitSelection", () => {
  it("separates exclusions marked with one or more !", () => {
    expect(splitSelection(["undead", "!fiend", "!!beast", ""])).toEqual({ included: ["undead"], excluded: ["fiend", "beast"] });
  });

  it("knows when something must match", () => {
    expect(hasIncluded(["!fiend"])).toBe(false);
    expect(hasIncluded(["undead", "!fiend"])).toBe(true);
  });
});

describe("matchValues", () => {
  it("passes an empty selection", () => {
    expect(matchValues(["humanoid"], [])).toEqual({ pass: true, reason: { code: "empty" } });
  });

  it("passes when an included value matches", () => {
    expect(matchValues(["humanoid", "elf"], ["elf", "dwarf"])).toEqual({ pass: true, reason: { code: "matched", values: { actual: "humanoid, elf" } } });
  });

  it("fails when no included value matches", () => {
    expect(matchValues(["humanoid"], ["undead"])).toEqual({
      pass: false, reason: { code: "notMatched", values: { actual: "humanoid", expected: "undead" } }
    });
  });

  it("fails when an excluded value matches", () => {
    expect(matchValues(["undead"], ["!undead", "!construct"])).toEqual({ pass: false, reason: { code: "excluded", values: { actual: "undead" } } });
  });

  it("passes exclusions that do not match", () => {
    expect(matchValues(["beast"], ["!undead"]).pass).toBe(true);
  });

  it("shows a dash when there is nothing to compare", () => {
    expect(matchValues([], ["undead"]).reason.values).toEqual({ actual: "—", expected: "undead" });
  });
});
