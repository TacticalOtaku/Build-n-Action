import {evaluateConditionGraph} from "./condition-graph.mjs";
import {evaluateContextCondition} from './graph-ports.mjs';

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
    if (bonus.conditionGraph?.enabled) {
      const configuredFilters = Object.keys(bonus.filters).filter(id => {
        const field = bonus.schema?.getField?.(`filters.${id}`);
        return field?.constructor?.storage ? field.constructor.storage(bonus) : true;
      });
      const evaluated = evaluateConditionGraph(bonus.conditionGraph, node => node.type === 'context'
        ? evaluateContextCondition(node, subjects, {combatActive: !!globalThis.game?.combat?.started})
        : filterRegistry[node.filter].call(bonus, subjects, bonus.filters[node.filter], details), {
        knownFilters: Object.keys(bonus.filters).filter(id => typeof filterRegistry[id] === "function"), configuredFilters
      });
      if (evaluated.result !== true) bonuses.delete(key);
      continue;
    }
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
