const ACTOR = new Set(["actorCreatureSizes", "actorCreatureTypes", "actorLanguages", "baseArmors", "healthPercentages", "remainingSpellSlots", "statusEffects"]);
const ITEM = new Set(["baseTools", "baseWeapons", "creatureTypes", "featureTypes", "identifiers", "itemTypes", "preparationModes", "sourceClasses", "spellComponents", "spellLevels", "spellSchools", "weaponProperties"]);
const ACTIVITY = new Set(["attackModes", "damageTypes", "saveAbilities"]);
const TARGET = new Set(["targetArmors", "targetEffects", "tokenSizes"]);
const SPECIAL = new Set(["abilities", "markers", "proficiencyLevels", "skillIds", "throwTypes"]);

/** A deliberately limited read-only trial: never dispatch scripts or dice formulas. */
export function evaluateTrialCondition(id, bonus, registry, subjects = {}, details = {}) {
  if (id === "customScripts") return {result: null, reason: "ScriptSkipped"};
  if (id === "arbitraryComparisons") return {result: null, reason: "FormulaSkipped"};
  if (![ACTOR, ITEM, ACTIVITY, TARGET, SPECIAL].some(set => set.has(id))) return {result: null, reason: "EvaluationError"};
  let missing = !subjects.actor;
  if (ITEM.has(id)) missing ||= !subjects.item;
  if (ACTIVITY.has(id)) missing ||= !subjects.activity;
  if (TARGET.has(id)) missing ||= !subjects.target?.actor;
  if (id === "tokenSizes") missing ||= !subjects.target?.document;
  if (id === "abilities") missing ||= !(subjects.activity?.ability || details.abilityId);
  if (id === "skillIds") missing ||= !details.skillId;
  if (id === "throwTypes") missing ||= !(details.ability || details.isDeath || details.isConcentration);
  if (id === "proficiencyLevels") missing ||= !(subjects.item || details.abilityId || details.ability || details.skillId || details.toolId || details.isDeath);
  if (id === "markers" && bonus.filters.markers?.target?.size) missing ||= !subjects.target?.actor;
  if (missing) return {result: null, reason: "MissingContext"};
  try {
    const value = registry[id].call(bonus, {...subjects, target: subjects.target ?? null}, bonus.filters[id], details);
    return typeof value === "boolean" ? {result: value} : {result: null, reason: "EvaluationError"};
  } catch { return {result: null, reason: "EvaluationError"}; }
}
