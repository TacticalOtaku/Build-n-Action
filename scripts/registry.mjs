/**
 * Utility extension of Map to keep track of rolls and bonuses that apply to them.
 *
 * An entry is created for every roll that has applicable bonuses, but there is no
 * single point at which it becomes obsolete: a fast-forwarded roll never opens a
 * dialog, and a dialog can be dismissed without notice. Entries therefore expire by
 * age -- only the most recent rolls can still have a dialog or an overview open.
 */
class RollRegistry extends Map {
  /**
   * How many roll configurations to retain. Older entries are evicted on registration.
   * @type {number}
   */
  static MAX_ENTRIES = 20;

  /* -------------------------------------------------- */

  /**
   * Register an object of data with a generated id.
   * @param {object} config     The data to store.
   * @returns {string}          Randomly generated id to later retrieve the stored data.
   */
  register(config) {
    const id = foundry.utils.randomID();
    this.set(id, config);
    this.#evictOldest();
    return id;
  }

  /* -------------------------------------------------- */

  /**
   * Drop the least recently registered entries once the cap is exceeded. A Map
   * iterates in insertion order, so the first key is always the oldest.
   */
  #evictOldest() {
    while (this.size > this.constructor.MAX_ENTRIES) {
      const [oldest] = this.keys();
      this.delete(oldest);
    }
  }
}

/* -------------------------------------------------- */

/**
 * The registry of rolls being made.
 * @type {RollRegistry<string, object>}
 */
export default new RollRegistry();
