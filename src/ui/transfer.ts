import type { BlueprintSource } from "../core/blueprint/types";
import { validateBlueprintSource } from "../core/blueprint/validate";
import { asRecord } from "../core/registry/data";

export const DRAG_TYPE = "Blueprint";

/** Drag data when the host has no format of its own: the blueprint travels with the drag. */
export function defaultDragData(blueprint: BlueprintSource): Record<string, unknown> {
  return { type: DRAG_TYPE, data: blueprint };
}

export function readDroppedBlueprint(data: unknown): BlueprintSource | null {
  const record = asRecord(data);
  if (record.type !== DRAG_TYPE) return null;
  const result = validateBlueprintSource(record.data);
  return result.ok ? result.value : null;
}

/** The JSON object in a drag's text, or null. */
export function parseDragText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
