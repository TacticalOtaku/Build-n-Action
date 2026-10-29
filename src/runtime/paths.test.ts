import { describe, expect, it } from "vitest";
import { rollDataPaths } from "./paths";

describe("rollDataPaths", () => {
  it("lists leaf values as @ paths, sorted", () => {
    const data = { abilities: { str: { mod: 3, value: 16 } }, prof: 2, name: "Aria", flags: { hidden: true } };
    expect(rollDataPaths(data)).toEqual(["@abilities.str.mod", "@abilities.str.value", "@flags.hidden", "@name", "@prof"]);
  });

  it("stops at the depth limit and survives cycles and functions", () => {
    const data: Record<string, unknown> = { a: { b: { c: { d: { e: 1 } } } }, f: () => 1 };
    data.self = data;
    expect(rollDataPaths(data, 3)).toEqual([]);
    expect(rollDataPaths(data, 5)).toEqual(["@a.b.c.d.e"]);
  });

  it("skips arrays and returns nothing for non-objects", () => {
    expect(rollDataPaths({ list: [1, 2], n: 1 })).toEqual(["@n"]);
    expect(rollDataPaths(null)).toEqual([]);
    expect(rollDataPaths(7)).toEqual([]);
  });

  it("never reads getters, where dnd5e keeps its deprecated keys", () => {
    let read = 0;
    const senses = { ranges: { darkvision: 60 } };
    Object.defineProperty(senses, "darkvision", { enumerable: true, get: () => { read++; return 60; } });
    expect(rollDataPaths({ attributes: { senses } })).toEqual(["@attributes.senses.ranges.darkvision"]);
    expect(read).toBe(0);
  });
});
