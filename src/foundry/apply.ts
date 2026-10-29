import type { ChainEntry, ChainIntent } from "../core/engine/interpreter";
import type { EventType } from "../core/registry/constants";
import { asNumber, asRecord, asString, asStrings } from "../core/registry/data";
import { resolveModifiers } from "../runtime/dice";
import { read } from "../runtime/read";
import {
  addCriticalBonus, adjustCriticalRanges, adjustSavingThrowRanges, appendDamagePart, appendRollPart, sanitizeCritical,
  type ProcessConfig
} from "../runtime/roll-config";
import type { Roller, SourceInfo } from "./collect";
import { originRollData } from "./documents";
import { modifyFormulaParts, replaceData, resolveForeign, simplifyNumber } from "./formulas";
import { SETTINGS, setting } from "./settings";
import { log } from "../core/log";

const warnedFormulas = new Set<string>();

/**
 * Whether a bonus formula parses. A broken one would make dnd5e throw and drop the whole roll, so it is skipped
 * (the editor reports it as "invalid-formula"); the console says so once per result.
 */
function rollable(formula: string, intent: ChainIntent, ctx: ApplyContext): boolean {
  if (Roll.validate(formula)) return true;
  const key = `${intent.blueprintId}|${intent.nodeId}`;
  if (!warnedFormulas.has(key)) {
    warnedFormulas.add(key);
    const name = asString(read(ctx.sources.get(intent.entry), "blueprint.name")) || intent.blueprintId;
    log.warn(`the formula "${formula}" in "${name}" is not a valid roll formula; the bonus is skipped.`);
  }
  return false;
}

export interface ApplyContext {
  event: EventType;
  roller: Roller;
  sources: ReadonlyMap<ChainEntry, SourceInfo>;
}

/** Dice modifiers keep applying to later parts until a "first die only" modifier has been used. */
export interface ModifierTracker {
  active: ChainIntent[];
  halted: Set<string>;
}

/** Overrides when the player applies a choice: its scaled formula, a picked damage type, origin roll data. */
export interface ApplyOptions {
  formula?(intent: ChainIntent): string | undefined;
  damageType?: string;
  data?: Record<string, unknown>;
}

/** Roll data of a blueprint whose origin is neither the roller nor the rolled item (v1 _replaceRollDataOfBonuses). */
function foreignData(intent: ChainIntent, ctx: ApplyContext): Record<string, unknown> | null {
  const info = ctx.sources.get(intent.entry);
  const origin = info?.origin;
  if (!info || !origin) return null;
  if ((origin.uuid === ctx.roller.actor.uuid) || (origin.uuid === ctx.roller.item?.uuid)) return null;
  return originRollData(info.document);
}

function formulaOf(intent: ChainIntent, key: string, ctx: ApplyContext, options: ApplyOptions): string {
  const formula = asString(intent.data[key]).trim();
  if (!formula) return "";
  if (options.data) return replaceData(formula, options.data);
  const data = foreignData(intent, ctx);
  return data ? resolveForeign(formula, data) : formula;
}

function numberOf(intent: ChainIntent, key: string, ctx: ApplyContext, options: ApplyOptions): number {
  const formula = formulaOf(intent, key, ctx, options);
  return formula ? (simplifyNumber(formula, options.data ?? ctx.roller.rollData) ?? 0) : 0;
}

function modifierKey(intent: ChainIntent): string {
  return `${intent.entry.documentUuid}|${intent.blueprintId}|${intent.nodeId}`;
}

/**
 * Apply one diceModifiers result to roll parts from `start[rollIndex]` on and, when `critical` is set,
 * to critical damage. A used "first die only" modifier is halted for the rest of the roll.
 */
export function applyModifiers(
  config: ProcessConfig,
  intent: ChainIntent,
  ctx: ApplyContext,
  tracker: ModifierTracker,
  start: readonly number[],
  critical: boolean
): void {
  const key = modifierKey(intent);
  if (tracker.halted.has(key)) return;
  const info = ctx.sources.get(intent.entry);
  const originData = info ? originRollData(info.document, true) : {};
  const spec = resolveModifiers(intent.data, formula => simplifyNumber(formula, originData));
  if (!spec) return;
  if (!tracker.active.includes(intent)) tracker.active.push(intent);
  const halt = () => {
    tracker.halted.add(key);
    tracker.active = tracker.active.filter(entry => entry !== intent);
  };
  const damage = critical && (ctx.event === "damageRoll");

  for (const [index, roll] of (config.rolls ?? []).entries()) {
    const parts = (roll.parts ??= []);
    const from = start[index] ?? 0;
    const slice = parts.slice(from);
    const stopped = modifyFormulaParts(slice, roll.data ?? ctx.roller.rollData, spec);
    parts.splice(from, slice.length, ...slice);
    if (stopped) return halt();
    const rollCritical = asRecord(roll.options?.critical);
    if (damage && (typeof rollCritical.bonusDamage === "string") && rollCritical.bonusDamage) {
      const formula = [rollCritical.bonusDamage];
      const done = modifyFormulaParts(formula, originData, spec);
      rollCritical.bonusDamage = String(formula[0]);
      if (done) return halt();
    }
  }
  if (damage && config.critical?.bonusDamage) {
    const formula: unknown[] = [config.critical.bonusDamage];
    const done = modifyFormulaParts(formula, originData, spec);
    config.critical.bonusDamage = String(formula[0]);
    if (done) halt();
  }
}

/** Apply roll-changing results to a dnd5e process configuration. */
export function applyRollIntents(
  config: ProcessConfig,
  intents: readonly ChainIntent[],
  ctx: ApplyContext,
  tracker: ModifierTracker,
  options: ApplyOptions = {}
): void {
  let success = 0;
  let failure = 0;
  let target = 0;
  let deathCritical = 0;
  const firstData = config.rolls?.[0]?.data ?? ctx.roller.rollData;

  for (const intent of intents) {
    switch (intent.type) {
      case "rollBonus": {
        const formula = options.formula?.(intent) ?? formulaOf(intent, "formula", ctx, options);
        if (!formula || !rollable(formula, intent, ctx)) break;
        if (ctx.event === "damageRoll") {
          const types = options.damageType ? [options.damageType] : asStrings(intent.data.damageTypes);
          appendDamagePart(config, formula, types, options.data ?? firstData);
        } else {
          appendRollPart(config, formula);
        }
        break;
      }
      case "critRange":
        success += numberOf(intent, "critical", ctx, options);
        failure += numberOf(intent, "fumble", ctx, options);
        break;
      case "critDamage":
        addCriticalBonus(config, numberOf(intent, "dice", ctx, options), formulaOf(intent, "damage", ctx, options));
        break;
      case "saveThresholds":
        target += numberOf(intent, "targetValue", ctx, options);
        deathCritical += numberOf(intent, "deathSaveCritical", ctx, options);
        break;
      default:
        break;
    }
  }

  if (success || failure) adjustCriticalRanges(config, success, failure, setting(SETTINGS.fumbleBelowOne));
  if (target || deathCritical) adjustSavingThrowRanges(config, target, deathCritical, ctx.roller.details.isDeath === true);
  for (const intent of intents) {
    if (intent.type === "diceModifiers") applyModifiers(config, intent, ctx, tracker, [], true);
  }
  if (ctx.event === "damageRoll") sanitizeCritical(config, formula => Roll.validate(formula));
}

const saveDCs = new WeakMap<object, { original: number; applied: number }>();

/**
 * Add DC bonuses to a save activity for this use. The bonus is added to the DC the activity had
 * before the previous bonus, so repeated uses without a data refresh do not stack.
 */
export function applySaveDC(activity: unknown, intents: readonly ChainIntent[], ctx: ApplyContext): void {
  const dc = read(activity, "save.dc");
  if (!dc || (typeof dc !== "object")) return;
  const record = dc as Record<string, unknown>;
  const total = intents
    .filter(intent => intent.type === "dcBonus")
    .reduce((sum, intent) => sum + numberOf(intent, "formula", ctx, {}), 0);
  const current = asNumber(record.value) ?? 0;
  const previous = saveDCs.get(record);
  const base = (previous && (previous.applied === current)) ? previous.original : current;
  if (!total && (base === current)) return;
  record.value = base + total;
  saveDCs.set(record, { original: base, applied: base + total });
}
