import { describe, expect, it } from "vitest";
import { CHECKS, CONDITION_NODE_FIELDS } from "./checks";
import { defaultsFor } from "./fields";
import { getCheck } from "./index";
import { CHECK_CATEGORIES } from "./types";

describe("check definitions", () => {
  it("defines 38 uniquely named checks", () => {
    const types = CHECKS.map(check => check.type);
    expect(types).toHaveLength(38);
    expect(new Set(types).size).toBe(38);
  });

  it("covers every v1 filter plus thisItem and targetMarkers", () => {
    const v1 = [
      "abilities", "actorCreatureSizes", "actorCreatureTypes", "actorLanguages", "arbitraryComparisons",
      "attackModes", "baseArmors", "baseTools", "baseWeapons", "creatureTypes", "customScripts", "damageTypes",
      "featureTypes", "healthPercentages", "identifiers", "itemTypes", "markers", "preparationModes",
      "proficiencyLevels", "remainingSpellSlots", "saveAbilities", "skillIds", "sourceClasses", "spellComponents",
      "spellLevels", "spellSchools", "statusEffects", "targetArmors", "targetEffects", "throwTypes", "tokenSizes",
      "weaponProperties"
    ];
    for (const type of [...v1, "thisItem", "targetMarkers"]) expect(getCheck(type), type).toBeDefined();
  });

  it("uses every category", () => {
    expect(new Set(CHECKS.map(check => check.category))).toEqual(new Set(CHECK_CATEGORIES));
  });

  it("lets every check run behind a signal", () => {
    for (const check of CHECKS) expect(check.relevantTo, check.type).toContain("signal");
  });

  it("keeps item checks away from rolls without an item", () => {
    expect(getCheck("baseWeapons")?.relevantTo).not.toContain("savingThrow");
    expect(getCheck("skillIds")?.relevantTo).toEqual(["abilityCheck", "afterCheck", "signal"]);
    expect(getCheck("creatureTypes")?.relevantTo).not.toContain("hitDie");
  });

  it("defaults list checks to an empty selection", () => {
    expect(defaultsFor(getCheck("creatureTypes")?.fields ?? [])).toEqual({ values: [] });
    expect(defaultsFor(getCheck("tokenSizes")?.fields ?? [])).toEqual({ size: null, type: "atLeast", self: false });
    expect(defaultsFor(getCheck("thisItem")?.fields ?? [])).toEqual({});
  });

  it("allows exclusions only where v1 did", () => {
    const exclusion = (type: string) => {
      const field = getCheck(type)?.fields[0];
      return field?.kind === "multiselect" ? field.exclusion : undefined;
    };
    expect(exclusion("creatureTypes")).toBe(true);
    expect(exclusion("spellLevels")).toBe(false);
    expect(exclusion("throwTypes")).toBe(false);
  });

  it("defaults a condition node to 'all checks pass', not limited to this item", () => {
    expect(defaultsFor(CONDITION_NODE_FIELDS)).toEqual({ mode: "all", thisItem: false });
  });
});
