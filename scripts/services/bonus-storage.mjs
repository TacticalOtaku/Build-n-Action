import {MODULE} from "../constants.mjs";

/**
 * Read raw contextual-bonus data from a document flag.
 *
 * @param {Document|object} document
 * @returns {object[]}
 */
export function getStoredBonusData(document) {
  let stored = foundry.utils.getProperty(document, `flags.${MODULE.ID}.bonuses`) ?? [];
  if (stored instanceof Map) stored = stored.values();
  else if (foundry.utils.getType(stored) === "Object") stored = Object.values(stored);
  return Array.isArray(stored) ? stored.filter(Boolean) : Array.from(stored ?? []);
}

/**
 * Replace one stored bonus or append it when it is new.
 *
 * @param {Document} document
 * @param {string} id
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function upsertStoredBonus(document, id, data) {
  const stored = getStoredBonusData(document).filter(entry => entry.id !== id);
  stored.push(data);
  await document.setFlag(MODULE.ID, "bonuses", stored);
}

/**
 * Remove one stored bonus.
 *
 * @param {Document} document
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function removeStoredBonus(document, id) {
  const stored = getStoredBonusData(document).filter(entry => entry.id !== id);
  await document.setFlag(MODULE.ID, "bonuses", stored);
}
