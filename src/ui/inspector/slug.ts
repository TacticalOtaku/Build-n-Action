/** Identifier-style slug: lower case, letters and digits of any script, single dashes. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
