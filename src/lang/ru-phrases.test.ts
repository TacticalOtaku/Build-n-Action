import { describe, expect, it } from "vitest";
import ru from "./ru.json";

function entries(node: unknown, prefix = ""): [string, string][] {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || (typeof node !== "object")) return [];
  return Object.entries(node).flatMap(([key, value]) => entries(value, prefix ? `${prefix}.${key}` : key));
}

const all = entries(ru);
const checkPhrases = all.filter(([key]) => /^BNA\.Check\.[^.]+\.Phrase/.test(key));

describe("Russian phrases", () => {
  it("put chosen values where the nominative is correct: first, after a dash or after a colon", () => {
    const governed = checkPhrases.filter(([, text]) => text.includes("{values}") && !/(^|— |: )\{values\}/.test(text));
    expect(governed).toEqual([]);
  });

  it("keep a dash from starting a line", () => {
    expect(checkPhrases.filter(([, text]) => text.includes(" — "))).toEqual([]);
  });

  it("negate a choice with «не»", () => {
    expect(ru.BNA.Phrase.NotValues).toBe("не {values}");
    expect(all.filter(([, text]) => text.includes("кроме {"))).toEqual([]);
  });

  it("give counts after a label instead of before an inflected noun", () => {
    const counted = all.filter(([key, text]) => /remainingSpellSlots\.Phrase|critDamage\.PhraseDice/.test(key) && /\{(min|max|value)\} \p{L}/u.test(text));
    expect(counted).toEqual([]);
  });

  it("name wire ends without a preposition", () => {
    expect(ru.BNA.UI.Canvas.wire).toBe("Провод: «{from}» ({pin}) → «{to}»");
  });
});
