/**
 * Normalize a selectable consumption amount and its resulting bonus scale.
 *
 * @param {object} options
 * @param {boolean} options.scales
 * @param {string|number} options.scaleValue
 * @param {number} options.minimum
 * @param {number} [options.step]
 * @returns {{value: number, scale: number}}
 */
export function calculateConsumptionScale({scales, scaleValue, minimum, step = 1}) {
  const value = Number.parseInt(scales ? scaleValue : minimum);
  const scale = scales ? Math.floor((value - minimum) / step) : 0;
  return {value, scale};
}

/**
 * Calculate the document update for item-use or quantity consumption.
 *
 * @param {"uses"|"quantity"} type
 * @param {Item5e} item
 * @param {number} value
 * @returns {{property: string, newValue: number}}
 */
export function calculateItemConsumption(type, item, value) {
  if (type === "uses") {
    return {
      property: "system.uses.spent",
      newValue: item.system.uses.spent + value
    };
  }
  return {
    property: "system.quantity",
    newValue: item.system.quantity - value
  };
}

/**
 * Allocate hit-die consumption across eligible classes.
 *
 * @param {Item5e[]} classes
 * @param {string} subtype
 * @param {number} amount
 * @returns {object[]}
 */
export function buildHitDiceUpdates(classes, subtype, amount) {
  const denominator = ["smallest", "largest"].includes(subtype) ? null : subtype;
  let eligible = classes.filter(cls => !denominator || (cls.system.hitDice === denominator));
  if (["smallest", "largest"].includes(subtype)) {
    eligible = [...eligible].sort((left, right) => {
      const order = left.system.hitDice.localeCompare(right.system.hitDice, "en", {numeric: true});
      return subtype === "largest" ? -order : order;
    });
  }

  const updates = [];
  let remaining = Number.parseInt(amount);
  for (const cls of eligible) {
    const available = ((remaining > 0) ? cls.system.levels : 0) - cls.system.hitDiceUsed;
    const delta = (remaining > 0) ? Math.min(remaining, available) : Math.max(remaining, available);
    if (!delta) continue;
    updates.push({_id: cls.id, "system.hitDiceUsed": cls.system.hitDiceUsed + delta});
    remaining -= delta;
    if (!remaining) break;
  }
  return updates;
}
