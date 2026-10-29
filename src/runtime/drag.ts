import type { BlueprintSource } from "../core/blueprint/types";
import { validateBlueprintSource } from "../core/blueprint/validate";
import { asRecord, asString } from "../core/registry/data";
import { parseBlueprintUuid } from "../core/storage/repository";

export const BLUEPRINT_DRAG = "Blueprint";
/** v1's drag type; still accepted from old macros and links. */
export const LEGACY_DRAG = "ContextualBonus";

export type BlueprintDrop = { kind: "uuid"; uuid: string } | { kind: "data"; blueprint: BlueprintSource };

/** What a drop carries, if it is a blueprint. UUIDs must have the blueprint form and plain characters. */
export function parseBlueprintDrop(data: unknown): BlueprintDrop | null {
  const record = asRecord(data);
  if ((record.type !== BLUEPRINT_DRAG) && (record.type !== LEGACY_DRAG)) return null;
  const uuid = asString(record.uuid);
  if (uuid) return (parseBlueprintUuid(uuid) && /^[\w.-]+$/.test(uuid)) ? { kind: "uuid", uuid } : null;
  if (record.type !== BLUEPRINT_DRAG) return null;
  const result = validateBlueprintSource(record.data);
  return result.ok ? { kind: "data", blueprint: result.value } : null;
}
