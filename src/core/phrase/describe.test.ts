import { describe, expect, it } from "vitest";
import type { BlueprintEdge, BlueprintNode } from "../blueprint/types";
import { createTranslator } from "../i18n";
import type { Choice, DynamicChoiceSource } from "../registry/fields";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import en from "../../lang/en.json";
import ru from "../../lang/ru.json";
import { describeBlueprint } from "./describe";
import { createPhraseFormatter } from "./formatter";

const LABELS: Record<"en" | "ru", Partial<Record<DynamicChoiceSource, Choice[]>>> = {
  en: {
    creatureTypes: [{ value: "undead", label: "undead" }],
    statusEffects: [{ value: "prone", label: "Prone" }, { value: "poisoned", label: "Poisoned" }],
    abilities: [{ value: "con", label: "Constitution" }],
    damageAndHealingTypes: [{ value: "fire", label: "fire" }, { value: "radiant", label: "radiant" }]
  },
  ru: {
    creatureTypes: [{ value: "undead", label: "нежить" }],
    statusEffects: [{ value: "prone", label: "Сбит с ног" }, { value: "poisoned", label: "Отравлен" }],
    abilities: [{ value: "con", label: "Телосложение" }],
    damageAndHealingTypes: [{ value: "fire", label: "огонь" }, { value: "radiant", label: "излучение" }]
  }
};

function formatters() {
  return {
    en: createPhraseFormatter(createTranslator(en, { strict: true }), { choices: source => LABELS.en[source] ?? [] }),
    ru: createPhraseFormatter(createTranslator(ru, { strict: true }), { choices: source => LABELS.ru[source] ?? [] })
  };
}

function sentences(nodes: BlueprintNode[], edges: BlueprintEdge[]) {
  const fmt = formatters();
  return { en: describeBlueprint({ nodes, edges }, fmt.en), ru: describeBlueprint({ nodes, edges }, fmt.ru) };
}

const undead = { id: "c1", type: "creatureTypes", data: { values: ["undead"] } };
const prone = { id: "c2", type: "targetEffects", data: { values: ["prone"] } };

describe("describeBlueprint", () => {
  it("describes an event, a condition and a typed damage bonus", () => {
    const result = sentences(
      [
        makeNode("event", "damageRoll", "ev"),
        makeCondition("if", [undead]),
        makeNode("result", "rollBonus", "bonus", { formula: "1d6", damageTypes: ["fire"] })
      ],
      [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    );
    expect(result.en).toEqual(["When I roll damage, if the target is undead, then +1d6 fire damage."]);
    expect(result.ru).toEqual(["Когда я бросаю урон, если цель\u00A0— нежить, то +1d6 урона (огонь)."]);
  });

  it("describes an aura, an optional result and a frequency limit", () => {
    const result = sentences(
      [
        makeNode("event", "savingThrow", "ev", {
          reach: { mode: "aura", range: "10", disposition: "1", includeSelf: true, blockers: [], require: {} }
        }),
        makeNode("result", "rollBonus", "bonus", {
          formula: "1d4",
          common: { optional: true, choiceGroup: "", cost: { type: "none" }, limit: "turn" }
        })
      ],
      [makeEdge("ev", "out", "bonus")]
    );
    expect(result.en).toEqual(["When an ally in my aura makes a saving throw: +1d4 to the roll (player's choice, once per turn)."]);
    expect(result.ru).toEqual(["Когда союзник в моей ауре совершает спасбросок: +1d4 к броску (по выбору игрока, раз в ход)."]);
  });

  it("adds what follows \"And then\" to the result", () => {
    const common = { optional: true, choiceGroup: "", cost: { type: "none" }, limit: "none", then: true };
    const result = sentences(
      [
        makeNode("event", "damageRoll", "ev"),
        makeNode("result", "rollBonus", "smite", { formula: "2d8", damageTypes: ["radiant"], common }),
        makeNode("result", "applyEffect", "apply", { source: "status", status: "prone", who: "target" })
      ],
      [makeEdge("ev", "out", "smite"), makeEdge("smite", "then", "apply")]
    );
    expect(result.en).toEqual(["When I roll damage: +2d8 radiant damage (player's choice); and then apply “Prone” to the target."]);
    expect(result.ru).toEqual(["Когда я бросаю урон: +2d8 урона (излучение) (по выбору игрока); затем\u00A0— наложить «Сбит с ног» на цель."]);
  });

  it("says the condition of a continuation", () => {
    const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: true };
    const result = sentences(
      [
        makeNode("event", "damageRoll", "ev"),
        makeNode("result", "rollBonus", "smite", { formula: "2", common }),
        makeCondition("if", [undead]),
        makeNode("result", "applyEffect", "apply", { source: "status", status: "prone", who: "target" })
      ],
      [makeEdge("ev", "out", "smite"), makeEdge("smite", "then", "if"), makeEdge("if", "yes", "apply")]
    );
    expect(result.en).toEqual(["When I roll damage: +2 to the roll; and then, if the target is undead, apply “Prone” to the target."]);
    expect(result.ru).toEqual(["Когда я бросаю урон: +2 к броску; затем, если цель\u00A0— нежить, наложить «Сбит с ног» на цель."]);
  });

  it("says a demanded save and its branches", () => {
    const result = sentences(
      [
        makeNode("event", "afterAttack", "ev"),
        makeNode("result", "demandSave", "save", { ability: "con", dc: "13" }),
        makeNode("result", "applyEffect", "poison", { source: "status", status: "poisoned", who: "target" })
      ],
      [makeEdge("ev", "hit", "save"), makeEdge("save", "failed", "poison")]
    );
    expect(result.en).toEqual(["When I hit with an attack: the target makes a Constitution saving throw, DC 13; on a failure, apply “Poisoned” to the target."]);
    expect(result.ru).toEqual(["Когда я попадаю атакой: цель делает спасбросок: Телосложение, СЛ\u00A013; при провале\u00A0— наложить «Отравлен» на цель."]);
  });

  it("says who else saves, with advantage and my spell DC", () => {
    const result = sentences(
      [
        makeNode("event", "turnStart", "ev"),
        makeNode("result", "demandSave", "save", { ability: "con", dcMode: "spell", who: "aura", range: "15", advantage: "disadvantage" })
      ],
      [makeEdge("ev", "out", "save")]
    );
    expect(result.en).toEqual(["When I start my turn: creatures in my aura (15 ft) make a Constitution saving throw, my spell save DC, with disadvantage."]);
    expect(result.ru).toEqual(["Когда я начинаю ход: существа в моей ауре (15 фт) делают спасбросок: Телосложение, СЛ моих заклинаний, с помехой."]);
  });

  it("says counter changes and checks", () => {
    const result = sentences(
      [
        makeNode("event", "afterAttack", "ev"),
        makeCondition("if", [{ id: "c1", type: "counter", data: { name: "rage", scope: "actor", whose: "self", operator: "GE", value: "1" } }]),
        makeNode("result", "counter", "add", { name: "hits", scope: "blueprint", action: "add", amount: "1", who: "self" })
      ],
      [makeEdge("ev", "hit", "if"), makeEdge("if", "yes", "add")]
    );
    expect(result.en).toEqual(["When I hit with an attack, if my counter “rage” ≥ 1, then add 1 to my counter “hits”."]);
    expect(result.ru).toEqual(["Когда я попадаю атакой, если мой счётчик «rage»: ≥ 1, то мой счётчик «hits»: +1."]);
  });

  it("negates conditions on the otherwise branch", () => {
    const result = sentences(
      [
        makeNode("event", "afterAttack", "ev"),
        makeCondition("if", [prone]),
        makeNode("result", "applyEffect", "apply", { source: "status", status: "prone", who: "target" })
      ],
      [makeEdge("ev", "hit", "if"), makeEdge("if", "no", "apply")]
    );
    expect(result.en).toEqual(["When I hit with an attack, if not (the target is affected by Prone), then apply “Prone” to the target."]);
    expect(result.ru).toEqual(["Когда я попадаю атакой, если неверно, что состояние цели\u00A0— Сбит с ног, то наложить «Сбит с ног» на цель."]);
  });

  it("groups results that share a path", () => {
    const result = sentences(
      [
        makeNode("event", "damageRoll", "ev"),
        makeNode("result", "rollBonus", "bonus", { formula: "2" }),
        makeNode("result", "critDamage", "crit", { dice: "1" })
      ],
      [makeEdge("ev", "out", "bonus"), makeEdge("ev", "out", "crit")]
    );
    expect(result.en).toEqual(["When I roll damage: +2 to the roll and on a critical hit: 1 extra dice."]);
    expect(result.ru).toEqual(["Когда я бросаю урон: +2 к броску и при крите: доп. кости × 1."]);
  });

  it("describes signals and any-of conditions", () => {
    const result = sentences(
      [
        makeNode("event", "signal", "sig", { name: "smite" }),
        makeCondition("if", [undead, prone], "any"),
        makeNode("result", "rollBonus", "bonus", { formula: "1d8" })
      ],
      [makeEdge("sig", "out", "if"), makeEdge("if", "yes", "bonus")]
    );
    expect(result.en).toEqual(["When the signal “smite” arrives, if (the target is undead or the target is affected by Prone), then +1d8 to the roll."]);
    expect(result.ru).toEqual(["Когда приходит сигнал «smite», если (цель\u00A0— нежить или состояние цели\u00A0— Сбит с ног), то +1d8 к броску."]);
  });

  it("skips empty conditions and unconnected nodes", () => {
    const result = sentences(
      [
        makeNode("event", "attackRoll", "ev"),
        makeCondition("if", []),
        makeNode("result", "rollBonus", "bonus", { formula: "1" }),
        makeNode("result", "reminder", "loose")
      ],
      [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    );
    expect(result.en).toEqual(["When I make an attack roll: +1 to the roll."]);
    expect(sentences([makeNode("event", "attackRoll", "ev")], []).en).toEqual([]);
  });

  it("puts \"only this item\" before the checks, joined with and whatever the mode", () => {
    const ev = makeNode("event", "damageRoll", "ev");
    const bonus = makeNode("result", "rollBonus", "bonus", { formula: "1" });
    const edges = [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")];
    const condition = (checks: typeof undead[], mode: "all" | "any") => ({ ...makeCondition("if", checks, mode), data: { mode, checks, thisItem: true } });

    expect(sentences([ev, condition([], "all"), bonus], edges).en).toEqual(["When I roll damage, if the roll uses this very item, then +1 to the roll."]);
    expect(sentences([ev, condition([undead, prone], "any"), bonus], edges)).toEqual({
      en: ["When I roll damage, if the roll uses this very item and (the target is undead or the target is affected by Prone), then +1 to the roll."],
      ru: ["Когда я бросаю урон, если бросок сделан именно этим предметом и (цель — нежить или состояние цели — Сбит с ног), то +1 к броску."]
    });
  });

  it("phrases triggers without a roll", () => {
    const bonus = makeNode("result", "reminder", "note", { text: "Heal" });
    const edges = [makeEdge("ev", "out", "note")];
    const turn = makeNode("event", "turnStart", "ev", { reach: { mode: "aura", range: "10", disposition: "1", includeSelf: true } });
    expect(sentences([turn, bonus], edges).ru[0]).toMatch(/^Когда союзник в моей ауре начинает ход: /);
    const enter = makeNode("event", "regionEnter", "ev", { tokens: "hostile" });
    expect(sentences([enter, bonus], edges)).toMatchObject({
      en: [expect.stringMatching(/^When a hostile creature enters this region: /)],
      ru: [expect.stringMatching(/^Когда враждебное существо входит в этот регион: /)]
    });
    expect(sentences([makeNode("event", "longRest", "ev"), bonus], edges).en[0]).toMatch(/^When I finish a long rest: /);
  });
});
