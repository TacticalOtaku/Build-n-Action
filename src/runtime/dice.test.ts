import { describe, expect, it } from "vitest";
import { modifyDie, resolveModifiers, type DieLike, type ModifierSpec } from "./dice";

const off = { enabled: false, value: "" };

function spec(data: Record<string, unknown>): ModifierSpec {
  const resolved = resolveModifiers({
    amount: { ...off, mode: "add" }, size: { ...off, mode: "add" }, reroll: off, explode: off, minimum: off, maximum: off,
    firstOnly: false, ...data
  }, formula => (Number.isFinite(Number(formula)) ? Number(formula) : null));
  if (!resolved) throw new Error("no modifiers");
  return resolved;
}

function d8(modifiers: string[] = []): DieLike {
  return { number: 2, faces: 8, modifiers };
}

function apply(data: Record<string, unknown>, die = d8()): DieLike {
  modifyDie(die, spec(data));
  return die;
}

describe("resolveModifiers", () => {
  it("returns null when nothing is active", () => {
    expect(resolveModifiers({ reroll: off }, () => 1)).toBeNull();
    expect(resolveModifiers({ minimum: { enabled: true, value: "0" } }, Number)).toBeNull();
    expect(resolveModifiers({ amount: { enabled: true, value: "x", mode: "add" } }, () => null)).toBeNull();
  });

  it("rounds values and ignores non-positive limits", () => {
    const resolved = spec({ reroll: { enabled: true, value: "2.6", invert: false, recursive: true, limit: "-1" }, firstOnly: true });
    expect(resolved.reroll).toEqual({ value: 3, invert: false, recursive: true, limit: null });
    expect(resolved.firstOnly).toBe(true);
  });
});

describe("modifyDie", () => {
  it("changes the number and size of dice", () => {
    expect(apply({ amount: { enabled: true, mode: "multiply", value: "2" } }).number).toBe(4);
    expect(apply({ amount: { enabled: true, mode: "add", value: "-5" } }).number).toBe(0);
    expect(apply({ size: { enabled: true, mode: "add", value: "2" } }).faces).toBe(10);
  });

  it("rerolls low results", () => {
    const reroll = (value: string, extra: Record<string, unknown> = {}) =>
      apply({ reroll: { enabled: true, value, invert: false, recursive: false, limit: "", ...extra } }).modifiers;
    expect(reroll("")).toEqual(["r=1"]);
    expect(reroll("1")).toEqual(["r=1"]);
    expect(reroll("3")).toEqual(["r<3"]);
    expect(reroll("12")).toEqual(["r<8"]);
    expect(reroll("0")).toEqual(["r=1"]);
    expect(reroll("-2")).toEqual(["r<6"]);
    expect(reroll("1", { recursive: true })).toEqual(["rr=1"]);
    expect(reroll("1", { recursive: true, limit: "2" })).toEqual(["rr2=1"]);
  });

  it("rerolls high results when inverted", () => {
    const reroll = (value: string) => apply({ reroll: { enabled: true, value, invert: true, recursive: false, limit: "" } }).modifiers;
    expect(reroll("6")).toEqual(["r>6"]);
    expect(reroll("8")).toEqual(["r=8"]);
    expect(reroll("0")).toEqual(["r=8"]);
    expect(reroll("-3")).toEqual(["r>5"]);
  });

  it("explodes", () => {
    const explode = (value: string, extra: Record<string, unknown> = {}) =>
      apply({ explode: { enabled: true, value, once: false, limit: "", ...extra } }).modifiers;
    expect(explode("")).toEqual(["x"]);
    expect(explode("", { once: true })).toEqual(["xo"]);
    expect(explode("", { limit: "3" })).toEqual(["x3=8"]);
    expect(explode("7")).toEqual(["x>=7"]);
    expect(explode("9")).toEqual([]);
    expect(explode("-1")).toEqual(["x>=7"]);
  });

  it("sets minimums and maximums", () => {
    expect(apply({ minimum: { enabled: true, value: "", maximize: true } }).modifiers).toEqual(["min8"]);
    expect(apply({ minimum: { enabled: true, value: "3", maximize: false } }).modifiers).toEqual(["min3"]);
    expect(apply({ minimum: { enabled: true, value: "-2", maximize: false } }).modifiers).toEqual(["min6"]);
    expect(apply({ maximum: { enabled: true, value: "5", zero: false } }).modifiers).toEqual(["max5"]);
    expect(apply({ maximum: { enabled: true, value: "-2", zero: false } }).modifiers).toEqual(["max6"]);
    expect(apply({ maximum: { enabled: true, value: "0", zero: true } }).modifiers).toEqual(["max0"]);
    expect(apply({ maximum: { enabled: true, value: "8", zero: false } }).modifiers).toEqual([]);
  });

  it("leaves modifiers of the same kind alone", () => {
    const die = apply({ reroll: { enabled: true, value: "2", invert: false, recursive: false, limit: "" } }, d8(["r=1"]));
    expect(die.modifiers).toEqual(["r=1"]);
  });

  it("skips dice whose size is not a number", () => {
    const die = apply({ explode: { enabled: true, value: "", once: false, limit: "" } }, { number: 1, faces: null, modifiers: [] });
    expect(die.modifiers).toEqual([]);
  });
});
