/** More paths than any suggestion list needs; stops runaway roll data. */
const LIMIT = 3000;

/** `@` paths of every number, string or boolean in roll data, up to `maxDepth` levels, sorted. */
export function rollDataPaths(data: unknown, maxDepth = 5): string[] {
  const paths: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (value: unknown, prefix: string, depth: number) => {
    if (paths.length >= LIMIT) return;
    if (["number", "string", "boolean"].includes(typeof value)) {
      if (prefix) paths.push(`@${prefix}`);
      return;
    }
    if (!value || (typeof value !== "object") || Array.isArray(value) || seen.has(value) || (depth >= maxDepth)) return;
    seen.add(value);
    // Only data properties: dnd5e keeps deprecated keys (senses.darkvision) as getters that warn when read.
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !("value" in descriptor) || (typeof descriptor.value === "function")) continue;
      walk(descriptor.value, prefix ? `${prefix}.${key}` : key, depth + 1);
    }
  };
  walk(data, "", 0);
  return paths.sort();
}
