import type { LimitPeriod } from "../core/engine/interpreter";

/** The moment a limited result is used or checked: combat position and rest counters. */
export interface UsageClock {
  /** Id of the started combat, or null outside combat. */
  combatId: string | null;
  round: number;
  turn: number;
  shortRests: number;
  longRests: number;
}

/** Whether a result limited to once per `limit` may apply again, given when it was last used. */
export function limitAvailable(record: UsageClock | null, now: UsageClock, limit: LimitPeriod): boolean {
  if (!record) return true;
  switch (limit) {
    case "turn":
      return !now.combatId || (record.combatId !== now.combatId) || (record.round !== now.round) || (record.turn !== now.turn);
    case "round":
      return !now.combatId || (record.combatId !== now.combatId) || (record.round !== now.round);
    case "shortRest":
      return (now.shortRests > record.shortRests) || (now.longRests > record.longRests);
    case "longRest":
      return now.longRests > record.longRests;
  }
}

/** Key of a usage record in `flags.build-n-action.usage` (no dots, so Foundry keeps it flat). */
export function usageKey(blueprintId: string, nodeId: string): string {
  return `${blueprintId}_${nodeId}`;
}
