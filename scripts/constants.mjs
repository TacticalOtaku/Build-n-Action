export const MODULE = {
  ID: "build-n-action",
  NAME: "Build-n-Action",
  ICON: "fa-solid fa-wand-magic-sparkles",
  CONSUMPTION_TYPES: {
    currency: "DND5E.Currency",
    effect: "BUILD_N_ACTION.FIELDS.consume.type.optionEffect",
    health: "DND5E.HitPoints",
    hitdice: "DND5E.HitDice",
    inspiration: "DND5E.Inspiration",
    quantity: "DND5E.Quantity",
    slots: "BUILD_N_ACTION.FIELDS.consume.type.optionSlots",
    uses: "DND5E.LimitedUses"
  },
  DISPOSITION_TYPES: {
    2: "BUILD_N_ACTION.FIELDS.aura.disposition.optionAny",
    1: "BUILD_N_ACTION.FIELDS.aura.disposition.optionAlly",
    "-1": "BUILD_N_ACTION.FIELDS.aura.disposition.optionEnemy"
  },
  HEALTH_PERCENTAGES_CHOICES: {
    0: "BUILD_N_ACTION.FIELDS.filters.healthPercentages.type.optionLT",
    1: "BUILD_N_ACTION.FIELDS.filters.healthPercentages.type.optionGT"
  },
  ATTACK_MODES_CHOICES: {
    offhand: "DND5E.ATTACK.Mode.Offhand",
    oneHanded: "DND5E.ATTACK.Mode.OneHanded",
    thrown: "DND5E.ATTACK.Mode.Thrown",
    "thrown-offhand": "DND5E.ATTACK.Mode.ThrownOffhand",
    twoHanded: "DND5E.ATTACK.Mode.TwoHanded"
  },
  SPELL_COMPONENT_CHOICES: {
    ANY: "BUILD_N_ACTION.FIELDS.filters.spellComponents.match.optionAny",
    ALL: "BUILD_N_ACTION.FIELDS.filters.spellComponents.match.optionAll"
  },
  TOKEN_SIZES_CHOICES: {
    0: "BUILD_N_ACTION.FIELDS.filters.tokenSizes.type.optionGT",
    1: "BUILD_N_ACTION.FIELDS.filters.tokenSizes.type.optionLT"
  },
  MODIFIER_MODES: {
    0: "BUILD_N_ACTION.MODIFIERS.FIELDS.mode.optionAdd",
    1: "BUILD_N_ACTION.MODIFIERS.FIELDS.mode.optionMultiply"
  }
};

/* -------------------------------------------------- */

export const SETTINGS = {
  AURA: "showAuraRanges",
  LABEL: "headerLabel",
  PLAYERS: "allowPlayers",
  SCRIPT: "disableCustomScriptFilter",
  FUMBLE: "allowFumbleNegation",
  SHEET_TAB: "showSheetTab",
  RADIUS: "padAuraRadius"
};
