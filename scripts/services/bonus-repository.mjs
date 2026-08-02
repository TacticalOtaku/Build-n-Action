import {MODULE} from "../constants.mjs";
import fields from "../fields/_module.mjs";
import models from "../models/contextual-bonus-model.mjs";
import {getStoredBonusData} from "./bonus-storage.mjs";

const EMBEDDABLE_DOCUMENT_TYPES = new Set(["Actor", "Item", "ActiveEffect", "Region"]);

/** @param {Document|object|null} document */
export function isEmbeddableDocument(document) {
  return EMBEDDABLE_DOCUMENT_TYPES.has(document?.documentName);
}

/**
 * Create a contextual bonus in memory.
 *
 * @param {object} data
 * @param {Document|null} [parent]
 * @returns {ContextualBonus}
 */
export function createBonus(data, parent = null) {
  if (!data || !(data.type in models)) throw new Error("INVALID BUILD_N_ACTION TYPE.");
  const source = {...data, id: foundry.utils.randomID()};
  return new models[source.type](source, {parent});
}

/**
 * Construct the collection of bonuses stored on a document.
 *
 * @param {Document} document
 * @returns {Collection<ContextualBonus>}
 */
export function getCollection(document) {
  const contents = [];
  for (const bonusData of getStoredBonusData(document)) {
    try {
      if (!foundry.data.validators.isValidId(bonusData.id)) continue;
      const BonusModel = models[bonusData.type];
      if (!BonusModel) continue;
      const bonus = new BonusModel(bonusData, {parent: document});
      contents.push([bonus.id, bonus]);
    } catch (error) {
      console.warn(error);
    }
  }
  return new foundry.utils.Collection(contents);
}

/**
 * Return embedded documents that contain contextual bonuses.
 *
 * @param {Document} document
 * @returns {object}
 */
export function findEmbeddedDocumentsWithBonuses(document) {
  const documents = {};
  for (const [, embedded] of document.traverseEmbeddedDocuments()) {
    const collection = embedded.constructor.metadata.collection;
    documents[collection] ??= [];
    if (getCollection(embedded).size) documents[collection].push(embedded);
  }
  return documents;
}

/**
 * Persist a contextual bonus on a document.
 *
 * @param {Document} document
 * @param {ContextualBonus} bonus
 * @param {object} [options]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Document|string|null>}
 */
export async function embedBonus(document, bonus, {renderSheet = true, ...options} = {}) {
  if (!isEmbeddableDocument(document)) {
    throw new Error("The document provided is not a valid document type for Build-n-Action!");
  }
  if (!Object.values(models).some(Model => bonus instanceof Model)) return null;

  const id = await persistBonus(document, bonus);
  if (renderSheet) await getCollection(document).get(id).sheet.render({force: true});
  return options.bonusId ? id : document;
}

/**
 * Duplicate an embedded contextual bonus.
 *
 * @param {ContextualBonus} bonus
 * @returns {Promise<ContextualBonus>}
 */
export async function duplicateBonus(bonus) {
  const data = bonus.toObject();
  data.name = game.i18n.format("BUILD_N_ACTION.BonusCopy", {name: data.name});
  const duplicate = new bonus.constructor(data, {parent: bonus.parent});
  const id = await embedBonus(bonus.parent, duplicate, {bonusId: true});
  return getCollection(bonus.parent).get(id);
}

/** @param {string} uuid */
export async function fromUuid(uuid) {
  try {
    const {parentUuid, id} = splitUuid(uuid);
    const parent = await globalThis.fromUuid(parentUuid);
    return getCollection(parent).get(id) ?? null;
  } catch {
    return null;
  }
}

/** @param {string} uuid */
export function fromUuidSync(uuid) {
  try {
    const {parentUuid, id} = splitUuid(uuid);
    const parent = globalThis.fromUuidSync(parentUuid);
    return getCollection(parent).get(id) ?? null;
  } catch {
    return null;
  }
}

async function persistBonus(document, bonus) {
  const data = bonus.toObject();
  for (const id of Object.keys(data.filters)) {
    if (!fields[id].storage(bonus)) delete data.filters[id];
  }
  data.id = foundry.utils.randomID();

  const collection = getCollection(document);
  collection.delete(data.id);
  const stored = collection.map(entry => entry.toObject());
  stored.push(data);
  await document.setFlag(MODULE.ID, "bonuses", stored);
  return data.id;
}

function splitUuid(uuid) {
  const parts = uuid.split(".");
  const id = parts.pop();
  parts.pop();
  return {parentUuid: parts.join("."), id};
}
