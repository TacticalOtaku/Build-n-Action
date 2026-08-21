/**
 * Persist an explicitly selected image on a contextual bonus.
 *
 * Image selection is kept out of the parent DocumentSheet form submission so
 * the ContextualBonus remains the only owner of its nested flag data.
 *
 * @param {ContextualBonus} bonus
 * @param {string} path
 * @returns {Promise<ContextualBonus>}
 */
export async function updateBonusImage(bonus, path) {
  path = String(path ?? "").trim();
  if (!path || (path === bonus.img)) return bonus;
  await bonus.update({img: path});
  return bonus;
}
