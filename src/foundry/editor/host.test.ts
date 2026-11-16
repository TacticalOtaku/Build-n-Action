import { afterEach, describe, expect, it, vi } from "vitest";
import { createFoundryHost } from "./host";

afterEach(() => vi.unstubAllGlobals());

describe("Foundry editor host effect selection", () => {
  it("lists accessible carrier effects and resolves an exact effect reference", async () => {
    const effect = { documentName: "ActiveEffect", uuid: "Item.staff.ActiveEffect.hex", name: "Custom Hex", isOwner: true };
    vi.stubGlobal("game", { user: { isGM: false }, i18n: { lang: "en", localize: (k: string) => k } });
    vi.stubGlobal("fromUuid", async () => effect);
    const carrier = { documentName: "Item", uuid: "Item.staff", effects: [effect] } as unknown as FoundryDocument;
    const selection = createFoundryHost(carrier).effectSelection!;
    expect(selection.choices()).toEqual([{ uuid: "Item.staff.ActiveEffect.hex", name: "Custom Hex" }]);
    expect(await selection.resolve("Item.staff.ActiveEffect.hex")).toEqual({ uuid: "Item.staff.ActiveEffect.hex", name: "Custom Hex" });
  });

  it("rejects inaccessible effects, item UUIDs and wrong document types", async () => {
    vi.stubGlobal("game", { user: { isGM: false }, i18n: { lang: "en", localize: (k: string) => k } });
    vi.stubGlobal("fromUuid", async () => ({ documentName: "ActiveEffect", uuid: "Item.staff.ActiveEffect.hex", name: "Secret", isOwner: false }));
    const selection = createFoundryHost({ documentName: "Item", uuid: "Item.staff" } as unknown as FoundryDocument).effectSelection!;
    expect(await selection.resolve("Item.staff.ActiveEffect.hex")).toBeNull();
    expect(await selection.resolve("Item.staff")).toBeNull();
    vi.stubGlobal("game", { user: { isGM: true }, i18n: { lang: "en", localize: (k: string) => k } });
    vi.stubGlobal("fromUuid", async () => ({ documentName: "Item", uuid: "Item.staff.ActiveEffect.hex", name: "Wrong type" }));
    expect(await selection.resolve("Item.staff.ActiveEffect.hex")).toBeNull();
  });

  it("returns no reference if document loading fails", async () => {
    vi.stubGlobal("game", { user: { isGM: false }, i18n: { lang: "en", localize: (k: string) => k } });
    vi.stubGlobal("fromUuid", async () => { throw new Error("Missing compendium"); });
    const selection = createFoundryHost({ documentName: "Item", uuid: "Item.staff" } as unknown as FoundryDocument).effectSelection!;
    expect(await selection.resolve("Item.staff.ActiveEffect.hex")).toBeNull();
  });
});
