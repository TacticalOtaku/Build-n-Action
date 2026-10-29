import type { LimitPeriod } from "../core/engine/interpreter";
import { asNumber, asRecord } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import { limitAvailable, usageKey, type UsageClock } from "../runtime/limits";
import { read } from "../runtime/read";

function rests(actor: FoundryDocument): { short: number; long: number } {
  const stored = asRecord(read(actor, `flags.${MODULE_SCOPE}.rests`));
  return { short: asNumber(stored.short) ?? 0, long: asNumber(stored.long) ?? 0 };
}

/** Now, for limits: the started combat's round and turn, and the actor's rest counters. */
export function usageClock(actor: FoundryDocument): UsageClock {
  const combat = game.combat;
  const started = !!combat && (combat.started === true);
  const counted = rests(actor);
  return {
    combatId: started ? combat.id : null,
    round: started ? combat.round : 0,
    turn: started ? (combat.turn ?? 0) : 0,
    shortRests: counted.short,
    longRests: counted.long
  };
}

function asClock(value: unknown): UsageClock | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    combatId: (typeof record.combatId === "string") ? record.combatId : null,
    round: asNumber(record.round) ?? 0,
    turn: asNumber(record.turn) ?? 0,
    shortRests: asNumber(record.shortRests) ?? 0,
    longRests: asNumber(record.longRests) ?? 0
  };
}

export function isLimitAvailable(actor: FoundryDocument, blueprintId: string, nodeId: string, limit: LimitPeriod): boolean {
  const record = asClock(read(actor, `flags.${MODULE_SCOPE}.usage.${usageKey(blueprintId, nodeId)}`));
  return limitAvailable(record, usageClock(actor), limit);
}

/** Remember that a limited result applied now. */
export async function recordUsage(actor: FoundryDocument, blueprintId: string, nodeId: string): Promise<void> {
  await actor.setFlag(MODULE_SCOPE, `usage.${usageKey(blueprintId, nodeId)}`, usageClock(actor));
}

/** dnd5e.restCompleted: count short and long rests so rest limits reset. */
export async function countRest(actor: unknown, result: unknown): Promise<void> {
  if (!actor || (typeof actor !== "object") || !("setFlag" in actor)) return;
  const document = actor as FoundryDocument;
  const counted = rests(document);
  const long = read(result, "type") === "long";
  await document.setFlag(MODULE_SCOPE, "rests", { short: counted.short + (long ? 0 : 1), long: counted.long + (long ? 1 : 0) });
}
