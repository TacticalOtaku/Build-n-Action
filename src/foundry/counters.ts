import type { BlueprintSource, CounterScope } from "../core/blueprint/types";
import type { ChainEntry, ChainIntent } from "../core/engine/interpreter";
import {
  counterDef, counterKey, counterName, counterResets, counterValue, EMPTY_STORE, formulaScope, readCounterStore, substituteCounters,
  substituteDeep, usedCounters, type CounterStore
} from "../core/counters/counters";
import { MODULE_SCOPE } from "../core/storage/repository";
import { listOf, read } from "../runtime/read";
import type { Roller, SourceInfo } from "./collect";
import type { CounterRow, CountersHost } from "../ui/host";
import { documentBlueprints, isDocument, ownerActor, replacement } from "./documents";
import { performOperations } from "./socket";

export function counterStore(actor: FoundryDocument | null | undefined): CounterStore {
  return actor ? readCounterStore(read(actor, `flags.${MODULE_SCOPE}.counters`)) : EMPTY_STORE;
}

/** Every blueprint on an actor's documents: the actor, its items and its effects. */
export function actorBlueprints(actor: FoundryDocument): BlueprintSource[] {
  const documents = [actor, ...listOf(read(actor, "items")), ...listOf(read(actor, "effects"))].filter(isDocument);
  return documents.flatMap(document => documentBlueprints(document).blueprints);
}

export interface CounterLookups {
  /** "My" counter by a formula name (the blueprint's own first, then shared). */
  self(name: string): number;
  /** The target's counter by a formula name; null without a target. */
  target: ((name: string) => number) | null;
  /** A counter of a known kind, mine or the target's. */
  value(name: string, scope: CounterScope, whose: "self" | "target"): number;
}

/**
 * Counter lookups for one blueprint: "my" counters on `owner`, the target's on `target`. `overrides` (the Test tab)
 * replace my values by "<scope>:<name>".
 */
export function counterLookups(
  owner: FoundryDocument | null,
  target: FoundryDocument | null,
  blueprint: BlueprintSource,
  overrides: Readonly<Record<string, number>> = {}
): CounterLookups {
  const mine = counterStore(owner);
  const theirs = counterStore(target);
  const own = (name: string, scope: CounterScope) => overrides[`${scope}:${name}`] ?? counterValue(mine, scope, name, blueprint);
  return {
    self: name => own(name, formulaScope(mine, name, blueprint)),
    target: target ? name => counterValue(theirs, formulaScope(theirs, name, blueprint), name, blueprint) : null,
    value: (name, scope, whose) => (whose === "target") ? counterValue(theirs, scope, name, blueprint) : own(name, scope)
  };
}

/** Results with every @counters.* and @target.counters.* reference replaced by the value now. */
export function resolveCounterIntents(intents: readonly ChainIntent[], sources: ReadonlyMap<ChainEntry, SourceInfo>, roller: Roller): ChainIntent[] {
  return intents.map(intent => {
    const info = sources.get(intent.entry);
    if (!info || !JSON.stringify([intent.data, intent.common]).includes("counters.")) return intent;
    const lookups = counterLookups(info.owner ?? roller.actor, roller.target?.actor ?? null, info.blueprint);
    const replace = (text: string) => substituteCounters(text, lookups.self, lookups.target);
    return { ...intent, data: substituteDeep(intent.data, replace), common: substituteDeep(intent.common, replace) };
  });
}

/** Reset the actor's counters that the event resets (GM side, with the triggers). */
export async function resetCounters(actor: FoundryDocument, event: "shortRest" | "longRest" | "turnStart"): Promise<void> {
  const resets = counterResets(counterStore(actor), actorBlueprints(actor), event);
  const updates = Object.fromEntries(Object.entries(resets).map(([key, value]) => [`flags.${MODULE_SCOPE}.counters.values.${key}`, value]));
  if (Object.keys(updates).length) await actor.update(updates);
}

/** The values of the counters a blueprint uses, on an actor. */
export function counterRows(actor: FoundryDocument | null, blueprint: BlueprintSource): CounterRow[] {
  if (!actor) return [];
  const store = counterStore(actor);
  return usedCounters(blueprint).map(used => ({ ...used, value: counterValue(store, used.scope, used.name, blueprint) }));
}

/** The editor's view of counters for a carrier: values on its owner, definitions, resets. */
export function countersHost(carrier: FoundryDocument): CountersHost {
  const owner = () => ownerActor(carrier);
  return {
    rows: blueprint => counterRows(owner(), blueprint),
    names: blueprint => [...new Set([...Object.keys(counterStore(owner()).defs), ...(blueprint.counters ?? []).map(def => counterName(def.name))])],
    reset: async (blueprint, row) => {
      const actor = owner();
      if (!actor) return;
      const def = counterDef(counterStore(actor), row.scope, row.name, blueprint);
      await performOperations([{ kind: "counter", actor: actor.uuid, key: counterKey(row.scope, row.name, blueprint.id), action: "reset", amount: 0, def }]);
    },
    actorDefs: () => {
      const actor = owner();
      return actor ? Object.values(counterStore(actor).defs) : null;
    },
    saveActorDefs: async defs => {
      const actor = owner();
      if (!actor) return;
      // Replace the definitions whole, so removed counters go too (v14 operator; "-=defs" is deprecated).
      await actor.update({ [`flags.${MODULE_SCOPE}.counters.defs`]: replacement(Object.fromEntries(defs.map(def => [def.name, { ...def }]))) });
    },
    subscribe: listener => {
      const id = Hooks.on("updateActor", (actor: unknown, changes: unknown) => {
        if ((actor === owner()) && JSON.stringify(changes).includes("counters")) listener();
      });
      return () => Hooks.off("updateActor", id);
    }
  };
}
