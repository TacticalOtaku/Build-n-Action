import { describe, expect, it } from "vitest";
import { choicesFor, type ChoiceSourceData } from "./choice-sources";

const data: ChoiceSourceData = {
  localize: key => `~${key}`,
  dnd5e: {
    abilities: { str: { label: "DND5E.AbilityStr" }, dex: { label: "DND5E.AbilityDex" } },
    actorSizes: { med: { label: "DND5E.SizeMedium" } },
    armorTypes: { light: "DND5E.EquipmentLight", shield: "DND5E.EquipmentShield" },
    attackClassifications: { weapon: { label: "DND5E.ATTACK.Classification.Weapon" } },
    attackModes: { twoHanded: { label: "DND5E.ATTACK.Mode.TwoHanded" } },
    attackTypes: { melee: { label: "DND5E.ATTACK.Type.Melee" } },
    creatureTypes: { undead: { label: "DND5E.CreatureUndead" } },
    currencies: { gp: { label: "DND5E.CurrencyGP" } },
    damageTypes: { fire: { label: "DND5E.DamageFire" } },
    healingTypes: { healing: { label: "DND5E.Healing" } },
    featureTypes: { class: { label: "DND5E.Feature.Class" } },
    proficiencyLevels: { 0: "DND5E.NotProficient", 0.5: "DND5E.HalfProficient", 1: "DND5E.Proficient", 2: "DND5E.Expertise" },
    skills: { ste: { label: "DND5E.SkillSte" } },
    itemProperties: { vocal: { label: "DND5E.ComponentVerbal" }, ver: { label: "DND5E.Item.Property.Versatile" }, mgc: { label: "DND5E.Item.Property.Magical" } },
    validProperties: { spell: new Set(["vocal"]), weapon: new Set(["ver", "mgc"]) },
    spellLevels: { 0: "DND5E.SpellLevel0", 1: "DND5E.SpellLevel1", 2: "DND5E.SpellLevel2" },
    spellcasting: { spell: { label: "DND5E.SPELLCASTING.METHODS.Spell.label" }, pact: { label: "DND5E.SPELLCASTING.METHODS.Pact.label" } },
    spellSchools: { evo: { label: "DND5E.SchoolEvo" } },
    weaponTypes: { simpleM: "DND5E.WeaponSimpleM", martialM: "DND5E.WeaponMartialM" }
  },
  statusEffects: [{ id: "prone", name: "EFFECT.StatusProne" }, { id: "dead", name: "EFFECT.StatusDead" }, { name: "no id" }],
  itemTypes: { weapon: "TYPES.Item.weapon", spell: "TYPES.Item.spell" },
  trees: {
    languages: { standard: { label: "Standard", children: { common: { label: "Common" } } } },
    tool: { art: { label: "Artisan's Tools", children: { smith: { label: "Smith's Tools" } } } },
    weapon: {
      mar: { label: "Martial", children: { longsword: { label: "Longsword" } } },
      sim: { label: "Simple", children: { club: { label: "Club" } } }
    }
  },
  effects: [{ id: "fx1", name: "Bless" }]
};

describe("choicesFor", () => {
  it("reads records of labels or label objects", () => {
    expect(choicesFor("abilities", data)).toEqual([
      { value: "str", label: "~DND5E.AbilityStr" }, { value: "dex", label: "~DND5E.AbilityDex" }
    ]);
    expect(choicesFor("armorTypes", data).map(choice => choice.value)).toEqual(["light", "shield"]);
    expect(choicesFor("proficiencyLevels", data).map(choice => choice.value)).toEqual(["0", "1", "2", "0.5"]);
  });

  it("joins damage and healing types", () => {
    expect(choicesFor("damageAndHealingTypes", data).map(choice => choice.value)).toEqual(["fire", "healing"]);
  });

  it("filters item properties per item type", () => {
    expect(choicesFor("spellComponents", data).map(choice => choice.value)).toEqual(["vocal"]);
    expect(choicesFor("weaponProperties", data).map(choice => choice.value)).toEqual(["ver", "mgc"]);
  });

  it("lists spell levels, slot levels and casting methods", () => {
    expect(choicesFor("spellLevels", data).map(choice => choice.value)).toEqual(["0", "1", "2"]);
    expect(choicesFor("spellSlotLevels", data)).toEqual([
      { value: "spell1", label: "~DND5E.SpellLevel1" },
      { value: "spell2", label: "~DND5E.SpellLevel2" },
      { value: "pact", label: "~DND5E.SpellLevelPact" }
    ]);
    expect(choicesFor("spellMethods", data).map(choice => choice.value)).toEqual(["spell", "pact"]);
  });

  it("flattens language and tool trees with their category as group", () => {
    expect(choicesFor("languages", data)).toEqual([
      { value: "standard", label: "~Standard" }, { value: "common", label: "~Common", group: "~Standard" }
    ]);
    expect(choicesFor("tools", data).map(choice => choice.value)).toEqual(["art", "smith"]);
  });

  it("lists weapon categories and base weapons, not the tree's own categories", () => {
    expect(choicesFor("weaponTypes", data)).toEqual([
      { value: "simpleM", label: "~DND5E.WeaponSimpleM" },
      { value: "martialM", label: "~DND5E.WeaponMartialM" },
      { value: "longsword", label: "~Longsword", group: "~Martial" },
      { value: "club", label: "~Club", group: "~Simple" }
    ]);
  });

  it("reads statuses, item types, throw types and the carrier's effects", () => {
    expect(choicesFor("statusEffects", data)).toEqual([
      { value: "prone", label: "~EFFECT.StatusProne" }, { value: "dead", label: "~EFFECT.StatusDead" }
    ]);
    expect(choicesFor("itemTypes", data).map(choice => choice.value)).toEqual(["weapon", "spell"]);
    expect(choicesFor("throwTypes", data).map(choice => choice.value)).toEqual(["str", "dex", "death", "concentration"]);
    expect(choicesFor("documentEffects", data)).toEqual([{ value: "fx1", label: "Bless" }]);
  });

  it("returns nothing for missing data", () => {
    expect(choicesFor("skills", { ...data, dnd5e: {} })).toEqual([]);
    expect(choicesFor("languages", { ...data, trees: {} })).toEqual([]);
  });
});
