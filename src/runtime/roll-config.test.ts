import { describe, expect, it } from "vitest";
import {
  addCriticalBonus, adjustCriticalRanges, adjustSavingThrowRanges, appendDamagePart, appendRollPart, injectTargetData,
  joinFormula, sanitizeCritical, type ProcessConfig
} from "./roll-config";

function damageConfig(): ProcessConfig {
  return {
    rolls: [
      { parts: ["1d8"], data: { mod: 3 }, options: { types: ["slashing"], properties: ["mgc"] } },
      { parts: ["1d6"], data: { mod: 3 }, options: { types: ["fire", "cold"] } }
    ]
  };
}

describe("roll parts and target data", () => {
  it("appends a part to every roll", () => {
    const config: ProcessConfig = { rolls: [{ parts: ["1d20"] }, {}] };
    appendRollPart(config, "1d4");
    expect(config.rolls?.map(roll => roll.parts)).toEqual([["1d20", "1d4"], ["1d4"]]);
  });

  it("puts the target's roll data on every roll", () => {
    const config: ProcessConfig = { data: {}, rolls: [{ parts: [] }] };
    injectTargetData(config, { ac: 15 });
    expect(config.data?.target).toEqual({ ac: 15 });
    expect(config.rolls?.[0]?.data?.target).toEqual({ ac: 15 });
  });

  it("replaces senses compatibility getters in the target data without touching the actor's data", () => {
    // dnd5e 5.3.3 SensesField._shim: enumerable, non-configurable getters that log a deprecation when read.
    let reads = 0;
    const senses = { ranges: { darkvision: 60 }, units: "ft" };
    Object.defineProperty(senses, "darkvision", { get: () => (reads++, 60), enumerable: true });
    const hp = { value: 7 };
    const token = new (class Token {})();
    const attributes = { senses, hp };
    const data = { attributes, token, list: [1, 2] };
    const config: ProcessConfig = { data: {}, rolls: [{}] };
    injectTargetData(config, data);

    const target = config.rolls?.[0]?.data?.target as typeof data;
    expect(target).toBe(config.data?.target);
    expect(Object.getOwnPropertyDescriptor(target.attributes.senses, "darkvision")).toMatchObject({ value: 60, enumerable: true });
    expect(target.attributes.senses).toEqual({ ranges: { darkvision: 60 }, units: "ft", darkvision: 60 });
    expect(reads).toBe(0);
    expect(Object.getOwnPropertyDescriptor(senses, "darkvision")?.get).toBeTypeOf("function");
    expect(data.attributes).toBe(attributes);
    expect([target.attributes.hp, target.token, target.list]).toEqual([hp, token, data.list]);
    expect(target.token).toBe(token);
  });

  it("passes target data without senses shims through unchanged", () => {
    const data = { attributes: { senses: { ranges: { darkvision: 60 } } } };
    const config: ProcessConfig = { rolls: [{}] };
    injectTargetData(config, data);
    expect(config.rolls?.[0]?.data?.target).toBe(data);
  });
});

describe("critical and fumble ranges", () => {
  it("widens critical and fumble ranges on every roll", () => {
    const config: ProcessConfig = { rolls: [{ options: { criticalSuccess: 19 } }, {}] };
    adjustCriticalRanges(config, 1, 1, false);
    expect(config.rolls?.map(roll => roll.options)).toEqual([{ criticalSuccess: 18, criticalFailure: 2 }, { criticalSuccess: 19, criticalFailure: 2 }]);
  });

  it("keeps the fumble range at 1 unless allowed to go below", () => {
    const config: ProcessConfig = { rolls: [{}] };
    adjustCriticalRanges(config, 0, -1, false);
    expect(config.rolls?.[0]?.options?.criticalFailure).toBe(1);
    adjustCriticalRanges(config, 25, -1, true);
    expect(config.rolls?.[0]?.options).toEqual({ criticalSuccess: 1, criticalFailure: 0 });
    adjustCriticalRanges(config, 0, 0, true);
    expect(config.rolls?.[0]?.options?.criticalFailure).toBe(0);
  });

  it("lowers a save target and a death save critical threshold", () => {
    const save: ProcessConfig = { target: 15, rolls: [{}] };
    adjustSavingThrowRanges(save, 2, 0, false);
    expect(save.target).toBe(13);
    const death: ProcessConfig = { target: 10, rolls: [{}] };
    adjustSavingThrowRanges(death, 1, 2, true);
    expect(death).toEqual({ target: 9, rolls: [{ options: { criticalSuccess: 18 } }] });
    const low: ProcessConfig = { target: 10, rolls: [{}] };
    adjustSavingThrowRanges(low, -15, 5, true);
    expect(low.target).toBe(15);
  });
});

describe("damage parts", () => {
  it("adds untyped bonuses to the first roll", () => {
    const config = damageConfig();
    appendDamagePart(config, "2", [], {});
    expect(config.rolls?.[0]?.parts).toEqual(["1d8", "2"]);
  });

  it("adds a typed bonus to a roll of that type, or a new roll", () => {
    const config = damageConfig();
    appendDamagePart(config, "1d4", ["cold"], {});
    expect(config.rolls?.[1]?.parts).toEqual(["1d6", "1d4"]);
    appendDamagePart(config, "1d4", ["radiant"], { level: 3 });
    expect(config.rolls?.[2]).toEqual({ data: { level: 3 }, parts: ["1d4"], options: { properties: ["mgc"], type: "radiant", types: ["radiant"] } });
  });

  it("puts a bonus with several types in its own roll", () => {
    const config = damageConfig();
    appendDamagePart(config, "1d6", ["fire", "cold"], {});
    expect(config.rolls?.[2]?.options).toEqual({ properties: ["mgc"], type: "fire", types: ["fire", "cold"] });
  });

  it("accumulates and sanitizes critical bonuses", () => {
    const config: ProcessConfig = { rolls: [] };
    addCriticalBonus(config, 1, "1d6");
    addCriticalBonus(config, -3, "2");
    expect(config.critical).toEqual({ bonusDice: -2, bonusDamage: "1d6 + 2" });
    sanitizeCritical(config, formula => !formula.includes("?"));
    expect(config.critical).toEqual({ bonusDice: 0, bonusDamage: "1d6 + 2" });
    addCriticalBonus(config, 0, "??");
    sanitizeCritical(config, formula => !formula.includes("?"));
    expect(config.critical?.bonusDamage).toBe("");
  });

  it("joins formulas", () => {
    expect(joinFormula("", "1d4")).toBe("1d4");
    expect(joinFormula("1d4", "")).toBe("1d4");
    expect(joinFormula("1d4", "2")).toBe("1d4 + 2");
  });
});
