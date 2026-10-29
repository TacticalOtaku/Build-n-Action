/** An `@path` being typed: where it sits in the text, and what was typed after `@` up to the caret. */
export interface FormulaToken {
  start: number;
  end: number;
  query: string;
}

const PATH_CHAR = /[\w.]/;

/** The @ token the caret is in, or null. A token starts at "@" that follows a non-path character. */
export function tokenAt(text: string, caret: number): FormulaToken | null {
  let start = caret;
  while ((start > 0) && PATH_CHAR.test(text.charAt(start - 1))) start--;
  if ((start === 0) || (text.charAt(start - 1) !== "@")) return null;
  const at = start - 1;
  if ((at > 0) && PATH_CHAR.test(text.charAt(at - 1))) return null;
  let end = caret;
  while ((end < text.length) && PATH_CHAR.test(text.charAt(end))) end++;
  return { start: at, end, query: text.slice(start, caret) };
}

/** Paths whose name starts with the query come first, then those that contain it. */
export function matchPaths(paths: readonly string[], query: string, limit = 8): string[] {
  const needle = query.toLowerCase();
  const prefix: string[] = [];
  const inner: string[] = [];
  for (const path of paths) {
    const name = path.slice(1).toLowerCase();
    if (name.startsWith(needle)) prefix.push(path);
    else if (name.includes(needle)) inner.push(path);
  }
  return [...prefix, ...inner].slice(0, limit);
}

export function insertPath(text: string, token: FormulaToken, path: string): { text: string; caret: number } {
  return { text: text.slice(0, token.start) + path + text.slice(token.end), caret: token.start + path.length };
}
