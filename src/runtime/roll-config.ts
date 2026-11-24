// Changes to dnd5e roll process configurations ({rolls: [{parts, data, options}], target, critical}),
// the same mutations v1.0.6 applied in its pre-roll hooks and optional selector.

import type { RollMode } from "../core/facts/types";
import { asRecord } from "../core/registry/data";

export type { RollMode };

export interface RollConfigEntry {
  parts?: unknown[];
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface ProcessConfig {
  advantage?: boolean;
  disadvantage?: boolean;
  rolls?: RollConfigEntry[];
  data?: Record<string, unknown>;
  target?: unknown;
  critical?: { bonusDice?: number; bonusDamage?: string };
}

export type RollAdvantageMode = "advantage" | "disadvantage";
export type ResolvedAdvantageMode = RollMode;

/** Combine advantage and disadvantage flags under 5e mutual-cancellation rules. */
export function combineAdvantageFlags(advantage: boolean, disadvantage: boolean): RollMode {
  if (advantage === disadvantage) return "normal";
  return advantage ? "advantage" : "disadvantage";
}

function hasAdvantageFlag(config: ProcessConfig): boolean {
  return Boolean(config.advantage) || entries(config).some(roll =>
    (roll.options?.advantage === true) || (roll.options?.advantageMode === 1)
  );
}

function hasDisadvantageFlag(config: ProcessConfig): boolean {
  return Boolean(config.disadvantage) || entries(config).some(roll =>
    (roll.options?.disadvantage === true) || (roll.options?.advantageMode === -1)
  );
}

/** Resolved 5e roll mode after mutual cancellation of any advantage and disadvantage sources. */
export function resolvedAdvantageMode(config: ProcessConfig): ResolvedAdvantageMode {
  return combineAdvantageFlags(hasAdvantageFlag(config), hasDisadvantageFlag(config));
}

/** Resolved pre-roll mode from a process config and an optional Midi-QOL workflow. */
export function resolvedConfigRollMode(config: ProcessConfig, workflow?: unknown): RollMode {
  const wf = asRecord(workflow);
  return combineAdvantageFlags(
    hasAdvantageFlag(config) || (wf.advantage === true),
    hasDisadvantageFlag(config) || (wf.disadvantage === true)
  );
}

/** Extract the resolved roll mode from a single submitted d20 roll, or null when the roll carries none. */
export function rollModeFromRoll(roll: unknown): RollMode | null {
  if (!roll || (typeof roll !== "object")) return null;
  const record = roll as Record<string, unknown>;
  const options = asRecord(record.options);
  if ((typeof options.advantageMode === "number") && Number.isFinite(options.advantageMode)) {
    if (options.advantageMode > 0) return "advantage";
    if (options.advantageMode < 0) return "disadvantage";
    return "normal";
  }
  if ((typeof record.hasAdvantage === "boolean") || (typeof record.hasDisadvantage === "boolean")) {
    return combineAdvantageFlags(record.hasAdvantage === true, record.hasDisadvantage === true);
  }
  if ((typeof options.advantage === "boolean") || (typeof options.disadvantage === "boolean")) {
    return combineAdvantageFlags(options.advantage === true, options.disadvantage === true);
  }
  return null;
}

/** Resolve the mode of submitted rolls (dialog choices override stale pre-roll config), falling back to config. */
export function resolvedSubmittedRollMode(rolls: readonly unknown[], config?: ProcessConfig): RollMode | null {
  for (const roll of rolls) {
    const mode = rollModeFromRoll(roll);
    if (mode) return mode;
  }
  return config ? resolvedAdvantageMode(config) : null;
}

/** Resolve the attack roll mode from a Midi-QOL workflow (attackRoll first, then flags once an attack ran). */
export function workflowAttackRollMode(workflow: unknown, allowFlags = false): RollMode | null {
  if (!workflow || (typeof workflow !== "object")) return null;
  const record = workflow as Record<string, unknown>;
  const fromRoll = rollModeFromRoll(record.attackRoll);
  if (fromRoll) return fromRoll;
  const hasAttack = allowFlags || (record.attackRoll != null) || (typeof record.attackTotal === "number");
  if (hasAttack && ((typeof record.advantage === "boolean") || (typeof record.disadvantage === "boolean"))) {
    return combineAdvantageFlags(record.advantage === true, record.disadvantage === true);
  }
  return null;
}

/** Apply advantage or disadvantage onto the roll configuration while preserving mutual cancellation. */
export function applyAdvantageMode(config: ProcessConfig, mode: RollAdvantageMode): void {
  const advantage = (mode === "advantage") || hasAdvantageFlag(config);
  const disadvantage = (mode === "disadvantage") || hasDisadvantageFlag(config);
  config.advantage = advantage;
  config.disadvantage = disadvantage;
  const numericMode = (advantage === disadvantage) ? 0 : (advantage ? 1 : -1);
  for (const roll of entries(config)) {
    roll.options ??= {};
    roll.options.advantage = advantage;
    roll.options.disadvantage = disadvantage;
    roll.options.advantageMode = numericMode;
  }
}

function isEntry(roll: unknown): roll is RollConfigEntry {
  return !!roll && (typeof roll === "object");
}

function entries(config: ProcessConfig): RollConfigEntry[] {
  return Array.isArray(config.rolls) ? config.rolls.filter(isEntry) : [];
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
