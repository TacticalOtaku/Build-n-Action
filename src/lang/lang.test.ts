import { describe, expect, it } from "vitest";
import { CONNECT_REJECTIONS } from "../core/graph/connections";
import { createTranslator } from "../core/i18n";
import { createPhraseFormatter, type ChoiceProvider } from "../core/phrase/formatter";
import { defaultsFor } from "../core/registry/fields";
import { requiredI18nKeys } from "../core/registry/i18n-keys";
import { CHECKS, RESULTS } from "../core/registry/index";
import en from "./en.json";
import ru from "./ru.json";

const provider: ChoiceProvider = { choices: () => [{ value: "x", label: "X" }] };

/** Data that drives each phrase builder down its non-default branches. */
const RICH_CHECK_DATA: Record<string, Record<string, unknown>[]> = {
  attackModes: [{ value: ["x"], classification: ["x"], mode: ["x"] }],
  featureTypes: [{ type: "x", subtype: "channelDivinity" }, { type: "x", subtype: "" }],
  spellComponents: [{ types: ["x"], match: "all" }, { types: ["x"], match: "any" }],
  healthPercentages: [{ value: 50, type: "atLeast" }, { value: 25, type: "atMost" }],
  remainingSpellSlots: [{ min: 1, max: 3, size: true }, { min: 1, max: null, size: false }, { min: null, max: 2, size: false }],
  tokenSizes: [{ size: 2, type: "atMost", self: true }, { size: 1, type: "atLeast", self: false }],
  arbitraryComparisons: [{ comparisons: [{ one: "@a", operator: "LT", other: "3" }] }],
  identifiers: [{ values: ["longsword"] }],
  creatureTypes: [{ values: ["x", "!x"] }]
};

const RICH_RESULT_DATA: Record<string, Record<string, unknown>[]> = {
  rollBonus: [{ formula: "1d6", damageTypes: ["x"] }],
  dcBonus: [{ formula: "1" }],
  diceModifiers: [
    {
      amount: { enabled: true, mode: "multiply", value: "2" },
      size: { enabled: true, mode: "add", value: "2" },
      reroll: { enabled: true, value: "2" },
      explode: { enabled: true, value: "6" },
      minimum: { enabled: true, maximize: true },
      maximum: { enabled: true, value: "5" }
    },
    { minimum: { enabled: true, value: "2" } }
  ],
  critRange: [{ critical: "-1", fumble: "1" }],
  critDamage: [{ dice: "1", damage: "1d6" }],
  saveThresholds: [{ targetValue: "-2", deathSaveCritical: "-1" }],
  reminder: [{ text: "A very long reminder text that certainly exceeds the preview length limit" }],
  rider: [
    { effect: { type: "rollBonus", data: { formula: "2d6" } }, scope: "nextRoll", roll: "damageRoll", who: "self", duration: { unit: "rounds", value: 2 } },
    { effect: null, scope: "sameActivation", duration: { unit: "untilRest", value: 1 } },
    { effect: { type: "critRange", data: {} }, duration: { unit: "uses", value: 3 } },
    { duration: { unit: "turns", value: 1 } }
  ],
  applyEffect: [{ source: "itemEffect", effectId: "x", who: "target" }],
  removeEffect: [{ match: "name", name: "Bless", who: "self" }],
  resource: [{ action: "restore", resource: "slots", slotLevel: "x", amount: "1", who: "self" }, { resource: "currency", currency: "x" }],
  signal: [{ name: "smite" }]
};

function flatten(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (!node || (typeof node !== "object")) return [];
  return Object.entries(node).flatMap(([key, value]) => flatten(value, prefix ? `${prefix}.${key}` : key));
}

describe.each([["en", en], ["ru", ru]] as const)("%s localization", (_language, dictionary) => {
  const translator = createTranslator(dictionary, { strict: true });
  const fmt = createPhraseFormatter(translator, provider);

  it("defines every key the registry references", () => {
    expect(requiredI18nKeys().filter(key => !translator.has(key))).toEqual([]);
  });

  it("defines a message for every connection rejection", () => {
    for (const reason of CONNECT_REJECTIONS) expect(translator.has(`BNA.Connect.${reason}`), reason).toBe(true);
  });

  it("phrases every check", () => {
    for (const check of CHECKS) {
      expect(() => check.phrase(defaultsFor(check.fields), fmt), check.type).not.toThrow();
      for (const data of RICH_CHECK_DATA[check.type] ?? []) {
        expect(() => check.phrase(data, fmt), `${check.type} (rich)`).not.toThrow();
      }
    }
  });

  it("phrases every result", () => {
    for (const result of RESULTS) {
      expect(() => result.phrase(defaultsFor(result.fields), fmt), result.type).not.toThrow();
      for (const data of RICH_RESULT_DATA[result.type] ?? []) {
        expect(() => result.phrase(data, fmt), `${result.type} (rich)`).not.toThrow();
      }
    }
  });
});

describe("language parity", () => {
  it("keeps English and Russian in sync", () => {
    expect(flatten(ru.BNA).sort()).toEqual(flatten(en.BNA).sort());
  });
});
