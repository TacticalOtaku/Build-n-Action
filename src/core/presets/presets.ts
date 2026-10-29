import { createBlueprint, createNode, duplicateBlueprint } from "../blueprint/factory";
import type { BlueprintEdge, BlueprintNode, BlueprintSource, ConditionCheck } from "../blueprint/types";
import type { Translator } from "../i18n";
import type { NodeKind, PinId } from "../registry/constants";
import { defaultsFor } from "../registry/fields";
import { COMMON_RESULT_FIELDS } from "../registry/index";

type Translate = Translator["t"];

/** A built-in starting point. `icon` is a Lucide name from src/ui/icons.tsx. */
export interface PresetDefinition {
  id: string;
  icon: string;
  build(t: Translate): BlueprintSource;
}

const COLUMN = 324;
const COMMON = defaultsFor(COMMON_RESULT_FIELDS) as { cost: Record<string, unknown> } & Record<string, unknown>;

function node(kind: NodeKind, type: string, id: string, x: number, y: number, data: Record<string, unknown> = {}): BlueprintNode {
  const base = createNode(kind, type, { x, y });
  return { ...base, id, data: { ...base.data, ...data } };
}

function event(type: string, id: string, y: number, data: Record<string, unknown> = {}): BlueprintNode {
  return node("event", type, id, 0, y, data);
}

function condition(id: string, x: number, y: number, checks: ConditionCheck[], mode: "all" | "any" = "all"): BlueprintNode {
  return node("condition", "condition", id, x, y, { mode, checks });
}

function check(id: string, type: string, data: Record<string, unknown>): ConditionCheck {
  return { id, type, data };
}

function result(type: string, id: string, x: number, y: number, data: Record<string, unknown>, common: Record<string, unknown> = {}): BlueprintNode {
  const built = node("result", type, id, x, y, data);
  const cost = { ...COMMON.cost, ...((common.cost as Record<string, unknown> | undefined) ?? {}) };
  return { ...built, data: { ...built.data, common: { ...COMMON, ...common, cost } } };
}

function edge(source: string, sourcePin: PinId, target: string): BlueprintEdge {
  return { id: `${source}-${sourcePin}-${target}`, source, sourcePin, target, targetPin: "in" };
}

function preset(id: string, icon: string, blueprintId: string, graph: (t: Translate) => { nodes: BlueprintNode[]; edges: BlueprintEdge[] }): PresetDefinition {
  return {
    id,
    icon,
    build: t => createBlueprint({
      id: blueprintId,
      name: t(`BNA.Preset.${id}.name`),
      description: t(`BNA.Preset.${id}.description`),
      ...graph(t)
    })
  };
}

const MELEE_WEAPON = { value: ["melee"], classification: ["weapon"], mode: [] };

export const PRESETS: readonly PresetDefinition[] = [
  preset("bless", "sparkle", "PresetBless00001", () => ({
    nodes: [event("attackRoll", "attack", 0), event("savingThrow", "save", 180), result("rollBonus", "bonus", COLUMN, 90, { formula: "1d4" })],
    edges: [edge("attack", "out", "bonus"), edge("save", "out", "bonus")]
  })),
  preset("bane", "skull", "PresetBane000001", () => ({
    nodes: [event("attackRoll", "attack", 0), event("savingThrow", "save", 180), result("rollBonus", "penalty", COLUMN, 90, { formula: "-1d4" })],
    edges: [edge("attack", "out", "penalty"), edge("save", "out", "penalty")]
  })),
  preset("hex", "tag", "PresetHex0000001", () => ({
    nodes: [
      event("damageRoll", "damage", 36),
      condition("cursed", COLUMN, 0, [check("c1", "targetMarkers", { values: ["hex"] })]),
      result("rollBonus", "necrotic", COLUMN * 2, 0, { formula: "1d6", damageTypes: ["necrotic"] })
    ],
    edges: [edge("damage", "out", "cursed"), edge("cursed", "yes", "necrotic")]
  })),
  preset("huntersMark", "crosshair", "PresetHuntMark01", () => ({
    nodes: [
      event("damageRoll", "damage", 36),
      condition("marked", COLUMN, 0, [
        check("c1", "targetMarkers", { values: ["hunters-mark"] }),
        check("c2", "attackModes", { value: [], classification: ["weapon"], mode: [] })
      ]),
      result("rollBonus", "force", COLUMN * 2, 0, { formula: "1d6", damageTypes: ["force"] })
    ],
    edges: [edge("damage", "out", "marked"), edge("marked", "yes", "force")]
  })),
  preset("sneakAttack", "swords", "PresetSneakAtk01", () => ({
    nodes: [
      event("damageRoll", "damage", 36),
      condition("finesse", COLUMN, 0, [
        check("c1", "weaponProperties", { values: ["fin"] }),
        check("c2", "attackModes", { value: ["ranged"], classification: ["weapon"], mode: [] })
      ], "any"),
      result("rollBonus", "sneak", COLUMN * 2, 0, { formula: "(ceil(@classes.rogue.levels / 2))d6" }, { optional: true, limit: "turn" })
    ],
    edges: [edge("damage", "out", "finesse"), edge("finesse", "yes", "sneak")]
  })),
  preset("greatWeapon", "sword", "PresetGreatWpn01", () => ({
    nodes: [
      event("damageRoll", "damage", 36),
      condition("heavy", COLUMN, 0, [
        check("c1", "weaponProperties", { values: ["two"] }),
        check("c2", "attackModes", { value: [], classification: [], mode: ["twoHanded"] })
      ], "any"),
      result("diceModifiers", "floor", COLUMN * 2, 0, { minimum: { enabled: true, value: "3", maximize: false } })
    ],
    edges: [edge("damage", "out", "heavy"), edge("heavy", "yes", "floor")]
  })),
  preset("archery", "target", "PresetArchery001", () => ({
    nodes: [
      event("attackRoll", "attack", 36),
      condition("ranged", COLUMN, 0, [check("c1", "baseWeapons", { values: ["simpleR", "martialR"] })]),
      result("rollBonus", "steady", COLUMN * 2, 0, { formula: "2" })
    ],
    edges: [edge("attack", "out", "ranged"), edge("ranged", "yes", "steady")]
  })),
  preset("brutalCritical", "sparkles", "PresetBrutalCr01", () => ({
    nodes: [
      event("damageRoll", "damage", 36),
      condition("melee", COLUMN, 0, [check("c1", "attackModes", MELEE_WEAPON)]),
      result("critDamage", "brutal", COLUMN * 2, 0, { dice: "1", damage: "" })
    ],
    edges: [edge("damage", "out", "melee"), edge("melee", "yes", "brutal")]
  })),
  preset("lucky", "star", "PresetLucky00001", t => ({
    nodes: [
      event("attackRoll", "attack", 0), event("abilityCheck", "check", 180), event("savingThrow", "save", 360),
      result("reminder", "luck", COLUMN, 180, { text: t("BNA.Preset.lucky.reminder") })
    ],
    edges: [edge("attack", "out", "luck"), edge("check", "out", "luck"), edge("save", "out", "luck")]
  })),
  preset("auraOfProtection", "shield", "PresetAuraProt01", () => ({
    nodes: [
      event("savingThrow", "save", 0, {
        reach: {
          mode: "aura", range: "10", disposition: "1", includeSelf: true, blockers: ["incapacitated"],
          require: { sight: false, move: false, sound: false, light: false }
        }
      }),
      result("rollBonus", "ward", COLUMN, 0, { formula: "max(1, @abilities.cha.mod)" })
    ],
    edges: [edge("save", "out", "ward")]
  })),
  preset("divineSmite", "sun", "PresetDivSmite01", () => ({
    nodes: [
      event("damageRoll", "damage", 90),
      condition("melee", COLUMN, 54, [check("c1", "attackModes", MELEE_WEAPON)]),
      result("rollBonus", "smite", COLUMN * 2, 0, { formula: "2d8", damageTypes: ["radiant"] }, {
        optional: true, choiceGroup: "divine-smite", cost: { type: "slots", scales: true, formula: "1d8" }
      }),
      condition("unholy", COLUMN * 2, 216, [check("c2", "creatureTypes", { values: ["undead", "fiend"] })]),
      result("rollBonus", "unholyBonus", COLUMN * 3, 216, { formula: "1d8", damageTypes: ["radiant"] }, {
        optional: true, choiceGroup: "divine-smite-fiend"
      })
    ],
    edges: [
      edge("damage", "out", "melee"), edge("melee", "yes", "smite"), edge("melee", "yes", "unholy"),
      edge("unholy", "yes", "unholyBonus")
    ]
  })),
  preset("colossusSlayer", "swords", "PresetColossus01", () => ({
    nodes: [
      event("damageRoll", "damage", 36),
      condition("wounded", COLUMN, 0, [
        check("c1", "arbitraryComparisons", {
          comparisons: [{ one: "@target.attributes.hp.value", operator: "LT", other: "@target.attributes.hp.max" }]
        }),
        check("c2", "attackModes", { value: [], classification: ["weapon"], mode: [] })
      ]),
      result("rollBonus", "slayer", COLUMN * 2, 0, { formula: "1d8" }, { limit: "turn" })
    ],
    edges: [edge("damage", "out", "wounded"), edge("wounded", "yes", "slayer")]
  })),
  preset("poisonedBlade", "flame", "PresetPoisonBl01", () => ({
    nodes: [
      event("afterAttack", "attack", 36),
      condition("living", COLUMN, 0, [check("c1", "creatureTypes", { values: ["!undead", "!construct"] })]),
      result("applyEffect", "poison", COLUMN * 2, 0, { source: "status", status: "poisoned", effectId: "", who: "target" }, {
        optional: true, limit: "turn"
      })
    ],
    edges: [edge("attack", "hit", "living"), edge("living", "yes", "poison")]
  })),
  preset("vampiricStrike", "heart-pulse", "PresetVampiric01", () => ({
    nodes: [
      event("afterDamage", "damage", 0),
      result("resource", "drink", COLUMN, 0, { action: "restore", resource: "tempHp", slotLevel: "", currency: "gp", amount: "@prof", who: "self" })
    ],
    edges: [edge("damage", "dropped", "drink")]
  }))
];

/** A new blueprint from a preset: a fresh id and the preset's localized name. */
export function instantiatePreset(preset: PresetDefinition, t: Translate): BlueprintSource {
  const built = preset.build(t);
  return duplicateBlueprint(built, built.name);
}
