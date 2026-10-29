// Node data is user-editable and may come from older or foreign sources, so every
// reader tolerates any input and falls back to an empty value of the right type.

export function asString(value: unknown, fallback = ""): string {
  return (typeof value === "string") ? value : fallback;
}

export function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function asNumber(value: unknown): number | null {
  return ((typeof value === "number") && Number.isFinite(value)) ? value : null;
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return (value && (typeof value === "object") && !Array.isArray(value)) ? value as Record<string, unknown> : {};
}
