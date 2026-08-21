import {MODULE, SETTINGS} from "./constants.mjs";
import * as filterings from "./services/filterings.mjs";
import {getCollection} from "./services/bonus-repository.mjs";
import {
  applyDamageDiceModifiers,
  applyImmediateDamageBonuses,
  sanitizeCriticalBonuses
} from "./services/damage-roll.mjs";
import registry from "./registry.mjs";
import {resolveRollTarget} from "./services/roll-target.mjs";
import {
  adjustCriticalRanges,
  adjustSavingThrowRanges,
  appendRollPart,
  injectTargetData
} from "./utils/roll-config.mjs";

/**
 * @typedef {object} SavingThrowDetails
 * @property {string} [ability]               The ability used for the saving throw.
 * @property {boolean} [isConcentration]      Whether this saving throw is to maintain concentration.
 * @property {boolean} [isDeath]              Whether this is a death saving throw.
 */

/* -------------------------------------------------- */
/*   Mutators                                         */
/* -------------------------------------------------- */

/**
 * When you force a saving throw...
 * @param {Activity} activity                           Activity being used.
 * @param {ActivityUseConfiguration} usageConfig        Configuration info for the activation.
 * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the created chat message.
 * @param {ActivityUsageUpdates} updates                Applied usage updates.
 */
function postActivityConsumption(activity, usageConfig, messageConfig, updates) {
  if (activity.type !== "save") return;

  const subjects = {
    activity: activity,
    item: activity.item,
    actor: activity.item.actor,
    target: resolveRollTarget(usageConfig)
  };

  const rollData = activity.getRollData({deterministic: true});

  // Get bonuses:
  const bonuses = filterings.itemCheck(subjects, "save", {spellLevel: rollData.item.level});
  if (!bonuses.size) return;

  _addTargetData({data: rollData}, subjects.target, true);
  const totalBonus = bonuses.all.reduce((acc, bonus) => {
    return acc + dnd5e.utils.simplifyBonus(bonus.bonuses.bonus, rollData);
  }, 0);

  activity.save.dc.value += totalBonus;
}

/* -------------------------------------------------- */

/**
 * When you make an attack roll...
 * @param {AttackRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog    Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration data for the roll's message.
 */
function preRollAttack(config, dialog, message) {
  const item = config.subject?.item;
  if (!item) return;

  const subjects = {
    activity: config.subject,
    item: item,
    actor: item.actor,
    target: resolveRollTarget(config)
  };
  // get bonuses:
  const rollData = config.subject.getRollData();
  const spellLevel = rollData.item.level;
  const bonuses = filterings.itemCheck(subjects, "attack", {spellLevel});
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  // Gather up all bonuses.
  const mods = {criticalSuccess: 0, criticalFailure: 0};
  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
    if (bonus.hasPropertyBonuses) {
      mods.criticalSuccess += dnd5e.utils.simplifyBonus(bonus.bonuses.criticalRange, rollData);
      mods.criticalFailure += dnd5e.utils.simplifyBonus(bonus.bonuses.fumbleRange, rollData);
    }
  }

  const id = registry.register({
    ...subjects,
    bonuses: bonuses,
    // Attack rolls do not yet preserve dice modifiers for later optional bonuses.
    modifiers: new foundry.utils.Collection(),
    spellLevel: spellLevel,
    configurations: {config, dialog, message}
  });

  // Add parts.
  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  adjustCriticalRanges(config, mods.criticalSuccess, mods.criticalFailure,
    game.settings.get(MODULE.ID, SETTINGS.FUMBLE));
}

/* -------------------------------------------------- */

/**
 * When you make a damage roll...
 * @param {DamageRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog    Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration data for the roll's message.
 */
function preRollDamage(config, dialog, message) {
  const item = config.subject?.item;
  if (!item) return;

  // get bonus:
  const spellLevel = config.subject.getRollData().item.level;
  const attackMode = config.attackMode ?? null;

  const subjects = {
    activity: config.subject,
    item: item,
    actor: item.actor,
    target: resolveRollTarget(config, {preferHitTargets: true})
  };
  const bonuses = filterings.itemCheck(subjects, "damage", {spellLevel, attackMode});
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  // Used in the optional selector to determine which bonuses have and still should apply dice modifications.
  const modifiers = new foundry.utils.Collection();

  const id = registry.register({
    ...subjects,
    spellLevel: spellLevel,
    bonuses: bonuses,
    modifiers: modifiers,
    configurations: {config, dialog, message},
    attackMode: attackMode
  });
  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  applyImmediateDamageBonuses(config, bonuses);
  applyDamageDiceModifiers(config, bonuses, modifiers);
  sanitizeCriticalBonuses(config);
}

/* -------------------------------------------------- */

/**
 * When you roll a saving throw.
 * @param {SavingThrowRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog         Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message       Configuration data for the roll's message.
 */
function preRollSavingThrow(config, dialog, message) {
  const actor = config.subject;
  if (!actor) return;
  const details = {
    ability: config.ability,
    isConcentration: config.isConcentration ?? config.hookNames?.includes("concentration") ?? false,
    isDeath: config.hookNames?.includes("deathSave") ?? false
  };

  const subjects = {actor, target: resolveRollTarget(config)};
  const bonuses = filterings.throwCheck(subjects, details);
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  // Gather up all bonuses.
  const accum = {targetValue: 0, critical: 0};
  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
    const rollData = config.rolls[0]?.data ?? actor.getRollData();
    accum.targetValue += dnd5e.utils.simplifyBonus(bonus.bonuses.targetValue, rollData);
    accum.critical += dnd5e.utils.simplifyBonus(bonus.bonuses.deathSaveCritical, rollData);
  }

  const id = registry.register({
    actor: actor,
    bonuses: bonuses,
    // Saving throws do not yet preserve dice modifiers for later optional bonuses.
    modifiers: new foundry.utils.Collection(),
    details: details,
    configurations: {config, dialog, message}
  });

  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  // Add modifiers to raise/lower the target value and critical threshold.
  adjustSavingThrowRanges(config, accum.targetValue, accum.critical, details.isDeath);
}

/* -------------------------------------------------- */

/**
 * When you roll an ability, skill, or tool check.
 * @param {AbilityCheckRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog          Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message        Configuration data for the roll's message.
 */
function preRollAbilityCheck(config, dialog, message) {
  const actor = config.subject;
  if (!actor) return;
  const subjects = {
    actor: actor,
    item: config.item,
    target: resolveRollTarget(config)
  };
  const details = {
    abilityId: config.ability,
    skillId: config.skill,
    toolId: config.tool
  };
  const bonuses = filterings.testCheck(subjects, details);
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
  }

  const id = registry.register({
    ...subjects,
    bonuses: bonuses,
    // Ability checks do not yet preserve dice modifiers for later optional bonuses.
    modifiers: new foundry.utils.Collection(),
    details: details,
    configurations: {config, dialog, message}
  });

  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);
}

/* -------------------------------------------------- */

/**
 * When you roll a hit die...
 * @param {HitDieRollProcessConfiguration} config  Configuration information for the roll.
 * @param {BasicRollDialogConfiguration} dialog    Configuration for the roll dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration for the roll message.
 */
function preRollHitDie(config, dialog, message) {
  const actor = config.subject;
  const subjects = {actor, target: resolveRollTarget(config)};
  const bonuses = filterings.hitDieCheck(subjects);
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  const modifiers = new foundry.utils.Collection();
  const id = registry.register({
    actor: actor,
    bonuses: bonuses,
    modifiers: modifiers,
    configurations: {config, dialog, message}
  });
  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
  }

  // Add die modifiers.
  for (const bonus of bonuses.nonoptional) {
    if (!bonus.hasDiceModifiers) continue;
    for (const {parts, data} of config.rolls) {
      if (bonus._halted) break;
      const halted = bonus.bonuses.modifiers.modifyParts(parts, data);
      if (halted) bonus._halted = true;
    }
    if (!bonus._halted) modifiers.set(bonus.uuid, bonus);
  }

  // Force dialog if there is an optional bonus.
  if (bonuses.optionals.size) dialog.configure = true;
}

/* -------------------------------------------------- */

/**
 * Inject buildNAction data on templates created by items.
 * @param {Activity} activity       Activity for which the template is being placed.
 * @param {object} templateData     Data used to create the new template.
 */
function preCreateActivityTemplate(activity, templateData) {
  const item = activity.item;
  if (!item?.isEmbedded) return;
  const [tokenDocument] = item.actor.isToken ? [item.actor.token] : item.actor.getActiveTokens(false, true);
  const disp = tokenDocument?.disposition ?? item.actor.prototypeToken.disposition;

  const bonusData = getCollection(item).reduce((acc, bonus) => {
    if (bonus.aura.isTemplate) acc.push(bonus.toObject());
    return acc;
  }, []);
  if (foundry.utils.isEmpty(bonusData)) return;
  foundry.utils.setProperty(templateData, `flags.${MODULE.ID}`, {
    bonuses: bonusData,
    templateDisposition: disp
  });
}

/* -------------------------------------------------- */

/**
 * Add the target's roll data to the actor's roll data.
 * @param {object} config               The roll config for this roll. **will be mutated**
 * @param {Token5e|null} target         The authoritative target for this roll.
 * @param {boolean} [deterministic]     Whether to force flat values for properties that could be a die or flat term.
 */
function _addTargetData(config, target, deterministic = false) {
  if (target?.actor) {
    const targetData = target.actor.getRollData({deterministic});
    injectTargetData(config, targetData);
  }
}

/* -------------------------------------------------- */

export default {
  postActivityConsumption,
  preCreateActivityTemplate,
  preRollAbilityCheck,
  preRollAttack,
  preRollDamage,
  preRollHitDie,
  preRollSavingThrow
};
