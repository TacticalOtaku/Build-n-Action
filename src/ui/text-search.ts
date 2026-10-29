function normalize(text: string): string {
  return text.toLocaleLowerCase().replaceAll("ё", "е").trim();
}

/** Whether any of the texts contains the query; an empty query matches everything. */
export function matchesSearch(query: string, ...texts: readonly string[]): boolean {
  const needle = normalize(query);
  return !needle || texts.some(text => normalize(text).includes(needle));
}
