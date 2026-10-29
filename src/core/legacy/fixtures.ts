/** Representative v1.0.6 bonus sources (as stored in flags.build-n-action.bonuses). */
export const LEGACY_FIXTURES = {
  attackAura: {
    id: "LgAttackAura0001", type: "attack", name: "Bless-like aura", img: "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    description: "<p>Allies gain a bonus.</p>", enabled: true, sort: 5, exclusive: false, optional: false, reminder: false,
    bonuses: { bonus: "1d4", criticalRange: "1", fumbleRange: "" },
    aura: {
      enabled: true, template: false, range: "30", self: true, disposition: 1, blockers: ["incapacitated"],
      require: { sight: true, move: false, sound: false, light: false }
    },
    filters: {
      itemTypes: ["weapon", "spell"], creatureTypes: ["undead", "!construct"], proficiencyLevels: [1, 2],
      markers: { values: ["blessed"], target: ["cursed"] }
    },
    consume: { enabled: false, type: "", subtype: "", scales: false, formula: "", value: { min: "", max: "", step: 1 } },
    flags: { world: { note: "keep me" } }
  },
  damageOptional: {
    id: "LgDamageOpt00002", type: "damage", name: "Divine smite", optional: true, exclusive: true,
    bonuses: {
      bonus: "2d8", damageType: "radiant", criticalBonusDice: "", criticalBonusDamage: "",
      modifiers: {
        config: { first: true },
        amount: { enabled: false, mode: 0, value: "" },
        size: { enabled: false, mode: 0, value: "" },
        reroll: { enabled: true, value: "2", invert: false, recursive: false, limit: "" },
        explode: { enabled: false, value: "", once: false, limit: "" },
        minimum: { enabled: true, value: "-1" },
        maximum: { enabled: false, value: "", zero: false }
      }
    },
    consume: { enabled: true, type: "slots", subtype: "", scales: true, formula: "1d8", value: { min: "1", max: "5", step: 1 } },
    filters: { spellLevels: [], healthPercentages: { value: 50, type: 1 }, tokenSizes: { size: 2, type: 0, self: false } }
  },
  optionalAttack: {
    id: "LgOptAttack00011", type: "attack", name: "Precise strike", optional: true,
    bonuses: { bonus: "1d8", criticalRange: "-1", fumbleRange: "" }
  },
  throwOld: {
    id: "LgThrowOld000003", type: "throw", name: "Death ward",
    bonuses: { bonus: "", deathSaveTargetValue: "-2", deathSaveCritical: "" },
    filters: { throwTypes: ["death"], arbitraryComparison: [{ one: "@attributes.hp.value", operator: "LT", other: "1" }] }
  },
  testSkill: {
    id: "LgTestSkill00004", type: "test", name: "Guidance", optional: true, bonuses: { bonus: "1d4" },
    filters: { skillIds: ["ste", "!ath"], spellComponents: { types: ["vocal"], match: "ALL" }, customScripts: "return true;" }
  },
  hitDie: {
    id: "LgHitDie00000005", type: "hitdie", name: "Durable",
    bonuses: { bonus: "", modifiers: { minimum: { enabled: true, value: "", maximize: true }, amount: { enabled: true, mode: 1, value: "2" } } }
  },
  saveDc: {
    id: "LgSaveDc00000006", type: "save", name: "Rod of the pact keeper", optional: true, bonuses: { bonus: "1" },
    filters: { saveAbilities: ["wis"], featureTypes: { type: "class", subtype: "" } }
  },
  reminder: {
    id: "LgReminder000007", type: "attack", name: "Charm resistance",
    description: "<p>You have <strong>advantage</strong>.</p>", optional: true, reminder: true, bonuses: { bonus: "" }
  },
  templateAura: {
    id: "LgTemplate000008", type: "damage", name: "Spirit guardians",
    bonuses: { bonus: "1d8", damageType: ["radiant"] }, aura: { enabled: true, isTemplate: true, self: false, disposition: -1 }
  },
  unknownFilter: { id: "LgUnknown0000009", type: "test", name: "Moon", bonuses: { bonus: "1" }, filters: { moonPhase: ["full"] } },
  badId: { id: "short", type: "test", name: "No id", bonuses: { bonus: "1" } },
  badType: { id: "LgBadType0000010", type: "initiative", name: "Unknown", bonuses: {} }
} as const;
