import { asRecord, asString } from "../core/registry/data";
import type { Choice, DynamicChoiceSource } from "../core/registry/fields";
import { listOf, read } from "./read";
import type { TraitTree } from "./traits";

/** A snapshot of the host's choice data (CONFIG.DND5E and friends); localize turns i18n keys into text. */
export interface ChoiceSourceData {
  dnd5e: Readonly<Record<string, unknown>>;
  statusEffects: readonly unknown[];
  itemTypes: Readonly<Record<string, string>>;
  trees: { languages?: TraitTree | null; weapon?: TraitTree | null; tool?: TraitTree | null };
  /** Effects on the blueprint's carrier (for "apply an item effect"). */
  effects: readonly { id: string; name: string }[];
  localize(key: string): string;
}

function labelOf(entry: unknown, key: string): string {
  if (typeof entry === "string") return entry;
  return asString(read(entry, "label")) || asString(read(entry, "name")) || key;
}

function childrenOf(node: unknown): TraitTree | null {
  const children = read(node, "children");
  return (children && (typeof children === "object")) ? children as TraitTree : null;
}

function choice(value: string, label: string, group?: string): Choice {
  return group ? { value, label, group } : { value, label };
}

function fromRecord(record: unknown, data: ChoiceSourceData): Choice[] {
  return Object.entries(asRecord(record)).map(([value, entry]) => choice(value, data.localize(labelOf(entry, value))));
}

/** Every entry of a trait tree, grouped under its parent's label. */
function fromTree(tree: TraitTree | null | undefined, data: ChoiceSourceData, group?: string): Choice[] {
  if (!tree) return [];
  return Object.entries(tree).flatMap(([value, node]) => {
    const label = data.localize(labelOf(node, value));
    const children = childrenOf(node);
    return [choice(value, label, group), ...(children ? fromTree(children, data, label) : [])];
  });
}

/** Entries without children, grouped under their parent's label. */
function leaves(tree: TraitTree | null | undefined, data: ChoiceSourceData, group?: string): Choice[] {
  if (!tree) return [];
  return Object.entries(tree).flatMap(([value, node]) => {
    const label = data.localize(labelOf(node, value));
    const children = childrenOf(node);
    return children ? leaves(children, data, label) : [choice(value, label, group)];
  });
}

function properties(kind: string, data: ChoiceSourceData): Choice[] {
  const valid = new Set(listOf(read(data.dnd5e, `validProperties.${kind}`)).filter((key): key is string => typeof key === "string"));
  return fromRecord(data.dnd5e.itemProperties, data).filter(entry => valid.has(entry.value));
}

/** The options of one dynamic choice list. */
export function choicesFor(source: DynamicChoiceSource, data: ChoiceSourceData): Choice[] {
  const config = data.dnd5e;
  switch (source) {
    case "abilities":
    case "actorSizes":
    case "armorTypes":
    case "attackClassifications":
    case "attackModes":
    case "attackTypes":
    case "creatureTypes":
    case "currencies":
    case "featureTypes":
    case "proficiencyLevels":
    case "skills":
    case "spellLevels":
    case "spellSchools":
      return fromRecord(config[source], data);
    case "damageAndHealingTypes":
      return [...fromRecord(config.damageTypes, data), ...fromRecord(config.healingTypes, data)];
    case "spellComponents":
      return properties("spell", data);
    case "weaponProperties":
      return properties("weapon", data);
    case "spellMethods":
      return fromRecord(config.spellcasting, data);
    case "spellSlotLevels":
      return [
        ...Object.entries(asRecord(config.spellLevels)).filter(([level]) => Number(level) > 0)
          .map(([level, entry]) => choice(`spell${level}`, data.localize(labelOf(entry, level)))),
        choice("pact", data.localize("DND5E.SpellLevelPact"))
      ];
    case "statusEffects":
      return data.statusEffects.flatMap(effect => {
        const id = asString(read(effect, "id"));
        return id ? [choice(id, data.localize(labelOf(effect, id)))] : [];
      });
    case "itemTypes":
      return Object.entries(data.itemTypes).map(([value, label]) => choice(value, data.localize(label)));
    case "throwTypes":
      return [
        ...fromRecord(config.abilities, data),
        choice("death", data.localize("DND5E.DeathSave")),
        choice("concentration", data.localize("DND5E.Concentration"))
      ];
    case "languages":
      return fromTree(data.trees.languages, data);
    case "tools":
      return fromTree(data.trees.tool, data);
    case "weaponTypes":
      return [...fromRecord(config.weaponTypes, data), ...leaves(data.trees.weapon, data)];
    case "documentEffects":
      return data.effects.map(effect => choice(effect.id, effect.name));
  }
}
