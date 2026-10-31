import { afterEach, describe, expect, it, vi } from "vitest";
import { executeOperation } from "./operations";

// Copying must preserve exact source identity without overwriting origin or other modules' flags.
afterEach(() => vi.unstubAllGlobals());
describe("copied effect provenance", () => {
  it("preserves the original and immediate sources across repeated copies", async () => {
    let created: Record<string, unknown>[] = [];
    const original = { _id: "copy", name: "Custom", flags: { other: { value: 7 }, "build-n-action": { markers: ["hex"], effectSources: ["Item.staff.ActiveEffect.original"] } } };
    const source = { documentName: "ActiveEffect", uuid: "Actor.hero.ActiveEffect.copy", ...original, toObject: () => structuredClone(original) };
    const actor = { documentName: "Actor", uuid: "Actor.target", createEmbeddedDocuments: async (_type: string, rows: Record<string, unknown>[]) => { created = rows; } };
    vi.stubGlobal("fromUuid", async (uuid: string) => uuid === actor.uuid ? actor : source);
    await executeOperation({ kind: "copyEffect", actor: actor.uuid, effect: source.uuid, origin: "Item.newOrigin" });
    expect(created[0]).toMatchObject({ origin: "Item.newOrigin", disabled: false, transfer: false, flags: { other: { value: 7 }, "build-n-action": { markers: ["hex"], effectSources: ["Actor.hero.ActiveEffect.copy", "Item.staff.ActiveEffect.original"] } } });
    expect(created[0]).not.toHaveProperty("_id");
    expect(original.flags["build-n-action"].effectSources).toEqual(["Item.staff.ActiveEffect.original"]);
  });
});
