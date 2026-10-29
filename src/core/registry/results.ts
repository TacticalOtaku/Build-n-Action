import { counterName } from "../counters/counters";
import { STATIC } from "./choices";
import { REACTION_EVENTS, TRIGGER_EVENTS, type EventType } from "./constants";
import { asBoolean, asNumber, asRecord, asString, asStrings } from "./data";
import type { ChoiceSpec, FieldSpec } from "./fields";
import type { PhraseFormatter, ResultDefinition } from "./types";

const DIALOG_ROLLS: readonly EventType[] = ["attackRoll", "damageRoll", "savingThrow", "abilityCheck", "hitDie", "signal"];
const REACTIONS: readonly EventType[] = [...REACTION_EVENTS, "signal"];
/** Events without a roll: results that change a roll do not fit. */
const TRIGGERS: readonly EventType[] = TRIGGER_EVENTS;
/** After a result's "And then" output: the roll is already decided. */
const AFTER_RESULT: readonly EventType[] = ["afterResult"];
/** After a demanded save's outcome outputs. */
const AFTER_SAVE: readonly EventType[] = ["demandedSave"];
const DAMAGE_TYPES: ChoiceSpec = { source: "damageAndHealingTypes" };
const WHO: ChoiceSpec = { static: STATIC.who };

/** Result types that change a roll; a rider can carry any of them to a later roll. */
export const ROLL_RESULT_TYPES: readonly string[] = [
  "rollBonus", "diceModifiers", "critRange", "critDamage", "saveThresholds", "reminder"
];

function formula(key: string, label: string, hint?: string, initial = ""): FieldSpec {
  return { key, kind: "formula", label, hint, default: initial };
}

function whoField(result: string, initial: "self" | "target"): FieldSpec {
  return { key: "who", kind: "select", label: `BNA.Result.${result}.Field.who`, default: initial, choices: WHO };
}

/* -------------------------------------------------- */
/*   Common properties (node.data.common)             */
/* -------------------------------------------------- */

const COUNTED_COSTS = ["uses", "quantity", "slots", "health", "hitdice", "currency"];

export const COMMON_RESULT_FIELDS: readonly FieldSpec[] = [
  { key: "optional", kind: "toggle", label: "BNA.Field.optional.label", hint: "BNA.Field.optional.hint", default: false },
  {
    key: "choiceGroup", kind: "text", label: "BNA.Field.choiceGroup.label", hint: "BNA.Field.choiceGroup.hint",
    default: "", visibleWhen: { key: "optional", in: [true] }
  },
  {
    key: "cost", kind: "group", label: "BNA.Field.cost.label", hint: "BNA.Field.cost.hint",
    visibleWhen: { key: "optional", in: [true] },
    fields: [
      {
        key: "type", kind: "select", label: "BNA.Field.costType.label", hint: "BNA.Field.costType.hint",
        default: "none", choices: { static: STATIC.costType }
      },
      {
        key: "subtype", kind: "select", label: "BNA.Field.costCurrency.label", default: "",
        choices: { source: "currencies" }, visibleWhen: { key: "type", in: ["currency"] }
      },
      {
        key: "subtype", kind: "select", label: "BNA.Field.costHitDie.label", default: "",
        choices: { static: STATIC.hitDieSize }, visibleWhen: { key: "type", in: ["hitdice"] }
      },
      { ...formula("min", "BNA.Field.costMin.label", "BNA.Field.costMin.hint", "1"), visibleWhen: { key: "type", in: COUNTED_COSTS } },
      { ...formula("max", "BNA.Field.costMax.label", "BNA.Field.costMax.hint"), visibleWhen: { key: "type", in: COUNTED_COSTS } },
      {
        key: "step", kind: "number", label: "BNA.Field.costStep.label", hint: "BNA.Field.costStep.hint",
        default: 1, min: 1, step: 1, visibleWhen: { key: "type", in: COUNTED_COSTS }
      },
      {
        key: "scales", kind: "toggle", label: "BNA.Field.costScales.label", hint: "BNA.Field.costScales.hint",
        default: false, visibleWhen: { key: "type", in: COUNTED_COSTS }
      },
      { ...formula("formula", "BNA.Field.costFormula.label", "BNA.Field.costFormula.hint"), visibleWhen: { key: "scales", in: [true] } }
    ]
  },
  {
    key: "limit", kind: "select", label: "BNA.Field.limit.label", hint: "BNA.Field.limit.hint",
    default: "none", choices: { static: STATIC.limit }
  },
  { key: "then", kind: "toggle", label: "BNA.Field.then.label", hint: "BNA.Field.then.hint", default: false }
];

/* -------------------------------------------------- */
/*   Roll changes                                     */
/* -------------------------------------------------- */

const rollBonus: ResultDefinition = {
  kind: "result",
  type: "rollBonus",
  category: "roll",
  icon: "plus",
  supportsOptional: true,
  compatibleEvents: DIALOG_ROLLS,
  fields: [
    formula("formula", "BNA.Result.rollBonus.Field.formula", "BNA.Result.rollBonus.Field.formulaHint"),
    {
      key: "damageTypes", kind: "multiselect", label: "BNA.Result.rollBonus.Field.damageTypes",
      hint: "BNA.Result.rollBonus.Field.damageTypesHint", default: [], choices: DAMAGE_TYPES, onlyFor: ["damageRoll"]
    }
  ],
  flavor: data => asStrings(data.damageTypes).filter(type => !type.startsWith("!")),
  phrase: (data, fmt) => {
    const value = fmt.signed(asString(data.formula));
    const types = asStrings(data.damageTypes);
    return types.length
      ? fmt.t("BNA.Result.rollBonus.PhraseTyped", { formula: value, types: fmt.choices(types, DAMAGE_TYPES) })
      : fmt.t("BNA.Result.rollBonus.Phrase", { formula: value });
  }
};

const dcBonus: ResultDefinition = {
  kind: "result",
  type: "dcBonus",
  category: "roll",
  icon: "gauge",
  supportsOptional: false,
  compatibleEvents: ["saveDC", "signal"],
  fields: [formula("formula", "BNA.Result.dcBonus.Field.formula", "BNA.Result.dcBonus.Field.formulaHint")],
  flavor: () => [],
  phrase: (data, fmt) => fmt.t("BNA.Result.dcBonus.Phrase", { formula: fmt.signed(asString(data.formula)) })
};

const D = "BNA.Result.diceModifiers.Field";
const ENABLED = { key: "enabled", in: [true] } as const;

function whenEnabled(spec: FieldSpec): FieldSpec {
  return { ...spec, visibleWhen: ENABLED };
}

function toggle(key: string, label: string): FieldSpec {
  return { key, kind: "toggle", label, default: false };
}

function modifierGroup(key: string, fields: readonly FieldSpec[]): FieldSpec {
  return {
    key, kind: "group", label: `${D}.${key}`, hint: `${D}.${key}Hint`,
    fields: [toggle("enabled", `${D}.enabled`), ...fields.map(whenEnabled)]
  };
}

const MODE_FIELD: FieldSpec = { key: "mode", kind: "select", label: `${D}.mode`, default: "add", choices: { static: STATIC.modifierMode } };
const MODIFIER_KEYS = ["amount", "size", "reroll", "explode", "minimum", "maximum"] as const;

const diceModifiers: ResultDefinition = {
  kind: "result",
  type: "diceModifiers",
  category: "roll",
  icon: "dices",
  supportsOptional: true,
  compatibleEvents: ["damageRoll", "hitDie", "signal"],
  fields: [
    modifierGroup("amount", [MODE_FIELD, formula("value", `${D}.value`)]),
    modifierGroup("size", [MODE_FIELD, formula("value", `${D}.value`)]),
    modifierGroup("reroll", [
      formula("value", `${D}.threshold`), toggle("invert", `${D}.invert`), toggle("recursive", `${D}.recursive`),
      formula("limit", `${D}.limit`)
    ]),
    modifierGroup("explode", [formula("value", `${D}.threshold`), toggle("once", `${D}.once`), formula("limit", `${D}.limit`)]),
    modifierGroup("minimum", [formula("value", `${D}.minimumValue`), toggle("maximize", `${D}.maximize`)]),
    modifierGroup("maximum", [formula("value", `${D}.maximumValue`), toggle("zero", `${D}.zero`)]),
    { key: "firstOnly", kind: "toggle", label: `${D}.firstOnly`, hint: `${D}.firstOnlyHint`, default: false }
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const parts: string[] = [];
    for (const key of MODIFIER_KEYS) {
      const modifier = asRecord(data[key]);
      if (!asBoolean(modifier.enabled)) continue;
      if ((key === "minimum") && asBoolean(modifier.maximize)) {
        parts.push(fmt.t("BNA.Result.diceModifiers.Short.maximize"));
        continue;
      }
      const mode = (asString(modifier.mode) === "multiply") ? "×" : "+";
      parts.push(fmt.t(`BNA.Result.diceModifiers.Short.${key}`, { value: asString(modifier.value), mode }));
    }
    return parts.length
      ? fmt.t("BNA.Result.diceModifiers.Phrase", { list: fmt.joinAnd(parts) })
      : fmt.t("BNA.Result.diceModifiers.PhraseEmpty");
  }
};

/** Phrase for results made of independent signed adjustments (crit range, save thresholds, …). */
function adjustments(
  fmt: PhraseFormatter,
  prefix: string,
  entries: readonly (readonly [value: string, key: string, signed: boolean])[]
): string[] {
  return entries.flatMap(([value, key, signed]) => {
    if (!value.trim()) return [];
    return [fmt.t(`${prefix}.${key}`, { value: signed ? fmt.signed(value) : value })];
  });
}

const critRange: ResultDefinition = {
  kind: "result",
  type: "critRange",
  category: "roll",
  icon: "sparkle",
  supportsOptional: true,
  compatibleEvents: ["attackRoll", "signal"],
  fields: [
    formula("critical", "BNA.Result.critRange.Field.critical", "BNA.Result.critRange.Field.criticalHint"),
    formula("fumble", "BNA.Result.critRange.Field.fumble", "BNA.Result.critRange.Field.fumbleHint")
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const parts = adjustments(fmt, "BNA.Result.critRange", [
      [asString(data.critical), "PhraseCritical", true],
      [asString(data.fumble), "PhraseFumble", true]
    ]);
    return parts.length ? fmt.joinAnd(parts) : fmt.t("BNA.Result.critRange.PhraseEmpty");
  }
};

const critDamage: ResultDefinition = {
  kind: "result",
  type: "critDamage",
  category: "roll",
  icon: "sparkles",
  supportsOptional: true,
  compatibleEvents: ["damageRoll", "signal"],
  fields: [
    formula("dice", "BNA.Result.critDamage.Field.dice", "BNA.Result.critDamage.Field.diceHint"),
    formula("damage", "BNA.Result.critDamage.Field.damage", "BNA.Result.critDamage.Field.damageHint")
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const parts = adjustments(fmt, "BNA.Result.critDamage", [
      [asString(data.dice), "PhraseDice", false],
      [asString(data.damage), "PhraseDamage", true]
    ]);
    return parts.length
      ? fmt.t("BNA.Result.critDamage.Phrase", { list: fmt.joinAnd(parts) })
      : fmt.t("BNA.Result.critDamage.PhraseEmpty");
  }
};

const saveThresholds: ResultDefinition = {
  kind: "result",
  type: "saveThresholds",
  category: "roll",
  icon: "sliders-horizontal",
  supportsOptional: true,
  compatibleEvents: ["savingThrow", "signal"],
  fields: [
    formula("targetValue", "BNA.Result.saveThresholds.Field.targetValue", "BNA.Result.saveThresholds.Field.targetValueHint"),
    formula(
      "deathSaveCritical", "BNA.Result.saveThresholds.Field.deathSaveCritical",
      "BNA.Result.saveThresholds.Field.deathSaveCriticalHint"
    )
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const parts = adjustments(fmt, "BNA.Result.saveThresholds", [
      [asString(data.targetValue), "PhraseTarget", true],
      [asString(data.deathSaveCritical), "PhraseDeath", true]
    ]);
    return parts.length ? fmt.joinAnd(parts) : fmt.t("BNA.Result.saveThresholds.PhraseEmpty");
  }
};

const REMINDER_PREVIEW = 48;

const reminder: ResultDefinition = {
  kind: "result",
  type: "reminder",
  category: "roll",
  icon: "sticky-note",
  supportsOptional: false,
  compatibleEvents: [...DIALOG_ROLLS, ...TRIGGERS, ...AFTER_RESULT],
  fields: [{
    key: "text", kind: "text", multiline: true, label: "BNA.Result.reminder.Field.text",
    hint: "BNA.Result.reminder.Field.textHint", default: ""
  }],
  flavor: () => [],
  phrase: (data, fmt) => {
    const text = asString(data.text).trim();
    const preview = (text.length > REMINDER_PREVIEW) ? `${text.slice(0, REMINDER_PREVIEW - 1)}…` : text;
    return fmt.t("BNA.Result.reminder.Phrase", { text: preview || fmt.t("BNA.Phrase.Unset") });
  }
};

/* -------------------------------------------------- */
/*   Reactions                                        */
/* -------------------------------------------------- */

const rider: ResultDefinition = {
  kind: "result",
  type: "rider",
  category: "reaction",
  icon: "forward",
  supportsOptional: true,
  compatibleEvents: [...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    {
      key: "effect", kind: "embeddedResult", label: "BNA.Result.rider.Field.effect",
      hint: "BNA.Result.rider.Field.effectHint", allowed: ROLL_RESULT_TYPES
    },
    {
      key: "scope", kind: "select", label: "BNA.Result.rider.Field.scope", hint: "BNA.Result.rider.Field.scopeHint",
      default: "sameActivation", choices: { static: STATIC.riderScope }
    },
    {
      key: "roll", kind: "select", label: "BNA.Result.rider.Field.roll", default: "attackRoll",
      choices: { static: STATIC.riderRoll }, visibleWhen: { key: "scope", in: ["nextRoll"] }
    },
    { ...whoField("rider", "self"), visibleWhen: { key: "scope", in: ["nextRoll"] } },
    {
      key: "duration", kind: "group", label: "BNA.Result.rider.Field.duration", hint: "BNA.Result.rider.Field.durationHint",
      fields: [
        { key: "unit", kind: "select", label: "BNA.Result.rider.Field.unit", default: "uses", choices: { static: STATIC.durationUnit } },
        {
          key: "value", kind: "number", label: "BNA.Result.rider.Field.value", default: 1, min: 1, step: 1,
          visibleWhen: { key: "unit", in: ["uses", "rounds", "turns"] }
        }
      ]
    }
  ],
  flavor: data => {
    const effect = asRecord(data.effect);
    return resultByType(asString(effect.type))?.flavor(asRecord(effect.data)) ?? [];
  },
  phrase: (data, fmt) => {
    const effect = asRecord(data.effect);
    const inner = resultByType(asString(effect.type));
    const text = inner ? inner.phrase(asRecord(effect.data), fmt) : fmt.t("BNA.Result.rider.PhraseNoEffect");
    const base = (asString(data.scope) === "nextRoll")
      ? fmt.t("BNA.Result.rider.Phrase.nextRoll", {
        effect: text,
        roll: fmt.choice(asString(data.roll), { static: STATIC.riderRoll }),
        who: fmt.choice(asString(data.who), WHO)
      })
      : fmt.t("BNA.Result.rider.Phrase.sameActivation", { effect: text });
    const duration = asRecord(data.duration);
    const unit = asString(duration.unit, "uses");
    const value = asNumber(duration.value) ?? 1;
    if ((unit === "uses") && (value === 1)) return base;
    const suffix = (unit === "untilRest")
      ? fmt.t("BNA.Result.rider.Duration.untilRest")
      : fmt.t(`BNA.Result.rider.Duration.${unit}`, { value });
    return `${base}, ${suffix}`;
  }
};

const applyEffect: ResultDefinition = {
  kind: "result",
  type: "applyEffect",
  category: "reaction",
  icon: "badge-plus",
  supportsOptional: true,
  compatibleEvents: [...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    {
      key: "source", kind: "select", label: "BNA.Result.applyEffect.Field.source", hint: "BNA.Result.applyEffect.Field.sourceHint",
      default: "status", choices: { static: STATIC.effectSource }
    },
    {
      key: "status", kind: "select", label: "BNA.Result.applyEffect.Field.status", default: "",
      choices: { source: "statusEffects" }, visibleWhen: { key: "source", in: ["status"] }
    },
    {
      key: "effectId", kind: "select", label: "BNA.Result.applyEffect.Field.effectId",
      hint: "BNA.Result.applyEffect.Field.effectIdHint", default: "", choices: { source: "documentEffects" },
      visibleWhen: { key: "source", in: ["itemEffect"] }
    },
    whoField("applyEffect", "target")
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const effect = (asString(data.source) === "itemEffect")
      ? fmt.choice(asString(data.effectId), { source: "documentEffects" })
      : fmt.choice(asString(data.status), { source: "statusEffects" });
    return fmt.t("BNA.Result.applyEffect.Phrase", {
      effect: effect || fmt.t("BNA.Phrase.Unset"),
      who: fmt.choice(asString(data.who), WHO)
    });
  }
};

const removeEffect: ResultDefinition = {
  kind: "result",
  type: "removeEffect",
  category: "reaction",
  icon: "badge-minus",
  supportsOptional: true,
  compatibleEvents: [...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    {
      key: "match", kind: "select", label: "BNA.Result.removeEffect.Field.match", default: "status",
      choices: { static: STATIC.removeMatch }
    },
    {
      key: "status", kind: "select", label: "BNA.Result.removeEffect.Field.status", default: "",
      choices: { source: "statusEffects" }, visibleWhen: { key: "match", in: ["status"] }
    },
    {
      key: "name", kind: "text", label: "BNA.Result.removeEffect.Field.name", hint: "BNA.Result.removeEffect.Field.nameHint",
      default: "", visibleWhen: { key: "match", in: ["name"] }
    },
    whoField("removeEffect", "self")
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const effect = (asString(data.match) === "name")
      ? asString(data.name).trim()
      : fmt.choice(asString(data.status), { source: "statusEffects" });
    return fmt.t("BNA.Result.removeEffect.Phrase", {
      effect: effect || fmt.t("BNA.Phrase.Unset"),
      who: fmt.choice(asString(data.who), WHO)
    });
  }
};

const resource: ResultDefinition = {
  kind: "result",
  type: "resource",
  category: "reaction",
  icon: "battery-charging",
  supportsOptional: true,
  compatibleEvents: [...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    {
      key: "action", kind: "select", label: "BNA.Result.resource.Field.action", default: "spend",
      choices: { static: STATIC.resourceAction }
    },
    {
      key: "resource", kind: "select", label: "BNA.Result.resource.Field.resource", default: "uses",
      choices: { static: STATIC.resourceType }
    },
    {
      key: "slotLevel", kind: "select", label: "BNA.Result.resource.Field.slotLevel", default: "",
      choices: { source: "spellSlotLevels" }, visibleWhen: { key: "resource", in: ["slots"] }
    },
    {
      key: "currency", kind: "select", label: "BNA.Result.resource.Field.currency", default: "gp",
      choices: { source: "currencies" }, visibleWhen: { key: "resource", in: ["currency"] }
    },
    formula("amount", "BNA.Result.resource.Field.amount", "BNA.Result.resource.Field.amountHint", "1"),
    whoField("resource", "self")
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const kind = asString(data.resource, "uses");
    let label = fmt.choice(kind, { static: STATIC.resourceType });
    const level = fmt.choice(asString(data.slotLevel), { source: "spellSlotLevels" });
    if ((kind === "slots") && level) label = fmt.t("BNA.Result.resource.SlotLevel", { level });
    if (kind === "currency") label = fmt.choice(asString(data.currency), { source: "currencies" }) || label;
    return fmt.t("BNA.Result.resource.Phrase", {
      action: fmt.choice(asString(data.action), { static: STATIC.resourceAction }),
      amount: asString(data.amount).trim() || "1",
      resource: label,
      who: fmt.choice(asString(data.who), WHO)
    });
  }
};

const signal: ResultDefinition = {
  kind: "result",
  type: "signal",
  category: "reaction",
  icon: "send",
  supportsOptional: true,
  compatibleEvents: [...DIALOG_ROLLS.filter(type => type !== "signal"), "saveDC", ...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    { key: "name", kind: "text", label: "BNA.Result.signal.Field.name", hint: "BNA.Result.signal.Field.nameHint", default: "" },
    {
      key: "scope", kind: "select", label: "BNA.Result.signal.Field.scope", hint: "BNA.Result.signal.Field.scopeHint",
      default: "actor", choices: { static: STATIC.signalScope }
    }
  ],
  flavor: () => [],
  phrase: (data, fmt) => fmt.t("BNA.Result.signal.Phrase", { name: asString(data.name).trim() || fmt.t("BNA.Phrase.Unset") })
};

const SAVE_WHO: ChoiceSpec = { static: STATIC.saveWho };
const ABILITIES: ChoiceSpec = { source: "abilities" };
const AURA = { key: "who", in: ["aura"] } as const;

const demandSave: ResultDefinition = {
  kind: "result",
  type: "demandSave",
  category: "reaction",
  icon: "shield-half",
  supportsOptional: false,
  pins: ["succeeded", "failed"],
  compatibleEvents: [...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    { key: "ability", kind: "select", label: "BNA.Result.demandSave.Field.ability", default: "con", choices: ABILITIES },
    {
      key: "dcMode", kind: "select", label: "BNA.Result.demandSave.Field.dcMode", hint: "BNA.Result.demandSave.Field.dcModeHint",
      default: "formula", choices: { static: STATIC.saveDcMode }
    },
    { ...formula("dc", "BNA.Result.demandSave.Field.dc", "BNA.Result.demandSave.Field.dcHint", "13"), visibleWhen: { key: "dcMode", in: ["formula"] } },
    { key: "who", kind: "select", label: "BNA.Result.demandSave.Field.who", default: "target", choices: SAVE_WHO },
    { ...formula("range", "BNA.Field.reachRange.label", "BNA.Field.reachRange.hint", "10"), visibleWhen: AURA },
    {
      key: "disposition", kind: "select", label: "BNA.Field.reachDisposition.label", hint: "BNA.Field.reachDisposition.hint",
      default: "-1", choices: { static: STATIC.disposition }, visibleWhen: AURA
    },
    { key: "includeSelf", kind: "toggle", label: "BNA.Field.reachIncludeSelf.label", default: false, visibleWhen: AURA },
    { key: "advantage", kind: "select", label: "BNA.Result.demandSave.Field.advantage", default: "normal", choices: { static: STATIC.rollMode } }
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const who = asString(data.who, "target");
    const ability = fmt.choice(asString(data.ability, "con"), ABILITIES) || fmt.t("BNA.Phrase.Unset");
    const dc = (asString(data.dcMode) === "spell")
      ? fmt.t("BNA.Result.demandSave.DcSpell")
      : fmt.t("BNA.Result.demandSave.DcFormula", { formula: asString(data.dc).trim() || "10" });
    const advantage = asString(data.advantage, "normal");
    const text = fmt.t(`BNA.Result.demandSave.Phrase.${who}`, { ability, dc, range: asString(data.range).trim() || "10" });
    return (advantage === "normal") ? text : fmt.t(`BNA.Result.demandSave.With.${advantage}`, { text });
  }
};

const counter: ResultDefinition = {
  kind: "result",
  type: "counter",
  category: "reaction",
  icon: "gauge",
  supportsOptional: true,
  compatibleEvents: [...REACTIONS, ...TRIGGERS, ...AFTER_RESULT, ...AFTER_SAVE],
  fields: [
    { key: "name", kind: "text", label: "BNA.Result.counter.Field.name", hint: "BNA.Result.counter.Field.nameHint", default: "", suggest: "counters" },
    { key: "scope", kind: "select", label: "BNA.Field.counterScope.label", hint: "BNA.Field.counterScope.hint", default: "actor", choices: { static: STATIC.counterScope } },
    { key: "action", kind: "select", label: "BNA.Result.counter.Field.action", default: "add", choices: { static: STATIC.counterAction } },
    { ...formula("amount", "BNA.Result.counter.Field.amount", "BNA.Result.counter.Field.amountHint", "1"), visibleWhen: { key: "action", in: ["add", "subtract", "set"] } },
    whoField("counter", "self")
  ],
  flavor: () => [],
  phrase: (data, fmt) => {
    const who = (asString(data.who) === "target") ? "target" : "self";
    return fmt.t(`BNA.Result.counter.Phrase.${who}.${asString(data.action, "add")}`, {
      name: counterName(asString(data.name)) || fmt.t("BNA.Phrase.Unset"),
      amount: asString(data.amount).trim() || "1"
    });
  }
};

export const RESULTS: readonly ResultDefinition[] = [
  rollBonus, dcBonus, diceModifiers, critRange, critDamage, saveThresholds, reminder,
  rider, applyEffect, removeEffect, resource, signal, demandSave, counter
];

const RESULT_MAP = new Map<string, ResultDefinition>(RESULTS.map(definition => [definition.type, definition]));

/** Lookup used by the rider, which embeds another result; called only after module init. */
function resultByType(type: string): ResultDefinition | undefined {
  return RESULT_MAP.get(type);
}
