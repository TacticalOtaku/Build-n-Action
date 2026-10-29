import type { BlueprintNode, BlueprintSource, ConditionCheck, CounterDef, CounterReset, CounterScope } from "../blueprint/types";
import { asNumber, asRecord, asString } from "../registry/data";

export const COUNTER_RESETS: readonly CounterReset[] = ["manual", "shortRest", "longRest", "turnStart"];

export const DEFAULT_COUNTER: Omit<CounterDef, "name"> = { min: 0, max: null, initial: 0, reset: "manual" };

/** An actor's counter flags: values by key, shared definitions by name. */
export interface CounterStore {
  values: Readonly<Record<string, number>>;
  defs: Readonly<Record<string, CounterDef>>;
}

export const EMPTY_STORE: CounterStore = { values: {}, defs: {} };

/** A counter name as stored: trimmed, lower case, runs of spaces and dots as "_". */
export function counterName(raw: string): string {
  return raw.trim().toLocaleLowerCase().replace(/[\s.]+/g, "_");
}

export function counterKey(scope: CounterScope, name: string, blueprintId: string): string {
  return (scope === "blueprint") ? `${blueprintId}:${name}` : name;
}

export function readCounterDef(value: unknown, name = ""): CounterDef {
  const record = asRecord(value);
  const reset = asString(record.reset, "manual");
  const min = asNumber(record.min) ?? DEFAULT_COUNTER.min;
  const max = asNumber(record.max);
  return {
    name: counterName(asString(record.name, name)),
    min,
    max: (max === null) ? null : Math.max(max, min),
    initial: asNumber(record.initial) ?? DEFAULT_COUNTER.initial,
    reset: COUNTER_RESETS.includes(reset as CounterReset) ? reset as CounterReset : "manual"
  };
}

export function readCounterStore(value: unknown): CounterStore {
  const record = asRecord(value);
  const values: Record<string, number> = {};
  for (const [key, entry] of Object.entries(asRecord(record.values))) {
    const number = asNumber(entry);
    if (number !== null) values[key] = number;
  }
  const defs: Record<string, CounterDef> = {};
  for (const [name, entry] of Object.entries(asRecord(record.defs))) defs[counterName(name)] = readCounterDef(entry, name);
  return { values, defs };
}

export function counterDef(store: CounterStore, scope: CounterScope, name: string, blueprint: Pick<BlueprintSource, "counters">): CounterDef {
  const key = counterName(name);
  const found = (scope === "blueprint")
    ? (blueprint.counters ?? []).map(entry => readCounterDef(entry)).find(entry => entry.name === key)
    : store.defs[key];
  return found ?? { name: key, ...DEFAULT_COUNTER };
}

export function counterValue(store: CounterStore, scope: CounterScope, name: string, blueprint: Pick<BlueprintSource, "id" | "counters">): number {
  const key = counterName(name);
  return store.values[counterKey(scope, key, blueprint.id)] ?? counterDef(store, scope, key, blueprint).initial;
}

/** Formulas name counters without a kind: the blueprint's own when it has one by that name, else the shared one. */
export function formulaScope(store: CounterStore, name: string, blueprint: Pick<BlueprintSource, "id" | "counters">): CounterScope {
  const key = counterName(name);
  const own = (blueprint.counters ?? []).some(entry => counterName(entry.name) === key)
    || (counterKey("blueprint", key, blueprint.id) in store.values);
  return own ? "blueprint" : "actor";
}

function clamp(value: number, def: CounterDef): number {
  const floored = Math.max(def.min, value);
  return (def.max === null) ? floored : Math.min(def.max, floored);
}

/** The value after an action ("add", "subtract", "set", "reset"), rounded down to whole numbers and kept within limits. */
export function nextCounterValue(current: number, action: string, amount: number, def: CounterDef): number {
  const step = Math.trunc(amount);
  switch (action) {
    case "add": return clamp(current + step, def);
    case "subtract": return clamp(current - step, def);
    case "set": return clamp(step, def);
    default: return clamp(def.initial, def);
  }
}

/** Short-rest counters reset on both rests; long-rest ones on long rests; turn ones at the start of a turn. */
export function resetsOn(event: "shortRest" | "longRest" | "turnStart", reset: CounterReset): boolean {
  if (event === "turnStart") return reset === "turnStart";
  if (event === "shortRest") return reset === "shortRest";
  return (reset === "shortRest") || (reset === "longRest");
}

/** The values an event resets, by key: shared counters of the actor and those of its blueprints. */
export function counterResets(
  store: CounterStore,
  blueprints: readonly Pick<BlueprintSource, "id" | "counters">[],
  event: "shortRest" | "longRest" | "turnStart"
): Record<string, number> {
  const resets: Record<string, number> = {};
  for (const def of Object.values(store.defs)) {
    if (resetsOn(event, def.reset)) resets[counterKey("actor", def.name, "")] = clamp(def.initial, def);
  }
  for (const blueprint of blueprints) {
    for (const def of (blueprint.counters ?? []).map(entry => readCounterDef(entry))) {
      if (resetsOn(event, def.reset)) resets[counterKey("blueprint", def.name, blueprint.id)] = clamp(def.initial, def);
    }
  }
  return resets;
}

const TARGET_REF = /@target\.counters\.([\p{L}\p{N}_]+)/gu;
const SELF_REF = /@counters\.([\p{L}\p{N}_]+)/gu;

/** Replace @target.counters.<name> and @counters.<name> with numbers; the target's are 0 without a target. */
export function substituteCounters(text: string, self: (name: string) => number, target: ((name: string) => number) | null): string {
  if (!text.includes("counters.")) return text;
  return text
    .replace(TARGET_REF, (_match, name: string) => String(target ? target(counterName(name)) : 0))
    .replace(SELF_REF, (_match, name: string) => String(self(counterName(name))));
}

/** Apply a string replacement to every string inside plain data (records and arrays). */
export function substituteDeep<T>(value: T, replace: (text: string) => string): T {
  if (typeof value === "string") return replace(value) as T;
  if (Array.isArray(value)) return value.map(entry => substituteDeep(entry, replace)) as T;
  if (value && (typeof value === "object")) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, substituteDeep(entry, replace)])) as T;
  }
  return value;
}

export interface UsedCounter {
  name: string;
  scope: CounterScope;
}

function nodeCounters(node: BlueprintNode): Readonly<Record<string, unknown>>[] {
  if ((node.kind === "result") && (node.type === "counter")) return [node.data];
  if (node.kind !== "condition") return [];
  const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
  return checks.filter(check => check.type === "counter").map(check => check.data);
}

/** "My" counters a blueprint uses, in graph order, each once: from counter nodes and checks, then from formulas. */
export function usedCounters(blueprint: BlueprintSource): UsedCounter[] {
  const found = new Map<string, UsedCounter>();
  const add = (name: string, scope: CounterScope) => {
    const key = counterName(name);
    if (key && !found.has(`${scope}:${key}`)) found.set(`${scope}:${key}`, { name: key, scope });
  };
  for (const node of blueprint.nodes) {
    for (const data of nodeCounters(node)) {
      if (asString(data.who ?? data.whose, "self") === "self") add(asString(data.name), (asString(data.scope) === "blueprint") ? "blueprint" : "actor");
    }
  }
  const text = JSON.stringify(blueprint.nodes.map(node => node.data));
  for (const match of text.matchAll(/(?<!target\.)@counters\.([\p{L}\p{N}_]+)/gu)) {
    const name = counterName(match[1] ?? "");
    add(name, formulaScope(EMPTY_STORE, name, blueprint));
  }
  return [...found.values()];
}
