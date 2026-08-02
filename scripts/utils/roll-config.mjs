/**
 * Append an additive part to every roll in a dnd5e BasicRoll process configuration.
 * @param {object} config  The process configuration to mutate.
 * @param {string} part    The formula part to append.
 */
export function appendRollPart(config, part) {
  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    roll.parts ??= [];
    roll.parts.push(part);
  }
}

/**
 * Add target roll data to every data container used by a dnd5e roll process.
 *
 * dnd5e 5.3 may defer creating an individual roll's data object until after
 * the pre-roll hooks have run. Creating the container here is safe because
 * the system's buildConfig step merges its final roll data into that object.
 *
 * @param {object} config      The process configuration to mutate.
 * @param {object} targetData  Roll data for the targeted actor.
 */
export function injectTargetData(config, targetData) {
  _removeLegacySenseAccessors(targetData);
  if (config.data && (typeof config.data === "object")) config.data.target = targetData;

  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    roll.data ??= {};
    roll.data.target = targetData;
  }
}

/**
 * Remove dnd5e 5.3 compatibility getters from ephemeral target roll data.
 * Reading those getters emits a deprecation warning when the roll dialog is
 * deep-cloned. The current values remain available under senses.ranges.
 *
 * @param {object} targetData  Target actor roll data to sanitize.
 */
function _removeLegacySenseAccessors(targetData, visited = new WeakSet()) {
  if (!targetData || (typeof targetData !== "object") || visited.has(targetData)) return;

  const prototype = Object.getPrototypeOf(targetData);
  if (!Array.isArray(targetData) && (prototype !== Object.prototype) && (prototype !== null)) return;
  visited.add(targetData);

  const descriptors = Object.getOwnPropertyDescriptors(targetData);
  const isSensesData = Object.hasOwn(descriptors, "ranges") && Object.hasOwn(descriptors.ranges, "value");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Object.hasOwn(descriptor, "value")) {
      _removeLegacySenseAccessors(descriptor.value, visited);
    } else if (isSensesData && descriptor.configurable) {
      delete targetData[key];
    }
  }
}

/**
 * Adjust critical success and failure thresholds on every configured roll.
 * @param {object} config              The process configuration to mutate.
 * @param {number} criticalSuccess     Amount by which to expand the critical success range.
 * @param {number} criticalFailure     Amount by which to expand the critical failure range.
 * @param {boolean} allowFailureBelowOne  Whether a failure threshold below one is allowed.
 */
export function adjustCriticalRanges(config, criticalSuccess, criticalFailure, allowFailureBelowOne = false) {
  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    const options = roll.options ??= {};
    options.criticalSuccess = Math.max(1, (options.criticalSuccess ?? 20) - criticalSuccess);
    options.criticalFailure = (options.criticalFailure ?? 1) + criticalFailure;
    if ((options.criticalFailure < 1) && !allowFailureBelowOne) options.criticalFailure = 1;
  }
}

/**
 * Adjust a saving throw target and, for death saves, its critical success threshold.
 * @param {object} config          The process configuration to mutate.
 * @param {number} targetBonus     Amount by which to reduce the target.
 * @param {number} criticalBonus   Amount by which to expand the death-save critical range.
 * @param {boolean} isDeath        Whether this is a death save.
 */
export function adjustSavingThrowRanges(config, targetBonus, criticalBonus, isDeath) {
  if (Number.isFinite(Number(config.target))) config.target = Number(config.target) - targetBonus;
  if (!isDeath) return;

  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    const options = roll.options ??= {};
    options.criticalSuccess = Math.max(1, (options.criticalSuccess ?? 20) - criticalBonus);
    if (Number.isFinite(Number(config.target))) {
      config.target = Math.min(options.criticalSuccess, config.target);
    }
  }
}
