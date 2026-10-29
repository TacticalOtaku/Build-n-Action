import type { LegacyCarrier } from "../core/legacy/adapter";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { MODULE_SCOPE, readBlueprints, type ReadResult } from "../core/storage/repository";
import { listOf, read } from "../runtime/read";

const EMPTY: ReadResult = { blueprints: [], issues: [] };

const CARRIERS: Readonly<Record<string, LegacyCarrier>> = {
  Actor: "actor", Item: "item", ActiveEffect: "effect", Region: "region", MeasuredTemplate: "template"
};

export function isDocument(value: unknown): value is FoundryDocument {
  return !!value && (typeof value === "object")
    && (typeof read(value, "documentName") === "string") && (typeof read(value, "uuid") === "string");
}

/** Whether a value is a document of one of these types (not a type guard, so "false" narrows nothing). */
function isA(value: unknown, ...names: string[]): boolean {
  return isDocument(value) && names.includes(value.documentName);
}

/** A world document by UUID, or null (never throws, never returns compendium index entries). */
export function documentFromUuid(uuid: string): FoundryDocument | null {
  if (!uuid) return null;
  try {
    const found = fromUuidSync(uuid);
    return isDocument(found) ? found : null;
  } catch {
    return null;
  }
}

export function carrierKind(document: FoundryDocument): LegacyCarrier | null {
  return CARRIERS[document.documentName] ?? null;
}

interface Cached {
  blueprints: unknown;
  bonuses: unknown;
  result: ReadResult;
}

const cache = new WeakMap<FoundryDocument, Cached>();

/**
 * Blueprints on a document: saved ones plus converted v1 bonuses. Foundry replaces flag arrays on
 * update, so the read is redone only when either array changes and compiled plans stay cached.
 */
export function documentBlueprints(document: FoundryDocument): ReadResult {
  const carrier = carrierKind(document);
  const scope = read(document, `flags.${MODULE_SCOPE}`);
  if (!carrier || !scope) return EMPTY;
  const blueprints = read(scope, "blueprints");
  const bonuses = read(scope, "bonuses");
  const cached = cache.get(document);
  if (cached && (cached.blueprints === blueprints) && (cached.bonuses === bonuses)) return cached.result;
  const result = readBlueprints(scope, carrier);
  cache.set(document, { blueprints, bonuses, result });
  return result;
}

/** Whether a carrier currently does nothing (v1 ContextualBonus#isSuppressed). */
export function isSuppressed(document: FoundryDocument): boolean {
  switch (document.documentName) {
    case "ActiveEffect":
      if (read(document, "active") !== true) return true;
      if (read(document, "isAppliedEnchantment") === true) return false;
      return read(document, "modifiesActor") !== true;
    case "MeasuredTemplate":
      return read(document, "hidden") === true;
    case "Item": {
      const actor = document.parent;
      if (!actor) return false;
      if (read(actor, "type") === "vehicle") {
        const system = asRecord(read(document, "system"));
        return ("crewed" in system) && (system.crewed !== true);
      }
      return read(document, "areEffectsSuppressed") === true;
    }
    default:
      return false;
  }
}

/** The item whose activity placed a template (its dnd5e origin flag holds the activity UUID). */
export function templateOriginItem(template: FoundryDocument): FoundryDocument | null {
  const origin = asString(read(template, "flags.dnd5e.origin"));
  if (!origin) return null;
  const item = documentFromUuid(origin.split(".").slice(0, -2).join("."));
  return isA(item, "Item") ? item : null;
}

function effectSource(effect: FoundryDocument): FoundryDocument | null {
  let origin = documentFromUuid(asString(read(effect, "origin")));
  if (isA(origin, "ActiveEffect")) origin = origin?.parent ?? null;
  if (isA(origin, "Item", "Actor")) return origin;
  return isA(effect.parent, "Item", "Actor") ? effect.parent : null;
}

/** The actor a blueprint belongs to (for signals, "includes me" and blockers). */
export function ownerActor(document: FoundryDocument): FoundryDocument | null {
  switch (document.documentName) {
    case "Actor":
      return document;
    case "Item":
      return isA(document.parent, "Actor") ? document.parent : null;
    case "ActiveEffect": {
      const parent = document.parent;
      if (isA(parent, "Actor")) return parent;
      return (isA(parent, "Item") && isA(parent?.parent, "Actor")) ? (parent?.parent ?? null) : null;
    }
    case "MeasuredTemplate": {
      const item = templateOriginItem(document);
      return (item && isA(item.parent, "Actor")) ? item.parent : null;
    }
    default:
      return null;
  }
}

/** The document whose roll data a blueprint's formulas use (v1 ContextualBonus#origin). */
export function rollDataOrigin(document: FoundryDocument): FoundryDocument | null {
  switch (document.documentName) {
    case "Actor":
    case "Item":
      return document;
    case "ActiveEffect":
      return effectSource(document);
    case "MeasuredTemplate":
      return templateOriginItem(document);
    default:
      return null;
  }
}

/** The item a blueprint belongs to, for "this item only" and item costs. */
export function carrierItem(document: FoundryDocument): FoundryDocument | null {
  switch (document.documentName) {
    case "Item":
      return document;
    case "MeasuredTemplate":
      return templateOriginItem(document);
    case "ActiveEffect": {
      const source = effectSource(document);
      return isA(source, "Item") ? source : null;
    }
    default:
      return null;
  }
}

/** Roll data of an activity, item or actor (a fresh object each call). */
export function rollDataOf(source: unknown, deterministic = false): Record<string, unknown> {
  const getRollData = read(source, "getRollData");
  if (typeof getRollData !== "function") return {};
  return asRecord(getRollData.call(source, { deterministic }));
}

/** Roll data of a blueprint's origin; a template also carries the level its spell was cast at. */
export function originRollData(document: FoundryDocument, deterministic = false): Record<string, unknown> {
  const data = rollDataOf(rollDataOrigin(document), deterministic);
  const level = asNumber(read(document, "flags.dnd5e.spellLevel"));
  if ((document.documentName === "MeasuredTemplate") && (level !== null)) data.item = { ...asRecord(data.item), level };
  return data;
}

/** The token that represents an actor on the canvas (its own token, else its first active token). */
export function actorToken(actor: FoundryDocument): TokenPlaceable | null {
  const own = read(actor, "token.object");
  if (own) return own as TokenPlaceable;
  const getActiveTokens = read(actor, "getActiveTokens");
  if (typeof getActiveTokens !== "function") return null;
  return (listOf(getActiveTokens.call(actor))[0] as TokenPlaceable | undefined) ?? null;
}

/** Whether a document update touched this module's flags (blueprints or v1 bonuses). */
export function touchesBlueprints(changes: unknown): boolean {
  const record = asRecord(changes);
  if (Object.keys(record).some(key => key.startsWith(`flags.${MODULE_SCOPE}`))) return true;
  const flags = asRecord(record.flags);
  return (MODULE_SCOPE in flags) || (`-=${MODULE_SCOPE}` in flags);
}

/** An update value that deletes its key (Foundry v14's ForcedDeletion; the "-=key" syntax is deprecated). */
export function deletion(): unknown {
  return new foundry.data.operators.ForcedDeletion();
}

/** An update value that replaces an object whole instead of merging into it (v14's ForcedReplacement, formerly "==key"). */
export function replacement(value: unknown): unknown {
  return foundry.data.operators.ForcedReplacement.create(value);
}

const queues = new Map<string, Promise<void>>();

/** Run one actor's read-then-write changes one after another on this client, so they never overwrite each other. */
export function queueFor(actor: FoundryDocument, write: () => Promise<void>): Promise<void> {
  const previous = queues.get(actor.uuid) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  queues.set(actor.uuid, next);
  return next.finally(() => {
    if (queues.get(actor.uuid) === next) queues.delete(actor.uuid);
  });
}
