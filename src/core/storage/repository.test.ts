import { describe, expect, it } from "vitest";
import en from "../../lang/en.json";
import ru from "../../lang/ru.json";
import { createBlueprint } from "../blueprint/factory";
import { isValidId } from "../blueprint/ids";
import type { BlueprintSource } from "../blueprint/types";
import { createTranslator } from "../i18n";
import { convertLegacyBonus } from "../legacy/adapter";
import { LEGACY_FIXTURES } from "../legacy/fixtures";
import {
  blueprintUuid, deleteBlueprint, flagChanges, issueMessageKey, parseBlueprintUuid, readBlueprints, upsertBlueprint
} from "./repository";

function blueprint(id: string, name: string, sort = 0): BlueprintSource {
  return createBlueprint({ id, name, sort });
}

const alpha = blueprint("AlphaBlueprint01", "Alpha", 10);
const beta = blueprint("BetaBlueprint002", "Beta", 0);

describe("readBlueprints", () => {
  it("returns nothing for empty or foreign flags", () => {
    expect(readBlueprints(undefined, "item")).toEqual({ blueprints: [], issues: [] });
    expect(readBlueprints({ blueprints: "oops", bonuses: 7 }, "item")).toEqual({ blueprints: [], issues: [] });
  });

  it("reads new blueprints sorted by sort, then name", () => {
    const gamma = blueprint("GammaBlueprint03", "Gamma", 0);
    const { blueprints } = readBlueprints({ blueprints: [alpha, gamma, beta] }, "item");
    expect(blueprints.map(entry => entry.name)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("skips damaged blueprints with an issue", () => {
    const { blueprints, issues } = readBlueprints({ blueprints: [alpha, { id: "BrokenBlueprint1", nodes: 3 }, null] }, "item");
    expect(blueprints).toEqual([alpha]);
    expect(issues).toEqual([{ id: "BrokenBlueprint1", code: "invalidBlueprint", values: { path: "schemaVersion" } }]);
  });

  it("converts legacy bonuses from an array or an id-keyed object", () => {
    const expected = convertLegacyBonus(LEGACY_FIXTURES.attackAura, "item").blueprint;
    const fromArray = readBlueprints({ bonuses: [LEGACY_FIXTURES.attackAura] }, "item");
    const fromObject = readBlueprints({ bonuses: { LgAttackAura0001: LEGACY_FIXTURES.attackAura } }, "item");
    expect(fromArray.blueprints).toEqual([expected]);
    expect(fromObject.blueprints).toEqual([expected]);
  });

  it("passes the carrier to the conversion", () => {
    const { blueprints } = readBlueprints({ bonuses: [LEGACY_FIXTURES.attackAura] }, "region");
    expect(blueprints[0]?.nodes[0]?.data.reach).toMatchObject({ mode: "region" });
  });

  it("prefers a saved blueprint over the legacy bonus with the same id", () => {
    const saved = blueprint("LgAttackAura0001", "Saved");
    const { blueprints } = readBlueprints({ blueprints: [saved], bonuses: [LEGACY_FIXTURES.attackAura] }, "item");
    expect(blueprints).toEqual([saved]);
  });

  it("reports conversion warnings with the blueprint id", () => {
    const { issues } = readBlueprints({ bonuses: [LEGACY_FIXTURES.unknownFilter, LEGACY_FIXTURES.badType] }, "item");
    expect(issues).toEqual([
      { id: "LgUnknown0000009", code: "unknownFilter", values: { filter: "moonPhase" } },
      { id: "LgBadType0000010", code: "unknownType", values: { type: "initiative" } }
    ]);
  });

  it("gives legacy bonuses with invalid ids a stable id", () => {
    const first = readBlueprints({ bonuses: [LEGACY_FIXTURES.badId] }, "item").blueprints[0];
    const second = readBlueprints({ bonuses: [LEGACY_FIXTURES.badId] }, "item").blueprints[0];
    expect(first && isValidId(first.id)).toBe(true);
    expect(second?.id).toBe(first?.id);
    const twins = readBlueprints({ bonuses: [LEGACY_FIXTURES.badId, LEGACY_FIXTURES.badId] }, "item").blueprints;
    expect(new Set(twins.map(entry => entry.id)).size).toBe(2);
  });
});

describe("upsertBlueprint", () => {
  it("appends a new blueprint", () => {
    expect(upsertBlueprint({ blueprints: [alpha] }, beta)).toEqual({ blueprints: [alpha, beta] });
    expect(upsertBlueprint(undefined, beta)).toEqual({ blueprints: [beta] });
  });

  it("replaces by id in place and keeps other raw entries", () => {
    const damaged = { id: "BrokenBlueprint1" };
    const renamed = { ...alpha, name: "Alpha 2" };
    expect(upsertBlueprint({ blueprints: [alpha, damaged, beta] }, renamed)).toEqual({ blueprints: [renamed, damaged, beta] });
  });

  it("moves a converted legacy bonus out of bonuses into the backup", () => {
    const converted = readBlueprints({ bonuses: [LEGACY_FIXTURES.attackAura, LEGACY_FIXTURES.hitDie] }, "item").blueprints
      .find(entry => entry.id === "LgAttackAura0001");
    if (!converted) throw new Error("not converted");
    const update = upsertBlueprint(
      { bonuses: [LEGACY_FIXTURES.attackAura, LEGACY_FIXTURES.hitDie], legacyBackup: { Older: 1 } }, converted
    );
    expect(update).toEqual({
      blueprints: [converted],
      bonuses: [LEGACY_FIXTURES.hitDie],
      legacyBackup: { Older: 1, LgAttackAura0001: LEGACY_FIXTURES.attackAura }
    });
  });

  it("finds a renamed legacy bonus through its recorded id", () => {
    const converted = readBlueprints({ bonuses: [LEGACY_FIXTURES.badId] }, "item").blueprints[0];
    if (!converted) throw new Error("not converted");
    const update = upsertBlueprint({ bonuses: [LEGACY_FIXTURES.badId] }, converted);
    expect(update.bonuses).toEqual([]);
    expect(update.legacyBackup).toEqual({ [converted.id]: LEGACY_FIXTURES.badId });
  });

  it("does not modify the stored flags", () => {
    const scope = { blueprints: [alpha], bonuses: [LEGACY_FIXTURES.attackAura] };
    const before = structuredClone(scope);
    upsertBlueprint(scope, { ...alpha, name: "Changed" });
    expect(scope).toEqual(before);
  });
});

describe("deleteBlueprint", () => {
  it("removes a blueprint", () => {
    expect(deleteBlueprint({ blueprints: [alpha, beta] }, alpha)).toEqual({ blueprints: [beta] });
  });

  it("removes a legacy bonus and keeps a backup", () => {
    const converted = readBlueprints({ bonuses: [LEGACY_FIXTURES.hitDie] }, "item").blueprints[0];
    if (!converted) throw new Error("not converted");
    expect(deleteBlueprint({ bonuses: [LEGACY_FIXTURES.hitDie] }, converted)).toEqual({
      blueprints: [], bonuses: [], legacyBackup: { LgHitDie00000005: LEGACY_FIXTURES.hitDie }
    });
  });
});

describe("flagChanges", () => {
  it("prefixes the module scope", () => {
    expect(flagChanges({ blueprints: [alpha], bonuses: [] })).toEqual({
      "flags.build-n-action.blueprints": [alpha],
      "flags.build-n-action.bonuses": []
    });
  });
});

describe("blueprint UUIDs", () => {
  it("builds and parses new and legacy forms", () => {
    const uuid = blueprintUuid("Actor.abc123def456ghi7.Item.Longsword0000001", "AlphaBlueprint01");
    expect(uuid).toBe("Actor.abc123def456ghi7.Item.Longsword0000001.Blueprint.AlphaBlueprint01");
    expect(parseBlueprintUuid(uuid)).toEqual({ parentUuid: "Actor.abc123def456ghi7.Item.Longsword0000001", id: "AlphaBlueprint01" });
    expect(parseBlueprintUuid("Item.Longsword0000001.ContextualBonus.LgAttackAura0001"))
      .toEqual({ parentUuid: "Item.Longsword0000001", id: "LgAttackAura0001" });
  });

  it("rejects other UUIDs", () => {
    expect(parseBlueprintUuid("Item.Longsword0000001")).toBeNull();
    expect(parseBlueprintUuid("Item.Longsword0000001.Blueprint.short")).toBeNull();
    expect(parseBlueprintUuid(".Blueprint.AlphaBlueprint01")).toBeNull();
  });
});

describe.each([["en", en], ["ru", ru]] as const)("%s storage messages", (_language, dictionary) => {
  it("describe every issue", () => {
    const translator = createTranslator(dictionary);
    const codes = ["invalidBlueprint", "invalidId", "unknownFilter", "unknownType"] as const;
    expect(codes.filter(code => !translator.has(issueMessageKey({ code })))).toEqual([]);
  });
});
