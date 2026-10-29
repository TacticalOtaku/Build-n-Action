import { createBlueprint } from "../core/blueprint/factory";
import type { BlueprintSource } from "../core/blueprint/types";
import type { EventType } from "../core/registry/constants";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { getResult, ROLL_RESULT_TYPES } from "../core/registry/index";

/** Rolls a next-roll rider may wait for. */
export const RIDER_ROLLS: readonly EventType[] = ["attackRoll", "damageRoll", "savingThrow", "abilityCheck"];

const STALE_ACTIVATION_MS = 60 * 60 * 1000;

/** Now, for riders: wall time, combat position and the recipient's rest counters. */
export interface RiderClock {
  time: number;
  combatId: string | null;
  round: number;
  turn: number;
  /** Number of turns in a round of the current combat. */
  combatants: number;
  shortRests: number;
  longRests: number;
}

export type RiderUntil =
  | { kind: "rounds" | "turns"; count: number; combatId: string; round: number; turn: number; combatants: number }
  | { kind: "rest"; shortRests: number; longRests: number };

export interface Rider {
  id: string;
  created: number;
  effect: { type: string; data: Record<string, unknown> };
  scope: "sameActivation" | "nextRoll";
  roll: EventType | null;
  activation: string | null;
  /** Uses left, or null for riders limited by time only. */
  uses: number | null;
  until: RiderUntil | null;
  source: { name: string; origin: string | null; blueprintId: string; nodeId: string };
}

export interface RiderContext {
  id: string;
  activation: string | null;
  clock: RiderClock;
  source: Rider["source"];
}

/** A rider from a rider result's data; null when it carries no roll change. */
export function createRider(data: Readonly<Record<string, unknown>>, ctx: RiderContext): Rider | null {
  const effect = asRecord(data.effect);
  const type = asString(effect.type);
  if (!ROLL_RESULT_TYPES.includes(type) || !getResult(type)) return null;
  const scope = (asString(data.scope) === "nextRoll") ? "nextRoll" : "sameActivation";
  const wanted = asString(data.roll) as EventType;
  const duration = asRecord(data.duration);
  const unit = asString(duration.unit, "uses");
  const count = Math.max(1, Math.trunc(asNumber(duration.value) ?? 1));
  const { clock } = ctx;

  let uses: number | null = null;
  let until: RiderUntil | null = null;
  if (unit === "untilRest") {
    until = { kind: "rest", shortRests: clock.shortRests, longRests: clock.longRests };
  } else if (((unit === "rounds") || (unit === "turns")) && clock.combatId) {
    until = { kind: unit, count, combatId: clock.combatId, round: clock.round, turn: clock.turn, combatants: Math.max(1, clock.combatants) };
  } else {
    uses = (unit === "uses") ? count : 1;
  }

  return {
    id: ctx.id,
    created: clock.time,
    effect: { type, data: { ...asRecord(effect.data) } },
    scope,
    roll: (scope === "nextRoll") ? (RIDER_ROLLS.includes(wanted) ? wanted : "attackRoll") : null,
    activation: (scope === "sameActivation") ? ctx.activation : null,
    uses,
    until,
    source: ctx.source
  };
}

export function riderExpired(rider: Rider, now: RiderClock): boolean {
  if ((rider.uses !== null) && (rider.uses <= 0)) return true;
  if ((rider.scope === "sameActivation") && ((now.time - rider.created) > STALE_ACTIVATION_MS)) return true;
  const until = rider.until;
  if (!until) return false;
  if (until.kind === "rest") return (now.shortRests > until.shortRests) || (now.longRests > until.longRests);
  if (now.combatId !== until.combatId) return true;
  const elapsed = ((now.round - until.round) * Math.max(1, until.combatants)) + (now.turn - until.turn);
  return (until.kind === "rounds") ? (elapsed >= until.count * until.combatants) : (elapsed >= until.count);
}

/** Whether a rider changes this roll: same activation (compatible rolls) or its next-roll kind. */
export function riderApplies(rider: Rider, event: EventType, activation: string | null): boolean {
  if (!getResult(rider.effect.type)?.compatibleEvents.includes(event)) return false;
  if (rider.scope === "sameActivation") return !!rider.activation && (rider.activation === activation);
  return rider.roll === event;
}

/** The rider after one use; riders limited by time only are unchanged. */
export function useRider(rider: Rider): Rider {
  return (rider.uses === null) ? rider : { ...rider, uses: rider.uses - 1 };
}

/** A rider as a one-path blueprint for this roll, so collection and the interpreter handle it. */
export function riderBlueprint(rider: Rider, event: EventType): BlueprintSource {
  return createBlueprint({
    id: rider.id,
    name: rider.source.name,
    nodes: [
      { id: "event", kind: "event", type: event, position: { x: 0, y: 0 }, data: { reach: { mode: "self" } } },
      {
        id: "effect", kind: "result", type: rider.effect.type, position: { x: 324, y: 0 },
        data: { ...rider.effect.data, common: { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" } }
      }
    ],
    edges: [{ id: "event-out-effect", source: "event", sourcePin: "out", target: "effect", targetPin: "in" }]
  });
}

function isRider(value: unknown): value is Rider {
  const record = asRecord(value);
  return (typeof record.id === "string")
    && (typeof asRecord(record.effect).type === "string")
    && ((record.scope === "sameActivation") || (record.scope === "nextRoll"));
}

/** Riders stored in `flags.build-n-action.riders`: by id since 2.3.0, a list before. */
export function readRiders(value: unknown): Rider[] {
  return (Array.isArray(value) ? value : Object.values(asRecord(value))).filter(isRider);
}
