import type { BlueprintSource } from "../../core/blueprint/types";
import { EVENT_TYPES, type EventType, type PinId } from "../../core/registry/constants";
import { asString } from "../../core/registry/data";

/** One outcome the Test panel offers; `pins` are what play fires for it (src/runtime/outcomes.ts). */
export interface OutcomeOption {
  id: PinId;
  pins: readonly PinId[];
}

const OUTCOMES: Partial<Record<EventType, readonly OutcomeOption[]>> = {
  afterAttack: [
    { id: "hit", pins: ["hit"] },
    { id: "crit", pins: ["hit", "crit"] },
    { id: "miss", pins: ["miss"] },
    { id: "fumble", pins: ["miss", "fumble"] }
  ],
  afterTargetSave: [{ id: "failed", pins: ["failed"] }, { id: "succeeded", pins: ["succeeded"] }],
  afterDamage: [{ id: "dealt", pins: ["dealt"] }, { id: "dropped", pins: ["dealt", "dropped"] }],
  afterCheck: [{ id: "success", pins: ["success"] }, { id: "failure", pins: ["failure"] }]
};

export function outcomeOptions(event: EventType): readonly OutcomeOption[] {
  return OUTCOMES[event] ?? [];
}

export interface EventOption {
  key: string;
  event: EventType;
  signal: string | null;
}

/** The events a test can fire: each event type in the blueprint once, and each named signal once. */
export function eventOptions(blueprint: BlueprintSource): EventOption[] {
  const options = new Map<string, EventOption>();
  for (const node of blueprint.nodes) {
    if ((node.kind !== "event") || !(EVENT_TYPES as readonly string[]).includes(node.type)) continue;
    const event = node.type as EventType;
    if (event === "signal") {
      const name = asString(node.data.name).trim();
      if (name) options.set(`signal:${name}`, { key: `signal:${name}`, event, signal: name });
    } else if (!options.has(event)) {
      options.set(event, { key: event, event, signal: null });
    }
  }
  return [...options.values()];
}
