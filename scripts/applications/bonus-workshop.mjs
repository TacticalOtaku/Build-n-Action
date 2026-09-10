import {MODULE} from "../constants.mjs";
import models from "../models/contextual-bonus-model.mjs";
import {
  duplicateBonus,
  embedBonus,
  fromUuid,
  getCollection
} from "../services/bonus-repository.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export default class BonusWorkshop extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(object, options = {}) {
    const uniqueId = `${MODULE.ID}-${object.uuid.replaceAll(".", "-")}`;
    super({...options, uniqueId});
    this.object = object;
    this.isItem = object.documentName === "Item";
    this.isEffect = object.documentName === "ActiveEffect";
    this.isActor = object.documentName === "Actor";
    this._documentAppId = uniqueId;
  }

  /* -------------------------------------------------- */

  /**
   * The right-hand side bonuses that have a collapsed description.
   * @type {Set<string>}
   */
  #collapsedBonuses = new Set();

  /* -------------------------------------------------- */

  /**
   * A reference to the owner of the bonuses.
   * @type {Actor5e|Item5e|ActiveEffect5e|RegionDocument}
   */
  get document() {
    return this.object;
  }

  /* -------------------------------------------------- */

  /** @override */
  get isEditable() {
    return !!this.document.sheet?.isEditable;
  }

  /* -------------------------------------------------- */

  /** @override */
  get title() {
    return `${MODULE.NAME}: ${this.document.name}`;
  }

  /* -------------------------------------------------- */

  /**
   * A reference to the collection of bonuses on this document.
   * @type {Collection<ContextualBonus>}
   */
  get collection() {
    return getCollection(this.document);
  }

  /* -------------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "builder", "dnd5e2"],
    window: {
      icon: MODULE.ICON,
      resizable: true
    },
    position: {
      width: 820,
      height: 720
    },
    actions: {
      "pick-type": this.#onClickType,
      "current-collapse": this.#onCollapseBonus,
      "current-toggle": this.#onToggleBonus,
      "current-copy": this.#onCopyBonus,
      "current-edit": this.#onClickBonus,
      "current-delete": this.#onDeleteBonus,
      "current-id": {handler: this.#onClickId, buttons: [0, 2]}
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/bonus-workshop.hbs`,
      scrollable: [".current-bonuses .bonuses"]
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const data = {
      isItem: this.isItem,
      isEffect: this.isEffect,
      isActor: this.isActor,
      parentName: this.document.name,
      currentBonuses: []
    };

    for (const bonus of this.collection) {
      data.currentBonuses.push({
        bonus,
        context: {
          collapsed: this.#collapsedBonuses.has(bonus.id),
          description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(bonus.description, {
            rollData: bonus.getRollData(), relativeTo: bonus.origin
          }),
          icon: bonus.icon,
          typeTooltip: `BUILD_N_ACTION.${bonus.type.toUpperCase()}.Label`
        }
      });
    }
    data.currentBonuses.sort((a, b) => a.bonus.name.localeCompare(b.bonus.name));

    data.createButtons = Object.entries(models).map(([type, cls]) => ({
      type, icon: cls.metadata.icon, label: `BUILD_N_ACTION.${type.toUpperCase()}.Label`
    }));
    data.ICON = MODULE.ICON;
    return data;
  }

  /* -------------------------------------------------- */

  /** @override */
  _onRender(...args) {
    super._onRender(...args);
    this.#updateResponsiveLayout(this.position.width);

    const content = this.element;
    if (!this.isEditable) {
      content.querySelectorAll(".select-type, .current-bonuses .functions").forEach(element => {
        element.style.pointerEvents = "none";
        element.classList.add("locked");
      });
      return;
    }

    content.querySelectorAll("[data-action='current-collapse']").forEach(element => {
      element.draggable = true;
      element.addEventListener("dragstart", this.#onDragStart.bind(this));
    });

    const dropZone = content.querySelector(".current-bonuses .bonuses");
    dropZone?.addEventListener("dragover", event => event.preventDefault());
    dropZone?.addEventListener("drop", this.#onDrop.bind(this));
  }

  /* -------------------------------------------------- */

  /** @override */
  _onPosition(position) {
    super._onPosition(position);
    this.#updateResponsiveLayout(position.width);
  }

  /* -------------------------------------------------- */

  /** Keep the type selector usable at narrow window sizes. */
  #updateResponsiveLayout(width) {
    const selector = this.element?.querySelector(".pages .select-type");
    selector?.classList.toggle("bna-compact", Number.parseInt(width) < 680);
  }

  /* -------------------------------------------------- */

  /** @override */
  render(...args) {
    this.document.apps[this._documentAppId] = this;
    return super.render(...args);
  }

  /* -------------------------------------------------- */

  /** @override */
  _onClose(options) {
    delete this.document.apps[this._documentAppId];
    return super._onClose(options);
  }

  /* -------------------------------------------------- */

  /** Start dragging a contextual bonus. */
  #onDragStart(event) {
    const label = event.currentTarget.closest(".bonus");
    const bonus = this.collection.get(label?.dataset.id);
    const dragData = bonus?.toDragData();
    if (dragData) event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------------- */

  /** Copy a dropped contextual bonus to this document. */
  async #onDrop(event) {
    event.preventDefault();
    if (!this.isEditable) return;

    let data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data.uuid || (data.type !== "ContextualBonus")) return;

    let bonus = await fromUuid(data.uuid);
    if (!bonus || (bonus.parent === this.document)) return;

    data = bonus.toObject();
    data.id = foundry.utils.randomID();
    bonus = new models[data.type](data, {parent: this.document});
    await embedBonus(this.document, bonus);
  }

  /* -------------------------------------------------- */

  /** Handle creating a new bonus. */
  static async #onClickType(event, target) {
    if (!this.isEditable) return;
    const type = target.dataset.type;
    const bonus = new models[type]({}, {parent: this.document});
    return embedBonus(this.document, bonus);
  }

  /* -------------------------------------------------- */

  /** Render the sheet of an existing bonus. */
  static #onClickBonus(event, target) {
    if (!this.isEditable) return;
    const bonus = this.collection.get(target.closest(".bonus").dataset.id);
    return bonus.sheet.render({force: true});
  }

  /* -------------------------------------------------- */

  /** Collapse or expand a bonus description. */
  static #onCollapseBonus(event, target) {
    const bonus = target.closest(".bonus");
    const id = bonus.dataset.id;
    const isCollapsed = this.#collapsedBonuses.has(id);
    bonus.classList.toggle("collapsed", !isCollapsed);
    if (isCollapsed) this.#collapsedBonuses.delete(id);
    else this.#collapsedBonuses.add(id);
  }

  /* -------------------------------------------------- */

  /** Copy the id or uuid of a bonus. */
  static async #onClickId(event, target) {
    event.preventDefault();
    const bonus = this.collection.get(target.closest(".bonus").dataset.id);
    const isId = event.button === 2;
    const id = isId ? bonus.id : bonus.uuid;
    await game.clipboard.copyPlainText(id);
    ui.notifications.info(game.i18n.format("DOCUMENT.IdCopiedClipboard", {
      id, label: "ContextualBonus", type: isId ? "id" : "uuid"
    }));
  }

  /* -------------------------------------------------- */

  /** Delete a bonus. */
  static #onDeleteBonus(event, target) {
    if (!this.isEditable) return;
    return this.collection.get(target.closest(".bonus").dataset.id).deleteDialog();
  }

  /* -------------------------------------------------- */

  /** Toggle a bonus. */
  static #onToggleBonus(event, target) {
    if (!this.isEditable) return;
    return this.collection.get(target.closest(".bonus").dataset.id).toggle();
  }

  /* -------------------------------------------------- */

  /** Duplicate a bonus. */
  static #onCopyBonus(event, target) {
    if (!this.isEditable) return;
    const bonus = this.collection.get(target.closest(".bonus").dataset.id);
    return duplicateBonus(bonus);
  }
}
