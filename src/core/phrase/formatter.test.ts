import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n";
import { STATIC } from "../registry/choices";
import { createPhraseFormatter, type ChoiceProvider } from "./formatter";

const translator = createTranslator({
  BNA: {
    Phrase: {
      And: "and", Or: "or", Any: "anything", NotValues: "anything but {values}", ButNot: "{values}, but not {excluded}"
    },
    Choice: { who: { self: "myself", target: "the target" } }
  }
}, { strict: true });

const provider: ChoiceProvider = {
  choices: source => (source === "creatureTypes")
    ? [{ value: "undead", label: "Undead" }, { value: "fiend", label: "Fiend" }, { value: "beast", label: "Beast" }]
    : []
};

const fmt = createPhraseFormatter(translator, provider);
const CREATURES = { source: "creatureTypes" } as const;

describe("createPhraseFormatter", () => {
  it("labels static and dynamic choices", () => {
    expect(fmt.choice("target", { static: STATIC.who })).toBe("the target");
    expect(fmt.choice("fiend", CREATURES)).toBe("Fiend");
  });

  it("falls back to the raw value and keeps blanks blank", () => {
    expect(fmt.choice("dragon", CREATURES)).toBe("dragon");
    expect(fmt.choice("", CREATURES)).toBe("");
  });

  it("phrases value lists with exclusions", () => {
    expect(fmt.choices([], CREATURES)).toBe("anything");
    expect(fmt.choices(["undead"], CREATURES)).toBe("Undead");
    expect(fmt.choices(["undead", "fiend", "beast"], CREATURES)).toBe("Undead, Fiend or Beast");
    expect(fmt.choices(["!beast"], CREATURES)).toBe("anything but Beast");
    expect(fmt.choices(["undead", "!beast"], CREATURES)).toBe("Undead, but not Beast");
  });

  it("signs formulas", () => {
    expect(fmt.signed("1d4")).toBe("+1d4");
    expect(fmt.signed(" -2 ")).toBe("-2");
    expect(fmt.signed("+3")).toBe("+3");
    expect(fmt.signed("")).toBe("+0");
  });

  it("joins lists naturally", () => {
    expect(fmt.joinAnd([])).toBe("");
    expect(fmt.joinAnd(["a"])).toBe("a");
    expect(fmt.joinAnd(["a", "b"])).toBe("a and b");
    expect(fmt.joinAnd(["a", "b", "c"])).toBe("a, b and c");
    expect(fmt.joinOr(["a", "b"])).toBe("a or b");
  });
});
