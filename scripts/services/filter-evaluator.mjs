/**
 * Remove bonuses that fail any configured filter.
 *
 * Evaluation short-circuits on the first failed filter so custom scripts and
 * expensive target checks never run for an already rejected bonus.
 *
 * @param {Map<string, ContextualBonus>} bonuses
 * @param {Record<string, Function>} filterRegistry
 * @param {object} subjects
 * @param {object} details
 * @returns {Map<string, ContextualBonus>}
 */
export function evaluateBonusFilters(bonuses, filterRegistry, subjects, details) {
  for (const [key, bonus] of bonuses.entries()) {
    for (const [filterId, value] of Object.entries(bonus.filters)) {
      const filter = filterRegistry[filterId];
      if (!filter) {
        bonuses.delete(key);
        break;
      }
      if (filter.call(bonus, subjects, value, details)) continue;
      bonuses.delete(key);
      break;
    }
  }
  return bonuses;
}
