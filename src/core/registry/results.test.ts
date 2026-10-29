import { describe, expect, it } from "vitest";
import { REACTION_EVENTS, TRIGGER_EVENTS } from "./constants";
import { defaultsFor } from "./fields";
import { getResult, hasDefinition } from "./index";
import { COMMON_RESULT_FIELDS, RESULTS, ROLL_RESULT_TYPES } from "./results";

describe("result definitions", () => {
  it("defines 14 uniquely named results", () => {
    const types = RESULTS.map(result => result.type);
    expect(types).toEqual([
      "rollBonus", "dcBonus", "diceModifiers", "critRange", "critDamage", "saveThresholds", "reminder",
      "rider", "applyEffect", "removeEffect", "resource", "signal", "demandSave", "counter"
    ]);
  });

  it("keeps roll changes off reaction events", () => {
    for (const type of ROLL_RESULT_TYPES) {
      for (const event of REACTION_EVENTS) expect(getResult(type)?.compatibleEvents, `${type}/${event}`).not.toContain(event);
    }
  });

  it("offers reaction results only after a roll, on a signal, on a trigger without a roll or after \"And then\"", () => {
    expect(getResult("applyEffect")?.compatibleEvents).toEqual([...REACTION_EVENTS, "signal", ...TRIGGER_EVENTS, "afterResult", "demandedSave"]);
  });

  it("lets only results that leave the roll alone follow \"And then\"", () => {
    const after = RESULTS.filter(result => result.compatibleEvents.includes("afterResult")).map(result => result.type);
    expect(after).toEqual(["reminder", "rider", "applyEffect", "removeEffect", "resource", "signal", "demandSave", "counter"]);
  });

  it("demands a save with its own outputs, after rolls are decided", () => {
    const demand = getResult("demandSave");
    expect(demand?.pins).toEqual(["succeeded", "failed"]);
    expect(demand?.supportsOptional).toBe(false);
    expect(demand?.compatibleEvents).toEqual([...REACTION_EVENTS, "signal", ...TRIGGER_EVENTS, "afterResult", "demandedSave"]);
    expect(defaultsFor(demand?.fields ?? [])).toEqual({
      ability: "con", dcMode: "formula", dc: "13", who: "target", range: "10", disposition: "-1", includeSelf: false, advantage: "normal"
    });
  });

  it("lets the reaction results follow a demanded save", () => {
    const after = RESULTS.filter(result => result.compatibleEvents.includes("demandedSave")).map(result => result.type);
    expect(after).toEqual(["rider", "applyEffect", "removeEffect", "resource", "signal", "demandSave", "counter"]);
  });

  it("changes a counter where resources change", () => {
    expect(getResult("counter")?.compatibleEvents).toEqual(getResult("resource")?.compatibleEvents);
    expect(defaultsFor(getResult("counter")?.fields ?? [])).toEqual({ name: "", scope: "actor", action: "add", amount: "1", who: "self" });
  });

  it("lets a rider carry exactly the roll changes", () => {
    const field = getResult("rider")?.fields.find(f => f.key === "effect");
    expect(field?.kind === "embeddedResult" ? field.allowed : []).toEqual(ROLL_RESULT_TYPES);
  });

  it("marks which results can be optional", () => {
    const optional = RESULTS.filter(result => result.supportsOptional).map(result => result.type);
    expect(optional).toEqual([
      "rollBonus", "diceModifiers", "critRange", "critDamage", "saveThresholds",
      "rider", "applyEffect", "removeEffect", "resource", "signal", "counter"
    ]);
  });

  it("defaults the roll bonus", () => {
    expect(defaultsFor(getResult("rollBonus")?.fields ?? [])).toEqual({ formula: "", damageTypes: [] });
  });

  it("defaults the common result properties", () => {
    expect(defaultsFor(COMMON_RESULT_FIELDS)).toEqual({
      optional: false,
      choiceGroup: "",
      cost: { type: "none", subtype: "", min: "1", max: "", step: 1, scales: false, formula: "" },
      limit: "none",
      then: false
    });
  });

  it("reports damage flavor from the bonus and through a rider", () => {
    expect(getResult("rollBonus")?.flavor({ formula: "1d6", damageTypes: ["fire", "!cold"] })).toEqual(["fire"]);
    expect(getResult("rider")?.flavor({ effect: { type: "rollBonus", data: { damageTypes: ["radiant"] } } })).toEqual(["radiant"]);
    expect(getResult("resource")?.flavor({})).toEqual([]);
  });

  it("knows which node types exist", () => {
    expect(hasDefinition("event", "attackRoll")).toBe(true);
    expect(hasDefinition("condition", "condition")).toBe(true);
    expect(hasDefinition("result", "signal")).toBe(true);
    expect(hasDefinition("result", "attackRoll")).toBe(false);
  });
});
