import type { PinId } from "../core/registry/constants";

export interface AttackResult {
  total: number | null;
  /** AC of the target, or null without a target (or behind total cover). */
  targetAc: number | null;
  isCritical: boolean;
  isFumble: boolean;
}

/** Pins of an attack against one target: a critical always hits, a fumble always misses. */
export function attackPins(result: AttackResult): PinId[] {
  if (result.isFumble) return ["miss", "fumble"];
  if (result.isCritical) return ["hit", "crit"];
  if ((result.total === null) || (result.targetAc === null)) return [];
  return (result.total >= result.targetAc) ? ["hit"] : ["miss"];
}

/** Pins when Midi QOL has decided whether the attack hit this target. */
export function midiAttackPins(hit: boolean, isCritical: boolean, isFumble: boolean): PinId[] {
  const pins: PinId[] = [hit ? "hit" : "miss"];
  if (hit && isCritical) pins.push("crit");
  if (isFumble) pins.push("fumble");
  return pins;
}

export function savePins(success: boolean): PinId[] {
  return [success ? "succeeded" : "failed"];
}

/** `dealt` for positive damage; `dropped` as well when the target ends at 0 HP. */
export function damagePins(hpDamage: number, newHp: number | null): PinId[] {
  if (!(hpDamage > 0)) return [];
  return ((newHp !== null) && (newHp <= 0)) ? ["dealt", "dropped"] : ["dealt"];
}

/** `success` or `failure` for a check with a DC; nothing when the DC is unknown. */
export function checkPins(total: number | null, dc: number | null): PinId[] {
  if ((total === null) || (dc === null)) return [];
  return [(total >= dc) ? "success" : "failure"];
}
