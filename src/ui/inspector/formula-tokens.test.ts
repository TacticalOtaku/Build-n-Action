import { describe, expect, it } from "vitest";
import { insertPath, matchPaths, tokenAt } from "./formula-tokens";

describe("tokenAt", () => {
  it("finds the @ token that ends at the caret", () => {
    expect(tokenAt("1d6 + @abil", 11)).toEqual({ start: 6, end: 11, query: "abil" });
    expect(tokenAt("@", 1)).toEqual({ start: 0, end: 1, query: "" });
    expect(tokenAt("@abilities.str.mod + 2", 14)).toEqual({ start: 0, end: 18, query: "abilities.str" });
  });

  it("returns null outside a token", () => {
    expect(tokenAt("1d6 + 2", 7)).toBeNull();
    expect(tokenAt("@prof + 2", 9)).toBeNull();
    expect(tokenAt("a@b", 3)).toBeNull();
  });
});

describe("matchPaths", () => {
  const paths = ["@abilities.cha.mod", "@abilities.str.mod", "@attributes.prof", "@prof", "@details.level"];

  it("puts prefix matches first, then other matches, up to the limit", () => {
    expect(matchPaths(paths, "pro")).toEqual(["@prof", "@attributes.prof"]);
    expect(matchPaths(paths, "mod", 1)).toEqual(["@abilities.cha.mod"]);
    expect(matchPaths(paths, "")).toHaveLength(5);
  });
});

describe("insertPath", () => {
  it("replaces the token and puts the caret after it", () => {
    expect(insertPath("1d6 + @abil", { start: 6, end: 11, query: "abil" }, "@abilities.str.mod"))
      .toEqual({ text: "1d6 + @abilities.str.mod", caret: 24 });
    expect(insertPath("@abilities.str.mod + 2", { start: 0, end: 18, query: "abilities.str" }, "@abilities.cha.mod"))
      .toEqual({ text: "@abilities.cha.mod + 2", caret: 18 });
  });
});
