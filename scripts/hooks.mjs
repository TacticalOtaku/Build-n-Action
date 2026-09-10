import {MODULE} from "./constants.mjs";
import * as filterings from "./services/filterings.mjs";
import api from "./api.mjs";
import applications from "./applications/_module.mjs";
import characterSheetTabSetup from "./applications/character-sheet-tab.mjs";
import enricherSetup from "./applications/enrichers.mjs";
import fields from "./fields/_module.mjs";
import injections from "./applications/injections.mjs";
import {getIntegrationStatus, validateIntegrations} from "./integrations.mjs";
import models from "./models/_module.mjs";
import mutators from "./mutators.mjs";
import OptionalSelector from "./applications/optional-selector.mjs";
import registry from "./registry.mjs";
import {configureApplicationFactories} from "./services/application-factories.mjs";
import {getProficiencyTrees, setProficiencyTrees} from "./services/proficiencies.mjs";
import {registerSettings} from "./settings.mjs";
import {applyInterfacePreferences} from "./services/interface-preferences.mjs";

// Build the module-owned public API. The package API is canonical; the global
// is provided for macros and deliberately has no legacy aliases.
const buildNActionApi = {
  ...api,
  getIntegrationStatus,
  abstract: {
    DataModels: models.ContextualBonus,
    DataFields: {
      fields: fields,
      models: models
    },
    TYPES: Object.keys(models.ContextualBonus),
    applications: applications
  },
  filters: {...filterings.filters}
};
Object.defineProperty(buildNActionApi, "trees", {get: getProficiencyTrees});
configureApplicationFactories(applications);
globalThis.BuildNAction = buildNActionApi;
globalThis.buildNAction = buildNActionApi;

/* -------------------------------------------------- */

/**
 * Render the optional bonus selector on a roll dialog.
 * @param {Dialog} dialog     The dialog being rendered.
 */
async function _renderDialog(dialog) {
  const m = dialog.options[MODULE.ID];
  if (!m) return;
  const r = registry.get(m.registry);
  if (!r) return;
  r.dialog = dialog;
  new OptionalSelector(m.registry).render();
}

/* -------------------------------------------------- */

/**
 * On-drop handler for the hotbar.
 * @param {Hotbar} bar                The hotbar application.
 * @param {object} dropData           The drop data.
 * @param {string} dropData.type      The type of the dropped document.
 * @param {string} dropData.uuid      The uuid of the dropped document.
 * @param {number} slot               The slot on the hotbar where it was dropped.
 */
async function _onHotbarDrop(bar, {type, uuid}, slot) {
  if (type !== "ContextualBonus") return;
  const bonus = await buildNActionApi.fromUuid(uuid);
  const data = {
    img: bonus.img,
    command: `buildNAction.hotbarToggle("${uuid}");`,
    name: `${game.i18n.localize("BUILD_N_ACTION.ToggleBonus")}: ${bonus.name}`,
    type: CONST.MACRO_TYPES.SCRIPT
  };
  const macro = game.macros.find(m => {
    return Object.entries(data).every(([k, v]) => m[k] === v) && m.isAuthor;
  }) ?? await Macro.implementation.create(data);
  return game.user.assignHotbarMacro(macro, slot);
}

/* -------------------------------------------------- */

/** Setup the global 'trees' for proficiency searching. */
async function setupTree() {
  const trees = {};
  for (const k of ["languages", "weapon", "armor", "tool", "skills"]) {
    trees[k] = await dnd5e.documents.Trait.choices(k);
  }
  setProficiencyTrees(trees);
}

/* -------------------------------------------------- */

// General setup.
Hooks.once("init", registerSettings);
Hooks.once("ready", () => applyInterfacePreferences());
Hooks.once("init", enricherSetup);
Hooks.once("init", () => game.modules.get(MODULE.ID).api = buildNActionApi);
Hooks.on("hotbarDrop", _onHotbarDrop);
Hooks.once("setup", () => characterSheetTabSetup());

// Any application injections.
Hooks.on("getActiveEffectConfigHeaderButtons", (...T) => injections.HeaderButton.inject(...T));
Hooks.on("getActorSheetHeaderButtons", (...T) => injections.HeaderButton.inject(...T));
Hooks.on("getDialogHeaderButtons", (...T) => injections.HeaderButtonDialog.inject(...T));
Hooks.on("getItemSheetHeaderButtons", (...T) => injections.HeaderButton.inject(...T));
Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
  injections.HeaderButton.injectV2(application, controls);
  injections.HeaderButtonDialog.injectV2(application, controls);
});
Hooks.on("renderDialog", _renderDialog);
Hooks.on("renderRollConfigurationDialog", _renderDialog);
Hooks.on("refreshToken", token => {
  for (const aura of applications.TokenAura.values()) {
    if ((aura.target === token) || (aura.token === token.document)) aura.refresh();
  }
});
Hooks.on("deleteToken", tokenDocument => {
  for (const aura of applications.TokenAura.values()) {
    if (aura.token === tokenDocument) aura.destroy({fadeOut: false});
  }
});
Hooks.on("canvasTearDown", () => applications.TokenAura.clear());

// Roll hooks. Delay these to let other modules modify behaviour first.
Hooks.once("ready", function() {
  validateIntegrations();
  Hooks.callAll(`${MODULE.ID}.preInitializeRollHooks`);

  Hooks.on("dnd5e.postActivityConsumption", mutators.postActivityConsumption);
  Hooks.on("dnd5e.preRollAbilityCheck", mutators.preRollAbilityCheck);
  Hooks.on("dnd5e.preRollAttack", mutators.preRollAttack);
  Hooks.on("dnd5e.preRollDamage", mutators.preRollDamage);
  Hooks.on("dnd5e.preRollHitDie", mutators.preRollHitDie);
  Hooks.on("dnd5e.preRollSavingThrow", mutators.preRollSavingThrow);
  Hooks.on("dnd5e.preCreateActivityTemplate", mutators.preCreateActivityTemplate);

  Hooks.callAll(`${MODULE.ID}.initializeRollHooks`);
  Hooks.callAll(`${MODULE.ID}.ready`, buildNActionApi, getIntegrationStatus());
});

Hooks.once("init", function() {
  const hook = game.modules.get("babele")?.active && (game.babele?.initialized === false) ? "babele.ready" : "ready";
  Hooks.once(hook, () => setupTree());
});

Hooks.once("i18nInit", function() {
  for (const model of Object.values(models.ContextualBonus)) {
    Localization.localizeDataModel(model);
  }

  const localizeObject = object => {
    for (const [k, v] of Object.entries(object)) {
      object[k] = game.i18n.localize(v);
    }
  };

  localizeObject(MODULE.ATTACK_MODES_CHOICES);
  localizeObject(MODULE.CONSUMPTION_TYPES);
  localizeObject(MODULE.DISPOSITION_TYPES);
  localizeObject(MODULE.HEALTH_PERCENTAGES_CHOICES);
  localizeObject(MODULE.MODIFIER_MODES);
  localizeObject(MODULE.SPELL_COMPONENT_CHOICES);
  localizeObject(MODULE.TOKEN_SIZES_CHOICES);
});
