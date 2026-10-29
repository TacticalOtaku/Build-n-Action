import { describe, expect, it } from "vitest";
import { createBlueprint } from "../blueprint/factory";
import { LEGACY_FIXTURES } from "../legacy/fixtures";
import { EXPORT_TYPE, exportBlueprints, importBlueprints, readLibrary, withLibraryEntry, withoutLibraryEntry } from "./library";

const one = createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "One" });
const two = createBlueprint({ id: "zZ3dE5gH7jK9mN1p", name: "Two" });

describe("library list", () => {
  it("reads valid entries once and skips broken ones", () => {
    expect(readLibrary([one, { id: "bad" }, two, one]).map(entry => entry.name)).toEqual(["One", "Two"]);
    expect(readLibrary("nope")).toEqual([]);
  });

  it("replaces an entry by id or appends it, and removes by id", () => {
    const renamed = { ...one, name: "One again" };
    expect(withLibraryEntry([one, two], renamed).map(entry => entry.name)).toEqual(["One again", "Two"]);
    expect(withLibraryEntry([one], two).map(entry => entry.id)).toEqual([one.id, two.id]);
    expect(withoutLibraryEntry([one, two], one.id)).toEqual([two]);
  });
});

describe("JSON exchange", () => {
  it("round-trips an export", () => {
    const text = exportBlueprints([one, two]);
    expect(JSON.parse(text)).toMatchObject({ type: EXPORT_TYPE, version: 2 });
    expect(importBlueprints(text)).toEqual({ blueprints: [one, two], rejected: 0, error: null });
  });

  it("accepts a bare blueprint and an array", () => {
    expect(importBlueprints(JSON.stringify(one)).blueprints).toEqual([one]);
    expect(importBlueprints(JSON.stringify([one, { id: "bad" }])).blueprints).toEqual([one]);
    expect(importBlueprints(JSON.stringify([one, { id: "bad" }])).rejected).toBe(1);
  });

  it("converts v1 bonuses", () => {
    const result = importBlueprints(JSON.stringify(LEGACY_FIXTURES.attackAura));
    expect(result.blueprints).toHaveLength(1);
    expect(result.blueprints[0]).toMatchObject({ id: LEGACY_FIXTURES.attackAura.id, name: LEGACY_FIXTURES.attackAura.name });
  });

  it("reports text that is not JSON", () => {
    expect(importBlueprints("{nope")).toEqual({ blueprints: [], rejected: 0, error: "invalidJson" });
  });
});
