import {MODULE} from "../constants.mjs";

/**
 * Count bonuses stored directly on a document without constructing their data models.
 *
 * @param {Document|object|null} document  Document whose module flags should be inspected.
 * @returns {number}                       Number of configured Build-n-Action bonuses.
 */
export function countDocumentBonuses(document) {
  const bonuses = document?.getFlag?.(MODULE.ID, "bonuses")
    ?? document?.flags?.[MODULE.ID]?.bonuses;

  if (Array.isArray(bonuses)) return bonuses.filter(Boolean).length;
  if ((bonuses instanceof Map) || (bonuses instanceof Set)) return bonuses.size;
  if (bonuses && (typeof bonuses === "object")) return Object.values(bonuses).filter(Boolean).length;
  return 0;
}
