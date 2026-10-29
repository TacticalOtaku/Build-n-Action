import { asBoolean, asRecord, asString } from "../core/registry/data";

/** A diceModifiers result with its formulas evaluated; parts that do nothing are null. */
export interface ModifierSpec {
  amount: { multiply: boolean; value: number } | null;
  size: { multiply: boolean; value: number } | null;
  reroll: { value: number | null; invert: boolean; recursive: boolean; limit: number | null } | null;
  explode: { value: number | null; once: boolean; limit: number | null } | null;
  minimum: { value: number | null; maximize: boolean } | null;
  maximum: { value: number; zero: boolean } | null;
  /** Modify only the first die of the first part that has dice. */
  firstOnly: boolean;
}

/** A die as the modifiers see it; the Foundry adapter maps it to and from a Die term. */
export interface DieLike {
  number: number | null;
  faces: number | null;
  modifiers: string[];
}

type Evaluate = (formula: string) => number | null;

function rounded(formula: unknown, evaluate: Evaluate): number | null {
  const text = asString(formula).trim();
  if (!text) return null;
  const value = evaluate(text);
  return ((value === null) || !Number.isFinite(value)) ? null : Math.round(value);
}

function positive(formula: unknown, evaluate: Evaluate): number | null {
  const value = rounded(formula, evaluate);
  return ((value !== null) && (value > 0)) ? value : null;
}

/** Evaluate a diceModifiers result's values (as v1's ModifiersModel#prepareDerivedData); null when inactive. */
export function resolveModifiers(data: Readonly<Record<string, unknown>>, evaluate: Evaluate): ModifierSpec | null {
  const part = (key: string) => asRecord(data[key]);
  const enabled = (key: string) => asBoolean(part(key).enabled);
  const value = (key: string) => rounded(part(key).value, evaluate);

  const amount = value("amount");
  const size = value("size");
  const minimum = value("minimum");
  const maximum = value("maximum");
  const spec: ModifierSpec = {
    amount: (enabled("amount") && (amount !== null)) ? { multiply: asString(part("amount").mode) === "multiply", value: amount } : null,
    size: (enabled("size") && (size !== null)) ? { multiply: asString(part("size").mode) === "multiply", value: size } : null,
    reroll: enabled("reroll")
      ? {
        value: value("reroll"), invert: asBoolean(part("reroll").invert), recursive: asBoolean(part("reroll").recursive),
        limit: positive(part("reroll").limit, evaluate)
      }
      : null,
    explode: enabled("explode")
      ? { value: value("explode"), once: asBoolean(part("explode").once), limit: positive(part("explode").limit, evaluate) }
      : null,
    minimum: (enabled("minimum") && (asBoolean(part("minimum").maximize) || ((minimum !== null) && (minimum !== 0))))
      ? { value: minimum, maximize: asBoolean(part("minimum").maximize) }
      : null,
    maximum: (enabled("maximum") && (maximum !== null)) ? { value: maximum, zero: asBoolean(part("maximum").zero) } : null,
    firstOnly: asBoolean(data.firstOnly)
  };
  const active = spec.amount || spec.size || spec.reroll || spec.explode || spec.minimum || spec.maximum;
  return active ? spec : null;
}

const EXISTING = {
  reroll: /rr?([0-9]+)?([<>=]+)?([0-9]+)?/i,
  explode: /xo?([0-9]+)?([<>=]+)?([0-9]+)?/i,
  minimum: /(?:min)([0-9]+)/i,
  maximum: /(?:max)([0-9]+)/i
};

function has(die: DieLike, kind: keyof typeof EXISTING): boolean {
  return die.modifiers.some(modifier => EXISTING[kind].test(modifier));
}

function reroll(die: DieLike, faces: number, rule: NonNullable<ModifierSpec["reroll"]>): void {
  if (has(die, "reroll")) return;
  const prefix = rule.recursive ? (rule.limit ? `rr${rule.limit}` : "rr") : "r";
  const v = rule.value ?? 1;
  let modifier: string;
  if (rule.invert) {
    if (v > 0) modifier = (v >= faces) ? `${prefix}=${faces}` : `${prefix}>${v}`;
    else if (v === 0) modifier = `${prefix}=${faces}`;
    else modifier = ((faces + v) <= 1) ? `${prefix}=1` : `${prefix}>${faces + v}`;
  } else if (v > 0) {
    modifier = (v === 1) ? `${prefix}=1` : `${prefix}<${Math.min(faces, v)}`;
  } else if (v === 0) {
    modifier = `${prefix}=1`;
  } else {
    modifier = ((faces + v) <= 1) ? `${prefix}=1` : `${prefix}<${faces + v}`;
  }
  if (faces > 1) die.modifiers.push(modifier);
}

function explode(die: DieLike, faces: number, rule: NonNullable<ModifierSpec["explode"]>): void {
  if (has(die, "explode")) return;
  const v = rule.value ?? 0;
  const limit = rule.limit;
  const prefix = (rule.once || (limit === 1)) ? "xo" : (limit ? `x${limit}` : "x");
  const atMax = /x\d+/.test(prefix) ? `${prefix}=${faces}` : prefix;
  let modifier: string;
  let valid: boolean;
  if (v === 0) {
    modifier = atMax;
    valid = (faces > 1) || (prefix === "xo");
  } else if (v > 0) {
    modifier = (v >= faces) ? atMax : `${prefix}>=${v}`;
    valid = (v <= faces) && (((v === 1) && (prefix === "xo")) || (v > 1));
  } else {
    const threshold = Math.max(1, faces + v);
    modifier = `${prefix}>=${threshold}`;
    valid = (threshold > 1) || (prefix === "xo");
  }
  if (valid || limit) die.modifiers.push(modifier);
}

function minimum(die: DieLike, faces: number, rule: NonNullable<ModifierSpec["minimum"]>): void {
  if (has(die, "minimum")) return;
  const min = rule.value ?? 0;
  const modifier = rule.maximize ? `min${faces}` : `min${(min > 0) ? Math.min(min, faces) : Math.max(1, faces + min)}`;
  if (modifier !== "min1") die.modifiers.push(modifier);
}

function maximum(die: DieLike, faces: number, rule: NonNullable<ModifierSpec["maximum"]>): void {
  if (has(die, "maximum")) return;
  const v = rule.value;
  const floor = rule.zero ? 0 : 1;
  const max = (v === 0) ? floor : ((v > 0) ? v : Math.max(floor, faces + v));
  if (max < faces) die.modifiers.push(`max${max}`);
}

/** Apply a modifier spec to one die, as v1's ModifiersModel#modifyDie. */
export function modifyDie(die: DieLike, spec: ModifierSpec): void {
  if (spec.amount && Number.isInteger(die.number)) {
    const number = die.number as number;
    die.number = Math.max(0, spec.amount.multiply ? number * spec.amount.value : number + spec.amount.value);
  }
  if (spec.size && Number.isInteger(die.faces)) {
    const faces = die.faces as number;
    die.faces = Math.max(0, spec.size.multiply ? faces * spec.size.value : faces + spec.size.value);
  }
  if (!Number.isInteger(die.faces)) return;
  const faces = die.faces as number;
  if (spec.reroll) reroll(die, faces, spec.reroll);
  if (spec.explode) explode(die, faces, spec.explode);
  if (spec.minimum) minimum(die, faces, spec.minimum);
  if (spec.maximum) maximum(die, faces, spec.maximum);
}
