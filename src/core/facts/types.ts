import type { EventType } from "../registry/constants";
import type { EffectFacts } from "./effects";

/** What checks need to know about a creature (the roller or the target). */
export interface CreatureFacts {
  /** Creature types and subtypes in lower case, e.g. ["humanoid", "elf"]. */
  creatureTypes: readonly string[];
  /** dnd5e size key, e.g. "med". */
  size: string | null;
  /** Worn armour and shield keys (base item and category), plus "natural" for natural armour. */
  armor: readonly string[];
  statuses: readonly string[];
  /** Applicable Active Effects; optional for callers supplying pre-existing facts. */
  effects?: readonly EffectFacts[];
  conditionImmunities: readonly string[];
  /** Markers on the creature, its items and its active effects. */
  markers: readonly string[];
  /** Token footprint in grid squares (the larger of width and height), or null without a token. */
  tokenSize: number | null;
  /** Hit points as a percentage (temporary hit points not counted), or null for actors without hit points. */
  hpPercent: number | null;
}

export interface ActorFacts extends CreatureFacts {
  uuid: string;
  /** Every language key the actor speaks, including parent categories such as "standard". */
  languages: readonly string[];
  spellSlots: readonly { level: number; value: number; max: number }[];
}

export interface ItemFacts {
  uuid: string;
  type: string;
  identifier: string;
  /** For weapons and armour: the category and the base item, e.g. ["martialM", "longsword"]. */
  baseTypes: readonly string[];
  properties: readonly string[];
  featureType: string | null;
  featureSubtype: string | null;
  /** Present for spells; level is the level it is cast at. */
  spell: { level: number; school: string; method: string; sourceClass: string } | null;
  /** Markers on the item and its active effects. */
  markers: readonly string[];
}

export interface ActivityFacts {
  type: string;
  /** Ability the activity rolls with. */
  ability: string | null;
  attackType: string | null;
  attackClassification: string | null;
  /** Damage or healing types the activity deals. */
  damageTypes: readonly string[];
  /** Ability that sets the DC of the save the activity forces: its DC calculation, or the spellcasting ability. */
  dcAbility: string | null;
}

export interface RollDetails {
  /** Ability of an ability, skill or tool check. */
  abilityId: string | null;
  skillId: string | null;
  /** The tool of a tool check and its parent categories. */
  toolKeys: readonly string[];
  /** Ability of the saving throw being rolled. */
  saveAbility: string | null;
  isDeath: boolean;
  isConcentration: boolean;
  /** dnd5e attack mode of a damage roll, e.g. "twoHanded". */
  attackMode: string | null;
  /** Proficiency multiplier that applies to this roll (0, 0.5, 1, 2), or null when unknown. */
  proficiency: number | null;
}

/** Everything the engine may ask about one roll; built by the runtime from Foundry documents. */
export interface RollFacts {
  event: EventType;
  actor: ActorFacts;
  item: ItemFacts | null;
  activity: ActivityFacts | null;
  target: CreatureFacts | null;
  roll: RollDetails;
}
