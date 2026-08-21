/**
 * Keep the dnd5e roll-configuration dialog available when a contextual bonus
 * still needs a user decision. This intentionally overrides Midi-QOL fast
 * forward only for rolls that actually have optional Build-n-Action bonuses.
 *
 * @param {object} dialog
 * @param {object} bonuses
 * @returns {boolean} Whether the dialog was required.
 */
export function requireOptionalRollDialog(dialog, bonuses) {
  if (!dialog || !bonuses?.optionals?.size) return false;
  dialog.configure = true;
  return true;
}
