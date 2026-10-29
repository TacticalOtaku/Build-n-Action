import type { BlueprintSource } from "../core/blueprint/types";
import { counterDef, counterKey, counterName, type CounterStore } from "../core/counters/counters";
import { asString } from "../core/registry/data";
import type { Operation } from "./operations";

export interface CounterPlanContext {
  /** Actor UUID of "me" (the carrier's owner, else the creature the event is about). */
  self: string;
  target: string | null;
  blueprint: Pick<BlueprintSource, "id" | "counters">;
  /** The resolved amount of the change. */
  amount: number;
}

/** The change a "Change counter" result makes, with the counter's limits; `store` is the recipient's counters. */
export function planCounter(data: Readonly<Record<string, unknown>>, ctx: CounterPlanContext, store: CounterStore): Operation | null {
  const name = counterName(asString(data.name));
  const actor = (asString(data.who, "self") === "target") ? ctx.target : ctx.self;
  if (!name || !actor) return null;
  const scope = (asString(data.scope) === "blueprint") ? "blueprint" : "actor";
  const def = counterDef(store, scope, name, ctx.blueprint);
  return { kind: "counter", actor, key: counterKey(scope, name, ctx.blueprint.id), action: asString(data.action, "add"), amount: ctx.amount, def };
}
