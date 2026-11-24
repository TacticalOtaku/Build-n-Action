import type { BlueprintSource, CounterDef } from "../core/blueprint/types";
import {
  counterDef,
  counterKey,
  counterName,
  readCounterDef,
  type CounterStore,
} from "../core/counters/counters";
import { asNumber, asRecord, asString } from "../core/registry/data";
import type { CostOption, ResolvedCost } from "./choices";
import { readRiders, type Rider } from "./riders";

export type ResourceKind =
  "uses" | "slots" | "hp" | "tempHp" | "hitDice" | "currency" | "quantity" | "inspiration";

export type ChatAudience = "gm" | "target";

/** One document change, addressed by UUID so it can be sent to the GM. */
export type Operation =
  | { kind: "status"; actor: string; status: string; active: boolean }
  | { kind: "copyEffect"; actor: string; effect: string; origin: string }
  | { kind: "removeEffects"; actor: string; name: string }
  | {
      kind: "resource";
      actor: string;
      item: string | null;
      resource: ResourceKind;
      delta: number;
      slot: string;
      currency: string;
    }
  | { kind: "rider"; actor: string; rider: Rider }
  /** A counter change, worked out from the value stored when it is made, so changes never overwrite each other. */
  | { kind: "counter"; actor: string; key: string; action: string; amount: number; def: CounterDef }
  /** A private chat reminder posted by the GM so players do not see hidden GM or target notes in their own chat log. */
  | {
      kind: "chat";
      actor: string;
      target: string | null;
      audience: ChatAudience;
      label: string;
      text: string;
    };

export const OPERATION_KINDS: readonly Operation["kind"][] = [
  "status",
  "copyEffect",
  "removeEffects",
  "resource",
  "rider",
  "counter",
  "chat",
];

const CHAT_AUDIENCES: readonly string[] = ["gm", "target"];

const RESOURCES: readonly string[] = ["uses", "slots", "hp", "tempHp", "hitDice", "currency"];

/** A string that stays one segment of a data path: a dot would reach into other data. */
function segment(value: unknown): string | null {
  return typeof value === "string" && !value.includes(".") ? value : null;
}

/** An operation another client sent, checked field by field; null when anything is missing or malformed. */
export function readOperation(value: unknown): Operation | null {
  const op = asRecord(value);
  const actor = op.actor;
  if (typeof actor !== "string" || !actor) return null;
  switch (op.kind) {
    case "status":
      return typeof op.status === "string" && typeof op.active === "boolean"
        ? { kind: "status", actor, status: op.status, active: op.active }
        : null;
    case "copyEffect":
      return typeof op.effect === "string" && typeof op.origin === "string"
        ? { kind: "copyEffect", actor, effect: op.effect, origin: op.origin }
        : null;
    case "removeEffects":
      return typeof op.name === "string" ? { kind: "removeEffects", actor, name: op.name } : null;
    case "resource": {
      const delta = asNumber(op.delta);
      const slot = segment(op.slot);
      const currency = segment(op.currency);
      const item = op.item === null ? null : asString(op.item) || null;
      if (!RESOURCES.includes(asString(op.resource)) || delta === null || slot === null || currency === null)
        return null;
      return {
        kind: "resource",
        actor,
        item,
        resource: op.resource as ResourceKind,
        delta: Math.trunc(delta),
        slot,
        currency,
      };
    }
    case "rider": {
      const rider = readRiders([op.rider])[0];
      return rider ? { kind: "rider", actor, rider } : null;
    }
    case "counter": {
      const key = segment(op.key);
      const amount = asNumber(op.amount);
      if (!key || amount === null || typeof op.action !== "string") return null;
      return { kind: "counter", actor, key, action: op.action, amount, def: readCounterDef(op.def) };
    }
    case "chat": {
      const audience = asString(op.audience);
      const target = op.target === null ? null : asString(op.target) || null;
      if (!CHAT_AUDIENCES.includes(audience) || typeof op.label !== "string" || typeof op.text !== "string")
        return null;
      return {
        kind: "chat",
        actor,
        target,
        audience: audience as ChatAudience,
        label: op.label,
        text: op.text,
      };
    }
    default:
      return null;
  }
}

export interface PlanContext {
  /** Actor UUID of the roller whose blueprint reacted. */
  self: string;
  /** Actor UUID of the roll's target, if any. */
  target: string | null;
  /** UUID of the item carrying the blueprint (item effects and uses come from it). */
  carrierItem: string | null;
  /** UUID recorded as the origin of copied effects. */
  origin: string;
  /** The resolved amount of a resource result. */
  amount: number;
}

function recipient(
  data: Readonly<Record<string, unknown>>,
  fallback: "self" | "target",
  ctx: PlanContext,
): string | null {
  return asString(data.who, fallback) === "target" ? ctx.target : ctx.self;
}

/** The change an applyEffect, removeEffect or resource result makes; null when there is nothing to do. */
export function planOperation(
  type: string,
  data: Readonly<Record<string, unknown>>,
  ctx: PlanContext,
): Operation | null {
  switch (type) {
    case "applyEffect": {
      const actor = recipient(data, "target", ctx);
      if (!actor) return null;
      if (asString(data.source, "status") === "itemEffect") {
        const effectId = asString(data.effectId);
        if (!effectId || !ctx.carrierItem) return null;
        return {
          kind: "copyEffect",
          actor,
          effect: `${ctx.carrierItem}.ActiveEffect.${effectId}`,
          origin: ctx.origin,
        };
      }
      const status = asString(data.status);
      return status ? { kind: "status", actor, status, active: true } : null;
    }
    case "removeEffect": {
      const actor = recipient(data, "self", ctx);
      if (!actor) return null;
      if (asString(data.match, "status") === "name") {
        const name = asString(data.name).trim();
        return name ? { kind: "removeEffects", actor, name } : null;
      }
      const status = asString(data.status);
      return status ? { kind: "status", actor, status, active: false } : null;
    }
    case "resource": {
      const actor = recipient(data, "self", ctx);
      const resource = asString(data.resource, "uses");
      const amount = Math.trunc(ctx.amount);
      if (!actor || !RESOURCES.includes(resource) || !amount) return null;
      if (resource === "uses" && !ctx.carrierItem) return null;
      return {
        kind: "resource",
        actor,
        item: resource === "uses" ? ctx.carrierItem : null,
        resource: resource as ResourceKind,
        delta: asString(data.action, "spend") === "restore" ? amount : -amount,
        slot: asString(data.slotLevel),
        currency: asString(data.currency, "gp"),
      };
    }
    default:
      return null;
  }
}

export interface CounterPlanContext {
  /** Actor UUID of "me" (the carrier's owner, else the creature the event is about). */
  self: string;
  target: string | null;
  blueprint: Pick<BlueprintSource, "id" | "counters">;
  /** The resolved amount of the change. */
  amount: number;
}

/** The change a "Change counter" result makes, with the counter's limits; `store` is the recipient's counters. */
export function planCounter(
  data: Readonly<Record<string, unknown>>,
  ctx: CounterPlanContext,
  store: CounterStore,
): Operation | null {
  const name = counterName(asString(data.name));
  const actor = asString(data.who, "self") === "target" ? ctx.target : ctx.self;
  if (!name || !actor) return null;
  const scope = asString(data.scope) === "blueprint" ? "blueprint" : "actor";
  const def = counterDef(store, scope, name, ctx.blueprint);
  return {
    kind: "counter",
    actor,
    key: counterKey(scope, name, ctx.blueprint.id),
    action: asString(data.action, "add"),
    amount: ctx.amount,
    def,
  };
}

export interface CostPaymentContext {
  actor: string;
  carrier: string;
  usesSpent?: number;
  usesMax?: number;
  autoDestroy?: boolean;
}

export type CostPaymentPlan =
  { kind: "none" } | { kind: "confirmDelete"; target: string } | { kind: "operation"; op: Operation };

/** Plan the resource change (or confirmed deletion) that pays an optional choice's cost; null when unsupported. */
export function planCostPayment(
  cost: ResolvedCost,
  option: CostOption,
  ctx: CostPaymentContext,
): CostPaymentPlan | null {
  switch (cost.type) {
    case "none":
      return { kind: "none" };
    case "uses":
      if ((ctx.usesSpent ?? 0) + option.amount >= (ctx.usesMax ?? 0) && ctx.autoDestroy) {
        return { kind: "confirmDelete", target: ctx.carrier };
      }
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: ctx.carrier,
          resource: "uses",
          delta: -option.amount,
          slot: "",
          currency: "",
        },
      };
    case "quantity":
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: ctx.carrier,
          resource: "quantity",
          delta: -option.amount,
          slot: "",
          currency: "",
        },
      };
    case "slots":
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: null,
          resource: "slots",
          delta: -1,
          slot: option.value,
          currency: "",
        },
      };
    case "health":
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: null,
          resource: "hp",
          delta: -option.amount,
          slot: "",
          currency: "",
        },
      };
    case "effect":
      return { kind: "confirmDelete", target: ctx.carrier };
    case "inspiration":
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: null,
          resource: "inspiration",
          delta: -1,
          slot: "",
          currency: "",
        },
      };
    case "currency":
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: null,
          resource: "currency",
          delta: -option.amount,
          slot: "",
          currency: cost.subtype,
        },
      };
    case "hitdice":
      return {
        kind: "operation",
        op: {
          kind: "resource",
          actor: ctx.actor,
          item: null,
          resource: "hitDice",
          delta: -option.amount,
          slot: cost.subtype,
          currency: "",
        },
      };
    default:
      return null;
  }
}

/** New `spent` after `delta` uses become available (negative spends). */
export function usesSpent(spent: number, max: number, delta: number): number {
  return Math.min(max, Math.max(0, spent - delta));
}

export function slotValue(value: number, max: number, delta: number): number {
  return Math.min(max, Math.max(0, value + delta));
}

/** The requested slot, or the lowest slot that can be spent (delta < 0) or refilled (delta > 0). */
export function pickSlot(
  slots: readonly { key: string; level: number; value: number; max: number }[],
  wanted: string,
  delta: number,
): string | null {
  if (wanted) return slots.some((slot) => slot.key === wanted) ? wanted : null;
  const candidates = slots
    .filter((slot) => slot.max > 0 && (delta < 0 ? slot.value > 0 : slot.value < slot.max))
    .sort((a, b) => a.level - b.level || a.key.localeCompare(b.key));
  return candidates[0]?.key ?? null;
}

/** Temporary hit points do not stack: restoring keeps the higher value; spending removes them. */
export function tempHp(current: number, delta: number): number {
  return delta > 0 ? Math.max(current, delta) : Math.max(0, current + delta);
}

export function currencyValue(value: number, delta: number): number {
  return Math.max(0, value + delta);
}

export function quantityValue(value: number, delta: number): number {
  return Math.max(0, value + delta);
}
