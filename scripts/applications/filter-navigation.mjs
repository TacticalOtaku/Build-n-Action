/**
 * Scroll one filter card into view inside the filter picker.
 * Using the picker's own scroll offset avoids scrollIntoView selecting an outer
 * ApplicationV2 scroll container when the filter tab has two scrollable columns.
 *
 * @param {HTMLElement|null} tab     Filter tab root.
 * @param {string} id                Filter identifier.
 * @param {object} [options]
 * @param {ScrollBehavior} [options.behavior="smooth"]
 * @returns {boolean}                Whether a matching filter was found.
 */
export function scrollFilterIntoView(tab, id, {behavior = "smooth"} = {}) {
  const picker = tab?.querySelector?.(".picker");
  if (!picker || !id) return false;

  const filters = Array.from(picker.querySelectorAll(".filter[data-id]"));
  const element = filters.find(filter => filter.dataset.id === id);
  if (!element) return false;

  const pickerTop = picker.getBoundingClientRect().top;
  const elementTop = element.getBoundingClientRect().top;
  const top = Math.max(0, picker.scrollTop + elementTop - pickerTop);

  if (typeof picker.scrollTo === "function") picker.scrollTo({top, behavior});
  else picker.scrollTop = top;

  for (const entry of tab.querySelectorAll(".toc [data-id]")) {
    entry.classList.toggle("viewed", entry.dataset.id === id);
  }
  return true;
}
