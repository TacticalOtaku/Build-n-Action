import { describe, expect, it } from "vitest";
import { isValidId } from "../blueprint/ids";
import type { BlueprintSource } from "../blueprint/types";
import { validateBlueprintSource } from "../blueprint/validate";
import { lintBlueprint } from "../engine/lint";
import { convertLegacyBonus } from "./adapter";
import { LEGACY_FIXTURES } from "./fixtures";

function convert(raw: unknown, carrier: Parameters<typeof convertLegacyBonus>[1] = "item") {
  const result = convertLegacyBonus(raw, carrier);
  if (!result.blueprint) throw new Error("not converted");
  return { blueprint: result.blueprint, warnings: result.warnings };
}

function node(blueprint: BlueprintSource, id: string) {
  const found = blueprint.nodes.find(entry => entry.id === id);
  if (!found) throw new Error(`missing node ${id}`);
  return found;
}

function checks(blueprint: BlueprintSource) {
  return (node(blueprint, "condition").data.checks as { type: string; data: unknown }[]).map(check => [check.type, check.data]);
}

describe("convertLegacyBonus", () => {
  it("keeps identity and metadata", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.attackAura);
    expect(blueprint).toMatchObject({
      id: "LgAttackAura0001", name: "Bless-like aura", img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
      description: "<p>Allies gain a bonus.</p>", enabled: true, sort: 5
    });
    expect(blueprint.flags).toEqual({ world: { note: "keep me" }, "build-n-action": { migratedFrom: "1.0.6" } });
  });

  it("turns an aura into the event's reach", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.attackAura);
    expect(node(blueprint, "event")).toMatchObject({ kind: "event", type: "attackRoll" });
    expect(node(blueprint, "event").data.reach).toEqual({
      mode: "aura", range: "30", disposition: "1", includeSelf: true, blockers: ["incapacitated"],
      require: { sight: true, move: false, sound: false, light: false }
    });
  });

  it("turns filters into checks of one all-of condition", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.attackAura);
    expect(node(blueprint, "condition").data.mode).toBe("all");
    expect(checks(blueprint)).toEqual([
      ["itemTypes", { values: ["weapon", "spell"] }],
      ["creatureTypes", { values: ["undead", "!construct"] }],
      ["proficiencyLevels", { values: ["1", "2"] }],
      ["markers", { values: ["blessed"] }],
      ["targetMarkers", { values: ["cursed"] }]
    ]);
  });

  it("turns bonus fields into results behind the condition", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.attackAura);
    expect(node(blueprint, "rollBonus").data).toMatchObject({ formula: "1d4", damageTypes: [], common: { optional: false } });
    expect(node(blueprint, "critRange").data).toMatchObject({ critical: "1", fumble: "" });
    expect(blueprint.edges.map(edge => edge.id)).toEqual(["event-out-condition", "condition-yes-rollBonus", "condition-yes-critRange"]);
  });

  it("produces valid blueprints that only note the migration", () => {
    for (const [name, raw] of Object.entries(LEGACY_FIXTURES)) {
      const { blueprint } = convertLegacyBonus(raw, "item");
      if (!blueprint) continue;
      expect(validateBlueprintSource(blueprint).ok, name).toBe(true);
    }
    expect(lintBlueprint(convert(LEGACY_FIXTURES.attackAura).blueprint).map(issue => issue.code)).toEqual(["migrated"]);
  });

  it("converts an optional damage bonus with a cost and dice modifiers", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.damageOptional);
    const cost = { type: "slots", subtype: "", min: "1", max: "5", step: 1, scales: true, formula: "1d8" };
    expect(node(blueprint, "rollBonus").data).toMatchObject({
      formula: "2d8", damageTypes: ["radiant"],
      common: { optional: true, choiceGroup: "LgDamageOpt00002", cost, limit: "none" }
    });
    expect(node(blueprint, "diceModifiers").data).toMatchObject({
      reroll: { enabled: true, value: "2", invert: false, recursive: false, limit: "" },
      minimum: { enabled: true, value: "", maximize: true },
      firstOnly: true,
      common: { optional: true, choiceGroup: "LgDamageOpt00002", cost }
    });
    expect(checks(blueprint)).toEqual([
      ["healthPercentages", { value: 50, type: "atLeast" }],
      ["tokenSizes", { size: 2, type: "atLeast", self: false }]
    ]);
    expect(node(blueprint, "condition").data.thisItem).toBe(true);
  });

  it("skips filters v1 stored with their defaults but never turned on", () => {
    // v1 saved every filter with its initial values; a filter with a null type was off (its storage() test).
    const { blueprint } = convert({
      ...LEGACY_FIXTURES.attackAura,
      filters: { healthPercentages: { value: 50, type: null }, tokenSizes: { size: 2, type: null, self: false }, remainingSpellSlots: { min: null, max: null, size: false } }
    });
    expect(blueprint.nodes.some(entry => entry.kind === "condition")).toBe(false);
    expect(blueprint.edges.map(entry => [entry.source, entry.target])).toEqual([["event", "rollBonus"], ["event", "critRange"]]);
  });

  it("keeps every part of an optional bonus in one choice, as v1 applied them together", () => {
    const { blueprint, warnings } = convert(LEGACY_FIXTURES.optionalAttack);
    const common = { optional: true, choiceGroup: "LgOptAttack00011" };
    expect(node(blueprint, "rollBonus").data).toMatchObject({ formula: "1d8", common });
    expect(node(blueprint, "critRange").data).toMatchObject({ critical: "-1", common });
    expect(warnings).toEqual([]);
  });

  it("applies optional flags only where v1 honoured them", () => {
    const { blueprint, warnings } = convert(LEGACY_FIXTURES.saveDc);
    expect(node(blueprint, "event").type).toBe("saveDC");
    expect(node(blueprint, "dcBonus").data).toMatchObject({ formula: "1", common: { optional: false } });
    expect(warnings).toEqual([]);
    expect(checks(blueprint)).toEqual([["saveAbilities", { values: ["wis"] }], ["featureTypes", { type: "class", subtype: "" }]]);
  });

  it("applies v1 pre-migrations", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.throwOld);
    expect(node(blueprint, "saveThresholds").data).toMatchObject({ targetValue: "-2", deathSaveCritical: "" });
    expect(checks(blueprint)).toEqual([
      ["throwTypes", { values: ["death"] }],
      ["arbitraryComparisons", { comparisons: [{ one: "@attributes.hp.value", operator: "LT", other: "1" }] }]
    ]);
  });

  it("converts test bonuses with exclusions, components and scripts", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.testSkill);
    expect(node(blueprint, "event").type).toBe("abilityCheck");
    expect(checks(blueprint)).toEqual([
      ["skillIds", { values: ["ste", "!ath"] }],
      ["spellComponents", { types: ["vocal"], match: "all" }],
      ["customScripts", { script: "return true;" }]
    ]);
    expect(node(blueprint, "rollBonus").data).toMatchObject({ formula: "1d4", common: { optional: true } });
  });

  it("wires results straight from the event without filters", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.hitDie);
    expect(node(blueprint, "event").type).toBe("hitDie");
    expect(node(blueprint, "diceModifiers").data).toMatchObject({
      amount: { enabled: true, mode: "multiply", value: "2" }, minimum: { enabled: true, maximize: true }
    });
    expect(node(blueprint, "diceModifiers").position).toEqual({ x: 324, y: 0 });
    expect(blueprint.edges.map(edge => edge.id)).toEqual(["event-out-diceModifiers"]);
  });

  it("turns an optional reminder into a reminder result", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.reminder);
    expect(node(blueprint, "reminder").data).toMatchObject({ text: "You have advantage." });
  });

  it("maps template auras and region carriers", () => {
    expect(node(convert(LEGACY_FIXTURES.templateAura).blueprint, "event").data.reach)
      .toMatchObject({ mode: "template", disposition: "-1", includeSelf: false });
    expect(node(convert(LEGACY_FIXTURES.attackAura, "region").blueprint, "event").data.reach).toMatchObject({ mode: "region" });
    expect(node(convert(LEGACY_FIXTURES.testSkill, "template").blueprint, "event").data.reach).toMatchObject({ mode: "template" });
  });

  it("centres the event on the result column", () => {
    const { blueprint } = convert(LEGACY_FIXTURES.attackAura);
    expect(node(blueprint, "event").position).toEqual({ x: 0, y: 108 });
    expect(node(blueprint, "condition").position).toEqual({ x: 324, y: 108 });
    expect(node(blueprint, "critRange").position).toEqual({ x: 648, y: 198 });
  });

  it("reports unknown filters, invalid ids and unknown types", () => {
    expect(convert(LEGACY_FIXTURES.unknownFilter).warnings).toEqual([{ code: "unknownFilter", values: { filter: "moonPhase" } }]);
    const renamed = convert(LEGACY_FIXTURES.badId);
    expect(isValidId(renamed.blueprint.id)).toBe(true);
    expect(renamed.warnings).toEqual([{ code: "invalidId" }]);
    expect(renamed.blueprint.flags["build-n-action"]).toEqual({ migratedFrom: "1.0.6", legacyId: "short" });
    expect(convertLegacyBonus(LEGACY_FIXTURES.badId, "item", { fallbackId: "StableFallback01" }).blueprint?.id).toBe("StableFallback01");
    expect(convertLegacyBonus(LEGACY_FIXTURES.badType, "item")).toEqual({
      blueprint: null, warnings: [{ code: "unknownType", values: { type: "initiative" } }]
    });
  });

  it("does not modify the source", () => {
    const raw = structuredClone(LEGACY_FIXTURES.damageOptional);
    convertLegacyBonus(raw, "item");
    expect(raw).toEqual(LEGACY_FIXTURES.damageOptional);
  });
});
