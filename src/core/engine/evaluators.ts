import type { CounterScope } from "../blueprint/types";
import { counterName } from "../counters/counters";
import type { RollFacts } from "../facts/types";
import { asBoolean, asNumber, asRecord, asString, asStrings } from "../registry/data";
import type { NodeData } from "../registry/types";
import { hasIncluded, matchValues } from "./inclusion";
import { failed, passed, type CheckOutcome, type ReasonCode } from "./reasons";

/** What evaluating checks needs from the host besides the facts. */
export interface CheckEnv {
  /** Evaluate a formula against the roller's roll data (including @target); null when not a number. */
  evaluateNumber(formula: string): number | null;
  /** Replace roll-data references in text, for string comparisons. */
  replaceData(text: string): string;
  /** Run a custom script check; null when the GM has disabled scripts. May throw. */
  /** The script's answer; null when scripts are turned off, "untrusted" when another user wrote it. */
  runScript(script: string, facts: RollFacts): boolean | null | "untrusted";
  /** UUID of the item that carries the blueprint, or null when it is not on an item. */
  carrierItemUuid: string | null;
  /** A counter's value: mine or the target's; 0 when unknown or without counters (see core/counters). */
  counter?(name: string, scope: CounterScope, whose: "self" | "target"): number;
}

export type Evaluator = (data: NodeData, facts: RollFacts, env: CheckEnv) => CheckOutcome;

const OPERATOR_SYMBOLS: Record<string, string> = { EQ: "=", NE: "≠", LT: "<", GT: ">", LE: "≤", GE: "≥" };

function selection(data: NodeData): string[] {
  return asStrings(data.values);
}

/** A list check on a fact that may be absent: absent passes only when nothing is required. */
function listOrAbsent(actual: readonly string[] | null, values: readonly string[], absent: ReasonCode): CheckOutcome {
  if (!values.length) return passed("empty");
  if (!actual) return hasIncluded(values) ? failed(absent) : passed(absent);
  return matchValues(actual, values);
}

/** A list check on a fact that must be present. */
function listRequired(actual: readonly string[] | null, values: readonly string[], absent: ReasonCode): CheckOutcome {
  if (!values.length) return passed("empty");
  if (!actual) return failed(absent);
  return matchValues(actual, values);
}

/** Drop conditions the creature is immune to from a selection (v1 behaviour). */
function withoutImmune(values: readonly string[], immunities: readonly string[]): string[] {
  return values.filter(value => !immunities.includes(value.replace(/^!+/, "")));
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

/** A creature's hit points against an "at most / at least N%" threshold. */
function healthThreshold(data: NodeData, hp: number | null): CheckOutcome {
  const value = asNumber(data.value);
  if (value === null) return passed("empty");
  if (hp === null) return failed("noValue");
  const atLeast = asString(data.type) === "atLeast";
  const ok = atLeast ? (hp >= value) : (hp <= value);
  const values = { actual: `${Math.round(hp)}%`, expected: `${atLeast ? "≥" : "≤"} ${value}%` };
  return ok ? passed("matched", { actual: values.actual }) : failed("threshold", values);
}

function compareText(operator: string, left: string, right: string): boolean {
  if ((operator === "LT") || (operator === "LE")) return right.includes(left);
  if ((operator === "GT") || (operator === "GE")) return left.includes(right);
  return left === right;
}

export const EVALUATORS: Record<string, Evaluator> = {
  itemTypes: (data, facts) => listRequired(facts.item ? [facts.item.type] : null, selection(data), "noItem"),

  identifiers: (data, facts) => listRequired(facts.item ? [facts.item.identifier] : null, selection(data), "noItem"),

  baseWeapons: (data, facts) => listOrAbsent((facts.item?.type === "weapon") ? facts.item.baseTypes : null, selection(data), "notWeapon"),

  weaponProperties: (data, facts) => listOrAbsent((facts.item?.type === "weapon") ? facts.item.properties : null, selection(data), "notWeapon"),

  attackModes: (data, facts) => {
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
  },

  featureTypes: (data, facts) => {
    const type = asString(data.type);
    if (!type) return passed("empty");
    if (facts.item?.type !== "feat") return failed("notFeature", { actual: facts.item?.type ?? "—" });
    if (facts.item.featureType !== type) return failed("notMatched", { actual: facts.item.featureType ?? "—", expected: type });
    const subtype = asString(data.subtype);
    if (subtype && (facts.item.featureSubtype !== subtype)) {
      return failed("notMatched", { actual: facts.item.featureSubtype ?? "—", expected: subtype });
    }
    return passed("matched", { actual: [type, subtype].filter(Boolean).join(", ") });
  },

  damageTypes: (data, facts) => listRequired(facts.activity?.damageTypes ?? null, selection(data), "noActivity"),

  abilities: (data, facts) => {
    const values = selection(data);
    if (!values.length) return passed("empty");
    const ability = facts.roll.toolKeys.length ? facts.roll.abilityId : (facts.activity ? facts.activity.ability : facts.roll.abilityId);
    return ability ? matchValues([ability], values) : failed("noValue");
  },

  thisItem: (_data, facts, env) => {
    if (!env.carrierItemUuid) return passed("empty");
    return (facts.item?.uuid === env.carrierItemUuid) ? passed("matched", { actual: facts.item.identifier }) : failed("otherItem");
  },

  spellLevels: (data, facts) => listRequired(facts.item?.spell ? [String(facts.item.spell.level)] : null, selection(data), "notSpell"),

  spellSchools: (data, facts) => listOrAbsent(facts.item?.spell ? [facts.item.spell.school] : null, selection(data), "notSpell"),

  spellComponents: (data, facts) => {
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
  },

  preparationModes: (data, facts) => listRequired(facts.item?.spell ? [facts.item.spell.method] : null, selection(data), "notSpell"),

  sourceClasses: (data, facts) => {
    const values = selection(data);
    if (!values.length) return passed("empty");
    if (!facts.item?.spell) return passed("notSpell");
    return matchValues([facts.item.spell.sourceClass], values);
  },

  actorCreatureTypes: (data, facts) => matchValues(facts.actor.creatureTypes, selection(data)),

  actorCreatureSizes: (data, facts) => listRequired(facts.actor.size ? [facts.actor.size] : null, selection(data), "noValue"),

  actorLanguages: (data, facts) => matchValues(facts.actor.languages, selection(data)),

  baseArmors: (data, facts) => matchValues(facts.actor.armor, selection(data)),

  statusEffects: (data, facts) => matchValues(facts.actor.statuses, withoutImmune(selection(data), facts.actor.conditionImmunities)),

  counter: (data, _facts, env) => {
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
  },

  healthPercentages: (data, facts) => healthThreshold(data, facts.actor.hpPercent),

  remainingSpellSlots: (data, facts) => {
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
  },

  proficiencyLevels: (data, facts) => listRequired((facts.roll.proficiency === null) ? null : [String(facts.roll.proficiency)], selection(data), "noValue"),

  markers: (data, facts) => {
    const values = selection(data);
    if (!values.length) return passed("empty");
    return matchValues([...(facts.item?.markers ?? []), ...facts.actor.markers], values);
  },

  creatureTypes: (data, facts) => listOrAbsent(facts.target?.creatureTypes ?? null, selection(data), "noTarget"),

  targetArmors: (data, facts) => listOrAbsent(facts.target?.armor ?? null, selection(data), "noTarget"),

  targetEffects: (data, facts) => {
    const target = facts.target;
    return listOrAbsent(target?.statuses ?? null, withoutImmune(selection(data), target?.conditionImmunities ?? []), "noTarget");
  },

  tokenSizes: (data, facts) => {
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
  },

  targetHealthPercentages: (data, facts) => {
    if (!facts.target && (asNumber(data.value) !== null)) return failed("noTarget");
    return healthThreshold(data, facts.target?.hpPercent ?? null);
  },

  targetMarkers: (data, facts) => listRequired(facts.target?.markers ?? null, selection(data), "noTarget"),

  saveAbilities: (data, facts) => listRequired(facts.activity?.dcAbility ? [facts.activity.dcAbility] : null, selection(data), "noValue"),

  throwTypes: (data, facts) => {
    const actual = [
      facts.roll.saveAbility,
      facts.roll.isDeath ? "death" : null,
      facts.roll.isConcentration ? "concentration" : null
    ].filter((value): value is string => value !== null);
    return listRequired(actual.length ? actual : null, selection(data), "noValue");
  },

  skillIds: (data, facts) => listOrAbsent(facts.roll.skillId ? [facts.roll.skillId] : null, selection(data), "noValue"),

  baseTools: (data, facts) => listOrAbsent(facts.roll.toolKeys.length ? facts.roll.toolKeys : null, selection(data), "noValue"),

  arbitraryComparisons: (data, _facts, env) => {
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
  },

  customScripts: (data, facts, env) => {
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

export function evaluateCheck(type: string, data: NodeData, facts: RollFacts, env: CheckEnv): CheckOutcome {
  const evaluator = EVALUATORS[type];
  return evaluator ? evaluator(data, facts, env) : failed("noValue");
}
