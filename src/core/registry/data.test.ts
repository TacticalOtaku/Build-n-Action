import { describe, expect, it } from "vitest";
import { asBoolean, asNumber, asRecord, asString, asStrings } from "./data";

describe("node data readers", () => {
  it("reads strings with a fallback", () => {
    expect(asString("a")).toBe("a");
    expect(asString(3)).toBe("");
    expect(asString(undefined, "self")).toBe("self");
  });

  it("keeps only string entries of arrays", () => {
    expect(asStrings(["a", 1, "b", null])).toEqual(["a", "b"]);
    expect(asStrings("a")).toEqual([]);
  });

  it("reads finite numbers only", () => {
    expect(asNumber(2)).toBe(2);
    expect(asNumber(Number.NaN)).toBeNull();
    expect(asNumber("2")).toBeNull();
  });

  it("treats only true as true", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean("true")).toBe(false);
  });

  it("reads plain objects and rejects arrays and null", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([1])).toEqual({});
    expect(asRecord(null)).toEqual({});
  });
});
