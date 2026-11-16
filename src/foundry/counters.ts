import type { BlueprintSource } from "../core/blueprint/types";
import {
  buildCounterLookups, counterDef, counterKey, counterName, counterResets, counterValue, EMPTY_STORE,
  readCounterStore, usedCounters, type CounterLookups, type CounterStore
} from "../core/counters/counters";
import { MODULE_SCOPE } from "../core/storage/repository";
import { listOf, read } from "../runtime/read";
import type { CounterRow, CountersHost } from "../ui/host";
import { documentBlueprints, isDocument, ownerActor, replacement } from "./documents";
import { performOperations } from "./socket";

export type { CounterLookups };

export function counterStore(actor: FoundryDocument | null | undefined): CounterStore {
  return actor ? readCounterStore(read(actor, `flags.${MODULE_SCOPE}.counters`)) : EMPTY_STORE;
}

/** Every blueprint on an actor's documents: the actor, its items and its effects. */
export function actorBlueprints(actor: FoundryDocument): BlueprintSource[] {
  const documents = [actor, ...listOf(read(actor, "items")), ...listOf(read(actor, "effects"))].filter(isDocument);
  return documents.flatMap(document => documentBlueprints(document).blueprints);
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
  return buildCounterLookups(counterStore(owner), target ? counterStore(target) : null, blueprint, overrides);
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
