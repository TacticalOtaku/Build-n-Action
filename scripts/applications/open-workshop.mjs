import {isEmbeddableDocument} from "../services/bonus-repository.mjs";
import BonusWorkshop from "./bonus-workshop.mjs";

/**
 * Render the bonus workshop for a supported document.
 *
 * @param {Document} document
 * @returns {BonusWorkshop}
 */
export function openBonusWorkshop(document) {
  if (!isEmbeddableDocument(document)) {
    throw new Error("The document provided is not a valid document type for Build-n-Action!");
  }
  return new BonusWorkshop(document).render(true);
}
