import {MODULE, SETTINGS} from "../constants.mjs";
import {isEmbeddableDocument} from "../services/bonus-repository.mjs";
import AppliedBonusesDialog from "./applied-bonuses-dialog.mjs";
import {countDocumentBonuses} from "./document-indicator.mjs";
import {openBonusWorkshop} from "./open-workshop.mjs";

/**
 * Utility class for injecting header buttons onto actor, item, and effect sheets.
 */
class HeaderButton {
  constructor(application) {
    this.#application = application;
    this.#bonusCount = countDocumentBonuses(application.document);
  }

  /* -------------------------------------------------- */

  /**
   * The sheet that is having a header button or tab attached.
   */
  #application = null;

  /** Number of bonuses stored directly on the sheet document. */
  #bonusCount = 0;

  /* -------------------------------------------------- */

  /**
   * Should the button be available for this user?
   * @type {boolean}
   */
  get showButton() {
    return game.settings.get(MODULE.ID, SETTINGS.PLAYERS) || game.user.isGM;
  }

  /* -------------------------------------------------- */

  /**
   * Should the label be shown in a header button or just icon?
   * @type {boolean}
   */
  get showLabel() {
    return game.settings.get(MODULE.ID, SETTINGS.LABEL);
  }

  /* -------------------------------------------------- */

  /**
   * Does this application show a tab instead of a button?
   * @type {boolean}
   */
  get showTab() {
    switch (this.#application.constructor.name) {
      case "ActorSheet5eCharacter2":
      case "ActorSheet5eNPC2":
      case "CharacterActorSheet":
      case "NPCActorSheet":
        return game.settings.get(MODULE.ID, SETTINGS.SHEET_TAB);
      default:
        return false;
    }
  }

  /* -------------------------------------------------- */

  /**
   * The invalid document types that should prevent the button from being shown.
   * @type {Set<string>}
   */
  get invalidTypes() {
    switch (this.#application.document.documentName) {
      case "Actor":
        return new Set(["group"]);
      default:
        return new Set();
    }
  }

  /* -------------------------------------------------- */

  /**
   * The button label.
   * @type {string}
   */
  get label() {
    return game.i18n.localize("BUILD_N_ACTION.ModuleTitle");
  }

  /* -------------------------------------------------- */

  /** Header icon, marked when the document owns one or more bonuses. */
  get icon() {
    const marker = this.#bonusCount ? ` ${MODULE.ID}-bonus-marker` : "";
    return `${MODULE.ICON}${marker}`;
  }

  /* -------------------------------------------------- */

  /**
   * Inject the button in the application's header.
   * @param {Application} application     The rendered application.
   * @param {object[]} array              The array of buttons.
   */
  static inject(application, array) {
    const instance = new this(application);

    // Invalid document subtype.
    if (instance.invalidTypes.has(application.document.type)) return;

    // This application shows a tab instead of a header button.
    if (instance.showTab) return;

    // Header buttons are disabled.
    if (!instance.showButton) return;

    // Insert button.
    array.unshift({
      class: `${MODULE.ID}${instance.#bonusCount ? " has-bonuses" : ""}`,
      icon: instance.icon,
      onclick: () => openBonusWorkshop(application.document),
      label: instance.showLabel ? instance.label : ""
    });
  }

  /* -------------------------------------------------- */

  /**
   * Inject a control into a Foundry v14 ApplicationV2 header.
   * @param {ApplicationV2} application                  The rendered application.
   * @param {ApplicationHeaderControlsEntry[]} controls  The array of controls.
   */
  static injectV2(application, controls) {
    const document = application.document;
    if (!isEmbeddableDocument(document)) return;

    const instance = new this(application);
    if (instance.invalidTypes.has(document.type) || instance.showTab || !instance.showButton) return;

    controls.unshift({
      action: `${MODULE.ID}-builder`,
      icon: instance.icon,
      label: instance.label,
      onClick: () => openBonusWorkshop(document)
    });
  }
}

/* -------------------------------------------------- */

/**
 * Add a header button to display the source of all applied bonuses.
 * Supports both legacy roll dialogs and ApplicationV2 roll configuration.
 */
class HeaderButtonDialog extends HeaderButton {
  /** @override */
  static inject(application, array) {
    const id = application.options[MODULE.ID]?.registry;
    if (!id) return;

    const instance = new this(application);
    array.unshift({
      class: MODULE.ID,
      icon: MODULE.ICON,
      onclick: () => new AppliedBonusesDialog({id, dialog: application}).render(true),
      label: instance.showLabel ? instance.label : ""
    });
  }

  /** @override */
  static injectV2(application, controls) {
    const id = application.options[MODULE.ID]?.registry;
    if (!id) return;

    const instance = new this(application);
    controls.unshift({
      action: `${MODULE.ID}-applied`,
      icon: MODULE.ICON,
      label: instance.label,
      onClick: () => new AppliedBonusesDialog({id, dialog: application}).render(true)
    });
  }
}

/* -------------------------------------------------- */

/** Inject form element on scene region configs. */
function injectRegionConfigElement(config, element) {
  if (!config.isEditable) return;
  const fg = element.querySelector("[name=visibility]").closest(".form-group");
  const div = document.createElement("FIELDSET");
  div.classList.add(MODULE.ID);
  div.innerHTML = `
  <legend>${game.i18n.localize("BUILD_N_ACTION.ModuleTitle")}</legend>
  <button type="button" data-action="buildNActionBuilder">
    <i class="${MODULE.ICON}"></i>
    ${game.i18n.localize("BUILD_N_ACTION.ModuleTitle")}
  </button>
  <p class="hint">${game.i18n.localize("BUILD_N_ACTION.RegionConfigHint")}</p>`;
  div.querySelector("[data-action]").addEventListener("click", () => openBonusWorkshop(config.document));
  fg.after(div);
}

/* -------------------------------------------------- */

export default {
  HeaderButton,
  HeaderButtonDialog,
  injectRegionConfigElement
};
