/**
 * Match a contextual bonus row against a user-entered search query.
 *
 * @param {string} text
 * @param {string} query
 * @param {string} [locale]
 * @returns {boolean}
 */
export function matchesBonusSearch(text, query, locale) {
  query = String(query ?? "").trim().toLocaleLowerCase(locale);
  if (!query) return true;
  return String(text ?? "").toLocaleLowerCase(locale).includes(query);
}
