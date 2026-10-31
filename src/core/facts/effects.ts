import { asRecord, asString } from "../registry/data";

export interface EffectReference {
  uuid: string;
  name: string;
}

export interface EffectFacts extends EffectReference {
  sources: readonly string[];
  active: boolean;
}

/** An effect reference must identify the effect itself, not its containing item. */
export function isEffectUuid(value: string): boolean {
  return /^[\w.-]+\.ActiveEffect\.[\w-]+$/.test(value);
}

export function effectReference(value: unknown): EffectReference | null {
  const data = asRecord(value);
  if (data.invalid === true) return null;
  const uuid = asString(data.uuid).trim();
  return isEffectUuid(uuid) ? { uuid, name: asString(data.name) } : null;
}
