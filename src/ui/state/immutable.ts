/** A copy of `target` with the value at `path` replaced; untouched branches keep their identity. */
export function setIn<T>(target: T, path: readonly string[], value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path as [string, ...string[]];
  const source: unknown = target;
  if (Array.isArray(source)) {
    const copy = [...source];
    copy[Number(head)] = setIn(copy[Number(head)], rest, value);
    return copy as T;
  }
  const record = (source && (typeof source === "object")) ? source as Record<string, unknown> : {};
  return { ...record, [head]: setIn(record[head], rest, value) } as T;
}

