import {MODULE, SETTINGS} from "../constants.mjs";
import models from "../models/contextual-bonus-model.mjs";
import {
  createBonus,
  duplicateBonus,
  embedBonus,
  findEmbeddedDocumentsWithBonuses,
  fromUuid,
  fromUuidSync,
  getCollection
} from "../services/bonus-repository.mjs";

const SHEET_MAPPINGS = new Map();

/**
 * Resolve a bonus from the current render mapping, falling back to its UUID.
 * The fallback handles partial sheet renders which can outlive the mapping
 * that existed when their DOM listeners were attached.
 *
 * @param {ActorSheet} sheet  Sheet containing the bonus row.
 * @param {string} uuid       Contextual bonus UUID from the row.
 * @returns {ContextualBonus|null}
 */
function _resolveBonus(sheet, uuid) {
  if (!uuid) return null;
  return SHEET_MAPPINGS.get(sheet.document.uuid)?.get(uuid) ?? fromUuidSync(uuid);
}

/**
 * Prepare one bonus row for the character-sheet tab.
 * @param {ActorSheet} sheet
 * @param {ContextualBonus} bonus
 * @param {object} rollData
 * @param {object} sections
 * @param {Set<string>} uuids
 */
async function _prepareBonusRow(sheet, bonus, rollData, sections, uuids) {
  SHEET_MAPPINGS.get(sheet.document.uuid).set(bonus.uuid, bonus);
  uuids.add(bonus.uuid);
  const section = sections[bonus.type] ??= {
    label: `BUILD_N_ACTION.${bonus.type.toUpperCase()}.Label`,
    key: bonus.type,
    bonuses: []
  };
  section.bonuses.push({
    bonus,
    labels: bonus.sheet._prepareLabels().slice(1).filterJoin(" &bull; "),
    tooltip: await foundry.applications.ux.TextEditor.implementation.enrichHTML(bonus.description, {
      rollData,
      relativeTo: bonus.origin
    }),
    isEmbedded: bonus.parent.isEmbedded,
    parentName: bonus.parent.name
  });
}

/**
 * Collect every bonus visible from an actor and its embedded documents.
 * @param {ActorSheet} sheet
 * @returns {Promise<{sections: object, uuids: Set<string>}>}
 */
async function _collectSheetBonuses(sheet) {
  const sections = {};
  const uuids = new Set();
  SHEET_MAPPINGS.set(sheet.document.uuid, new Map());

  const actorRollData = sheet.actor.getRollData();
  for (const bonus of getCollection(sheet.actor)) {
    await _prepareBonusRow(sheet, bonus, actorRollData, sections, uuids);
  }
  for (const item of sheet.actor.items) {
    const itemRollData = item.getRollData();
    for (const bonus of getCollection(item)) {
      await _prepareBonusRow(sheet, bonus, itemRollData, sections, uuids);
    }
    for (const effect of item.effects) {
      for (const bonus of getCollection(effect)) {
        await _prepareBonusRow(sheet, bonus, itemRollData, sections, uuids);
      }
    }
  }
  for (const effect of sheet.actor.effects) {
    for (const bonus of getCollection(effect)) {
      await _prepareBonusRow(sheet, bonus, actorRollData, sections, uuids);
    }
  }
  sections.all = {label: "BUILD_N_ACTION.Bonuses", key: "all", bonuses: []};
  return {sections, uuids};
}

/**
 * Render the tab markup.
 * @param {ActorSheet} sheet
 * @param {object} sections
 * @returns {Promise<HTMLDivElement>}
 */
async function _renderSheetTab(sheet, sections) {
  const template = `modules/${MODULE.ID}/templates/subapplications/character-sheet-tab.hbs`;
  const div = document.createElement("DIV");
  const isActive = sheet.tabGroups.primary === MODULE.ID ? "active" : "";
  const isEdit = sheet.constructor.MODES.EDIT === sheet._mode;
  sheet._filters[MODULE.ID] ??= {name: "", properties: new Set()};
  div.innerHTML = await foundry.applications.handlebars.renderTemplate(template, {
    ICON: MODULE.ICON,
    parentName: sheet.document.name,
    isActive,
    isEdit,
    sections: Object.values(sections).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang))
  });
  return div;
}

/**
 * Synchronize the tab control's bonus indicator and accessible label.
 * @param {HTMLElement} html
 * @param {boolean} hasBonuses
 */
function _configureTabControl(html, hasBonuses) {
  const tabControl = html.querySelector(`nav [data-tab="${MODULE.ID}"]`);
  if (!tabControl) return;
  const tooltip = game.i18n.localize("BUILD_N_ACTION.ModuleTitle");
  tabControl.classList.toggle("has-build-n-action-bonuses", hasBonuses);
  tabControl.dataset.tooltip = tooltip;
  tabControl.setAttribute("aria-label", tooltip);
}

/**
 * Register actions that operate on a rendered bonus row.
 * @param {ActorSheet} sheet
 * @param {HTMLDivElement} div
 */
function _registerBonusActions(sheet, div) {
  div.querySelectorAll("[data-action]").forEach(node => {
    node.addEventListener("click", async event => {
      const target = event.currentTarget;
      const uuid = target.closest("[data-item-uuid]")?.dataset.itemUuid;
      const bonus = _resolveBonus(sheet, uuid);
      if (!bonus) return;
      switch (target.dataset.action) {
        case "toggle":
          return bonus.toggle();
        case "edit":
          return bonus.sheet.render({force: true});
        case "delete":
          return bonus.deleteDialog();
        case "contextMenu":
          event.preventDefault();
          event.stopPropagation();
          return target.dispatchEvent(new PointerEvent("contextmenu", {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY
          }));
        default:
          return;
      }
    });
  });
}

/**
 * Register drag-and-drop behavior for bonus rows and sources.
 * @param {ActorSheet} sheet
 * @param {HTMLDivElement} div
 * @param {Set<string>} uuids
 */
function _registerDragAndDrop(sheet, div, uuids) {
  div.firstElementChild.addEventListener("drop", async event => {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!sheet.isEditable) return;
    const bonus = await fromUuid(data.uuid);
    if (!bonus || uuids.has(bonus.uuid)) return;
    embedBonus(sheet.document, bonus);
  });
  div.querySelectorAll("[data-item-uuid][draggable]").forEach(node => {
    node.addEventListener("dragstart", event => {
      const bonus = _resolveBonus(sheet, event.currentTarget.dataset.itemUuid);
      const dragData = bonus?.toDragData();
      if (!dragData) return;
      event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    });
  });
}

/**
 * Register links back to a bonus source document.
 * @param {HTMLDivElement} div
 */
function _registerSourceActions(div) {
  div.querySelectorAll("[data-action='bonus-source']").forEach(node => {
    node.addEventListener("click", async event => {
      const item = await fromUuid(event.currentTarget.dataset.uuid);
      return item?.sheet.render(true);
    });
  });
}

/**
 * Handle rendering a new tab on the v2 character sheet.
 * @param {ActorSheet} sheet      The rendered sheet.
 * @param {HTMLElement} html      The element of the sheet.
 */
async function _onRenderCharacterSheet2(sheet, html) {
  const {sections, uuids} = await _collectSheetBonuses(sheet);
  const div = await _renderSheetTab(sheet, sections);
  _configureTabControl(html, uuids.size > 0);
  _registerBonusActions(sheet, div);
  _registerDragAndDrop(sheet, div, uuids);
  _registerSourceActions(div);

  const body = html.querySelector(".tab-body");
  if (!body || body.querySelector(`:scope > .tab.${MODULE.ID}`)) return;

  body.appendChild(div.firstElementChild);
  html.querySelectorAll("button.create-child").forEach(button => {
    // Assigning listener to all buttons due to weirdness on npc sheet.
    button.addEventListener("click", _createChildBonus.bind(sheet));
  });

  new dnd5e.applications.ContextMenu5e(html, ".build-n-action-list .item[data-item-uuid]", [], {
    jQuery: false,
    onOpen: _onOpenContextMenu.bind(sheet)
  });
}

/* -------------------------------------------------- */

/**
 * Populate the context menu options.
 * @this {ActorSheet}
 * @param {HTMLElement} element     The targeted element.
 */
function _onOpenContextMenu(element) {
  const bonus = _resolveBonus(this, element.dataset.itemUuid);
  if (!bonus) {
    ui.context.menuItems = [];
    return;
  }
  ui.context.menuItems = [{
    name: "BUILD_N_ACTION.ContextMenu.Edit",
    icon: "<i class='fa-solid fa-edit'></i>",
    callback: () => bonus.sheet.render({force: true})
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Duplicate",
    icon: "<i class='fa-solid fa-copy'></i>",
    callback: () => duplicateBonus(bonus)
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Delete",
    icon: "<i class='fa-solid fa-trash'></i>",
    callback: () => bonus.deleteDialog()
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Enable",
    icon: "<i class='fa-solid fa-toggle-on'></i>",
    condition: () => !bonus.enabled,
    callback: () => bonus.toggle(),
    group: "instance"
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Disable",
    icon: "<i class='fa-solid fa-toggle-off'></i>",
    condition: () => bonus.enabled,
    callback: () => bonus.toggle(),
    group: "instance"
  }];
}

/* -------------------------------------------------- */

/**
 * Utility method that creates a popup dialog for a new bonus.
 * @this {ActorSheet}
 * @returns {Promise}
 */
async function _createChildBonus() {
  if (!this.isEditable || (this.tabGroups.primary !== MODULE.ID)) return;
  const template = "systems/dnd5e/templates/apps/document-create.hbs";
  const data = {
    folders: [],
    folder: null,
    hasFolders: false,
    type: Object.keys(models)[0],
    types: Object.keys(models).reduce((acc, type) => {
      const label = game.i18n.localize(`BUILD_N_ACTION.${type.toUpperCase()}.Label`);
      acc.push({
        type: type,
        label: label,
        icon: models[type].metadata.defaultImg
      });
      return acc;
    }, []).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang))
  };
  const title = game.i18n.localize("BUILD_N_ACTION.Create");
  return foundry.applications.api.DialogV2.prompt({
    content: await foundry.applications.handlebars.renderTemplate(template, data),
    window: {title},
    position: {width: 350},
    classes: ["dnd5e2", "create-document", "dialog", MODULE.ID],
    ok: {
      label: title,
      callback: async (event, button) => {
        const form = button.form.querySelector("form") ?? button.form;
        const formData = new FormDataExtended(form).object;
        if (!formData.name?.trim()) delete formData.name;
        const bonus = createBonus(formData, this.document);
        return embedBonus(this.document, bonus);
      }
    },
    rejectClose: false,
    modal: true
  });
}

/* -------------------------------------------------- */

/**
 * Add a new tab to the v2 character sheet.
 */
function _addCharacterTab() {
  const classes = [
    dnd5e.applications.actor.CharacterActorSheet,
    dnd5e.applications.actor.NPCActorSheet
  ];
  for (const cls of classes) {
    cls.TABS.push({
      tab: MODULE.ID, label: MODULE.NAME, icon: MODULE.ICON
    });
    const fn = cls.prototype._filterChildren;
    class sheet extends cls {
      /** @override */
      _filterChildren(collection, filters) {
        if (collection !== MODULE.ID) return fn.call(this, collection, filters);

        const embedded = findEmbeddedDocumentsWithBonuses(this.document);

        const actor = getCollection(this.document).contents;
        const items = embedded.items?.flatMap(item => getCollection(item).contents) ?? [];
        const effects = embedded.effects?.flatMap(effect => getCollection(effect).contents) ?? [];
        return actor.concat(items).concat(effects);
      }
    }
    cls.prototype._filterChildren = sheet.prototype._filterChildren;
  }
}

/* -------------------------------------------------- */

/** Initialize this part of the module. */
export default function characterSheetTabSetup() {
  if (!game.settings.get(MODULE.ID, SETTINGS.SHEET_TAB)) return;
  if (!game.user.isGM && !game.settings.get(MODULE.ID, SETTINGS.PLAYERS)) return;
  _addCharacterTab();
  Hooks.on("renderCharacterActorSheet", _onRenderCharacterSheet2);
  Hooks.on("renderNPCActorSheet", _onRenderCharacterSheet2);
}
