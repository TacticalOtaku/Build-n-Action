import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGACY_FIXTURES } from "../core/legacy/fixtures";
import { deleteBackups, runMigration, scanMigration } from "./migration";

function doc(documentName: string, name: string, flags: Record<string, unknown>, embedded: Record<string, unknown> = {}) {
  const updates: Record<string, unknown>[] = [];
  return {
    documentName, name, uuid: `${documentName}.${name}`, flags: { "build-n-action": flags }, updates, ...embedded,
    update(changes: Record<string, unknown>) {
      updates.push(changes);
      return Promise.resolve(this);
    }
  };
}

function world(parts: { actors?: unknown[]; items?: unknown[]; scenes?: unknown[] }) {
  vi.stubGlobal("game", {
    actors: parts.actors ?? [],
    items: parts.items ?? [],
    scenes: parts.scenes ?? [],
    packs: Object.assign([], { get: () => undefined })
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("world migration", () => {
  it("scans actors with their items and effects, world items and scene regions", async () => {
    const sword = doc("Item", "Sword", { bonuses: [LEGACY_FIXTURES.attackAura] });
    const hero = doc("Actor", "Hero", {}, { items: [sword], effects: [] });
    const region = doc("Region", "Shrine", { bonuses: [LEGACY_FIXTURES.optionalAttack] });
    const broken = doc("Item", "Broken", { bonuses: [{ id: "BadBonus00000001", type: "bogus" }] });
    world({ actors: [hero], items: [broken], scenes: [{ regions: [region], templates: [] }] });
    const report = await scanMigration();
    expect(report).toMatchObject({ documents: 3, converted: 2, failed: 1, errors: 0 });
    expect(report.entries.map(entry => entry.label)).toEqual(["Sword", "Broken", "Shrine"]);
    expect(sword.updates).toEqual([]);
  });

  it("migrates each document once and keeps going past errors", async () => {
    const sword = doc("Item", "Sword", { bonuses: [LEGACY_FIXTURES.attackAura] });
    const cursed = doc("Item", "Cursed", { bonuses: [LEGACY_FIXTURES.optionalAttack] });
    cursed.update = () => Promise.reject(new Error("locked"));
    world({ items: [sword, cursed] });
    const progress: number[] = [];
    const report = await runMigration({ onProgress: done => progress.push(done) });
    expect(report).toMatchObject({ documents: 2, converted: 1, errors: 1 });
    expect(report.entries.find(entry => entry.label === "Cursed")?.error).toBe("locked");
    expect(sword.updates).toHaveLength(1);
    expect(progress.at(-1)).toBe(2);
  });

  it("limits a run to the documents a filter includes", async () => {
    const mine = doc("Item", "BNA Live Sword", { bonuses: [LEGACY_FIXTURES.attackAura] });
    const theirs = doc("Item", "Their Sword", { bonuses: [LEGACY_FIXTURES.optionalAttack] });
    world({ items: [mine, theirs] });
    const report = await runMigration({ include: document => document.name.startsWith("BNA Live") });
    expect(report.entries.map(entry => entry.label)).toEqual(["BNA Live Sword"]);
    expect(theirs.updates).toEqual([]);
  });

  it("deletes backups where there are any, with the v14 deletion operator", async () => {
    class ForcedDeletion {}
    vi.stubGlobal("foundry", { data: { operators: { ForcedDeletion, ForcedReplacement: { create: (value: unknown) => ({ replace: value }) } } } });
    const kept = doc("Item", "Kept", { legacyBackup: { x: {} } });
    const clean = doc("Item", "Clean", {});
    world({ items: [kept, clean] });
    expect(await deleteBackups()).toBe(1);
    expect(Object.keys(kept.updates[0] ?? {})).toEqual(["flags.build-n-action.legacyBackup"]);
    expect(kept.updates[0]?.["flags.build-n-action.legacyBackup"]).toBeInstanceOf(ForcedDeletion);
    expect(JSON.stringify(kept.updates)).not.toContain("-=");
    expect(clean.updates).toEqual([]);
  });
});
