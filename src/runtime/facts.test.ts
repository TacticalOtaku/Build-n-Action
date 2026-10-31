import { describe, expect, it } from "vitest";
import { buildRollFacts, creatureTypes, markersOf, type RollInput } from "./facts";
import type { TraitTree } from "./traits";

const tools: TraitTree = { art: { label: "Artisan's Tools", children: { smith: { label: "Smith's Tools" } } } };
const languages: TraitTree = { standard: { children: { common: {}, dwarvish: {} } } };

function effect(active: boolean, markers: string[]) {
  return { active, flags: { "build-n-action": { markers } } };
}

function hero(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "Actor.hero",
    statuses: new Set(["blessed"]),
    flags: { "build-n-action": { markers: ["oath"] }, dnd5e: { diamondSoul: true } },
    allApplicableEffects: () => [effect(true, ["hex"]), effect(false, ["hidden"])],
    system: {
      details: { type: { value: "humanoid", subtype: "Elf / High Elf", custom: "" } },
      traits: { size: "med", languages: { value: new Set(["dwarvish"]) }, ci: { value: new Set(["charmed"]) } },
      attributes: {
        hp: { pct: 40 },
        ac: { calc: "default", equippedArmor: { system: { type: { value: "heavy", baseItem: "plate" } } }, equippedShield: null }
      },
      spells: { spell1: { level: 1, value: 2, max: 4 }, pact: { level: 3, value: 1, max: 1 } },
      skills: { ste: { prof: { multiplier: 2 } } },
      abilities: { dex: { checkProf: { multiplier: 0.5 }, saveProf: { multiplier: 1 } } },
      tools: { smith: { prof: { multiplier: 1 } } }
    },
    ...overrides
  };
}

const longsword = {
  uuid: "Actor.hero.Item.sword",
  type: "weapon",
  identifier: "longsword",
  flags: {},
  system: { type: { value: "martialM", baseItem: "longsword" }, properties: new Set(["ver"]), prof: { multiplier: 1 } }
};

const fireBolt = {
  uuid: "Actor.hero.Item.bolt",
  type: "spell",
  system: {
    identifier: "fire-bolt", level: 1, school: "evo", method: "spell", classIdentifier: "wizard",
    properties: new Set(["vocal", "somatic"]), prof: { multiplier: 1 }
  }
};

const attack = {
  type: "attack", ability: "str",
  attack: { type: { value: "melee", classification: "weapon" } },
  damage: { parts: [{ types: new Set(["slashing"]) }, { types: new Set(["fire"]) }] }
};

function input(partial: Partial<RollInput>): RollInput {
  return { event: "attackRoll", actor: hero(), token: { width: 1, height: 1 }, details: {}, ...partial };
}

describe("creature facts", () => {
  it("reads creature types like v1", () => {
    expect(creatureTypes(hero())).toEqual(["elf", "high elf", "humanoid"]);
    expect(creatureTypes({ system: { details: { type: { value: "custom", subtype: "", custom: "Ooze/Slime" } } } })).toEqual(["ooze", "slime"]);
    expect(creatureTypes({ system: {} })).toEqual([]);
  });

  it("collects markers from the document and its active effects", () => {
    expect(markersOf(hero())).toEqual(["oath", "hex"]);
  });
});

describe("buildRollFacts", () => {
  it("describes the roller", () => {
    const facts = buildRollFacts(input({}), { languages });
    expect(facts.actor).toEqual({
      uuid: "Actor.hero",
      creatureTypes: ["elf", "high elf", "humanoid"],
      size: "med",
      armor: ["plate", "heavy"],
      statuses: ["blessed"], effects: [],
      conditionImmunities: ["charmed"],
      markers: ["oath", "hex"],
      tokenSize: 1,
      languages: ["dwarvish", "standard"],
      hpPercent: 40,
      spellSlots: [{ level: 1, value: 2, max: 4 }, { level: 3, value: 1, max: 1 }]
    });
  });

  it("describes a weapon attack", () => {
    const facts = buildRollFacts(input({ item: longsword, activity: attack, details: { attackMode: "twoHanded" } }), {});
    expect(facts.item).toMatchObject({ type: "weapon", identifier: "longsword", baseTypes: ["martialM", "longsword"], properties: ["ver"], spell: null });
    expect(facts.activity).toEqual({
      type: "attack", ability: "str", attackType: "melee", attackClassification: "weapon",
      damageTypes: ["slashing", "fire"], dcAbility: null
    });
    expect(facts.roll).toMatchObject({ attackMode: "twoHanded", proficiency: 1 });
  });

  it("uses the cast level of a spell", () => {
    const facts = buildRollFacts(input({ event: "damageRoll", item: fireBolt, details: { spellLevel: 3 } }), {});
    expect(facts.item?.identifier).toBe("fire-bolt");
    expect(facts.item?.spell).toEqual({ level: 3, school: "evo", method: "spell", sourceClass: "wizard" });
    const stored = { ...fireBolt, system: { ...fireBolt.system, classIdentifier: undefined, sourceItem: "class:cleric" } };
    expect(buildRollFacts(input({ item: stored }), {}).item?.spell?.sourceClass).toBe("cleric");
  });

  it("reads the ability that sets a save DC", () => {
    const save = (calculation: string) => ({ type: "save", spellcastingAbility: "int", save: { dc: { calculation } } });
    expect(buildRollFacts(input({ event: "saveDC", activity: save("dex") }), {}).activity?.dcAbility).toBe("dex");
    expect(buildRollFacts(input({ event: "saveDC", activity: save("spellcasting") }), {}).activity?.dcAbility).toBe("int");
    expect(buildRollFacts(input({ event: "saveDC", activity: save("") }), {}).activity?.dcAbility).toBeNull();
  });

  it("reads healing types", () => {
    const heal = { type: "heal", healing: { types: new Set(["healing"]) } };
    expect(buildRollFacts(input({ activity: heal }), {}).activity?.damageTypes).toEqual(["healing"]);
  });

  it("chooses proficiency in v1 order", () => {
    const facts = (details: RollInput["details"], item?: unknown) => buildRollFacts(input({ details, item }), {}).roll.proficiency;
    expect(facts({ skillId: "ste", abilityId: "dex" })).toBe(2);
    expect(facts({ abilityId: "dex" })).toBe(0.5);
    expect(facts({ isDeath: true })).toBe(1);
    expect(facts({ saveAbility: "dex" })).toBe(1);
    expect(facts({ saveAbility: "wis" })).toBe(0);
    expect(facts({}, longsword)).toBe(1);
    expect(facts({ toolId: "smith", abilityId: "str" })).toBe(1);
    expect(facts({})).toBeNull();
  });

  it("describes checks, saves and tools", () => {
    const check = buildRollFacts(input({ event: "abilityCheck", details: { abilityId: "str", toolId: "smith" } }), { tool: tools });
    expect(check.roll).toMatchObject({ abilityId: "str", toolKeys: ["art", "smith"] });
    const save = buildRollFacts(input({ event: "savingThrow", details: { saveAbility: "con", isConcentration: true } }), {});
    expect(save.roll).toMatchObject({ saveAbility: "con", isConcentration: true, isDeath: false });
    expect(buildRollFacts(input({ details: { toolId: "lute" } }), {}).roll.toolKeys).toEqual(["lute"]);
  });

  it("describes the target token", () => {
    const target = { actor: hero({ uuid: "Actor.foe", statuses: new Set(["prone"]) }), document: { width: 2, height: 3 } };
    const facts = buildRollFacts(input({ target }), {});
    expect(facts.target).toMatchObject({ statuses: ["prone"], tokenSize: 3, creatureTypes: ["elf", "high elf", "humanoid"], hpPercent: 40 });
    expect(buildRollFacts(input({ target: { actor: null, document: {} } }), {}).target).toBeNull();
    expect(buildRollFacts(input({}), {}).target).toBeNull();
  });

  it("tolerates actors without hit points, spells or a token", () => {
    const facts = buildRollFacts(input({ actor: { uuid: "Actor.cart", system: {} }, token: null }), {});
    expect(facts.actor).toMatchObject({ hpPercent: null, spellSlots: [], tokenSize: null, armor: [], languages: [] });
  });
});

describe("effect facts", () => {
  it("collects applicable effects, preserving names, activity and exact sources", () => {
    const actor = hero({
      allApplicableEffects: () => [
        { name: "Метка (особая)", uuid: "Actor.hero.ActiveEffect.mark", active: true, origin: "Item.bow", flags: { "build-n-action": { effectSources: ["Item.bow.ActiveEffect.source"] } } },
        { name: "Disabled", uuid: "Actor.hero.ActiveEffect.off", active: false, _stats: { duplicateSource: "Item.staff.ActiveEffect.original" } }
      ],
      items: [{ effects: [{ name: "Not transferred", active: true }] }]
    });
    const result = buildRollFacts(input({ actor, target: { actor, document: {} } }), {});
    expect(result.actor.effects).toEqual([
      { name: "Метка (особая)", uuid: "Actor.hero.ActiveEffect.mark", active: true, sources: ["Actor.hero.ActiveEffect.mark", "Item.bow.ActiveEffect.source"] },
      { name: "Disabled", uuid: "Actor.hero.ActiveEffect.off", active: false, sources: ["Actor.hero.ActiveEffect.off", "Item.staff.ActiveEffect.original"] }
    ]);
    expect(result.target?.effects).toEqual(result.actor.effects);
  });
});
