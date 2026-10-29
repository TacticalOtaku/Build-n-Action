import { describe, expect, it } from "vitest";
import { createTranslator } from "../../core/i18n";
import { createPhraseFormatter } from "../../core/phrase/formatter";
import en from "../../lang/en.json";
import { checkChoices, reasonText } from "./reason-text";

const translator = createTranslator(en);
const t = (key: string, data?: Record<string, string | number>) => translator.t(key, data);
const fmt = createPhraseFormatter(translator, {
  choices: () => [{ value: "humanoid", label: "Humanoid" }, { value: "undead", label: "Undead" }, { value: "fiend", label: "Fiend" }]
});

describe("reasonText", () => {
  it("shows stored values by their labels", () => {
    const reason = { code: "notMatched" as const, values: { actual: "humanoid", expected: "undead, fiend" } };
    expect(reasonText(reason, t, fmt, checkChoices("creatureTypes"))).toBe("Humanoid is not one of: Undead, Fiend.");
  });

  it("keeps values when the check has no choice list, and keeps the dash", () => {
    expect(reasonText({ code: "notMatched", values: { actual: "—", expected: "undead" } }, t, fmt, null)).toBe("— is not one of: undead.");
    expect(reasonText({ code: "noTarget" }, t)).toBe("There is no target.");
  });

  it("finds the choice list of list checks only", () => {
    expect(checkChoices("creatureTypes")).not.toBeNull();
    expect(checkChoices("customScripts")).toBeNull();
    expect(checkChoices("unknown")).toBeNull();
  });
});
