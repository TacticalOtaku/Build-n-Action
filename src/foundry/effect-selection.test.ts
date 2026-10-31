import { afterEach, describe, expect, it, vi } from "vitest";
import { createEffectSelectionHost } from "./effect-selection";

afterEach(() => vi.unstubAllGlobals());
describe("effect selection host", () => {
  it("lists accessible carrier effects and resolves an exact effect reference", async () => {
    const effect = { documentName: "ActiveEffect", uuid: "Item.staff.ActiveEffect.hex", name: "Custom Hex", isOwner: true };
    vi.stubGlobal("game", { user: { isGM: false } });
    vi.stubGlobal("fromUuid", async () => effect);
    const host = createEffectSelectionHost({ effects: [effect] });
    expect(host.choices()).toEqual([{ uuid: "Item.staff.ActiveEffect.hex", name: "Custom Hex" }]);
    expect(await host.resolve("Item.staff.ActiveEffect.hex")).toEqual({ uuid: "Item.staff.ActiveEffect.hex", name: "Custom Hex" });
  });
  it("rejects inaccessible effects, item UUIDs and wrong document types", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });
    vi.stubGlobal("fromUuid", async () => ({ documentName: "ActiveEffect", uuid: "Item.staff.ActiveEffect.hex", name: "Secret", isOwner: false }));
    const host = createEffectSelectionHost(null);
    expect(await host.resolve("Item.staff.ActiveEffect.hex")).toBeNull();
    expect(await host.resolve("Item.staff")).toBeNull();
    vi.stubGlobal("game", { user: { isGM: true } });
    vi.stubGlobal("fromUuid", async () => ({ documentName: "Item", uuid: "Item.staff.ActiveEffect.hex", name: "Wrong type" }));
    expect(await host.resolve("Item.staff.ActiveEffect.hex")).toBeNull();
  });
  it("returns no reference if document loading fails", async () => {
    vi.stubGlobal("fromUuid", async () => { throw new Error("Missing compendium"); });
    expect(await createEffectSelectionHost(null).resolve("Item.staff.ActiveEffect.hex")).toBeNull();
  });
});
