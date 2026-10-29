import { asString } from "../core/registry/data";
import { read, stringList } from "./read";

export type EffectState = "active" | "disabled" | "expired" | "suppressed";

export interface EffectSummary {
  state: EffectState;
  /** DAE: while this holds, DAE keeps the effect off. */
  disableCondition: string | null;
  /** DAE: when this fails, DAE deletes the effect. */
  enableCondition: string | null;
  /** DAE special duration keys (zeroHP, turnStart, …). */
  specialDurations: string[];
}

/** Foundry resets the prepared `duration.expired` of an effect without a timed duration, so the stored flag counts too. */
function isExpired(effect: unknown): boolean {
  return (read(effect, "duration.expired") === true) || (read(effect, "_source.duration.expired") === true);
}

function text(effect: unknown, path: string): string | null {
  return asString(read(effect, path)).trim() || null;
}

/**
 * An effect's state as the collector sees it (src/foundry/documents.ts isSuppressed): off when disabled; expired when its
 * duration is over (Foundry 14 keeps an effect that DAE's special durations end, marked expired); suppressed when
 * otherwise inactive (an unequipped item) or when it does not apply to its actor (an item effect that does not transfer).
 */
export function effectSummary(effect: unknown): EffectSummary {
  let state: EffectState = "active";
  if (read(effect, "disabled") === true) state = "disabled";
  else if ((read(effect, "active") !== true) && isExpired(effect)) state = "expired";
  else if ((read(effect, "active") !== true) || ((read(effect, "modifiesActor") !== true) && (read(effect, "isAppliedEnchantment") !== true))) state = "suppressed";
  return {
    state,
    disableCondition: text(effect, "flags.dae.disableCondition"),
    enableCondition: text(effect, "flags.dae.enableCondition"),
    specialDurations: stringList(read(effect, "flags.dae.specialDuration"))
  };
}
