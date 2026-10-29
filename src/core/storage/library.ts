import type { BlueprintSource } from "../blueprint/types";
import { validateBlueprintSource } from "../blueprint/validate";
import { convertLegacyBonus } from "../legacy/adapter";
import { asRecord } from "../registry/data";

export const EXPORT_TYPE = "build-n-action.blueprints";

export interface BlueprintExport {
  type: typeof EXPORT_TYPE;
  version: 2;
  blueprints: BlueprintSource[];
}

export interface ImportResult {
  blueprints: BlueprintSource[];
  /** Entries that were neither a valid blueprint nor a convertible v1 bonus. */
  rejected: number;
  error: "invalidJson" | null;
}

/** The world library's entries: valid blueprints, the first of each id. */
export function readLibrary(value: unknown): BlueprintSource[] {
  const list: BlueprintSource[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(value) ? value : []) {
    const result = validateBlueprintSource(raw);
    if (!result.ok || ids.has(result.value.id)) continue;
    ids.add(result.value.id);
    list.push(result.value);
  }
  return list;
}

export function withLibraryEntry(list: readonly BlueprintSource[], blueprint: BlueprintSource): BlueprintSource[] {
  return list.some(entry => entry.id === blueprint.id)
    ? list.map(entry => ((entry.id === blueprint.id) ? blueprint : entry))
    : [...list, blueprint];
}

export function withoutLibraryEntry(list: readonly BlueprintSource[], id: string): BlueprintSource[] {
  return list.filter(entry => entry.id !== id);
}

export function exportBlueprints(blueprints: readonly BlueprintSource[]): string {
  const data: BlueprintExport = { type: EXPORT_TYPE, version: 2, blueprints: [...blueprints] };
  return JSON.stringify(data, null, 2);
}

/** A v1 bonus has a v1 roll type and no schema version. */
function isLegacyBonus(raw: unknown): boolean {
  const record = asRecord(raw);
  return (record.schemaVersion === undefined) && ["attack", "damage", "save", "throw", "test", "hitdie"].includes(String(record.type));
}

function readEntry(raw: unknown): BlueprintSource | null {
  if (isLegacyBonus(raw)) return convertLegacyBonus(raw, "item").blueprint;
  const result = validateBlueprintSource(raw);
  return result.ok ? result.value : null;
}

/** Blueprints from exported JSON, a bare blueprint or array, or v1 bonus JSON. */
export function importBlueprints(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { blueprints: [], rejected: 0, error: "invalidJson" };
  }
  const record = asRecord(data);
  let raws: unknown[];
  if (Array.isArray(data)) raws = data;
  else if ((record.type === EXPORT_TYPE) && Array.isArray(record.blueprints)) raws = record.blueprints;
  else raws = [data];
  const blueprints: BlueprintSource[] = [];
  let rejected = 0;
  for (const raw of raws) {
    const entry = readEntry(raw);
    if (entry) blueprints.push(entry);
    else rejected++;
  }
  return { blueprints, rejected, error: null };
}
