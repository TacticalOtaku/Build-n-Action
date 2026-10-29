import type { StaticChoice } from "./fields";

function choices(group: string, values: readonly string[]): readonly StaticChoice[] {
  return values.map(value => ({ value, label: `BNA.Choice.${group}.${value}` }));
}

/** Choice lists owned by the module. Labels are i18n keys `BNA.Choice.<group>.<value>`. */
export const STATIC = {
  reachMode: choices("reachMode", ["self", "aura", "template", "region"]),
  turnReachMode: choices("reachMode", ["self", "aura"]),
  regionTokens: choices("regionTokens", ["any", "friendly", "hostile"]),
  disposition: [
    { value: "2", label: "BNA.Choice.disposition.any" },
    { value: "1", label: "BNA.Choice.disposition.ally" },
    { value: "-1", label: "BNA.Choice.disposition.enemy" }
  ],
  conditionMode: choices("conditionMode", ["all", "any"]),
  threshold: choices("threshold", ["atMost", "atLeast"]),
  componentMatch: choices("componentMatch", ["any", "all"]),
  modifierMode: choices("modifierMode", ["add", "multiply"]),
  who: choices("who", ["self", "target"]),
  saveWho: choices("saveWho", ["target", "self", "aura"]),
  saveDcMode: choices("saveDcMode", ["formula", "spell"]),
  rollMode: choices("rollMode", ["normal", "advantage", "disadvantage"]),
  counterScope: choices("counterScope", ["actor", "blueprint"]),
  counterAction: choices("counterAction", ["add", "subtract", "set", "reset"]),
  counterOperator: choices("counterOperator", ["EQ", "NE", "LT", "LE", "GT", "GE"]),
  counterReset: choices("counterReset", ["manual", "shortRest", "longRest", "turnStart"]),
  riderScope: choices("riderScope", ["sameActivation", "nextRoll"]),
  riderRoll: choices("riderRoll", ["attackRoll", "damageRoll", "savingThrow", "abilityCheck"]),
  durationUnit: choices("durationUnit", ["uses", "rounds", "turns", "untilRest"]),
  effectSource: choices("effectSource", ["status", "itemEffect"]),
  removeMatch: choices("removeMatch", ["status", "name"]),
  resourceAction: choices("resourceAction", ["spend", "restore"]),
  resourceType: choices("resourceType", ["uses", "slots", "hp", "tempHp", "hitDice", "currency"]),
  signalScope: choices("signalScope", ["actor", "document"]),
  costType: choices("costType", [
    "none", "uses", "quantity", "slots", "health", "hitdice", "currency", "inspiration", "effect"
  ]),
  hitDieSize: choices("hitDieSize", ["smallest", "largest", "d6", "d8", "d10", "d12"]),
  limit: choices("limit", ["none", "turn", "round", "shortRest", "longRest"]),
  comparisonOperator: choices("comparisonOperator", ["EQ", "LT", "GT", "LE", "GE"])
} as const satisfies Record<string, readonly StaticChoice[]>;

export type StaticChoiceGroup = keyof typeof STATIC;
