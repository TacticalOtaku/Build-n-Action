import {openBonusWorkshop} from "./applications/open-workshop.mjs";
import {MODULE} from "./constants.mjs";
import {
  createBonus,
  duplicateBonus,
  embedBonus,
  findEmbeddedDocumentsWithBonuses,
  fromUuid,
  fromUuidSync,
  getCollection
} from "./services/bonus-repository.mjs";
import {
  hasArmorProficiency,
  hasToolProficiency,
  hasWeaponProficiency,
  proficiencyTree,
  speaksLanguage
} from "./services/proficiencies.mjs";

export default {
  applyMarkers,
  createBonus,
  duplicateBonus,
  embedBonus,
  findEmbeddedDocumentsWithBonuses,
  fromUuid,
  fromUuidSync,
  getCollection,
  hasArmorProficiency,
  hasToolProficiency,
  hasWeaponProficiency,
  hotbarToggle,
  openBonusWorkshop,
  proficiencyTree,
  speaksLanguage
};

/**
 * Apply markers to a document for the Markers filter.
 *
 * @param {Document} document
 * @returns {Promise<Document|null>}
 */
async function applyMarkers(document) {
  const {SetField, StringField} = foundry.data.fields;
  const field = new SetField(new StringField());
  const value = document.getFlag(MODULE.ID, "markers") ?? [];
  const html = field.toFormGroup({
    label: "BUILD_N_ACTION.MarkersDialog.field.label",
    hint: "BUILD_N_ACTION.MarkersDialog.field.hint",
    localize: true
  }, {value, name: "markers", slug: true}).outerHTML;

  return foundry.applications.api.DialogV2.prompt({
    rejectClose: false,
    content: `<fieldset>${html}</fieldset>`,
    window: {
      icon: "fa-solid fa-tags",
      title: game.i18n.format("BUILD_N_ACTION.MarkersDialog.title", {name: document.name})
    },
    position: {width: 400},
    ok: {
      callback: async (event, button) => {
        const markers = Array.from(button.form.elements.markers.value);
        await document.setFlag(MODULE.ID, "markers", markers);
        return document;
      }
    }
  });
}

/**
 * Toggle a contextual bonus from a hotbar macro.
 *
 * @param {string} uuid
 * @returns {Promise<ContextualBonus|undefined>}
 */
async function hotbarToggle(uuid) {
  const bonus = await fromUuid(uuid);
  if (!bonus) {
    ui.notifications.warn("BUILD_N_ACTION.BonusNotFound", {localize: true});
    return;
  }
  return bonus.toggle();
}
