import {MODULE, SETTINGS} from "./constants.mjs";
import {refreshTokenAuras} from "./services/application-factories.mjs";

/** Document types whose open sheets expose Build-n-Action header controls. */
const DOCUMENT_TYPES = new Set(["Actor", "Item", "ActiveEffect", "Region"]);

/**
 * Re-render open document applications after a header-control setting changes.
 */
export function refreshDocumentApplications() {
  const applications = new Set(Object.values(globalThis.ui?.windows ?? {}));
  for (const application of globalThis.foundry?.applications?.instances?.values?.() ?? []) {
    applications.add(application);
  }

  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  for (const application of applications) {
    if (!DOCUMENT_TYPES.has(application.document?.documentName)) continue;
    if (ApplicationV2 && (application instanceof ApplicationV2)) application.render({force: true});
    else application.render(true);
  }
}

/**
 * Apply aura display settings to every aura currently tracked on the canvas.
 */
export function refreshAuras() {
  refreshTokenAuras();
}

/**
 * Prompt connected clients to reload after changing startup-only sheet hooks.
 * @returns {Promise<void>}
 */
export function reloadWorld() {
  return foundry.applications.settings.SettingsConfig.reloadConfirm({world: true});
}

/**
 * Register one world-scoped boolean setting.
 * @param {ClientSettings} settings
 * @param {string} key
 * @param {object} config
 */
function registerBooleanSetting(settings, key, config) {
  settings.register(MODULE.ID, key, {
    scope: "world",
    config: true,
    type: Boolean,
    ...config
  });
}

/**
 * Register all module settings using the Foundry V14 SettingConfig contract.
 * Injectable callbacks keep registration independently testable.
 *
 * @param {object} [options]
 * @param {ClientSettings} [options.settings]
 * @param {Function} [options.refreshDocuments]
 * @param {Function} [options.refreshAuraDisplays]
 * @param {Function} [options.reload]
 */
export function registerSettings({
  settings = game.settings,
  refreshDocuments = refreshDocumentApplications,
  refreshAuraDisplays = refreshAuras,
  reload = reloadWorld
} = {}) {
  registerBooleanSetting(settings, SETTINGS.PLAYERS, {
    name: "BUILD_N_ACTION.SettingsShowBuilderForPlayersName",
    hint: "BUILD_N_ACTION.SettingsShowBuilderForPlayersHint",
    default: true,
    onChange: value => {
      refreshDocuments(value);
      if (settings.get?.(MODULE.ID, SETTINGS.SHEET_TAB)) return reload();
    }
  });

  registerBooleanSetting(settings, SETTINGS.LABEL, {
    name: "BUILD_N_ACTION.SettingsDisplayLabelName",
    hint: "BUILD_N_ACTION.SettingsDisplayLabelHint",
    default: false,
    onChange: refreshDocuments
  });

  registerBooleanSetting(settings, SETTINGS.SCRIPT, {
    name: "BUILD_N_ACTION.SettingsDisableCustomScriptFilterName",
    hint: "BUILD_N_ACTION.SettingsDisableCustomScriptFilterHint",
    default: false
  });

  registerBooleanSetting(settings, SETTINGS.AURA, {
    name: "BUILD_N_ACTION.SettingsShowAuraRangesName",
    hint: "BUILD_N_ACTION.SettingsShowAuraRangesHint",
    default: false,
    onChange: refreshAuraDisplays
  });

  registerBooleanSetting(settings, SETTINGS.RADIUS, {
    name: "BUILD_N_ACTION.SettingsPadAuraRadius",
    hint: "BUILD_N_ACTION.SettingsPadAuraRadiusHint",
    default: true,
    onChange: refreshAuraDisplays
  });

  registerBooleanSetting(settings, SETTINGS.FUMBLE, {
    name: "BUILD_N_ACTION.SettingsAllowFumbleNegationName",
    hint: "BUILD_N_ACTION.SettingsAllowFumbleNegationHint",
    default: false
  });

  registerBooleanSetting(settings, SETTINGS.SHEET_TAB, {
    name: "BUILD_N_ACTION.SettingsShowSheetTab",
    hint: "BUILD_N_ACTION.SettingsShowSheetTabHint",
    default: false,
    onChange: reload
  });
}
