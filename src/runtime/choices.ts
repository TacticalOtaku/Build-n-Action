import type { ChainEntry, ChainIntent } from "../core/engine/interpreter";
import { asBoolean, asNumber, asRecord, asString } from "../core/registry/data";

/* -------------------------------------------------- */
/*   Intents                                          */
/* -------------------------------------------------- */

/** Optional results of one blueprint offered to the player together, for one cost. */
export interface Choice {
  /** Unique within the roll: entry order and choice group. */
  key: string;
  intents: ChainIntent[];
  cost: CostSpec;
}

export interface SortedIntents {
  immediate: ChainIntent[];
  choices: Choice[];
  reminders: ChainIntent[];
}

export function sortIntents(intents: readonly ChainIntent[]): SortedIntents {
  const sorted: SortedIntents = { immediate: [], choices: [], reminders: [] };
  const order = new Map<ChainEntry, number>();
  const choices = new Map<string, Choice>();
  for (const intent of intents) {
    if (intent.type === "reminder") {
      sorted.reminders.push(intent);
      continue;
    }
    if (!intent.common.optional) {
      sorted.immediate.push(intent);
      continue;
    }
    if (!order.has(intent.entry)) order.set(intent.entry, order.size);
    const key = `${order.get(intent.entry)}:${intent.common.choiceGroup}`;
    let choice = choices.get(key);
    if (!choice) {
      choice = { key, intents: [], cost: readCost({}) };
      choices.set(key, choice);
      sorted.choices.push(choice);
    }
    choice.intents.push(intent);
    const cost = readCost(intent.common.cost);
    if ((choice.cost.type === "none") && (cost.type !== "none")) choice.cost = cost;
  }
  return sorted;
}

/* -------------------------------------------------- */
/*   Costs                                            */
/* -------------------------------------------------- */

/** The stored cost of a choice (common.cost), formulas unevaluated. */
export interface CostSpec {
  type: string;
  subtype: string;
  min: string;
  max: string;
  step: number;
  scales: boolean;
  formula: string;
}

export interface ResolvedCost {
  type: string;
  subtype: string;
  min: number;
  max: number | null;
  step: number;
  scales: boolean;
  formula: string;
}

/** What the roller and the blueprint's carrier can pay; read by the Foundry adapter. */
export interface CostState {
  /** Whether the current user owns the documents the cost is paid from. */
  owner: boolean;
  actorType: string;
  /** Limited uses of the carrier item. */
  uses: { value: number; max: number; limited: boolean } | null;
  /** Quantity of the carrier item, null when it has none. */
  quantity: number | null;
  /** Whether the blueprint lives on an effect that still exists. */
  effect: boolean;
  slots: readonly { key: string; level: number; value: number; max: number }[];
  hp: { value: number; temp: number; max: number; tempmax: number } | null;
  currency: Readonly<Record<string, number>> | null;
  hitDice: { value: number; max: number; bySize: Readonly<Record<string, number>> } | null;
  inspiration: boolean | null;
  /** Valid currency keys and hit die sizes (CONFIG.DND5E). */
  currencies: readonly string[];
  hitDieTypes: readonly string[];
}

export interface CostOption {
  /** The select value: an amount, or a spell slot key. */
  value: string;
  amount: number;
  /** How many steps above the minimum; scales the choice's formulas. */
  scale: number;
  /** What remains, e.g. "3/5". */
  available: string;
}

const PAYABLE = ["uses", "quantity", "slots", "health", "hitdice", "currency", "inspiration", "effect"];

export function readCost(value: unknown): CostSpec {
  const cost = asRecord(value);
  const type = asString(cost.type, "none");
  return {
    type: PAYABLE.includes(type) ? type : "none",
    subtype: asString(cost.subtype),
    min: asString(cost.min),
    max: asString(cost.max),
    step: asNumber(cost.step) ?? 1,
    scales: asBoolean(cost.scales),
    formula: asString(cost.formula)
  };
}

/** Evaluate min and max (v1 ConsumptionModel#prepareDerivedData). */
export function resolveCost(cost: CostSpec, evaluate: (formula: string) => number | null): ResolvedCost {
  const number = (formula: string) => (formula.trim() ? evaluate(formula) : null);
  let min = number(cost.min) ?? 1;
  let max = number(cost.max);
  if ((max !== null) && (min > max)) [min, max] = [max, min];
  return { ...cost, min, max };
}

function slotsFrom(state: CostState, min: number) {
  return state.slots.filter(slot => slot.value && slot.max && slot.level && (slot.level >= min));
}

function hitDiceAvailable(cost: ResolvedCost, state: CostState): number {
  if (!state.hitDice) return 0;
  return ["smallest", "largest"].includes(cost.subtype) ? state.hitDice.value : (state.hitDice.bySize[cost.subtype] ?? 0);
}

function valid(cost: ResolvedCost, state: CostState): boolean {
  const invalidScale = cost.scales && ((cost.max ?? Infinity) < cost.min);
  switch (cost.type) {
    case "uses": return !invalidScale && !!state.uses?.limited && (cost.min > 0);
    case "quantity": return !invalidScale && (state.quantity !== null) && (cost.min > 0);
    case "effect": return true;
    case "health":
    case "slots": return !invalidScale && (cost.min > 0);
    case "currency": return !invalidScale && state.currencies.includes(cost.subtype) && (cost.min > 0);
    case "inspiration": return true;
    case "hitdice": return !invalidScale && ["smallest", "largest", ...state.hitDieTypes].includes(cost.subtype) && (cost.min > 0);
    default: return false;
  }
}

/** Whether the choice can be offered: nothing to pay, or the minimum can be paid by an owner. */
export function costAvailable(cost: ResolvedCost, state: CostState): boolean {
  if (cost.type === "none") return true;
  if (!valid(cost, state) || !state.owner) return false;
  const hp = state.hp;
  switch (cost.type) {
    case "uses": return (state.uses?.value ?? 0) >= cost.min;
    case "quantity": return (state.quantity ?? 0) >= cost.min;
    case "effect": return state.effect;
    case "slots": return slotsFrom(state, cost.min).length > 0;
    case "health": return !!hp && ((hp.value + hp.temp) >= cost.min);
    case "currency": return (state.currency?.[cost.subtype] ?? 0) >= cost.min;
    case "inspiration": return (state.actorType === "character") && (state.inspiration === true);
    case "hitdice": return (state.actorType === "character") && (hitDiceAvailable(cost, state) >= cost.min);
    default: return false;
  }
}

/** Whether the player picks how much to pay (v1 OptionalSelector#doesBonusScale). */
export function costScales(cost: ResolvedCost, state: CostState): boolean {
  if (!cost.scales || !valid(cost, state)) return false;
  if (["effect", "inspiration"].includes(cost.type)) return false;
  if (["health", "currency"].includes(cost.type)) return cost.step > 0;
  return true;
}

/** The lowest spell slot at or above `min`, preferring pact slots on a tie (v1). */
export function lowestSlot(state: CostState, min: number): CostState["slots"][number] | null {
  const slots = slotsFrom(state, min);
  if (!slots.length) return null;
  const level = Math.min(...slots.map(slot => slot.level));
  const lowest = slots.filter(slot => slot.level === level);
  return lowest.find(slot => !slot.key.startsWith("spell")) ?? lowest[0] ?? null;
}

function stepped(from: number, to: number, step: number, available: string, min: number): CostOption[] {
  const options: CostOption[] = [];
  for (let amount = from; amount <= to; amount += step) {
    options.push({ value: String(amount), amount, scale: Math.floor((amount - min) / step), available });
  }
  return options;
}

/** A class item's hit dice (dnd5e 5.x: system.hd.denomination, system.levels, system.hd.spent). */
export interface ClassHitDice {
  id: string;
  denomination: string;
  levels: number;
  spent: number;
}

/** New `spent` values after spending `amount` hit dice of a size, or the smallest/largest first (v1 buildHitDiceUpdates). */
export function hitDiceSpend(classes: readonly ClassHitDice[], subtype: string, amount: number): { id: string; spent: number }[] {
  const bySize = ["smallest", "largest"].includes(subtype);
  let eligible = classes.filter(cls => bySize || (cls.denomination === subtype));
  if (bySize) {
    eligible = [...eligible].sort((left, right) => {
      const order = left.denomination.localeCompare(right.denomination, "en", { numeric: true });
      return (subtype === "largest") ? -order : order;
    });
  }
  const updates: { id: string; spent: number }[] = [];
  let remaining = Math.trunc(amount);
  for (const cls of eligible) {
    const available = ((remaining > 0) ? cls.levels : 0) - cls.spent;
    const delta = (remaining > 0) ? Math.min(remaining, available) : Math.max(remaining, available);
    if (!delta) continue;
    updates.push({ id: cls.id, spent: cls.spent + delta });
    remaining -= delta;
    if (!remaining) break;
  }
  return updates;
}

/** The amounts (or slots) the player may pay; a non-scaling cost has one option at the minimum. */
export function costOptions(cost: ResolvedCost, state: CostState): CostOption[] {
  const min = cost.min;
  const max = cost.max ?? Infinity;
  const uses = state.uses;
  const hp = state.hp;
  const hpAvailable = hp ? Math.max(0, hp.value) + Math.max(0, hp.temp) : 0;
  const available = (() => {
    switch (cost.type) {
      case "uses": return uses ? `${uses.value}/${uses.max}` : "";
      case "quantity": return String(state.quantity ?? 0);
      case "health": return hp ? `${hpAvailable}/${Math.max(0, hp.max) + Math.max(0, hp.tempmax)}` : "";
      case "currency": return String(state.currency?.[cost.subtype] ?? 0);
      case "hitdice": return state.hitDice ? (["smallest", "largest"].includes(cost.subtype)
        ? `${state.hitDice.value}/${state.hitDice.max}` : String(hitDiceAvailable(cost, state))) : "";
      default: return "";
    }
  })();

  if (!costScales(cost, state)) {
    if (cost.type === "slots") {
      const slot = lowestSlot(state, min);
      return slot ? [{ value: slot.key, amount: 1, scale: 0, available: `${slot.value}/${slot.max}` }] : [];
    }
    const amount = ["effect", "inspiration"].includes(cost.type) ? 1 : min;
    return [{ value: String(amount), amount, scale: 0, available }];
  }

  switch (cost.type) {
    case "uses":
    case "quantity": {
      const have = (cost.type === "uses") ? (uses?.value ?? 0) : (state.quantity ?? 0);
      return stepped(Math.max(1, min), Math.min(have, max), 1, available, min);
    }
    case "slots":
      return slotsFrom(state, min)
        .sort((a, b) => (a.level - b.level) || a.key.localeCompare(b.key))
        .map(slot => ({
          value: slot.key, amount: 1, scale: Math.min(slot.level - min, max - 1), available: `${slot.value}/${slot.max}`
        }));
    case "health": {
      const capacity = hp ? Math.max(0, hp.max) + Math.max(0, hp.tempmax) : 0;
      if (hpAvailable < min) return [];
      return stepped(min || 1, Math.min(hpAvailable, cost.max ?? capacity), cost.step, available, min);
    }
    case "currency": {
      const have = state.currency?.[cost.subtype] ?? 0;
      if (have < min) return [];
      return stepped(min || 1, Math.min(have, max), cost.step, available, min);
    }
    case "hitdice":
      return stepped(min, Math.min(max, hitDiceAvailable(cost, state)), 1, available, min);
    default:
      return [];
  }
}
