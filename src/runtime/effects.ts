import { isEffectUuid, type EffectFacts } from "../core/facts/effects";
import { asString } from "../core/registry/data";
import { callList, read, stringList } from "./read";

/** Only exact effect references establish provenance; an item origin is ambiguous. */
export function effectSources(effect: unknown): string[] {
  return [...new Set([
    asString(read(effect, "uuid")),
    ...stringList(read(effect, "flags.build-n-action.effectSources")),
    asString(read(effect, "_stats.duplicateSource")),
    asString(read(effect, "_stats.compendiumSource")),
    asString(read(effect, "origin"))
  ].filter(isEffectUuid))];
}

/** Foundry supplies applicable actor/item effects, including inactive ones. */
export function creatureEffects(actor: unknown): EffectFacts[] {
  return callList(actor, "allApplicableEffects").flatMap(effect => {
    const name = asString(read(effect, "name"));
    const uuid = asString(read(effect, "uuid"));
    return (name || isEffectUuid(uuid)) ? [{ name, uuid, sources: effectSources(effect), active: read(effect, "active") === true }] : [];
  });
}
