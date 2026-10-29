import { describe, expect, it } from "vitest";
import { CHECKS } from "../registry/index";
import { activityFacts, actorFacts, creatureFacts, itemFacts, rollDetails, rollFacts } from "../testing/facts";
import { EVALUATORS, evaluateCheck, type CheckEnv } from "./evaluators";

const env: CheckEnv = {
  evaluateNumber: formula => {
    const value = Number(formula.replace("@target.hp", "7").replace("@level", "5"));
    return Number.isFinite(value) ? value : null;
  },
  replaceData: text => text.replace("@name", "Aria"),
  runScript: script => {
    if (script === "disabled") return null;
    if (script === "untrusted") return "untrusted";
    if (script === "throw") throw new Error("boom");
    return script === "return true";
  },
  carrierItemUuid: "Actor.hero.Item.sword"
};

const spell = itemFacts({
  uuid: "Actor.hero.Item.bolt", type: "spell", identifier: "fire-bolt", baseTypes: [], properties: ["vocal", "somatic"],
  spell: { level: 0, school: "evo", method: "spell", sourceClass: "wizard" }
});

type Case = [string, string, Record<string, unknown>, ReturnType<typeof rollFacts>, boolean, string];

const cases: Case[] = [
  ["itemTypes matches", "itemTypes", { values: ["weapon"] }, rollFacts(), true, "matched"],
  ["itemTypes needs an item", "itemTypes", { values: ["weapon"] }, rollFacts({ item: null }), false, "noItem"],
  ["identifiers", "identifiers", { values: ["dagger"] }, rollFacts(), false, "notMatched"],
  ["baseWeapons by base item", "baseWeapons", { values: ["longsword"] }, rollFacts(), true, "matched"],
  ["baseWeapons by category", "baseWeapons", { values: ["martialM"] }, rollFacts(), true, "matched"],
  ["baseWeapons on a spell with only exclusions", "baseWeapons", { values: ["!dagger"] }, rollFacts({ item: spell }), true, "notWeapon"],
  ["baseWeapons on a spell with inclusions", "baseWeapons", { values: ["dagger"] }, rollFacts({ item: spell }), false, "notWeapon"],
  ["weaponProperties exclusion", "weaponProperties", { values: ["!ver"] }, rollFacts(), false, "excluded"],
  ["attackModes all criteria", "attackModes", { value: ["melee"], classification: ["weapon"], mode: ["twoHanded"] },
    rollFacts({ roll: rollDetails({ attackMode: "twoHanded" }) }), true, "matched"],
  ["attackModes wrong mode", "attackModes", { value: [], classification: [], mode: ["offhand"] },
    rollFacts({ roll: rollDetails({ attackMode: "twoHanded" }) }), false, "notMatched"],
  ["attackModes ignores non-attacks", "attackModes", { value: ["ranged"], classification: [], mode: [] },
    rollFacts({ activity: activityFacts({ type: "save" }) }), true, "noActivity"],
  ["featureTypes wrong item", "featureTypes", { type: "class", subtype: "" }, rollFacts(), false, "notFeature"],
  ["featureTypes subtype", "featureTypes", { type: "class", subtype: "channelDivinity" },
    rollFacts({ item: itemFacts({ type: "feat", featureType: "class", featureSubtype: "channelDivinity" }) }), true, "matched"],
  ["damageTypes", "damageTypes", { values: ["fire"] }, rollFacts(), false, "notMatched"],
  ["damageTypes needs an activity", "damageTypes", { values: ["fire"] }, rollFacts({ activity: null }), false, "noActivity"],
  ["abilities of the activity", "abilities", { values: ["str"] }, rollFacts(), true, "matched"],
  ["abilities of a tool check", "abilities", { values: ["dex"] },
    rollFacts({ activity: null, roll: rollDetails({ abilityId: "dex", toolKeys: ["thief"] }) }), true, "matched"],
  ["abilities without an ability", "abilities", { values: ["str"] }, rollFacts({ activity: activityFacts({ ability: null }) }), false, "noValue"],
  ["thisItem on the carrier", "thisItem", {}, rollFacts(), true, "matched"],
  ["thisItem on another item", "thisItem", {}, rollFacts({ item: spell }), false, "otherItem"],
  ["spellLevels", "spellLevels", { values: ["0", "1"] }, rollFacts({ item: spell }), true, "matched"],
  ["spellLevels needs a spell", "spellLevels", { values: ["0"] }, rollFacts(), false, "notSpell"],
  ["spellSchools exclusion", "spellSchools", { values: ["!evo"] }, rollFacts({ item: spell }), false, "excluded"],
  ["spellComponents any", "spellComponents", { types: ["material", "vocal"], match: "any" }, rollFacts({ item: spell }), true, "matched"],
  ["spellComponents all", "spellComponents", { types: ["material", "vocal"], match: "all" }, rollFacts({ item: spell }), false, "notMatched"],
  ["preparationModes", "preparationModes", { values: ["pact"] }, rollFacts({ item: spell }), false, "notMatched"],
  ["sourceClasses passes non-spells", "sourceClasses", { values: ["cleric"] }, rollFacts(), true, "notSpell"],
  ["sourceClasses", "sourceClasses", { values: ["wizard"] }, rollFacts({ item: spell }), true, "matched"],
  ["actorCreatureTypes", "actorCreatureTypes", { values: ["!undead"] }, rollFacts(), true, "matched"],
  ["actorCreatureSizes", "actorCreatureSizes", { values: ["sm"] }, rollFacts(), false, "notMatched"],
  ["actorLanguages by category", "actorLanguages", { values: ["standard"] }, rollFacts(), true, "matched"],
  ["baseArmors without armour", "baseArmors", { values: ["heavy"] }, rollFacts(), false, "notMatched"],
  ["baseArmors exclusion without armour", "baseArmors", { values: ["!heavy"] }, rollFacts(), true, "matched"],
  ["statusEffects", "statusEffects", { values: ["raging"] }, rollFacts({ actor: actorFacts({ statuses: ["raging"] }) }), true, "matched"],
  ["statusEffects ignores immunities", "statusEffects", { values: ["poisoned"] },
    rollFacts({ actor: actorFacts({ conditionImmunities: ["poisoned"] }) }), true, "empty"],
  ["healthPercentages at most", "healthPercentages", { value: 50, type: "atMost" }, rollFacts({ actor: actorFacts({ hpPercent: 40 }) }), true, "matched"],
  ["healthPercentages at least", "healthPercentages", { value: 50, type: "atLeast" }, rollFacts({ actor: actorFacts({ hpPercent: 40 }) }), false, "threshold"],
  ["healthPercentages without hit points", "healthPercentages", { value: 50, type: "atMost" }, rollFacts({ actor: actorFacts({ hpPercent: null }) }), false, "noValue"],
  ["remainingSpellSlots counts slots", "remainingSpellSlots", { min: 2, max: null, size: false },
    rollFacts({ actor: actorFacts({ spellSlots: [{ level: 1, value: 1, max: 4 }, { level: 2, value: 1, max: 3 }] }) }), true, "matched"],
  ["remainingSpellSlots counts levels", "remainingSpellSlots", { min: null, max: 2, size: true },
    rollFacts({ actor: actorFacts({ spellSlots: [{ level: 1, value: 1, max: 4 }, { level: 2, value: 1, max: 3 }] }) }), false, "threshold"],
  ["proficiencyLevels", "proficiencyLevels", { values: ["2"] }, rollFacts({ roll: rollDetails({ proficiency: 2 }) }), true, "matched"],
  ["proficiencyLevels unknown", "proficiencyLevels", { values: ["1"] }, rollFacts(), false, "noValue"],
  ["markers on the item or actor", "markers", { values: ["hex"] }, rollFacts({ actor: actorFacts({ markers: ["hex"] }) }), true, "matched"],
  ["creatureTypes of the target", "creatureTypes", { values: ["undead"] }, rollFacts(), false, "notMatched"],
  ["creatureTypes without a target", "creatureTypes", { values: ["undead"] }, rollFacts({ target: null }), false, "noTarget"],
  ["creatureTypes exclusion without a target", "creatureTypes", { values: ["!undead"] }, rollFacts({ target: null }), true, "noTarget"],
  ["targetArmors", "targetArmors", { values: ["shield"] }, rollFacts({ target: creatureFacts({ armor: ["shield", "leather"] }) }), true, "matched"],
  ["targetEffects", "targetEffects", { values: ["prone"] }, rollFacts({ target: creatureFacts({ statuses: ["prone"] }) }), true, "matched"],
  ["targetHealthPercentages at most", "targetHealthPercentages", { value: 50, type: "atMost" },
    rollFacts({ target: creatureFacts({ hpPercent: 30 }) }), true, "matched"],
  ["targetHealthPercentages ignores my hit points", "targetHealthPercentages", { value: 50, type: "atMost" },
    rollFacts({ actor: actorFacts({ hpPercent: 10 }), target: creatureFacts({ hpPercent: 80 }) }), false, "threshold"],
  ["targetHealthPercentages without hit points", "targetHealthPercentages", { value: 50, type: "atLeast" },
    rollFacts({ target: creatureFacts({ hpPercent: null }) }), false, "noValue"],
  ["targetHealthPercentages without a target", "targetHealthPercentages", { value: 50, type: "atMost" }, rollFacts({ target: null }), false, "noTarget"],
  ["targetHealthPercentages empty without a target", "targetHealthPercentages", { value: null, type: "atMost" }, rollFacts({ target: null }), true, "empty"],
  ["tokenSizes at least", "tokenSizes", { size: 2, type: "atLeast", self: false }, rollFacts(), false, "threshold"],
  ["tokenSizes compared with me", "tokenSizes", { size: 1, type: "atLeast", self: true },
    rollFacts({ actor: actorFacts({ tokenSize: 2 }), target: creatureFacts({ tokenSize: 3 }) }), true, "matched"],
  ["tokenSizes without a target", "tokenSizes", { size: 1, type: "atMost", self: false }, rollFacts({ target: null }), false, "noTarget"],
  ["targetMarkers", "targetMarkers", { values: ["hunters-mark"] }, rollFacts({ target: creatureFacts({ markers: ["hunters-mark"] }) }), true, "matched"],
  ["saveAbilities", "saveAbilities", { values: ["wis"] }, rollFacts({ activity: activityFacts({ type: "save", dcAbility: "wis" }) }), true, "matched"],
  ["saveAbilities without a save", "saveAbilities", { values: ["wis"] }, rollFacts(), false, "noValue"],
  ["throwTypes death", "throwTypes", { values: ["death"] }, rollFacts({ roll: rollDetails({ isDeath: true }) }), true, "matched"],
  ["throwTypes concentration", "throwTypes", { values: ["concentration"] },
    rollFacts({ roll: rollDetails({ saveAbility: "con", isConcentration: true }) }), true, "matched"],
  ["skillIds", "skillIds", { values: ["ste"] }, rollFacts({ roll: rollDetails({ skillId: "ste" }) }), true, "matched"],
  ["skillIds on a non-skill roll", "skillIds", { values: ["ste"] }, rollFacts(), false, "noValue"],
  ["baseTools by category", "baseTools", { values: ["art"] }, rollFacts({ roll: rollDetails({ toolKeys: ["smith", "art"] }) }), true, "matched"],
  ["comparisons with numbers", "arbitraryComparisons", { comparisons: [{ one: "@target.hp", operator: "LT", other: "10" }] }, rollFacts(), true, "matched"],
  ["comparisons failing", "arbitraryComparisons", { comparisons: [{ one: "@level", operator: "GE", other: "7" }] }, rollFacts(), false, "comparisonFailed"],
  ["comparisons with text", "arbitraryComparisons", { comparisons: [{ one: "ria", operator: "LT", other: "@name" }] }, rollFacts(), true, "matched"],
  ["comparisons need both sides", "arbitraryComparisons", { comparisons: [{ one: "", operator: "EQ", other: "1" }] }, rollFacts(), false, "comparisonFailed"],
  ["script true", "customScripts", { script: "return true" }, rollFacts(), true, "matched"],
  ["script false", "customScripts", { script: "return false" }, rollFacts(), false, "scriptFalse"],
  ["script error", "customScripts", { script: "throw" }, rollFacts(), false, "scriptError"],
  ["scripts disabled", "customScripts", { script: "disabled" }, rollFacts(), true, "scriptDisabled"],
  ["another player's script", "customScripts", { script: "untrusted" }, rollFacts(), false, "scriptUntrusted"]
];

describe("evaluators", () => {
  it("cover every registry check", () => {
    expect(Object.keys(EVALUATORS).sort()).toEqual(CHECKS.map(check => check.type).sort());
  });

  it.each(cases)("%s", (_name, type, data, facts, pass, code) => {
    const outcome = evaluateCheck(type, data, facts, env);
    expect(outcome.pass).toBe(pass);
    expect(outcome.reason.code).toBe(code);
  });

  it("passes every check with default (empty) data", () => {
    for (const check of CHECKS) {
      const data = Object.fromEntries(check.fields.map(field => [field.key, "default" in field ? field.default : null]));
      expect(evaluateCheck(check.type, data, rollFacts({ item: itemFacts({ uuid: env.carrierItemUuid ?? "" }) }), env).pass, check.type).toBe(true);
    }
  });

  it("fails unknown checks", () => {
    expect(evaluateCheck("nope", {}, rollFacts(), env)).toEqual({ pass: false, reason: { code: "noValue" } });
  });

  it("reports comparison details", () => {
    const outcome = evaluateCheck("arbitraryComparisons", { comparisons: [{ one: "@level", operator: "GE", other: "7" }] }, rollFacts(), env);
    expect(outcome.reason.values).toEqual({ left: "@level", operator: "≥", right: "7" });
  });
});

describe("counter check", () => {
  const values: Record<string, number> = { "self:actor:rage": 2, "target:blueprint:curse": 3 };
  const counterEnv: CheckEnv = { ...env, counter: (name, scope, whose) => values[`${whose}:${scope}:${name}`] ?? 0 };

  it.each([
    [{ name: "Rage", scope: "actor", whose: "self", operator: "GE", value: "2" }, true],
    [{ name: "rage", scope: "actor", whose: "self", operator: "NE", value: "2" }, false],
    [{ name: "curse", scope: "blueprint", whose: "target", operator: "GT", value: "2" }, true],
    [{ name: "unknown", scope: "actor", whose: "self", operator: "EQ", value: "0" }, true]
  ])("compares %o", (data, pass) => {
    expect(evaluateCheck("counter", data, rollFacts(), counterEnv).pass).toBe(pass);
  });

  it("reads 0 when the host has no counters", () => {
    expect(evaluateCheck("counter", { name: "rage", scope: "actor", whose: "self", operator: "EQ", value: "0" }, rollFacts(), env).pass).toBe(true);
  });
});
