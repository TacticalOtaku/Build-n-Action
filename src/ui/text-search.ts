/** Lowercases, folds "ё" into "е", and trims search input or haystack text. */
export function normalizeSearch(text: string): string {
  return text.toLocaleLowerCase().replaceAll("ё", "е").trim();
}

/** Whether any of the texts contains the query; an empty query matches everything. */
export function matchesSearch(query: string, ...texts: readonly string[]): boolean {
  const needle = normalizeSearch(query);
  return !needle || texts.some((text) => normalizeSearch(text).includes(needle));
}
