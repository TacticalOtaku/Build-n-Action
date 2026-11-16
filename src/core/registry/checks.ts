import { counterName } from "../counters/counters";
import { failed, passed, type CheckOutcome, type ReasonCode } from "../engine/reasons";
import { effectReference, type CreatureFacts, type RollFacts } from "../facts/types";
import { STATIC } from "./choices";
import { EVENT_TYPES, ITEM_EVENTS, type EventType } from "./constants";
import { asBoolean, asNumber, asRecord, asString, asStrings } from "./data";
import type { ChoiceSpec, DynamicChoiceSource, FieldSpec } from "./fields";
import type { CheckCategory, CheckDefinition, NodeData, PhraseFormatter } from "./types";

const ALL: readonly EventType[] = EVENT_TYPES;
const ITEM: readonly EventType[] = [...ITEM_EVENTS, "signal"];
const NO_HIT_DIE: readonly EventType[] = EVENT_TYPES.filter(type => type !== "hitDie");
const OPERATOR_SYMBOLS: Record<string, string> = { EQ: "=", NE: "≠", LT: "<", GT: ">", LE: "≤", GE: "≥" };

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

function splitSelection(values: readonly string[]): { included: string[]; excluded: string[] } {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const value of values) {
    const match = /^(!*)(.+)$/.exec(value);
    if (!match?.[2]) continue;
    if (match[1]) excluded.push(match[2]);
    else included.push(match[2]);
  }
  return { included, excluded };
}

function matchValues(actual: readonly string[], selection: readonly string[]): CheckOutcome {
  const { included, excluded } = splitSelection(selection);
  if (!included.length && !excluded.length) return passed("empty");
  const shown = actual.length ? actual.join(", ") : "—";
  if (included.length && !included.some(value => actual.includes(value))) {
    return failed("notMatched", { actual: shown, expected: included.join(", ") });
  }
  const hit = excluded.find(value => actual.includes(value));
  if (hit) return failed("excluded", { actual: hit });
  return passed("matched", { actual: shown });
}

function listOutcome(
  actual: readonly string[] | null,
  values: readonly string[],
  options: { absent?: ReasonCode; required?: boolean }
): CheckOutcome {
  if (!options.absent) return matchValues(actual ?? [], values);
  if (!values.length) return passed("empty");
  if (!actual) {
    if (options.required) return failed(options.absent);
    return splitSelection(values).included.length > 0 ? failed(options.absent) : passed(options.absent);
  }
  return matchValues(actual, values);
}

function withoutImmune(values: readonly string[], immunities: readonly string[]): string[] {
  return values.filter(value => !immunities.includes(value.replace(/^!+/, "")));
}

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

interface ListCheckRule {
  exclusion?: boolean;
  contradiction?: boolean;
  absent?: ReasonCode;
  required?: boolean;
  actual(facts: RollFacts): readonly string[] | null;
  filterValues?(values: readonly string[], facts: RollFacts): readonly string[];
}

/** A check that passes when a runtime value is one of the selected choices. */
function listCheck(
  type: string,
  category: CheckCategory,
  icon: string,
  source: DynamicChoiceSource,
  relevantTo: readonly EventType[],
  rule: ListCheckRule
): CheckDefinition {
  const spec: ChoiceSpec = { source };
  const exclusion = rule.exclusion ?? true;
  return {
    type, category, icon, relevantTo,
    reasonChoices: spec,
    fields: [anyOf(source, exclusion)],
    phrase: (data, fmt) => fmt.t(`BNA.Check.${type}.Phrase`, { values: fmt.choices(asStrings(data.values), spec) }),
    evaluate: (data, facts) => {
      const raw = asStrings(data.values);
      const values = rule.filterValues ? rule.filterValues(raw, facts) : raw;
      return listOutcome(rule.actual(facts), values, rule);
    },
    ...(rule.contradiction ? { contradictionValues: (data: NodeData) => splitSelection(asStrings(data.values)).included } : {})
  };
}

/** A check that passes when a free-form slug (identifier, marker, class) is one of the entered tags. */
function tagCheck(
  type: string,
  category: CheckCategory,
  icon: string,
  relevantTo: readonly EventType[],
  options: {
    contradiction?: boolean;
    evaluate(data: NodeData, facts: RollFacts): CheckOutcome;
  }
): CheckDefinition {
  return {
    type, category, icon, relevantTo,
    fields: [TAGS],
    phrase: (data, fmt) => {
      const values = asStrings(data.values);
      return fmt.t(`BNA.Check.${type}.Phrase`, { values: values.length ? fmt.joinOr(values) : fmt.t("BNA.Phrase.Any") });
    },
    evaluate: options.evaluate,
    ...(options.contradiction ? { contradictionValues: (data: NodeData) => splitSelection(asStrings(data.values)).included } : {})
  };
}

function evaluateActiveEffect(data: NodeData, creature: CreatureFacts | null): CheckOutcome {
  const sourceMode = data.match === "source";
  const reference = effectReference(data.source);
  const name = asString(data.name).normalize("NFC").trim().toLowerCase();
  if (sourceMode ? data.source == null : !name) return passed("empty");
  if (sourceMode && !reference) return failed("noValue");
  if (!creature) return failed("noTarget");
  const effects = (creature.effects ?? []).filter(effect => effect.active || data.includeInactive === true);
  const found = effects.some(effect => {
    return sourceMode
      ? effect.uuid === reference?.uuid || effect.sources.includes(reference?.uuid ?? "")
      : effect.name.normalize("NFC").trim().toLowerCase() === name;
  });
  const absent = data.presence === "absent";
  const expected = sourceMode ? reference?.name || reference?.uuid || "—" : asString(data.name).trim();
  if (found !== absent) return passed("matched", { actual: expected });
  return absent ? failed("excluded", { actual: expected }) : failed("notMatched", { actual: effects.map(effect => effect.name || effect.uuid).join(", ") || "—", expected });
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
    },
    evaluate: (data, facts) => evaluateActiveEffect(data, category === "self" ? facts.actor : facts.target)
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
  },
  evaluate: (data, facts) => {
    const lists: [readonly string[], string | null][] = [
      [asStrings(data.value), facts.activity?.attackType ?? null],
      [asStrings(data.classification), facts.activity?.attackClassification ?? null],
      [asStrings(data.mode), facts.roll.attackMode]
    ];
    if (lists.every(([values]) => !values.length)) return passed("empty");
    if (facts.activity?.type !== "attack") return passed("noActivity");
    for (const [values, actual] of lists) {
      if (values.length && !values.includes(actual ?? "")) {
        return failed("notMatched", { actual: actual ?? "—", expected: values.join(", ") });
      }
    }
    return passed("matched", { actual: lists.map(([, actual]) => actual ?? "—").join(", ") });
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
  },
  evaluate: (data, facts) => {
    const type = asString(data.type);
    if (!type) return passed("empty");
    if (facts.item?.type !== "feat") return failed("notFeature", { actual: facts.item?.type ?? "—" });
    if (facts.item.featureType !== type) return failed("notMatched", { actual: facts.item.featureType ?? "—", expected: type });
    const subtype = asString(data.subtype);
    if (subtype && (facts.item.featureSubtype !== subtype)) {
      return failed("notMatched", { actual: facts.item.featureSubtype ?? "—", expected: subtype });
    }
    return passed("matched", { actual: [type, subtype].filter(Boolean).join(", ") });
  }
};

const thisItem: CheckDefinition = {
  type: "thisItem",
  category: "item",
  icon: "pin",
  relevantTo: ITEM,
  fields: [],
  phrase: (_data, fmt) => fmt.t("BNA.Check.thisItem.Phrase"),
  evaluate: (_data, facts, env) => {
    if (!env.carrierItemUuid) return passed("empty");
    return (facts.item?.uuid === env.carrierItemUuid) ? passed("matched", { actual: facts.item.identifier }) : failed("otherItem");
  }
};

const spellComponents: CheckDefinition = {
  type: "spellComponents",
  category: "spell",
  icon: "hand",
  relevantTo: ITEM,
  reasonChoices: { source: "spellComponents" },
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
  },
  evaluate: (data, facts) => {
    const types = asStrings(data.types);
    if (!types.length) return passed("empty");
    if (!facts.item?.spell) return failed("notSpell");
    const properties = facts.item.properties;
    const ok = (asString(data.match) === "all")
      ? types.every(type => properties.includes(type))
      : types.some(type => properties.includes(type));
    return ok
      ? passed("matched", { actual: properties.join(", ") })
      : failed("notMatched", { actual: properties.join(", ") || "—", expected: types.join(", ") });
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
    },
    evaluate: (data, facts) => {
      if ((category === "target") && !facts.target && (asNumber(data.value) !== null)) return failed("noTarget");
      const hp = (category === "target") ? (facts.target?.hpPercent ?? null) : facts.actor.hpPercent;
      const value = asNumber(data.value);
      if (value === null) return passed("empty");
      if (hp === null) return failed("noValue");
      const atLeast = asString(data.type) === "atLeast";
      const ok = atLeast ? (hp >= value) : (hp <= value);
      const values = { actual: `${Math.round(hp)}%`, expected: `${atLeast ? "≥" : "≤"} ${value}%` };
      return ok ? passed("matched", { actual: values.actual }) : failed("threshold", values);
    }
  };
}

function compare(operator: string, left: number, right: number): boolean {
  switch (operator) {
    case "LT": return left < right;
    case "GT": return left > right;
    case "LE": return left <= right;
    case "GE": return left >= right;
    case "NE": return left !== right;
    default: return left === right;
  }
}

function compareText(operator: string, left: string, right: string): boolean {
  if ((operator === "LT") || (operator === "LE")) return right.includes(left);
  if ((operator === "GT") || (operator === "GE")) return left.includes(right);
  return left === right;
}

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
    operator: OPERATOR_SYMBOLS[asString(data.operator, "GE")] ?? "=",
    value: asString(data.value).trim() || "0"
  }),
  counterRef: data => {
    const name = counterName(asString(data.name));
    return name ? { name } : null;
  },
  evaluate: (data, _facts, env) => {
    const name = counterName(asString(data.name));
    // Like every check, an empty one restricts nothing.
    if (!name) return passed("empty");
    const scope = (asString(data.scope) === "blueprint") ? "blueprint" : "actor";
    const whose = (asString(data.whose) === "target") ? "target" : "self";
    const operator = asString(data.operator, "EQ");
    const actual = env.counter?.(name, scope, whose) ?? 0;
    const wanted = env.evaluateNumber(asString(data.value).trim() || "0");
    const shown = { left: `${name} = ${actual}`, operator: OPERATOR_SYMBOLS[operator] ?? "=", right: String(wanted ?? "—") };
    if ((wanted === null) || !compare(operator, actual, wanted)) return failed("comparisonFailed", shown);
    return passed("matched", { actual });
  }
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
  },
  evaluate: (data, facts) => {
    const min = asNumber(data.min);
    const max = asNumber(data.max);
    if ((min === null) && (max === null)) return passed("empty");
    const bySize = asBoolean(data.size);
    const count = facts.actor.spellSlots.reduce((total, slot) => {
      if (!slot.level || !slot.value || !slot.max) return total;
      return total + (Math.min(Math.max(slot.value, 0), slot.max) * (bySize ? slot.level : 1));
    }, 0);
    const ok = (count >= (min ?? 0)) && (count <= (max ?? Infinity));
    return ok
      ? passed("matched", { actual: count })
      : failed("threshold", { actual: count, expected: `${min ?? 0}–${max ?? "∞"}` });
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
  },
  evaluate: (data, facts) => {
    const size = asNumber(data.size);
    if (size === null) return passed("empty");
    const targetSize = facts.target?.tokenSize ?? null;
    if (targetSize === null) return failed("noTarget");
    const self = asBoolean(data.self);
    const mine = facts.actor.tokenSize;
    if (self && (mine === null)) return failed("noValue");
    const atMost = asString(data.type) === "atMost";
    const bound = self ? (atMost ? Math.min(mine ?? size, size) : Math.max(mine ?? size, size)) : size;
    const ok = atMost ? (targetSize <= bound) : (targetSize >= bound);
    return ok
      ? passed("matched", { actual: targetSize })
      : failed("threshold", { actual: targetSize, expected: `${atMost ? "≤" : "≥"} ${bound}` });
  }
};

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
  },
  evaluate: (data, _facts, env) => {
    const rows = Array.isArray(data.comparisons) ? data.comparisons.map(asRecord) : [];
    if (!rows.length) return passed("empty");
    for (const row of rows) {
      const one = asString(row.one).trim();
      const other = asString(row.other).trim();
      const operator = asString(row.operator, "EQ");
      const shown = { left: one || "—", operator: OPERATOR_SYMBOLS[operator] ?? "=", right: other || "—" };
      if (!one || !other) return failed("comparisonFailed", shown);
      const left = env.evaluateNumber(one);
      const right = env.evaluateNumber(other);
      const ok = ((left !== null) && (right !== null))
        ? compare(operator, left, right)
        : compareText(operator, env.replaceData(one), env.replaceData(other));
      if (!ok) return failed("comparisonFailed", shown);
    }
    return passed("matched", { actual: rows.length });
  }
};

const customScripts: CheckDefinition = {
  type: "customScripts",
  category: "advanced",
  icon: "code",
  relevantTo: ALL,
  fields: [{ key: "script", kind: "script", ...field("customScripts", "script"), default: "" }],
  phrase: (_data, fmt) => fmt.t("BNA.Check.customScripts.Phrase"),
  evaluate: (data, facts, env) => {
    const script = asString(data.script).trim();
    if (!script) return passed("empty");
    let result: boolean | null | "untrusted";
    try {
      result = env.runScript(script, facts);
    } catch {
      return failed("scriptError");
    }
    if (result === null) return passed("scriptDisabled");
    if (result === "untrusted") return failed("scriptUntrusted");
    return result ? passed("matched", { actual: "true" }) : failed("scriptFalse");
  }
};

export const CHECKS: readonly CheckDefinition[] = [
  // Item
  listCheck("itemTypes", "item", "package", "itemTypes", ITEM, {
    exclusion: false, contradiction: true, required: true, absent: "noItem", actual: facts => facts.item ? [facts.item.type] : null
  }),
  tagCheck("identifiers", "item", "fingerprint", ITEM, {
    contradiction: true,
    evaluate: (data, facts) => listOutcome(facts.item ? [facts.item.identifier] : null, asStrings(data.values), { required: true, absent: "noItem" })
  }),
  listCheck("baseWeapons", "item", "sword", "weaponTypes", ITEM, {
    contradiction: true, absent: "notWeapon", actual: facts => (facts.item?.type === "weapon") ? facts.item.baseTypes : null
  }),
  listCheck("weaponProperties", "item", "list-checks", "weaponProperties", ITEM, {
    absent: "notWeapon", actual: facts => (facts.item?.type === "weapon") ? facts.item.properties : null
  }),
  attackModes,
  featureTypes,
  listCheck("damageTypes", "item", "flame", "damageAndHealingTypes", ITEM, {
    contradiction: true, required: true, absent: "noActivity", actual: facts => facts.activity?.damageTypes ?? null
  }),
  listCheck("abilities", "item", "dumbbell", "abilities", [...ITEM_EVENTS, "abilityCheck", "afterCheck", "signal"], {
    required: true,
    absent: "noValue",
    actual: facts => {
      const ability = facts.roll.toolKeys.length ? facts.roll.abilityId : (facts.activity ? facts.activity.ability : facts.roll.abilityId);
      return ability ? [ability] : null;
    }
  }),
  thisItem,
  // Spell
  listCheck("spellLevels", "spell", "layers", "spellLevels", ITEM, {
    exclusion: false, contradiction: true, required: true, absent: "notSpell",
    actual: facts => facts.item?.spell ? [String(facts.item.spell.level)] : null
  }),
  listCheck("spellSchools", "spell", "book-open", "spellSchools", ITEM, {
    contradiction: true, absent: "notSpell", actual: facts => facts.item?.spell ? [facts.item.spell.school] : null
  }),
  spellComponents,
  listCheck("preparationModes", "spell", "book-marked", "spellMethods", ITEM, {
    exclusion: false, contradiction: true, required: true, absent: "notSpell",
    actual: facts => facts.item?.spell ? [facts.item.spell.method] : null
  }),
  tagCheck("sourceClasses", "spell", "graduation-cap", ITEM, {
    evaluate: (data, facts) => {
      const values = asStrings(data.values);
      if (!values.length) return passed("empty");
      if (!facts.item?.spell) return passed("notSpell");
      return matchValues([facts.item.spell.sourceClass], values);
    }
  }),
  // Me
  listCheck("actorCreatureTypes", "self", "paw-print", "creatureTypes", ALL, {
    contradiction: true, actual: facts => facts.actor.creatureTypes
  }),
  listCheck("actorCreatureSizes", "self", "ruler", "actorSizes", ALL, {
    exclusion: false, contradiction: true, required: true, absent: "noValue",
    actual: facts => facts.actor.size ? [facts.actor.size] : null
  }),
  listCheck("actorLanguages", "self", "languages", "languages", ALL, {
    actual: facts => facts.actor.languages
  }),
  listCheck("baseArmors", "self", "shirt", "armorTypes", ALL, {
    actual: facts => facts.actor.armor
  }),
  listCheck("statusEffects", "self", "activity", "statusEffects", ALL, {
    actual: facts => facts.actor.statuses,
    filterValues: (values, facts) => withoutImmune(values, facts.actor.conditionImmunities)
  }),
  activeEffectCheck("actorActiveEffects", "self"),
  healthCheck("healthPercentages", "self", ALL),
  remainingSpellSlots,
  listCheck("proficiencyLevels", "self", "award", "proficiencyLevels",
    ["attackRoll", "savingThrow", "abilityCheck", "afterAttack", "afterCheck", "signal"], {
      exclusion: false, required: true, absent: "noValue",
      actual: facts => (facts.roll.proficiency === null) ? null : [String(facts.roll.proficiency)]
    }),
  tagCheck("markers", "self", "tag", ALL, {
    evaluate: (data, facts) => {
      const values = asStrings(data.values);
      return values.length ? matchValues([...(facts.item?.markers ?? []), ...facts.actor.markers], values) : passed("empty");
    }
  }),
  counterCheck,
  // Target
  listCheck("creatureTypes", "target", "paw-print", "creatureTypes", NO_HIT_DIE, {
    contradiction: true, absent: "noTarget", actual: facts => facts.target?.creatureTypes ?? null
  }),
  listCheck("targetArmors", "target", "shield-half", "armorTypes", NO_HIT_DIE, {
    absent: "noTarget", actual: facts => facts.target?.armor ?? null
  }),
  listCheck("targetEffects", "target", "activity", "statusEffects", NO_HIT_DIE, {
    absent: "noTarget",
    actual: facts => facts.target?.statuses ?? null,
    filterValues: (values, facts) => withoutImmune(values, facts.target?.conditionImmunities ?? [])
  }),
  activeEffectCheck("targetActiveEffects", "target"),
  healthCheck("targetHealthPercentages", "target", NO_HIT_DIE),
  tokenSizes,
  tagCheck("targetMarkers", "target", "tags", NO_HIT_DIE, {
    evaluate: (data, facts) => listOutcome(facts.target?.markers ?? null, asStrings(data.values), { required: true, absent: "noTarget" })
  }),
  // Roll
  listCheck("saveAbilities", "roll", "shield-check", "abilities", ["saveDC", "afterTargetSave", "signal"], {
    contradiction: true, required: true, absent: "noValue",
    actual: facts => facts.activity?.dcAbility ? [facts.activity.dcAbility] : null
  }),
  listCheck("throwTypes", "roll", "shield", "throwTypes", ["savingThrow", "signal"], {
    exclusion: false, required: true, absent: "noValue",
    actual: facts => {
      const actual = [
        facts.roll.saveAbility,
        facts.roll.isDeath ? "death" : null,
        facts.roll.isConcentration ? "concentration" : null
      ].filter((value): value is string => value !== null);
      return actual.length ? actual : null;
    }
  }),
  listCheck("skillIds", "roll", "graduation-cap", "skills", ["abilityCheck", "afterCheck", "signal"], {
    contradiction: true, absent: "noValue", actual: facts => facts.roll.skillId ? [facts.roll.skillId] : null
  }),
  listCheck("baseTools", "roll", "wrench", "tools", ["abilityCheck", "afterCheck", "signal"], {
    absent: "noValue", actual: facts => facts.roll.toolKeys.length ? facts.roll.toolKeys : null
  }),
  // Advanced
  arbitraryComparisons,
  customScripts
];
