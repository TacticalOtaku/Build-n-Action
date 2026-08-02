import {MODULE} from "../constants.mjs";
import registry from "../registry.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export default class AppliedBonusesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({id: registryId, dialog, ...options}) {
    super({...options, registryId, uniqueId: `${dialog.id}-bonuses-overview`});
    this.dialog = dialog;
  }

  /* -------------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("BUILD_N_ACTION.OverviewTitle");
  }

  /* -------------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "overview"],
    window: {
      icon: MODULE.ICON,
      resizable: false
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      close: this.#onCloseDialog,
      copyUuid: this.#onClickUuid
    },
    registryId: null
  };

  /* -------------------------------------------------- */

  /** @override */
  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/subapplications/applied-bonuses-dialog.hbs`
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  async _prepareContext() {
    return {bonuses: registry.get(this.options.registryId)?.bonuses ?? []};
  }

  /* -------------------------------------------------- */

  /** Copy a source document UUID. */
  static async #onClickUuid(event, target) {
    await game.clipboard.copyPlainText(target.dataset.uuid);
    ui.notifications.info("BUILD_N_ACTION.OverviewCopied", {localize: true});
  }

  /* -------------------------------------------------- */

  /** Close the overview. */
  static #onCloseDialog() {
    return this.close();
  }
}
