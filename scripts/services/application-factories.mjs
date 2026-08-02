let BonusSheetClass;
let TokenAuraClass;

/**
 * Configure UI classes at the composition root without making data models
 * depend on the public global API.
 *
 * @param {object} applications
 * @param {typeof ApplicationV2} applications.BonusSheet
 * @param {typeof TokenAura} applications.TokenAura
 */
export function configureApplicationFactories({BonusSheet, TokenAura}) {
  BonusSheetClass = BonusSheet;
  TokenAuraClass = TokenAura;
}

/**
 * Return the existing sheet for a bonus or construct a new one.
 *
 * @param {ContextualBonus} bonus
 * @returns {BonusSheet}
 */
export function getBonusSheet(bonus) {
  if (!BonusSheetClass) throw new Error("Build-n-Action application factories are not configured.");
  const sheet = foundry.applications.instances.get(BonusSheetClass.applicationId(bonus));
  return sheet ?? new BonusSheetClass({bonus});
}

/** Apply current display settings to tracked token auras. */
export function refreshTokenAuras() {
  TokenAuraClass?.refreshAll();
}

/**
 * Construct the configured aura visualization.
 *
 * @param {TokenDocument5e} token
 * @param {ContextualBonus} bonus
 * @returns {TokenAura}
 */
export function createTokenAura(token, bonus) {
  if (!TokenAuraClass) throw new Error("Build-n-Action application factories are not configured.");
  return new TokenAuraClass(token, bonus);
}
