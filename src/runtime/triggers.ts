import type { BlueprintSource } from "../core/blueprint/types";

/** Combat#previous and Combat#current as Foundry reports them. */
export interface TurnState {
  round: number | null;
  turn: number | null;
  combatantId: string | null;
}

export interface TurnTransition {
  event: "turnStart" | "turnEnd";
  combatantId: string;
  round: number;
  turn: number;
}

function forward(previous: TurnState, current: TurnState): boolean {
  const [roundBefore, turnBefore] = [previous.round ?? 0, previous.turn ?? -1] as const;
  const [roundAfter, turnAfter] = [current.round ?? 0, current.turn ?? -1] as const;
  return (roundAfter > roundBefore) || ((roundAfter === roundBefore) && (turnAfter > turnBefore));
}

/**
 * The turn events of one combatTurnChange: the previous turn ends and the current one starts, only when combat
 * moved forward. Turns skipped on the way do not fire; going back fires nothing.
 */
export function turnTransitions(previous: TurnState | null, current: TurnState | null): TurnTransition[] {
  if (!current || !forward(previous ?? { round: 0, turn: null, combatantId: null }, current)) return [];
  const transitions: TurnTransition[] = [];
  if (previous?.combatantId && ((previous.round ?? 0) > 0)) {
    transitions.push({ event: "turnEnd", combatantId: previous.combatantId, round: previous.round ?? 0, turn: previous.turn ?? 0 });
  }
  if (current.combatantId && ((current.round ?? 0) > 0)) {
    transitions.push({ event: "turnStart", combatantId: current.combatantId, round: current.round ?? 0, turn: current.turn ?? 0 });
  }
  return transitions;
}

/** The event for a dnd5e rest type ("short" or "long"). */
export function restEvent(type: unknown): "shortRest" | "longRest" | null {
  if (type === "short") return "shortRest";
  if (type === "long") return "longRest";
  return null;
}

/** A gate that lets each key through once while it is remembered (`ttlMs`). */
export function createOnce(ttlMs: number): (key: string, now?: number) => boolean {
  const seen = new Map<string, number>();
  return (key, now = Date.now()) => {
    for (const [known, at] of seen) if ((now - at) > ttlMs) seen.delete(known);
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  };
}

const REGION_EVENTS = new Set(["regionEnter", "regionExit"]);

/** Whether a region's blueprints need the module's region behavior to hear tokens entering or leaving. */
export function needsRegionBehavior(blueprints: readonly BlueprintSource[]): boolean {
  return blueprints.some(blueprint => blueprint.nodes.some(node => (node.kind === "event") && REGION_EVENTS.has(node.type)));
}
