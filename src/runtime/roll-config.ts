// Changes to dnd5e roll process configurations ({rolls: [{parts, data, options}], target, critical}),
// the same mutations v1.0.6 applied in its pre-roll hooks and optional selector.

export interface RollConfigEntry {
  parts?: unknown[];
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ProcessConfig {
  rolls?: RollConfigEntry[];
  data?: Record<string, unknown>;
  target?: unknown;
  critical?: { bonusDice?: number; bonusDamage?: string };
}

function isEntry(roll: unknown): roll is RollConfigEntry {
  return !!roll && (typeof roll === "object");
}

function entries(config: ProcessConfig): RollConfigEntry[] {
  return (config.rolls ?? []).filter(isEntry);
}

/** Append an additive part to every roll. */
export function appendRollPart(config: ProcessConfig, part: string): void {
  for (const roll of entries(config)) (roll.parts ??= []).push(part);
}

/**
 * Plain target roll data with dnd5e 5.3's senses shims (non-configurable getters such as `senses.darkvision` that
 * log a deprecation when the roll dialog deep-clones its configuration) turned into plain values from
 * `senses.ranges`. Roll data shares objects with the actor, so only the objects on the way to a shimmed senses
 * object are copied; everything else, and the actor, stays as it is.
 */
function withoutSenseShims(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (!value || (typeof value !== "object")) return value;
  if (seen.has(value)) return seen.get(value);
  seen.set(value, value);
  let result: unknown = value;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    const items = value.map(item => withoutSenseShims(item, seen));
    if (items.some((item, index) => item !== value[index])) result = items;
  } else if ((prototype === Object.prototype) || (prototype === null)) {
    const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(value);
    const ranges = descriptors.ranges;
    const shimmed = (ranges && ("value" in ranges)) ? ranges.value as Record<string, unknown> : null;
    let changed = false;
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor)) {
        if (!shimmed) continue;
        descriptors[key] = { value: shimmed[key], enumerable: descriptor.enumerable, writable: true, configurable: true };
        changed = true;
        continue;
      }
      const next = withoutSenseShims(descriptor.value, seen);
      if (next === descriptor.value) continue;
      descriptors[key] = { ...descriptor, value: next };
      changed = true;
    }
    if (changed) result = Object.create(prototype, descriptors);
  }
  seen.set(value, result);
  return result;
}

/** Make `@target` available to every roll (dnd5e merges its own roll data into these containers later). */
export function injectTargetData(config: ProcessConfig, targetData: Record<string, unknown>): void {
  const target = withoutSenseShims(targetData);
  if (config.data && (typeof config.data === "object")) config.data.target = target;
  for (const roll of entries(config)) (roll.data ??= {}).target = target;
}

/** A stored number, or the fallback when absent or not a number (0 is kept). */
function numberOr(value: unknown, fallback: number): number {
  const number = ((value === undefined) || (value === null)) ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Widen the critical range by `success` and the fumble range by `failure` on every roll. */
export function adjustCriticalRanges(config: ProcessConfig, success: number, failure: number, allowFailureBelowOne: boolean): void {
  for (const roll of entries(config)) {
    const options = (roll.options ??= {});
    options.criticalSuccess = Math.max(1, numberOr(options.criticalSuccess, 20) - success);
    let fumble = numberOr(options.criticalFailure, 1) + failure;
    if ((fumble < 1) && !allowFailureBelowOne) fumble = 1;
    options.criticalFailure = fumble;
  }
}

/** Lower a save's target by `targetBonus`; for death saves also widen the critical success range. */
export function adjustSavingThrowRanges(config: ProcessConfig, targetBonus: number, criticalBonus: number, isDeath: boolean): void {
  if (Number.isFinite(Number(config.target))) config.target = Number(config.target) - targetBonus;
  if (!isDeath) return;
  for (const roll of entries(config)) {
    const options = (roll.options ??= {});
    const critical = Math.max(1, numberOr(options.criticalSuccess, 20) - criticalBonus);
    options.criticalSuccess = critical;
    if (Number.isFinite(Number(config.target))) config.target = Math.min(critical, Number(config.target));
  }
}

export function joinFormula(current: string, addition: string): string {
  if (!addition) return current;
  return current ? `${current} + ${addition}` : addition;
}

function typesOf(roll: RollConfigEntry): unknown[] {
  const types = roll.options?.types;
  return Array.isArray(types) ? types : [];
}

/**
 * Add a damage bonus: untyped bonuses join the first roll, a single type joins a roll of that
 * type, and anything else becomes its own roll carrying the bonus's types.
 */
export function appendDamagePart(config: ProcessConfig, formula: string, types: readonly string[], rollData: Record<string, unknown>): void {
  const rolls = entries(config);
  const first = rolls[0];
  let roll: RollConfigEntry | undefined;
  if (!types.length) roll = first;
  else if (types.length === 1) roll = rolls.find(candidate => typesOf(candidate).includes(types[0]));
  if (roll) {
    (roll.parts ??= []).push(formula);
    return;
  }
  const properties = first?.options?.properties;
  (config.rolls ??= []).push({
    data: rollData,
    parts: [formula],
    options: { properties: Array.isArray(properties) ? [...properties] : [], type: types[0], types: [...types] }
  });
}

/** Add extra critical dice and critical damage. */
export function addCriticalBonus(config: ProcessConfig, dice: number, damage: string): void {
  const critical = (config.critical ??= {});
  critical.bonusDice = (critical.bonusDice ?? 0) + dice;
  critical.bonusDamage = joinFormula(critical.bonusDamage ?? "", damage);
}

/** Clamp extra critical dice at 0 and drop critical damage that is not a valid formula. */
export function sanitizeCritical(config: ProcessConfig, validateFormula: (formula: string) => boolean): void {
  const critical = (config.critical ??= {});
  critical.bonusDice = Math.max(0, critical.bonusDice ?? 0);
  if (critical.bonusDamage && !validateFormula(critical.bonusDamage)) critical.bonusDamage = "";
}
