// Foundry documents and dnd5e data reach the runtime as unknown values. These readers never
// throw: a missing step yields undefined, and lists accept arrays, Sets or any iterable.

/** Read a dotted path, e.g. read(actor, "system.attributes.hp.pct"). */
export function read(source: unknown, path: string): unknown {
  let value: unknown = source;
  for (const key of path.split(".")) {
    if ((value === null) || (value === undefined)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Entries of an array, Set or other iterable object; [] for anything else (strings included). */
export function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && (typeof value === "object") && (Symbol.iterator in value)) return [...(value as Iterable<unknown>)];
  return [];
}

/** The strings in an array, Set or other iterable. */
export function stringList(value: unknown): string[] {
  return listOf(value).filter((entry): entry is string => typeof entry === "string");
}

/** Call a method that returns an iterable (e.g. allApplicableEffects) and list the result; [] when absent. */
export function callList(source: unknown, method: string): unknown[] {
  const fn = read(source, method);
  return (typeof fn === "function") ? listOf(fn.call(source)) : [];
}
