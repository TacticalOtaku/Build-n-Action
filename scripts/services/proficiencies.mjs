let proficiencyTrees = {};

/** @param {object} trees */
export function setProficiencyTrees(trees) {
  proficiencyTrees = trees;
}

/** @returns {object} */
export function getProficiencyTrees() {
  return proficiencyTrees;
}

/**
 * Does this actor speak a given language?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
export function speaksLanguage(actor, trait) {
  return hasTrait(actor, trait, "languages");
}

/**
 * Does this actor have a given weapon proficiency?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
export function hasWeaponProficiency(actor, trait) {
  return hasTrait(actor, trait, "weapon");
}

/**
 * Does this actor have a given armor proficiency?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
export function hasArmorProficiency(actor, trait) {
  return hasTrait(actor, trait, "armor");
}

/**
 * Does this actor have a given tool proficiency?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
export function hasToolProficiency(actor, trait) {
  return hasTrait(actor, trait, "tool");
}

/**
 * Retrieve a path through nested proficiencies.
 *
 * @param {string} key
 * @param {string} category
 * @returns {string[]}
 */
export function proficiencyTree(key, category) {
  const root = proficiencyTrees[category];
  if (!root) return [];

  const find = (node) => {
    for (const [nodeKey, value] of Object.entries(node)) {
      if (nodeKey === key) return [nodeKey];
      if (!value.children) continue;
      const childPath = find(value.children);
      if (childPath.length) return [nodeKey, ...childPath];
    }
    return [];
  };

  return find(root);
}

function hasTrait(actor, trait, category) {
  const path = CONFIG.DND5E.traits[category].actorKeyPath ?? `system.traits.${category}`;
  const set = foundry.utils.getProperty(actor, path)?.value ?? new Set();
  if (set.has(trait)) return true;
  return set.some(value => {
    const [key, node] = proficiencyTrees[category]?.find(value) ?? [];
    return (key === trait) || (node?.children && node.children.find(trait));
  });
}
