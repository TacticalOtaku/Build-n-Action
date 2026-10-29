import { describe, expect, it } from "vitest";
import { createBlueprint } from "../blueprint/factory";
import { convertLegacyBonus } from "../legacy/adapter";
import { LEGACY_FIXTURES } from "../legacy/fixtures";
import { backupPath, planMigration } from "./migration";
import { MODULE_SCOPE } from "./repository";

/** Apply `flags.build-n-action.*` changes to a flag scope, as document.update would. */
function applied(scope: Record<string, unknown>, changes: Record<string, unknown> | null): Record<string, unknown> {
  const next = { ...scope };
  for (const [key, value] of Object.entries(changes ?? {})) next[key.slice(`flags.${MODULE_SCOPE}.`.length)] = value;
  return next;
}

describe("planMigration", () => {
  it("converts every v1 bonus, retires the originals to the backup and keeps stored blueprints", () => {
    const kept = createBlueprint({ id: "kEEp5gH7jK9mN1p0", name: "Kept" });
    const scope = { blueprints: [kept], bonuses: [LEGACY_FIXTURES.attackAura, LEGACY_FIXTURES.damageOptional] };
    const plan = planMigration(scope, "item");
    expect(plan.converted).toBe(2);
    expect(plan.failed).toBe(0);
    const next = applied(scope, plan.changes);
    const ids = (next.blueprints as { id: string }[]).map(entry => entry.id);
    expect(ids[0]).toBe(kept.id);
    expect(ids.slice(1).sort()).toEqual([LEGACY_FIXTURES.attackAura.id, LEGACY_FIXTURES.damageOptional.id].sort());
    expect(next.bonuses).toEqual([]);
    expect(Object.keys(next.legacyBackup as object).sort()).toEqual([LEGACY_FIXTURES.attackAura.id, LEGACY_FIXTURES.damageOptional.id].sort());
  });

  it("is idempotent", () => {
    const scope = { bonuses: [LEGACY_FIXTURES.attackAura] };
    const next = applied(scope, planMigration(scope, "item").changes);
    expect(planMigration(next, "item")).toMatchObject({ converted: 0, changes: null });
  });

  it("retires a bonus shadowed by a stored blueprint with the same id", () => {
    const stored = createBlueprint({ id: LEGACY_FIXTURES.attackAura.id, name: "Already saved" });
    const plan = planMigration({ blueprints: [stored], bonuses: [LEGACY_FIXTURES.attackAura] }, "item");
    expect(plan.converted).toBe(0);
    const next = applied({ blueprints: [stored], bonuses: [LEGACY_FIXTURES.attackAura] }, plan.changes);
    expect(next.bonuses).toEqual([]);
    expect(Object.keys(next.legacyBackup as object)).toEqual([LEGACY_FIXTURES.attackAura.id]);
    expect((next.blueprints as { name: string }[])[0]?.name).toBe("Already saved");
  });

  it("leaves bonuses it cannot convert and counts them", () => {
    const plan = planMigration({ bonuses: [{ id: "BadBonus00000001", type: "bogus" }] }, "item");
    expect(plan).toMatchObject({ converted: 0, failed: 1, changes: null });
  });

  it("has nothing to do without bonuses", () => {
    expect(planMigration({ blueprints: [] }, "actor")).toEqual({ converted: 0, failed: 0, repaired: 0, issues: [], changes: null });
  });
});

describe("planMigration repairs", () => {
  it("removes the hit-point check 2.0.0 added from a v1 filter that was off, using the backup", () => {
    const original = { ...LEGACY_FIXTURES.attackAura, filters: { creatureTypes: ["undead"], healthPercentages: { value: 50, type: null } } };
    const fixed = convertLegacyBonus(original, "item").blueprint;
    if (!fixed) throw new Error("not converted");
    const stale = { id: "c-healthPercentages", type: "healthPercentages", data: { value: 50, type: "atMost" } };
    const migrated = {
      ...fixed,
      nodes: fixed.nodes.map(node => (node.id === "condition") ? { ...node, data: { ...node.data, checks: [...(node.data.checks as unknown[]), stale] } } : node)
    };
    const scope = { blueprints: [migrated], bonuses: [], legacyBackup: { [original.id]: original } };
    const plan = planMigration(scope, "item");
    expect(plan).toMatchObject({ converted: 0, repaired: 1 });
    const next = applied(scope, plan.changes);
    expect(next.blueprints).toEqual([fixed]);
    expect(planMigration(next, "item")).toMatchObject({ repaired: 0, changes: null });
  });

  it("repairs nothing without a backup", () => {
    const blueprint = convertLegacyBonus(LEGACY_FIXTURES.attackAura, "item").blueprint;
    expect(planMigration({ blueprints: [blueprint] }, "item")).toMatchObject({ repaired: 0, changes: null });
  });
});

describe("backupPath", () => {
  it("names the backup flag to delete when there is one", () => {
    expect(backupPath({ legacyBackup: { a: {} } })).toBe(`flags.${MODULE_SCOPE}.legacyBackup`);
    expect(backupPath({ legacyBackup: {} })).toBeNull();
    expect(backupPath({})).toBeNull();
  });
});
