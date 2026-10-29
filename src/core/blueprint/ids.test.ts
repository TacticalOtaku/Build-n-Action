import { describe, expect, it } from "vitest";
import { isValidId, randomId } from "./ids";

describe("randomId", () => {
  it("creates 16 alphanumeric characters by default", () => {
    expect(randomId()).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it("honours a custom length", () => {
    expect(randomId(8)).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it("does not repeat across calls", () => {
    const ids = new Set(Array.from({ length: 500 }, () => randomId()));
    expect(ids.size).toBe(500);
  });
});

describe("isValidId", () => {
  it("accepts Foundry-style document ids", () => {
    expect(isValidId("aB3dE5gH7jK9mN1p")).toBe(true);
  });

  it.each([["short"], [42], [null], ["aB3dE5gH7jK9mN1!"], ["aB3dE5gH7jK9mN1pX"]])("rejects %s", value => {
    expect(isValidId(value)).toBe(false);
  });
});
