import { randomId } from "../core/blueprint/ids";
import type { ChainIntent, ChainResult } from "../core/engine/interpreter";
import type { RollFacts } from "../core/facts/types";
import type { EventType } from "../core/registry/constants";
import type { SortedIntents } from "../runtime/choices";
import type { ApplyContext, ModifierTracker } from "./apply";
import type { EvaluationContext } from "./evaluate";
import type { AppliedResults } from "./reactions";

const LIMIT = 20;

/** Choices and reminders waiting for the roll dialog. */
export interface PendingRoll {
  ctx: ApplyContext;
  sorted: SortedIntents;
  tracker: ModifierTracker;
  /** Keys of choices already applied (a dialog re-render must not offer them twice). */
  applied: Set<string>;
  /** Choices the player applied, whose "And then" continues once the roll goes ahead. */
  chosen: ChainIntent[];
  /** The evaluation the choices came from, for the public applyResult hook. */
  context: EvaluationContext;
}

const pending = new Map<string, PendingRoll>();

export function registerPending(roll: PendingRoll): string {
  const id = randomId();
  pending.set(id, roll);
  while (pending.size > LIMIT) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
  return id;
}

export function pendingRoll(id: unknown): PendingRoll | null {
  return (typeof id === "string") ? (pending.get(id) ?? null) : null;
}

/** What a roll applied before it was made; its "And then" outputs continue once the roll goes ahead. */
export interface AfterRoll {
  applied: Omit<AppliedResults, "intents">;
  /** Mandatory results, reminders and sent signals. */
  intents: ChainIntent[];
  /** Mandatory results already in the roll: their limits are spent, and they are announced, once the roll goes ahead. */
  immediate: ChainIntent[];
  /** Riders that changed the roll, used up once it goes ahead. */
  riders: string[];
  /** The dialog's choices, when the roll offered any. */
  pending: PendingRoll | null;
}

// Keyed by the roll's process config: dnd5e hands the same object to preRoll* and postRollConfiguration.
const afterRolls = new WeakMap<object, AfterRoll>();

export function rememberAfterRoll(config: unknown, after: AfterRoll): void {
  if (config && (typeof config === "object")) afterRolls.set(config, after);
}

/** The roll's AfterRoll, forgotten as it is taken so it continues once. */
export function takeAfterRoll(config: unknown): AfterRoll | null {
  if (!config || (typeof config !== "object")) return null;
  const found = afterRolls.get(config) ?? null;
  afterRolls.delete(config);
  return found;
}

/** What the engine decided for a recent roll; read through api.debug.recentRolls(). */
export interface RollRecord {
  event: EventType;
  time: number;
  /** Milliseconds spent collecting blueprints, building facts and running the chain. */
  ms: number;
  actor: string;
  facts: RollFacts;
  runs: ChainResult["runs"];
  intents: { blueprintId: string; nodeId: string; type: string; optional: boolean; document: string }[];
  signals: ChainResult["signals"];
  truncated: boolean;
}

const records: RollRecord[] = [];

export function remember(event: EventType, actor: string, facts: RollFacts, chain: ChainResult, ms: number): void {
  records.unshift({
    event, time: Date.now(), ms, actor, facts,
    runs: chain.runs,
    intents: chain.intents.map(intent => ({
      blueprintId: intent.blueprintId, nodeId: intent.nodeId, type: intent.type,
      optional: intent.common.optional, document: intent.entry.documentUuid
    })),
    signals: chain.signals,
    truncated: chain.truncated
  });
  records.length = Math.min(records.length, LIMIT);
}

export function recentRolls(): readonly RollRecord[] {
  return records;
}
