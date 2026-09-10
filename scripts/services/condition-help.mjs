/** One source of field help for the visual editor and the existing filter picker. */
export function getConditionHelp(id, localize = key => globalThis.game.i18n.localize(key)) {
  return {
    description: localize(`BUILD_N_ACTION.FIELDS.filters.${id}.hint`).replace(/<[^>]*>/g, ""),
    example: localize(`BUILD_N_ACTION.ConditionHelp.${id}.example`),
    context: localize(`BUILD_N_ACTION.ConditionHelp.${id}.context`)
  };
}
