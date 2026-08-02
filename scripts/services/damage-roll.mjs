/**
 * Apply immediate additive and critical damage bonuses.
 *
 * @param {object} config
 * @param {BonusCollection} bonuses
 * @param {Function} [simplifyBonus]
 */
export function applyImmediateDamageBonuses(
  config,
  bonuses,
  simplifyBonus = dnd5e.utils.simplifyBonus
) {
  const critical = config.critical ??= {};
  critical.bonusDice ??= 0;
  critical.bonusDamage ??= "";

  for (const bonus of bonuses.nonoptional) {
    const rollData = config.rolls[0].data;
    if (bonus.hasPropertyBonuses) {
      critical.bonusDice += simplifyBonus(bonus.bonuses.criticalBonusDice, rollData);
      critical.bonusDamage = joinFormula(critical.bonusDamage, bonus.bonuses.criticalBonusDamage);
    }
    if (bonus.hasAdditiveBonus) appendDamagePart(config, bonus, rollData);
  }
}

/**
 * Apply dice modifiers and retain modifiers that can affect later optional bonuses.
 *
 * @param {object} config
 * @param {BonusCollection} bonuses
 * @param {Collection} modifiers
 */
export function applyDamageDiceModifiers(config, bonuses, modifiers) {
  for (const bonus of bonuses.nonoptional) {
    if (!bonus.hasDiceModifiers) continue;
    applyModifierToRolls(config, bonus);
    applyModifierToCritical(config, bonus);
    if (!bonus._halted) modifiers.set(bonus.uuid, bonus);
  }
}

/**
 * Clamp and validate accumulated critical bonuses.
 *
 * @param {object} config
 * @param {Function} [validateFormula]
 */
export function sanitizeCriticalBonuses(config, validateFormula = Roll.validate) {
  const critical = config.critical ??= {};
  critical.bonusDice = Math.max(0, critical.bonusDice ?? 0);
  if (critical.bonusDamage && !validateFormula(critical.bonusDamage)) {
    console.warn("Critical bonus damage resulted in invalid formula:", critical.bonusDamage);
    critical.bonusDamage = "";
  }
}

function appendDamagePart(config, bonus, rollData) {
  const roll = config.rolls.find(candidate => {
    if (!bonus.hasDamageType) return true;
    if (bonus.bonuses.damageType.size > 1) return false;
    return candidate.options.types.includes(bonus.bonuses.damageType.first());
  });

  if (roll) {
    roll.parts.push(bonus.bonuses.bonus);
    return;
  }

  config.rolls.push({
    data: rollData,
    parts: [bonus.bonuses.bonus],
    options: {
      properties: [...config.rolls[0].options.properties ?? []],
      type: bonus.bonuses.damageType.first(),
      types: Array.from(bonus.bonuses.damageType)
    }
  });
}

function applyModifierToRolls(config, bonus) {
  for (const {parts, data, options} of config.rolls) {
    if (bonus._halted) break;
    bonus._halted = bonus.bonuses.modifiers.modifyParts(parts, data) || false;

    if (!bonus._halted && options.critical?.bonusDamage) {
      const criticalParts = [options.critical.bonusDamage];
      bonus._halted = bonus.bonuses.modifiers.modifyParts(criticalParts, bonus.getRollData()) || false;
      options.critical.bonusDamage = criticalParts[0];
    }
  }
}

function applyModifierToCritical(config, bonus) {
  if (bonus._halted || !config.critical?.bonusDamage) return;
  const parts = [config.critical.bonusDamage];
  bonus._halted = bonus.bonuses.modifiers.modifyParts(parts, bonus.getRollData()) || false;
  config.critical.bonusDamage = parts[0];
}

function joinFormula(current, addition) {
  if (!addition) return current;
  return current ? `${current} + ${addition}` : addition;
}
