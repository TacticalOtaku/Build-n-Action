import { describe, expect, it } from "vitest";
import { setIn } from "./immutable";

describe("setIn", () => {
  it("replaces a nested value without mutating the source", () => {
    const source = { reach: { mode: "self", require: { sight: false } }, other: [1] };
    const result = setIn(source, ["reach", "require", "sight"], true);
    expect(result).toEqual({ reach: { mode: "self", require: { sight: true } }, other: [1] });
    expect(source.reach.require.sight).toBe(false);
    expect(result.other).toBe(source.other);
  });

  it("creates missing objects along the path", () => {
    expect(setIn({}, ["cost", "type"], "slots")).toEqual({ cost: { type: "slots" } });
  });

  it("updates array entries by index", () => {
    expect(setIn({ list: ["a", "b"] }, ["list", "1"], "c")).toEqual({ list: ["a", "c"] });
  });

  it("returns the value for an empty path", () => {
    expect(setIn({ a: 1 }, [], 5)).toBe(5);
  });
});
