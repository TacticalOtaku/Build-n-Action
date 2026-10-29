import type { BlueprintSource } from "../blueprint/types";
import { foldThisItemChecks } from "../blueprint/normalize";
import { validateBlueprintSource } from "../blueprint/validate";
import { convertLegacyBonus, type ConversionWarningCode, type LegacyCarrier } from "../legacy/adapter";
import { asRecord, asString } from "../registry/data";

export const MODULE_SCOPE = "build-n-action";
export const BLUEPRINT_NAME = "Blueprint";
/** The embedded name v1.0.6 used in UUIDs; still resolved for old links, enrichers and macros. */
export const LEGACY_NAME = "ContextualBonus";

/** A stored entry that could not be read as-is; shown in the editor's lint panel. */
export interface RepositoryIssue {
  id: string;
  code: "invalidBlueprint" | ConversionWarningCode;
  values?: Record<string, string>;
}

export interface ReadResult {
  blueprints: BlueprintSource[];
  issues: RepositoryIssue[];
}

/** New values for the module's flags; keys are relative to `flags.build-n-action`. */
export interface FlagUpdate {
  blueprints: unknown[];
  bonuses?: unknown[];
  legacyBackup?: Record<string, unknown>;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function issueMessageKey(issue: Pick<RepositoryIssue, "code">): string {
  return (issue.code === "invalidBlueprint") ? "BNA.Storage.invalidBlueprint" : `BNA.Migration.Warning.${issue.code}`;
}

/** Stored lists may be arrays or id-keyed objects (v1 accepted both). */
export function storedEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && (typeof value === "object")) return Object.values(value).filter(Boolean);
  return [];
}

export function storedId(entry: unknown): string {
  return asString(asRecord(entry).id);
}

/** A 16-character id derived from text (FNV-1a), so a bonus without a valid id keeps one id across reads. */
function derivedId(seed: string): string {
  let hash = 0x811c9dc5;
  let id = "";
  for (let round = 0; id.length < 16; round++) {
    for (const char of `${round}:${seed}`) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    id += ID_ALPHABET.charAt(hash % ID_ALPHABET.length);
  }
  return id;
}

function byOrder(left: BlueprintSource, right: BlueprintSource): number {
  return (left.sort - right.sort) || left.name.localeCompare(right.name);
}

/** The blueprints stored on a document: saved ones plus lazily converted v1 bonuses. */
export function readBlueprints(scope: unknown, carrier: LegacyCarrier): ReadResult {
  const flags = asRecord(scope);
  const blueprints: BlueprintSource[] = [];
  const issues: RepositoryIssue[] = [];
  const ids = new Set<string>();

  for (const raw of storedEntries(flags.blueprints)) {
    const result = validateBlueprintSource(raw);
    if (!result.ok) {
      issues.push({ id: storedId(raw), code: "invalidBlueprint", values: { path: result.issues[0]?.path || "—" } });
      continue;
    }
    if (ids.has(result.value.id)) continue;
    ids.add(result.value.id);
    blueprints.push(foldThisItemChecks(result.value));
  }

  const seeds = new Map<string, number>();
  for (const raw of storedEntries(flags.bonuses)) {
    if (ids.has(storedId(raw))) continue;
    const seed = JSON.stringify(raw);
    const occurrence = seeds.get(seed) ?? 0;
    seeds.set(seed, occurrence + 1);
    const { blueprint, warnings } = convertLegacyBonus(raw, carrier, { fallbackId: derivedId(`${occurrence}:${seed}`) });
    const id = blueprint?.id ?? storedId(raw);
    for (const warning of warnings) issues.push({ id, ...warning });
    if (!blueprint || ids.has(blueprint.id)) continue;
    ids.add(blueprint.id);
    blueprints.push(blueprint);
  }

  return { blueprints: blueprints.sort(byOrder), issues };
}

/** Remove the v1 bonus a blueprint was converted from (if still stored) and back it up. */
function withoutLegacy(flags: Record<string, unknown>, blueprint: Pick<BlueprintSource, "id" | "flags">): Omit<FlagUpdate, "blueprints"> {
  const legacyId = asString(asRecord(blueprint.flags[MODULE_SCOPE]).legacyId, blueprint.id);
  const bonuses = storedEntries(flags.bonuses);
  const index = bonuses.findIndex(entry => [blueprint.id, legacyId].includes(storedId(entry)));
  if (index < 0) return {};
  const original = bonuses[index];
  return {
    bonuses: bonuses.filter((_entry, position) => position !== index),
    legacyBackup: { ...asRecord(flags.legacyBackup), [blueprint.id]: original }
  };
}

/** Save a blueprint: replace it by id or append it, and retire the v1 bonus it came from. */
export function upsertBlueprint(scope: unknown, blueprint: BlueprintSource): FlagUpdate {
  const flags = asRecord(scope);
  const stored = storedEntries(flags.blueprints);
  const index = stored.findIndex(entry => storedId(entry) === blueprint.id);
  const blueprints = (index < 0)
    ? [...stored, blueprint]
    : stored.map((entry, position) => (position === index) ? blueprint : entry);
  return { blueprints, ...withoutLegacy(flags, blueprint) };
}

/** Delete a blueprint, including the v1 bonus it may still be stored as (kept in the backup). */
export function deleteBlueprint(scope: unknown, blueprint: Pick<BlueprintSource, "id" | "flags">): FlagUpdate {
  const flags = asRecord(scope);
  const blueprints = storedEntries(flags.blueprints).filter(entry => storedId(entry) !== blueprint.id);
  return { blueprints, ...withoutLegacy(flags, blueprint) };
}

/** A flag update as `document.update` changes. */
export function flagChanges(update: FlagUpdate): Record<string, unknown> {
  return Object.fromEntries(Object.entries(update).map(([key, value]) => [`flags.${MODULE_SCOPE}.${key}`, value]));
}

export function blueprintUuid(parentUuid: string, id: string): string {
  return `${parentUuid}.${BLUEPRINT_NAME}.${id}`;
}

const UUID_PATTERN = new RegExp(`^(.+)\\.(?:${BLUEPRINT_NAME}|${LEGACY_NAME})\\.([A-Za-z0-9]{16})$`);

/** Split a blueprint UUID (new or v1 form) into its parent document UUID and blueprint id. */
export function parseBlueprintUuid(uuid: string): { parentUuid: string; id: string } | null {
  const match = UUID_PATTERN.exec(uuid);
  if (!match?.[1] || !match[2]) return null;
  return { parentUuid: match[1], id: match[2] };
}
