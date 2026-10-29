import { describe, expect, it } from "vitest";
import { matchesSearch } from "./text-search";

describe("matchesSearch", () => {
  it("matches any text, ignoring case, ё/е and surrounding space", () => {
    expect(matchesSearch("  ЁЖ ", "ежик")).toBe(true);
    expect(matchesSearch("smite", "Divine Smite")).toBe(true);
    expect(matchesSearch("bless", "Divine Smite", "Adds 2d8")).toBe(false);
    expect(matchesSearch("", "anything")).toBe(true);
  });
});
