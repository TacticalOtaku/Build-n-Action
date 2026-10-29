import type { ActivityFacts, ActorFacts, CreatureFacts, ItemFacts, RollDetails, RollFacts } from "../facts/types";

export function creatureFacts(partial: Partial<CreatureFacts> = {}): CreatureFacts {
  return {
    creatureTypes: ["humanoid"], size: "med", armor: [], statuses: [], conditionImmunities: [], markers: [], tokenSize: 1, hpPercent: 100,
    ...partial
  };
}

export function actorFacts(partial: Partial<ActorFacts> = {}): ActorFacts {
  return {
    ...creatureFacts(),
    uuid: "Actor.hero",
    languages: ["common", "standard"],
    spellSlots: [],
    ...partial
  };
}

export function itemFacts(partial: Partial<ItemFacts> = {}): ItemFacts {
  return {
    uuid: "Actor.hero.Item.sword",
    type: "weapon",
    identifier: "longsword",
    baseTypes: ["martialM", "longsword"],
    properties: ["ver"],
    featureType: null,
    featureSubtype: null,
    spell: null,
    markers: [],
    ...partial
  };
}

export function activityFacts(partial: Partial<ActivityFacts> = {}): ActivityFacts {
  return {
    type: "attack", ability: "str", attackType: "melee", attackClassification: "weapon", damageTypes: ["slashing"], dcAbility: null,
    ...partial
  };
}

export function rollDetails(partial: Partial<RollDetails> = {}): RollDetails {
  return {
    abilityId: null, skillId: null, toolKeys: [], saveAbility: null, isDeath: false, isConcentration: false,
    attackMode: null, proficiency: null,
    ...partial
  };
}

/** Facts for a longsword damage roll against a humanoid, unless overridden. */
export function rollFacts(partial: Partial<RollFacts> = {}): RollFacts {
  return {
    event: "damageRoll",
    actor: actorFacts(),
    item: itemFacts(),
    activity: activityFacts(),
    target: creatureFacts(),
    roll: rollDetails(),
    ...partial
  };
}
