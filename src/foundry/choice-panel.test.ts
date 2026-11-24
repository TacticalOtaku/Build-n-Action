import { describe, expect, it } from "vitest";
import { syncDialogAdvantage } from "./choice-panel";

describe("syncDialogAdvantage", () => {
  it("sets defaultButton on plain dialog configs and on getter-only ApplicationV2 dialogs without throwing", () => {
    const plain: Record<string, unknown> = {};
    syncDialogAdvantage(plain, { advantage: true, disadvantage: false, rolls: [{ parts: ["1d20"] }] });
    expect(plain.options).toEqual({ defaultButton: "advantage" });

    const appOpts: Record<string, unknown> = { advantageMode: 0, defaultButton: "normal" };
    const app = {
      get options() {
        return appOpts;
      },
    };
    expect(() =>
      syncDialogAdvantage(app, { advantage: false, disadvantage: true, rolls: [{}] }),
    ).not.toThrow();
    expect(appOpts).toEqual({ advantageMode: -1, defaultButton: "disadvantage" });

    // Mutual cancellation returns to normal even when advantageMode was preset.
    syncDialogAdvantage(app, { advantage: true, disadvantage: true, rolls: [{}] });
    expect(appOpts).toEqual({ advantageMode: 0, defaultButton: "normal" });

    // Real ApplicationV2 dialogs call Object.freeze(this.options) in their constructor.
    const frozenApp: { options: Record<string, unknown> } = {
      options: Object.freeze({ advantageMode: 0, defaultButton: "normal" }),
    };
    expect(() =>
      syncDialogAdvantage(frozenApp, { advantage: true, disadvantage: false, rolls: [{}] }),
    ).not.toThrow();
    expect(frozenApp.options).toEqual({ advantageMode: 1, defaultButton: "advantage" });
    expect(Object.isFrozen(frozenApp.options)).toBe(true);
  });
});
