import { createBlueprint, createEdge, createNode } from "../src/core/blueprint/factory";
import type { BlueprintEdge, BlueprintNode, BlueprintSource } from "../src/core/blueprint/types";
import type { NodeKind, PinId } from "../src/core/registry/constants";
import { defaultsFor } from "../src/core/registry/fields";
import { COMMON_RESULT_FIELDS } from "../src/core/registry/index";

const COST = defaultsFor(COMMON_RESULT_FIELDS).cost as Record<string, unknown>;

function node(kind: NodeKind, type: string, id: string, x: number, y: number, data: Record<string, unknown> = {}): BlueprintNode {
  const base = createNode(kind, type, { x, y });
  return { ...base, id, data: { ...base.data, ...data } };
}

function withCommon(target: BlueprintNode, patch: Record<string, unknown>): BlueprintNode {
  return { ...target, data: { ...target.data, common: { ...(target.data.common as Record<string, unknown>), ...patch } } };
}

function edge(source: string, pin: PinId, target: string): BlueprintEdge {
  return { ...createEdge(source, pin, target), id: `${source}-${pin}-${target}` };
}

const FLAVOURS = ["fire", "cold", "lightning", "radiant", "necrotic", "acid", "poison", "thunder", "force", "psychic"];

export function createSampleBlueprints(language: "en" | "ru"): BlueprintSource[] {
  const name = (en: string, ru: string) => (language === "ru") ? ru : en;
  const aura = { mode: "aura", range: "10", disposition: "1", includeSelf: true, blockers: ["incapacitated"], require: { sight: false, move: false, sound: false, light: false } };

  const flame = createBlueprint({
    id: "PlgFlameTongue01",
    name: name("Flame tongue", "Пылающий клинок"),
    nodes: [
      node("event", "damageRoll", "ev", 0, 90),
      node("condition", "condition", "undead", 324, 54, {
        thisItem: true,
        checks: [{ id: "c1", type: "creatureTypes", data: { values: ["undead"] } }]
      }),
      node("result", "rollBonus", "fire", 648, 0, { formula: "1d6", damageTypes: ["fire"] }),
      node("result", "critDamage", "crit", 648, 234, { dice: "1" })
    ],
    edges: [edge("ev", "out", "undead"), edge("undead", "yes", "fire"), edge("ev", "out", "crit")]
  });

  const poison = createBlueprint({
    id: "PlgPoisonBlade02",
    name: name("Poisoned blade", "Отравленный клинок"),
    nodes: [
      node("event", "afterAttack", "ev", 0, 90),
      node("condition", "condition", "living", 324, 36, {
        checks: [{ id: "c1", type: "creatureTypes", data: { values: ["!undead", "!construct"] } }]
      }),
      withCommon(
        node("result", "applyEffect", "apply", 648, 0, { source: "status", status: "poisoned", who: "target" }),
        { optional: true, cost: { ...COST, type: "uses" }, limit: "turn" }
      ),
      node("result", "rider", "rider", 648, 252, {
        effect: { type: "rollBonus", data: { formula: "2d6", damageTypes: ["poison"] } },
        scope: "sameActivation"
      })
    ],
    edges: [edge("ev", "hit", "living"), edge("living", "yes", "apply"), edge("ev", "crit", "rider")]
  });

  const protection = createBlueprint({
    id: "PlgAuraProtect03",
    name: name("Aura of protection", "Аура защиты"),
    nodes: [
      node("event", "savingThrow", "ev", 0, 54, { reach: aura }),
      node("result", "rollBonus", "bonus", 324, 54, { formula: "max(1, @abilities.cha.mod)" })
    ],
    edges: [edge("ev", "out", "bonus")]
  });

  const showcase = createBlueprint({
    id: "PlgElementsShow04",
    name: name("Damage effects showcase", "Стихии: витрина эффектов"),
    nodes: [
      node("event", "damageRoll", "ev", 0, 432),
      ...FLAVOURS.map((flavour, index) => node(
        "result", "rollBonus", flavour, 324 + ((index % 2) * 306), Math.floor(index / 2) * 198,
        { formula: "1d6", damageTypes: [flavour] }
      ))
    ],
    edges: FLAVOURS.map(flavour => edge("ev", "out", flavour))
  });

  const smite = createBlueprint({
    id: "PlgDivineSmite05",
    name: name("Divine smite", "Божественная кара"),
    nodes: [
      node("event", "afterAttack", "hit", 0, 90),
      node("result", "signal", "send", 324, 90, { name: "smite" }),
      node("event", "signal", "receive", 0, 360, { name: "smite" }),
      withCommon(
        node("result", "rollBonus", "radiant", 324, 342, { formula: "2d8", damageTypes: ["radiant"] }),
        { optional: true, choiceGroup: "smite", cost: { ...COST, type: "slots", scales: true, formula: "1d8" } }
      )
    ],
    edges: [edge("hit", "hit", "send"), edge("receive", "out", "radiant")]
  });

  return [flame, poison, protection, showcase, smite];
}
