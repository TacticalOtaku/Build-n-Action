import { counterName } from "../counters/counters";
import { effectReference } from "../facts/effects";
import { STATIC } from "./choices";
import { EVENT_TYPES, ITEM_EVENTS, type EventType } from "./constants";
import { asBoolean, asNumber, asRecord, asString, asStrings } from "./data";
import type { ChoiceSpec, DynamicChoiceSource, FieldSpec } from "./fields";
import type { CheckCategory, CheckDefinition, NodeData, PhraseFormatter } from "./types";

const ALL: readonly EventType[] = EVENT_TYPES;
const ITEM: readonly EventType[] = [...ITEM_EVENTS, "signal"];
const NO_HIT_DIE: readonly EventType[] = EVENT_TYPES.filter(type => type !== "hitDie");

/** Fields of the condition node itself (its checks are stored alongside). */
export const CONDITION_NODE_FIELDS: readonly FieldSpec[] = [
  {
    key: "mode", kind: "select", label: "BNA.Field.conditionMode.label", hint: "BNA.Field.conditionMode.hint",
    default: "all", choices: { static: STATIC.conditionMode }
  },
  {
    key: "thisItem", kind: "toggle", label: "BNA.Field.conditionThisItem.label", hint: "BNA.Field.conditionThisItem.hint", default: false
  }
];

function anyOf(source: DynamicChoiceSource, exclusion: boolean): FieldSpec {
  return {
    key: "values",
    kind: "multiselect",
    label: "BNA.Field.anyOf.label",
    hint: exclusion ? "BNA.Field.anyOf.hintExclusion" : "BNA.Field.anyOf.hint",
    default: [],
    choices: { source },
    exclusion
  };
}

const TAGS: FieldSpec = { key: "values", kind: "tags", label: "BNA.Field.tags.label", hint: "BNA.Field.tags.hint", default: [] };

/** A check that passes when a runtime value is one of the selected choices. */
function listCheck(
  type: string,
  category: CheckCategory,
  icon: string,
  source: DynamicChoiceSource,
  relevantTo: readonly EventType[],
  exclusion = true
): CheckDefinition {
  const spec: ChoiceSpec = { source };
  return {
    type, category, icon, relevantTo,
    fields: [anyOf(source, exclusion)],
    phrase: (data, fmt) => fmt.t(`BNA.Check.${type}.Phrase`, { values: fmt.choices(asStrings(data.values), spec) })
  };
}

/** A check that passes when a free-form slug (identifier, marker, class) is one of the entered tags. */
function tagCheck(type: string, category: CheckCategory, icon: string, relevantTo: readonly EventType[]): CheckDefinition {
  return {
    type, category, icon, relevantTo,
    fields: [TAGS],
    phrase: (data, fmt) => {
      const values = asStrings(data.values);
      return fmt.t(`BNA.Check.${type}.Phrase`, { values: values.length ? fmt.joinOr(values) : fmt.t("BNA.Phrase.Any") });
    }
  };
}

function activeEffectCheck(type: string, category: "self" | "target"): CheckDefinition {
  return {
    type, category, icon: "activity", relevantTo: category === "self" ? ALL : NO_HIT_DIE,
    fields: [
      { key: "match", kind: "select", label: "BNA.Field.activeEffect.match", default: "name", choices: { static: [
        { value: "name", label: "BNA.Field.activeEffect.byName" }, { value: "source", label: "BNA.Field.activeEffect.bySource" }
      ] } },
      { key: "name", kind: "text", label: "BNA.Field.activeEffect.name", hint: "BNA.Field.activeEffect.nameHint", default: "", visibleWhen: { key: "match", in: ["name"] } },
      { key: "source", kind: "effectReference", label: "BNA.Field.activeEffect.source", hint: "BNA.Field.activeEffect.sourceHint", default: null, visibleWhen: { key: "match", in: ["source"] } },
      { key: "presence", kind: "select", label: "BNA.Field.activeEffect.presence", default: "present", choices: { static: [
        { value: "present", label: "BNA.Field.activeEffect.present" }, { value: "absent", label: "BNA.Field.activeEffect.absent" }
      ] } },
      { key: "includeInactive", kind: "toggle", label: "BNA.Field.activeEffect.includeInactive", hint: "BNA.Field.activeEffect.inactiveHint", default: false }
    ],
    phrase: (data, fmt) => {
      const ref = effectReference(data.source);
      const effect = (data.match === "source" ? ref?.name || ref?.uuid : asString(data.name).trim()) || fmt.t("BNA.Phrase.Unset");
      const phrase = fmt.t(`BNA.Check.${type}.${data.presence === "absent" ? "PhraseAbsent" : "Phrase"}`, { effect });
      return data.includeInactive === true ? `${phrase} (${fmt.t("BNA.Field.activeEffect.includeInactive")})` : phrase;
    }
  };
}

function field(check: string, key: string): { label: string; hint: string } {
  return { label: `BNA.Check.${check}.Field.${key}`, hint: `BNA.Check.${check}.Field.${key}Hint` };
}

const attackModes: CheckDefinition = {
  type: "attackModes",
  category: "item",
  icon: "move-diagonal",
  relevantTo: ["damageRoll", "afterDamage", "signal"],
  fields: [
    { key: "value", kind: "multiselect", ...field("attackModes", "value"), default: [], choices: { source: "attackTypes" } },
    {
      key: "classification", kind: "multiselect", ...field("attackModes", "classification"), default: [],
      choices: { source: "attackClassifications" }
    },
    { key: "mode", kind: "multiselect", ...field("attackModes", "mode"), default: [], choices: { source: "attackModes" } }
  ],
  phrase: (data, fmt) => {
    const parts: string[] = [];
    const add = (key: string, source: DynamicChoiceSource) => {
      const values = asStrings(data[key]);
      if (values.length) parts.push(fmt.choices(values, { source }));
    };
    add("value", "attackTypes");
    add("classification", "attackClassifications");
    add("mode", "attackModes");
    return fmt.t("BNA.Check.attackModes.Phrase", { values: parts.length ? fmt.joinAnd(parts) : fmt.t("BNA.Phrase.Any") });
  }
};

const featureTypes: CheckDefinition = {
  type: "featureTypes",
  category: "item",
  icon: "star",
  relevantTo: ITEM,
  fields: [
    { key: "type", kind: "select", ...field("featureTypes", "type"), default: "", choices: { source: "featureTypes" } },
    { key: "subtype", kind: "text", ...field("featureTypes", "subtype"), default: "" }
  ],
  phrase: (data, fmt) => {
    const type = fmt.choice(asString(data.type), { source: "featureTypes" }) || fmt.t("BNA.Phrase.Any");
    const subtype = asString(data.subtype);
    return subtype
      ? fmt.t("BNA.Check.featureTypes.PhraseSubtype", { type, subtype })
      : fmt.t("BNA.Check.featureTypes.Phrase", { type });
  }
};

const thisItem: CheckDefinition = {
  type: "thisItem",
  category: "item",
  icon: "pin",
  relevantTo: ITEM,
  fields: [],
  phrase: (_data, fmt) => fmt.t("BNA.Check.thisItem.Phrase")
};

const spellComponents: CheckDefinition = {
  type: "spellComponents",
  category: "spell",
  icon: "hand",
  relevantTo: ITEM,
  fields: [
    { key: "types", kind: "multiselect", ...field("spellComponents", "types"), default: [], choices: { source: "spellComponents" } },
    {
      key: "match", kind: "select", ...field("spellComponents", "match"), default: "any",
      choices: { static: STATIC.componentMatch }
    }
  ],
  phrase: (data, fmt) => {
    const labels = asStrings(data.types).map(value => fmt.choice(value, { source: "spellComponents" }));
    if (!labels.length) return fmt.t("BNA.Check.spellComponents.Phrase.any", { values: fmt.t("BNA.Phrase.Any") });
    return asString(data.match) === "all"
      ? fmt.t("BNA.Check.spellComponents.Phrase.all", { values: fmt.joinAnd(labels) })
      : fmt.t("BNA.Check.spellComponents.Phrase.any", { values: fmt.joinOr(labels) });
  }
};

/** Hit points at most or at least a percentage: mine, or the target's. */
function healthCheck(type: string, category: CheckCategory, relevantTo: readonly EventType[]): CheckDefinition {
  return {
    type, category, icon: "heart", relevantTo,
    fields: [
      { key: "value", kind: "number", ...field(type, "value"), default: null, min: 0, max: 100, step: 1 },
      { key: "type", kind: "select", label: `BNA.Check.${type}.Field.type`, default: "atMost", choices: { static: STATIC.threshold } }
    ],
    phrase: (data, fmt) => {
      const value = asNumber(data.value);
      if (value === null) return fmt.t(`BNA.Check.${type}.PhraseAny`);
      const threshold = asString(data.type) === "atLeast" ? "atLeast" : "atMost";
      return fmt.t(`BNA.Check.${type}.Phrase.${threshold}`, { value });
    }
  };
}

const COUNTER_SYMBOLS: Record<string, string> = { EQ: "=", NE: "≠", LT: "<", LE: "≤", GT: ">", GE: "≥" };

const counterCheck: CheckDefinition = {
  type: "counter",
  category: "self",
  icon: "gauge",
  relevantTo: ALL,
  fields: [
    { key: "name", kind: "text", ...field("counter", "name"), default: "", suggest: "counters" },
    { key: "scope", kind: "select", label: "BNA.Field.counterScope.label", hint: "BNA.Field.counterScope.hint", default: "actor", choices: { static: STATIC.counterScope } },
    { key: "whose", kind: "select", label: "BNA.Check.counter.Field.whose", default: "self", choices: { static: STATIC.who } },
    { key: "operator", kind: "select", label: "BNA.Check.counter.Field.operator", default: "GE", choices: { static: STATIC.counterOperator } },
    { key: "value", kind: "formula", label: "BNA.Check.counter.Field.value", default: "1" }
  ],
  phrase: (data, fmt) => fmt.t(`BNA.Check.counter.Phrase.${(asString(data.whose) === "target") ? "target" : "self"}`, {
    name: counterName(asString(data.name)) || fmt.t("BNA.Phrase.Unset"),
    operator: COUNTER_SYMBOLS[asString(data.operator, "GE")] ?? "=",
    value: asString(data.value).trim() || "0"
  })
};

const remainingSpellSlots: CheckDefinition = {
  type: "remainingSpellSlots",
  category: "self",
  icon: "battery",
  relevantTo: ALL,
  fields: [
    { key: "min", kind: "number", ...field("remainingSpellSlots", "min"), default: null, min: 0, step: 1 },
    { key: "max", kind: "number", ...field("remainingSpellSlots", "max"), default: null, min: 0, step: 1 },
    { key: "size", kind: "toggle", ...field("remainingSpellSlots", "size"), default: false }
  ],
  phrase: (data, fmt) => {
    const min = asNumber(data.min);
    const max = asNumber(data.max);
    let text: string;
    if ((min !== null) && (max !== null)) text = fmt.t("BNA.Check.remainingSpellSlots.Phrase.range", { min, max });
    else if (min !== null) text = fmt.t("BNA.Check.remainingSpellSlots.Phrase.min", { min });
    else if (max !== null) text = fmt.t("BNA.Check.remainingSpellSlots.Phrase.max", { max });
    else return fmt.t("BNA.Check.remainingSpellSlots.PhraseAny");
    return asBoolean(data.size) ? `${text} ${fmt.t("BNA.Check.remainingSpellSlots.PhraseSize")}` : text;
  }
};

const tokenSizes: CheckDefinition = {
  type: "tokenSizes",
  category: "target",
  icon: "maximize",
  relevantTo: NO_HIT_DIE,
  fields: [
    { key: "size", kind: "number", ...field("tokenSizes", "size"), default: null, min: 0.5, step: 0.5 },
    { key: "type", kind: "select", label: "BNA.Check.tokenSizes.Field.type", default: "atLeast", choices: { static: STATIC.threshold } },
    { key: "self", kind: "toggle", ...field("tokenSizes", "self"), default: false }
  ],
  phrase: (data, fmt) => {
    const size = asNumber(data.size);
    if (size === null) return fmt.t("BNA.Check.tokenSizes.PhraseAny");
    const type = asString(data.type) === "atMost" ? "atMost" : "atLeast";
    const text = fmt.t(`BNA.Check.tokenSizes.Phrase.${type}`, { size });
    return asBoolean(data.self) ? `${text} ${fmt.t("BNA.Check.tokenSizes.PhraseSelf")}` : text;
  }
};

const OPERATOR_SYMBOLS: Record<string, string> = { EQ: "=", LT: "<", GT: ">", LE: "≤", GE: "≥" };

const arbitraryComparisons: CheckDefinition = {
  type: "arbitraryComparisons",
  category: "advanced",
  icon: "equal",
  relevantTo: ALL,
  fields: [{ key: "comparisons", kind: "comparisons", ...field("arbitraryComparisons", "comparisons"), default: [] }],
  phrase: (data: NodeData, fmt: PhraseFormatter) => {
    const rules = Array.isArray(data.comparisons) ? data.comparisons.map(asRecord) : [];
    if (!rules.length) return fmt.t("BNA.Check.arbitraryComparisons.PhraseAny");
    const texts = rules.map(rule => {
      const operator = OPERATOR_SYMBOLS[asString(rule.operator)] ?? "=";
      return `${asString(rule.one)} ${operator} ${asString(rule.other)}`;
    });
    return fmt.t("BNA.Check.arbitraryComparisons.Phrase", { values: fmt.joinAnd(texts) });
  }
};

const customScripts: CheckDefinition = {
  type: "customScripts",
  category: "advanced",
  icon: "code",
  relevantTo: ALL,
  fields: [{ key: "script", kind: "script", ...field("customScripts", "script"), default: "" }],
  phrase: (_data, fmt) => fmt.t("BNA.Check.customScripts.Phrase")
};

export const CHECKS: readonly CheckDefinition[] = [
  // Item
  listCheck("itemTypes", "item", "package", "itemTypes", ITEM, false),
  tagCheck("identifiers", "item", "fingerprint", ITEM),
  listCheck("baseWeapons", "item", "sword", "weaponTypes", ITEM),
  listCheck("weaponProperties", "item", "list-checks", "weaponProperties", ITEM),
  attackModes,
  featureTypes,
  listCheck("damageTypes", "item", "flame", "damageAndHealingTypes", ITEM),
  listCheck("abilities", "item", "dumbbell", "abilities", [...ITEM_EVENTS, "abilityCheck", "afterCheck", "signal"]),
  thisItem,
  // Spell
  listCheck("spellLevels", "spell", "layers", "spellLevels", ITEM, false),
  listCheck("spellSchools", "spell", "book-open", "spellSchools", ITEM),
  spellComponents,
  listCheck("preparationModes", "spell", "book-marked", "spellMethods", ITEM, false),
  tagCheck("sourceClasses", "spell", "graduation-cap", ITEM),
  // Me
  listCheck("actorCreatureTypes", "self", "paw-print", "creatureTypes", ALL),
  listCheck("actorCreatureSizes", "self", "ruler", "actorSizes", ALL, false),
  listCheck("actorLanguages", "self", "languages", "languages", ALL),
  listCheck("baseArmors", "self", "shirt", "armorTypes", ALL),
  listCheck("statusEffects", "self", "activity", "statusEffects", ALL),
  activeEffectCheck("actorActiveEffects", "self"),
  healthCheck("healthPercentages", "self", ALL),
  remainingSpellSlots,
  listCheck("proficiencyLevels", "self", "award", "proficiencyLevels",
    ["attackRoll", "savingThrow", "abilityCheck", "afterAttack", "afterCheck", "signal"], false),
  tagCheck("markers", "self", "tag", ALL),
  counterCheck,
  // Target
  listCheck("creatureTypes", "target", "paw-print", "creatureTypes", NO_HIT_DIE),
  listCheck("targetArmors", "target", "shield-half", "armorTypes", NO_HIT_DIE),
  listCheck("targetEffects", "target", "activity", "statusEffects", NO_HIT_DIE),
  activeEffectCheck("targetActiveEffects", "target"),
  healthCheck("targetHealthPercentages", "target", NO_HIT_DIE),
  tokenSizes,
  tagCheck("targetMarkers", "target", "tags", NO_HIT_DIE),
  // Roll
  listCheck("saveAbilities", "roll", "shield-check", "abilities", ["saveDC", "afterTargetSave", "signal"]),
  listCheck("throwTypes", "roll", "shield", "throwTypes", ["savingThrow", "signal"], false),
  listCheck("skillIds", "roll", "graduation-cap", "skills", ["abilityCheck", "afterCheck", "signal"]),
  listCheck("baseTools", "roll", "wrench", "tools", ["abilityCheck", "afterCheck", "signal"]),
  // Advanced
  arbitraryComparisons,
  customScripts
];
