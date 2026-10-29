import { describe, expect, it } from "vitest";
import { createTranslator } from "../../core/i18n";
import { makeCondition, makeNode } from "../../core/testing/graph";
import en from "../../lang/en.json";
import { nodeTitle } from "./node-title";

const { t } = createTranslator(en, { strict: true });

describe("nodeTitle", () => {
  it("names events and results by type", () => {
    expect(nodeTitle(makeNode("event", "damageRoll", "ev"), t)).toBe(t("BNA.Event.damageRoll.Label"));
    expect(nodeTitle(makeNode("result", "rollBonus", "r"), t)).toBe(t("BNA.Result.rollBonus.Label"));
  });

  it("names conditions by their first check and counts the rest", () => {
    const checks = [
      { id: "c1", type: "creatureTypes", data: {} },
      { id: "c2", type: "thisItem", data: {} }
    ];
    expect(nodeTitle(makeCondition("if", checks), t)).toBe(`${t("BNA.Check.creatureTypes.Label")} +1`);
    expect(nodeTitle(makeCondition("if", []), t)).toBe(t("BNA.UI.Node.noChecksTitle"));
  });

  it("names a condition that only has the \"only this item\" tick after it", () => {
    const ticked = makeCondition("if", []);
    expect(nodeTitle({ ...ticked, data: { ...ticked.data, thisItem: true } }, t)).toBe(t("BNA.Check.thisItem.Label"));
  });

  it("falls back for unknown types", () => {
    expect(nodeTitle({ ...makeNode("result", "rollBonus", "r"), type: "gone" }, t)).toBe(t("BNA.UI.Node.unknown"));
  });
});
