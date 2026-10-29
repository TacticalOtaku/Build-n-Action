import type { EventType } from "./constants";

/** Choice lists that only exist at runtime (CONFIG.DND5E, the carrying document, …). */
export type DynamicChoiceSource =
  | "abilities"
  | "actorSizes"
  | "armorTypes"
  | "attackClassifications"
  | "attackModes"
  | "attackTypes"
  | "creatureTypes"
  | "currencies"
  | "damageAndHealingTypes"
  | "documentEffects"
  | "featureTypes"
  | "itemTypes"
  | "languages"
  | "proficiencyLevels"
  | "skills"
  | "spellComponents"
  | "spellLevels"
  | "spellMethods"
  | "spellSchools"
  | "spellSlotLevels"
  | "statusEffects"
  | "throwTypes"
  | "tools"
  | "weaponProperties"
  | "weaponTypes";

/** A choice defined by the module itself; `label` is an i18n key. */
export interface StaticChoice {
  readonly value: string;
  readonly label: string;
}

/** A choice supplied at runtime; `label` is already localized. */
export interface Choice {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}

export type ChoiceSpec =
  | { readonly static: readonly StaticChoice[] }
  | { readonly source: DynamicChoiceSource };

/** Show a field only while a sibling value is one of `in`. */
export interface VisibleWhen {
  readonly key: string;
  readonly in: readonly unknown[];
}

export type ComparisonOperator = "EQ" | "LT" | "GT" | "LE" | "GE";

export interface Comparison {
  one: string;
  operator: ComparisonOperator;
  other: string;
}

interface FieldBase {
  readonly key: string;
  /** i18n key of the field label. */
  readonly label: string;
  /** i18n key of the hint shown under the field. */
  readonly hint?: string;
  readonly visibleWhen?: VisibleWhen;
  /** Only meaningful when an upstream event is one of these (e.g. damage types on damage rolls). */
  readonly onlyFor?: readonly EventType[];
  /** A text field that suggests known names ("counters": counter names). */
  readonly suggest?: "counters";
}

export type FieldSpec =
  | (FieldBase & { readonly kind: "formula"; readonly default: string })
  | (FieldBase & { readonly kind: "text"; readonly default: string; readonly multiline?: boolean })
  | (FieldBase & {
    readonly kind: "number";
    readonly default: number | null;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
  })
  | (FieldBase & { readonly kind: "toggle"; readonly default: boolean })
  | (FieldBase & { readonly kind: "select"; readonly default: string; readonly choices: ChoiceSpec })
  | (FieldBase & {
    readonly kind: "multiselect";
    readonly default: readonly string[];
    readonly choices: ChoiceSpec;
    /** Values may be stored with a leading "!" to require that they do not match. */
    readonly exclusion?: boolean;
  })
  | (FieldBase & { readonly kind: "tags"; readonly default: readonly string[] })
  | (FieldBase & { readonly kind: "comparisons"; readonly default: readonly Comparison[] })
  | (FieldBase & { readonly kind: "script"; readonly default: string })
  | (FieldBase & { readonly kind: "embeddedResult"; readonly allowed: readonly string[] })
  | (FieldBase & { readonly kind: "group"; readonly fields: readonly FieldSpec[] });

export type FieldKind = FieldSpec["kind"];

/** Initial data for a list of fields; nested groups become nested objects. */
export function defaultsFor(fields: readonly FieldSpec[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    // Several specs may share one key and differ only in visibility (e.g. a cost subtype);
    // they describe the same stored value, so the first default wins.
    if (field.key in data) continue;
    data[field.key] = defaultOf(field);
  }
  return data;
}

function defaultOf(field: FieldSpec): unknown {
  switch (field.kind) {
    case "group":
      return defaultsFor(field.fields);
    case "embeddedResult":
      return null;
    case "multiselect":
    case "tags":
      return [...field.default];
    case "comparisons":
      return field.default.map(comparison => ({ ...comparison }));
    default:
      return field.default;
  }
}

/** Whether a field is shown, given the data object it lives in. */
export function isFieldVisible(field: FieldSpec, data: Readonly<Record<string, unknown>>): boolean {
  const rule = field.visibleWhen;
  return !rule || rule.in.includes(data[rule.key]);
}

/** Visit every field, descending into groups depth-first. */
export function walkFields(fields: readonly FieldSpec[], visit: (field: FieldSpec) => void): void {
  for (const field of fields) {
    visit(field);
    if (field.kind === "group") walkFields(field.fields, visit);
  }
}
