import {MODULE} from "../constants.mjs";
import {fromUuid} from "../services/bonus-repository.mjs";

/**
 * Register enrichers.
 */
export default function enricherSetup() {
  CONFIG.TextEditor.enrichers.push({
    pattern: /@BNA\[(?<uuid>[^\]]+)\]/g,
    enricher: enrichContextualBonus
  });
}

/* -------------------------------------------------- */

/**
 * Enrich a content link.
 * @param {object} config     Configuration for the enrichment.
 * @returns {HTMLElement}     The created element.
 */
async function enrichContextualBonus(config) {
  const uuid = config.groups.uuid;
  const bonus = await fromUuid(uuid);
  if (!bonus) return;
  const anchor = document.createElement("A");
  anchor.dataset.uuid = uuid;
  anchor.dataset.link = "";
  anchor.classList.add(MODULE.ID, "content-link");
  if (bonus.enabled) anchor.classList.add("enabled");
  anchor.innerHTML = `<i class="${MODULE.ICON}"></i>${bonus.name}`;
  anchor.addEventListener("click", () => bonus.toggle());
  return anchor;
}

/* -------------------------------------------------- */

/**
 * Add a click event listener to content links.
 */
document.addEventListener("click", async (event) => {
  const target = event.target.closest(`a.${MODULE.ID}.content-link`);
  if (!target) return;
  if (event.detail > 1) event.preventDefault();
  const bonus = await fromUuid(target.dataset.uuid);
  await bonus?.toggle();
});
