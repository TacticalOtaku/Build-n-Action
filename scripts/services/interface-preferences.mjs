import {MODULE, SETTINGS} from "../constants.mjs";

/** Apply personal visual preferences without a reload or changes to world data. */
export function applyInterfacePreferences({settings = game.settings, body = globalThis.document?.body} = {}) {
  if (!body) return;
  body.dataset.bnaEffects = settings.get(MODULE.ID, SETTINGS.EFFECTS) ? "on" : "off";
  body.dataset.bnaMotion = settings.get(MODULE.ID, SETTINGS.MOTION) ? "on" : "off";
}
