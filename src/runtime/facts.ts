import type { ActivityFacts, ActorFacts, CreatureFacts, ItemFacts, RollDetails, RollFacts } from "../core/facts/types";
import type { EventType } from "../core/registry/constants";
import { asNumber, asRecord, asString, asStrings } from "../core/registry/data";
import { callList, listOf, read, stringList } from "./read";
import { expandTraits, traitPath, type TraitTree } from "./traits";
import { creatureEffects } from "./effects";

const SCOPE = "build-n-action";

/** dnd5e trait trees used to widen languages and tools; missing trees mean "no hierarchy". */
export interface TraitTrees {
  languages?: TraitTree | null;
  tool?: TraitTree | null;
  /** Not used by facts; the editor lists base weapons from it. */
  weapon?: TraitTree | null;
}

/** The targeted token: its actor and its document (for the footprint). */
export interface TargetInput {
  actor: unknown;
  document: unknown;
}

export interface RollDetailsInput {
  abilityId?: string | null;
  skillId?: string | null;
  toolId?: string | null;
  saveAbility?: string | null;
  isDeath?: boolean;
  isConcentration?: boolean;
  attackMode?: string | null;
  /** The level the spell is cast at, when it differs from the item's base level. */
  spellLevel?: number | null;
}

export interface RollInput {
  event: EventType;
  actor: unknown;
  /** The roller's token document, if any. */
  token?: unknown;
  item?: unknown;
  activity?: unknown;
  target?: TargetInput | null;
  details: RollDetailsInput;
}

function text(value: unknown): string | null {
  return asString(value) || null;
}

function splitTypes(value: string): string[] {
  return value.split("/").map(part => part.trim().toLowerCase()).filter(Boolean);
}

/** Creature types and subtypes, as v1's _splitRaces: subtypes split on "/", then the type or custom text. */
export function creatureTypes(actor: unknown): string[] {
  const type = read(actor, "system.details.type");
  if (!type || (typeof type !== "object")) return [];
  const types = new Set(splitTypes(asString(read(type, "subtype"))));
  const value = asString(read(type, "value"));
  if (value === "custom") splitTypes(asString(read(type, "custom"))).forEach(entry => types.add(entry));
  else if (value) types.add(value);
  return [...types];
}

function wornArmor(actor: unknown): string[] {
  const ac = read(actor, "system.attributes.ac");
  const types = new Set<string>();
  for (const worn of [read(ac, "equippedShield"), read(ac, "equippedArmor")]) {
    if (!worn) continue;
    for (const key of [read(worn, "system.type.baseItem"), read(worn, "system.type.value")]) {
      if (typeof key === "string" && key) types.add(key);
    }
  }
  if (read(ac, "calc") === "natural") types.add("natural");
  return [...types];
}

function ownMarkers(document: unknown): string[] {
  return asStrings(read(document, `flags.${SCOPE}.markers`));
}

/** Markers stored on a document and on its active applicable effects. */
export function markersOf(document: unknown): string[] {
  const markers = new Set(ownMarkers(document));
  for (const effect of callList(document, "allApplicableEffects")) {
    if (read(effect, "active") === true) ownMarkers(effect).forEach(marker => markers.add(marker));
  }
  return [...markers];
}

function footprint(tokenDocument: unknown): number | null {
  const width = asNumber(read(tokenDocument, "width"));
  const height = asNumber(read(tokenDocument, "height"));
  if ((width === null) && (height === null)) return null;
  return Math.max(width ?? 0, height ?? 0);
}

function creature(actor: unknown, tokenDocument: unknown): CreatureFacts {
  const hp = read(actor, "system.attributes.hp");
  return {
    creatureTypes: creatureTypes(actor),
    size: text(read(actor, "system.traits.size")),
    armor: wornArmor(actor),
    statuses: stringList(read(actor, "statuses")),
    effects: creatureEffects(actor),
    conditionImmunities: stringList(read(actor, "system.traits.ci.value")),
    markers: markersOf(actor),
    tokenSize: footprint(tokenDocument),
    hpPercent: hp ? asNumber(read(hp, "pct")) : null
  };
}

function spellSlots(actor: unknown): ActorFacts["spellSlots"] {
  const spells = asRecord(read(actor, "system.spells"));
  return Object.values(spells).flatMap(slot => {
    const level = asNumber(read(slot, "level"));
    const value = asNumber(read(slot, "value"));
    const max = asNumber(read(slot, "max"));
    return ((level === null) || (value === null) || (max === null)) ? [] : [{ level, value, max }];
  });
}

function actorFacts(actor: unknown, tokenDocument: unknown, trees: TraitTrees): ActorFacts {
  return {
    uuid: asString(read(actor, "uuid")),
    ...creature(actor, tokenDocument),
    languages: expandTraits(trees.languages, stringList(read(actor, "system.traits.languages.value"))),
    spellSlots: spellSlots(actor)
  };
}

/**
 * The class a spell belongs to. dnd5e 5.3 deprecated SpellData#sourceClass: classIdentifier gives the
 * same value, and the stored sourceItem ("class:wizard") is the fallback for plain data.
 */
function spellClass(item: unknown): string {
  const identifier = asString(read(item, "system.classIdentifier"));
  if (identifier) return identifier;
  const [type, key] = asString(read(item, "system.sourceItem")).split(":");
  return ((type === "class") && key) ? key : "";
}

function itemFacts(item: unknown, spellLevel: number | null | undefined): ItemFacts {
  const type = asString(read(item, "type"));
  const hasBase = (type === "weapon") || (type === "equipment") || (type === "tool");
  return {
    uuid: asString(read(item, "uuid")),
    type,
    identifier: asString(read(item, "identifier")) || asString(read(item, "system.identifier")),
    baseTypes: hasBase
      ? [read(item, "system.type.value"), read(item, "system.type.baseItem")].filter((key): key is string => (typeof key === "string") && !!key)
      : [],
    properties: stringList(read(item, "system.properties")),
    featureType: (type === "feat") ? text(read(item, "system.type.value")) : null,
    featureSubtype: (type === "feat") ? text(read(item, "system.type.subtype")) : null,
    spell: (type === "spell")
      ? {
        level: spellLevel ?? asNumber(read(item, "system.level")) ?? 0,
        school: asString(read(item, "system.school")),
        method: asString(read(item, "system.method")),
        sourceClass: spellClass(item)
      }
      : null,
    markers: markersOf(item)
  };
}

function dcAbility(activity: unknown): string | null {
  const calculation = asString(read(activity, "save.dc.calculation"));
  if (!calculation) return null;
  return (calculation === "spellcasting") ? text(read(activity, "spellcastingAbility")) : calculation;
}

function activityFacts(activity: unknown): ActivityFacts {
  const type = asString(read(activity, "type"));
  let parts: unknown[] = [];
  if (type === "heal") parts = [read(activity, "healing")];
  else if (["attack", "damage", "save"].includes(type)) parts = listOf(read(activity, "damage.parts"));
  const damageTypes = new Set(parts.flatMap(part => stringList(read(part, "types"))));
  return {
    type,
    ability: text(read(activity, "ability")),
    attackType: (type === "attack") ? text(read(activity, "attack.type.value")) : null,
    attackClassification: (type === "attack") ? text(read(activity, "attack.type.classification")) : null,
    damageTypes: [...damageTypes],
    dcAbility: (type === "save") ? dcAbility(activity) : null
  };
}

/** v1's proficiencyLevels: skill, ability check, death save, saving throw, item, tool — first that applies. */
function proficiency(input: RollInput): number | null {
  const { actor, item, details } = input;
  const multiplier = (path: string) => asNumber(read(actor, path)) || 0;
  if (details.skillId) return multiplier(`system.skills.${details.skillId}.prof.multiplier`);
  if (details.abilityId && !details.toolId) return multiplier(`system.abilities.${details.abilityId}.checkProf.multiplier`);
  if (details.isDeath) return read(actor, "flags.dnd5e.diamondSoul") ? 1 : 0;
  if (details.saveAbility) return multiplier(`system.abilities.${details.saveAbility}.saveProf.multiplier`);
  if (item) return asNumber(read(item, "system.prof.multiplier"));
  if (details.toolId) return multiplier(`system.tools.${details.toolId}.prof.multiplier`);
  return null;
}

function rollDetails(input: RollInput, trees: TraitTrees): RollDetails {
  const { details } = input;
  const toolPath = details.toolId ? traitPath(trees.tool, details.toolId) : [];
  return {
    abilityId: details.abilityId ?? null,
    skillId: details.skillId ?? null,
    toolKeys: details.toolId ? (toolPath.length ? toolPath : [details.toolId]) : [],
    saveAbility: details.saveAbility ?? null,
    isDeath: details.isDeath === true,
    isConcentration: details.isConcentration === true,
    attackMode: details.attackMode ?? null,
    proficiency: proficiency(input)
  };
}

/** Everything the engine may ask about one roll, read from dnd5e documents. */
export function buildRollFacts(input: RollInput, trees: TraitTrees): RollFacts {
  const target = input.target;
  return {
    event: input.event,
    actor: actorFacts(input.actor, input.token, trees),
    item: input.item ? itemFacts(input.item, input.details.spellLevel) : null,
    activity: input.activity ? activityFacts(input.activity) : null,
    target: target?.actor ? creature(target.actor, target.document) : null,
    roll: rollDetails(input, trees)
  };
}
