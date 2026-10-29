export const EVENT_TYPES = [
  "attackRoll",
  "damageRoll",
  "saveDC",
  "savingThrow",
  "abilityCheck",
  "hitDie",
  "afterAttack",
  "afterTargetSave",
  "afterDamage",
  "afterCheck",
  "turnStart",
  "turnEnd",
  "regionEnter",
  "regionExit",
  "shortRest",
  "longRest",
  "signal",
  "afterResult",
  "demandedSave"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Events fired once a roll is resolved; they expose outcome pins. */
export const REACTION_EVENTS: readonly EventType[] = [
  "afterAttack", "afterTargetSave", "afterDamage", "afterCheck"
];

/** Events that start without a roll: turns, regions, rests. */
export const TRIGGER_EVENTS: readonly EventType[] = ["turnStart", "turnEnd", "regionEnter", "regionExit", "shortRest", "longRest"];

/** Events whose context always carries the item (and activity) being used. */
export const ITEM_EVENTS: readonly EventType[] = [
  "attackRoll", "damageRoll", "saveDC", "afterAttack", "afterTargetSave", "afterDamage"
];

export const PIN_IDS = [
  "out", "yes", "no",
  "hit", "miss", "crit", "fumble",
  "failed", "succeeded",
  "dealt", "dropped",
  "success", "failure",
  "then"
] as const;

export type PinId = (typeof PIN_IDS)[number];

/** Internal events of continuations: what follows a result's own outputs. They have no palette entry. */
export const CONTINUATION_EVENTS: readonly EventType[] = ["afterResult", "demandedSave"];

/** The internal event a continuation runs under, by the result pin it leaves from. */
export const CONTINUATION_EVENT_BY_PIN: Readonly<Partial<Record<PinId, EventType>>> = { then: "afterResult", succeeded: "demandedSave", failed: "demandedSave" };

export const NODE_KINDS = ["event", "condition", "result"] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** The single node type of kind "condition"; its checks live in its data. */
export const CONDITION_NODE_TYPE = "condition";
