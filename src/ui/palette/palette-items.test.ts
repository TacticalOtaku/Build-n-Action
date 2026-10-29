import { describe, expect, it } from "vitest";
import { createTranslator } from "../../core/i18n";
import en from "../../lang/en.json";
import ru from "../../lang/ru.json";
import { PALETTE_ITEMS, filterPaletteItems } from "./palette-items";

const tEn = createTranslator(en, { strict: true }).t;
const tRu = createTranslator(ru, { strict: true }).t;
const NONE = { from: null, upstream: [] } as const;

describe("PALETTE_ITEMS", () => {
  it("lists every event, the condition and every result", () => {
    expect(PALETTE_ITEMS).toHaveLength(17 + 1 + 14);
    expect(PALETTE_ITEMS.find(item => item.kind === "condition")?.type).toBe("condition");
  });

  it("has translated labels and summaries", () => {
    for (const item of PALETTE_ITEMS) {
      expect(() => tEn(item.labelKey), item.key).not.toThrow();
      expect(() => tRu(item.summaryKey), item.key).not.toThrow();
    }
  });
});

describe("filterPaletteItems", () => {
  it("shows everything without context or query", () => {
    expect(filterPaletteItems(PALETTE_ITEMS, "", NONE, tEn)).toHaveLength(PALETTE_ITEMS.length);
  });

  it("hides events when continuing from an output", () => {
    const items = filterPaletteItems(PALETTE_ITEMS, "", { from: "condition", upstream: [] }, tEn);
    expect(items.some(item => item.kind === "event")).toBe(false);
    expect(items.some(item => item.kind === "condition")).toBe(true);
  });

  it("keeps only results compatible with the upstream events", () => {
    const types = filterPaletteItems(PALETTE_ITEMS, "", { from: "event", upstream: ["afterAttack"] }, tEn)
      .filter(item => item.kind === "result").map(item => item.type);
    expect(types).toContain("applyEffect");
    expect(types).not.toContain("rollBonus");
  });

  it("keeps only results that leave the roll alone after \"And then\"", () => {
    const types = filterPaletteItems(PALETTE_ITEMS, "", { from: "result", upstream: ["afterResult"] }, tEn)
      .filter(item => item.kind === "result").map(item => item.type);
    expect(types).toEqual(["reminder", "rider", "applyEffect", "removeEffect", "resource", "signal", "demandSave", "counter"]);
  });

  it("ranks label prefixes above other matches", () => {
    const labels = filterPaletteItems(PALETTE_ITEMS, "dam", NONE, tEn).map(item => tEn(item.labelKey));
    expect(labels[0]).toBe("Damage roll");
  });

  it("matches summaries and scattered letters", () => {
    expect(filterPaletteItems(PALETTE_ITEMS, "spend", NONE, tEn).map(item => item.type)).toContain("resource");
    expect(filterPaletteItems(PALETTE_ITEMS, "rllbns", NONE, tEn).map(item => item.type)).toContain("rollBonus");
  });

  it("treats ё and е alike", () => {
    expect(filterPaletteItems(PALETTE_ITEMS, "ещё", NONE, tRu).length)
      .toBe(filterPaletteItems(PALETTE_ITEMS, "еще", NONE, tRu).length);
  });

  it("returns nothing for gibberish", () => {
    expect(filterPaletteItems(PALETTE_ITEMS, "zzqq", NONE, tEn)).toEqual([]);
  });
});
