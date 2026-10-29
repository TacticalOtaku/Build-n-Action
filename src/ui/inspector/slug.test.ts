import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Long Sword", "long-sword"],
    ["  fire-bolt  ", "fire-bolt"],
    ["Hunter's Mark!", "hunters-mark"],
    ["метка  охотника", "метка-охотника"],
    ["--a---b--", "a-b"],
    ["!!!", ""]
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
