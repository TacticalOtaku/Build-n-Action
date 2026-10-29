import { createBlueprint, createNode } from "../blueprint/factory";
import { isValidId, randomId } from "../blueprint/ids";
import {
  DEFAULT_BLUEPRINT_IMG, type BlueprintEdge, type BlueprintNode, type BlueprintSource, type ConditionCheck
} from "../blueprint/types";
import type { EventType, PinId } from "../registry/constants";
import { asBoolean, asNumber, asRecord, asString } from "../registry/data";
import { REACH_FIELD } from "../registry/events";
import { defaultsFor } from "../registry/fields";
import { COMMON_RESULT_FIELDS, getResult } from "../registry/index";

export const LEGACY_VERSION = "1.0.6";

/** The kind of document a v1 bonus was stored on; it decides the reach of region and template bonuses. */
export type LegacyCarrier = "actor" | "item" | "effect" | "region" | "template";

export const CONVERSION_WARNINGS = ["invalidId", "unknownFilter", "unknownType"] as const;

export type ConversionWarningCode = (typeof CONVERSION_WARNINGS)[number];

/** Something the migration report should mention; the text is `BNA.Migration.Warning.<code>`. */
export interface ConversionWarning {
  code: ConversionWarningCode;
  values?: Record<string, string>;
}

export interface ConversionResult {
  blueprint: BlueprintSource | null;
  warnings: ConversionWarning[];
}

export interface ConversionOptions {
  /** Id to use when the stored id is invalid; defaults to a random one. */
  fallbackId?: string;
}

const EVENT_BY_TYPE: Record<string, EventType> = {
  attack: "attackRoll", damage: "damageRoll", save: "saveDC", throw: "savingThrow", test: "abilityCheck", hitdie: "hitDie"
};

/** Filters whose value is a plain list (numbers are turned into strings). */
const LIST_FILTERS = new Set([
  "abilities", "actorCreatureSizes", "actorCreatureTypes", "actorLanguages", "baseArmors", "baseTools", "baseWeapons",
  "creatureTypes", "damageTypes", "itemTypes", "preparationModes", "proficiencyLevels", "saveAbilities", "skillIds",
  "spellLevels", "spellSchools", "statusEffects", "targetArmors", "targetEffects", "throwTypes", "weaponProperties"
]);

const OPERATORS = new Set(["EQ", "LT", "GT", "LE", "GE"]);
const COLUMN = 324;
const ROW = 198;
const GRID = 18;

function text(value: unknown): string {
  return (typeof value === "number") ? String(value) : asString(value);
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => ((typeof entry === "string") || (typeof entry === "number")) ? [String(entry)] : []);
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|br|li|h\d)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The data migrations v1's ContextualBonus.migrateData applied on load. */
function premigrate(raw: unknown): Record<string, unknown> {
  const source = structuredClone(asRecord(raw));
  const bonuses = asRecord(source.bonuses);
  source.bonuses = bonuses;

  const minimum = asRecord(asRecord(bonuses.modifiers).minimum);
  if (!("maximize" in minimum) && (minimum.value === "-1")) {
    minimum.value = "";
    minimum.maximize = true;
  }
  if (bonuses.deathSaveTargetValue) bonuses.targetValue = bonuses.deathSaveTargetValue;
  const damageType = bonuses.damageType ?? source.damageType;
  if (typeof damageType === "string") bonuses.damageType = [damageType];

  const filters = asRecord(source.filters);
  source.filters = filters;
  if (Array.isArray(filters.arbitraryComparison) && filters.arbitraryComparison.length && !filters.arbitraryComparisons) {
    filters.arbitraryComparisons = filters.arbitraryComparison;
  }

  const aura = asRecord(source.aura);
  source.aura = aura;
  if (aura.isTemplate) aura.template = aura.isTemplate;
  return source;
}

function reachFor(auraRaw: unknown, carrier: LegacyCarrier): Record<string, unknown> {
  const reach = asRecord(defaultsFor([REACH_FIELD]).reach);
  if (carrier === "region") return { ...reach, mode: "region" };
  const aura = asRecord(auraRaw);
  if (!asBoolean(aura.enabled) && (carrier !== "template")) return { ...reach, mode: "self" };
  const require = asRecord(aura.require);
  const disposition = String(asNumber(aura.disposition) ?? 2);
  return {
    ...reach,
    mode: (asBoolean(aura.template) || (carrier === "template")) ? "template" : "aura",
    range: text(aura.range).trim() || "0",
    disposition: ["2", "1", "-1"].includes(disposition) ? disposition : "2",
    includeSelf: aura.self !== false,
    blockers: list(aura.blockers),
    require: {
      sight: asBoolean(require.sight), move: asBoolean(require.move), sound: asBoolean(require.sound), light: asBoolean(require.light)
    }
  };
}

function convertFilters(filtersRaw: unknown, warnings: ConversionWarning[]): ConditionCheck[] {
  const checks: ConditionCheck[] = [];
  const add = (type: string, data: Record<string, unknown>) => checks.push({ id: `c-${type}`, type, data });

  for (const [key, value] of Object.entries(asRecord(filtersRaw))) {
    if (LIST_FILTERS.has(key)) {
      const values = list(value);
      if (values.length) add(key, { values });
      continue;
    }
    const record = asRecord(value);
    switch (key) {
      case "identifiers":
      case "sourceClasses": {
        const values = list(record.values);
        if (values.length) add(key, { values });
        break;
      }
      case "markers": {
        const own = list(record.values);
        const target = list(record.target);
        if (own.length) add("markers", { values: own });
        if (target.length) add("targetMarkers", { values: target });
        break;
      }
      case "attackModes": {
        const data = { value: list(record.value), classification: list(record.classification), mode: list(record.mode) };
        if (data.value.length || data.classification.length || data.mode.length) add(key, data);
        break;
      }
      case "featureTypes": {
        const type = text(record.type);
        if (type) add(key, { type, subtype: text(record.subtype) });
        break;
      }
      // v1 stored these with defaults (value 50, size 2) and counted them only once a type was chosen.
      case "healthPercentages": {
        const threshold = asNumber(record.value);
        const type = asNumber(record.type);
        if ((threshold !== null) && (type !== null)) add(key, { value: threshold, type: (type === 1) ? "atLeast" : "atMost" });
        break;
      }
      case "remainingSpellSlots": {
        const min = asNumber(record.min);
        const max = asNumber(record.max);
        if ((min !== null) || (max !== null)) add(key, { min, max, size: asBoolean(record.size) });
        break;
      }
      case "spellComponents": {
        const types = list(record.types);
        if (types.length) add(key, { types, match: (text(record.match).toUpperCase() === "ALL") ? "all" : "any" });
        break;
      }
      case "tokenSizes": {
        const size = asNumber(record.size);
        const type = asNumber(record.type);
        if ((size !== null) && (size > 0) && (type !== null)) add(key, { size, type: (type === 1) ? "atMost" : "atLeast", self: asBoolean(record.self) });
        break;
      }
      case "arbitraryComparisons": {
        const rows = Array.isArray(value) ? value.map(asRecord).map(row => ({
          one: text(row.one), operator: OPERATORS.has(text(row.operator)) ? text(row.operator) : "EQ", other: text(row.other)
        })) : [];
        if (rows.length) add(key, { comparisons: rows });
        break;
      }
      case "customScripts": {
        const script = text(value).trim();
        if (script) add(key, { script });
        break;
      }
      case "arbitraryComparison":
        break;
      default:
        warnings.push({ code: "unknownFilter", values: { filter: key } });
    }
  }
  return checks;
}

function convertModifiers(raw: unknown): Record<string, unknown> | null {
  const source = asRecord(raw);
  const part = (key: string) => asRecord(source[key]);
  const mode = (value: unknown) => (Number(value) === 1) ? "multiply" : "add";
  const data = {
    amount: { enabled: asBoolean(part("amount").enabled), mode: mode(part("amount").mode), value: text(part("amount").value) },
    size: { enabled: asBoolean(part("size").enabled), mode: mode(part("size").mode), value: text(part("size").value) },
    reroll: {
      enabled: asBoolean(part("reroll").enabled), value: text(part("reroll").value), invert: asBoolean(part("reroll").invert),
      recursive: asBoolean(part("reroll").recursive), limit: text(part("reroll").limit)
    },
    explode: {
      enabled: asBoolean(part("explode").enabled), value: text(part("explode").value), once: asBoolean(part("explode").once),
      limit: text(part("explode").limit)
    },
    minimum: { enabled: asBoolean(part("minimum").enabled), value: text(part("minimum").value), maximize: asBoolean(part("minimum").maximize) },
    maximum: { enabled: asBoolean(part("maximum").enabled), value: text(part("maximum").value), zero: asBoolean(part("maximum").zero) },
    firstOnly: asBoolean(asRecord(source.config).first)
  };
  const any = [data.amount, data.size, data.reroll, data.explode, data.minimum, data.maximum].some(entry => entry.enabled);
  return any ? data : null;
}

interface PlannedResult {
  type: string;
  data: Record<string, unknown>;
}

function plannedResults(type: string, bonuses: Record<string, unknown>): PlannedResult[] {
  const results: PlannedResult[] = [];
  const field = (key: string) => text(bonuses[key]).trim();
  const bonus = field("bonus");
  if (bonus) {
    if (type === "save") results.push({ type: "dcBonus", data: { formula: bonus } });
    else results.push({ type: "rollBonus", data: { formula: bonus, damageTypes: (type === "damage") ? list(bonuses.damageType) : [] } });
  }
  if ((type === "attack") && (field("criticalRange") || field("fumbleRange"))) {
    results.push({ type: "critRange", data: { critical: field("criticalRange"), fumble: field("fumbleRange") } });
  }
  if ((type === "damage") && (field("criticalBonusDice") || field("criticalBonusDamage"))) {
    results.push({ type: "critDamage", data: { dice: field("criticalBonusDice"), damage: field("criticalBonusDamage") } });
  }
  if ((type === "throw") && (field("targetValue") || field("deathSaveCritical"))) {
    results.push({ type: "saveThresholds", data: { targetValue: field("targetValue"), deathSaveCritical: field("deathSaveCritical") } });
  }
  if ((type === "damage") || (type === "hitdie")) {
    const modifiers = convertModifiers(bonuses.modifiers);
    if (modifiers) results.push({ type: "diceModifiers", data: modifiers });
  }
  return results;
}

/** v1's isOptionable: which bonuses could be optional at all. */
function optionable(type: string, bonuses: Record<string, unknown>, results: readonly PlannedResult[]): boolean {
  if ((type === "damage") || (type === "hitdie")) return results.length > 0;
  if ((type === "attack") || (type === "throw") || (type === "test")) return !!text(bonuses.bonus).trim();
  return false;
}

function costFor(consumeRaw: unknown): Record<string, unknown> {
  const base = asRecord(defaultsFor(COMMON_RESULT_FIELDS).cost);
  const consume = asRecord(consumeRaw);
  const type = text(consume.type);
  if (!asBoolean(consume.enabled) || !type) return base;
  const value = asRecord(consume.value);
  return {
    ...base,
    type,
    subtype: text(consume.subtype),
    min: text(value.min).trim() || "1",
    max: text(value.max).trim(),
    step: asNumber(value.step) ?? 1,
    scales: asBoolean(consume.scales),
    formula: text(consume.formula).trim()
  };
}

function edge(source: string, pin: PinId, target: string): BlueprintEdge {
  return { id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" };
}

/** Convert one v1.0.6 bonus into an equivalent blueprint (see the plan for the rules). */
export function convertLegacyBonus(raw: unknown, carrier: LegacyCarrier, options: ConversionOptions = {}): ConversionResult {
  const source = premigrate(raw);
  const legacyType = text(source.type);
  const eventType = EVENT_BY_TYPE[legacyType];
  if (!eventType) return { blueprint: null, warnings: [{ code: "unknownType", values: { type: legacyType || "—" } }] };

  const warnings: ConversionWarning[] = [];
  const legacyId = text(source.id);
  let id = legacyId;
  if (!isValidId(id)) {
    warnings.push({ code: "invalidId" });
    id = options.fallbackId ?? randomId();
  }

  const checks = convertFilters(source.filters, warnings);
  // v1 "exclusive": only rolls with the carrying item, which is the condition's own tick now.
  const onlyThisItem = asBoolean(source.exclusive);
  const needsCondition = (checks.length > 0) || onlyThisItem;

  const bonuses = asRecord(source.bonuses);
  let planned = plannedResults(legacyType, bonuses);
  const optional = asBoolean(source.optional) && optionable(legacyType, bonuses, planned);
  if (!planned.length && asBoolean(source.optional) && asBoolean(source.reminder) && (legacyType !== "save")) {
    planned = [{ type: "reminder", data: { text: stripHtml(text(source.description)) || text(source.name) } }];
  }

  const cost = costFor(source.consume);
  const centre = Math.round(((Math.max(planned.length, 1) - 1) * ROW) / 2 / GRID) * GRID;
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];

  const event = createNode("event", eventType, { x: 0, y: centre });
  nodes.push({ ...event, id: "event", data: { ...event.data, reach: reachFor(source.aura, carrier) } });
  let from: { id: string; pin: PinId } = { id: "event", pin: "out" };

  if (needsCondition) {
    const condition = createNode("condition", "condition", { x: COLUMN, y: centre });
    nodes.push({ ...condition, id: "condition", data: { mode: "all", thisItem: onlyThisItem, checks } });
    edges.push(edge("event", "out", "condition"));
    from = { id: "condition", pin: "yes" };
  }

  const column = needsCondition ? COLUMN * 2 : COLUMN;
  planned.forEach((result, index) => {
    const created = createNode("result", result.type, { x: column, y: index * ROW });
    const supportsOptional = getResult(result.type)?.supportsOptional ?? false;
    const common = {
      ...asRecord(created.data.common),
      ...((optional && supportsOptional) ? { optional: true, choiceGroup: id, cost } : {})
    };
    nodes.push({ ...created, id: result.type, data: { ...created.data, ...result.data, common } });
    edges.push(edge(from.id, from.pin, result.type));
  });

  const flags = asRecord(source.flags);
  const blueprint = createBlueprint({
    id,
    name: text(source.name),
    img: text(source.img) || DEFAULT_BLUEPRINT_IMG,
    description: text(source.description),
    enabled: source.enabled !== false,
    sort: asNumber(source.sort) ?? 0,
    nodes,
    edges,
    flags: {
      ...flags,
      "build-n-action": {
        ...asRecord(flags["build-n-action"]),
        migratedFrom: LEGACY_VERSION,
        ...((id === legacyId) ? {} : { legacyId })
      }
    }
  });
  return { blueprint, warnings };
}
