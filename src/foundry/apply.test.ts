import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainIntent } from "../core/engine/interpreter";
import { applyRollIntents, type ApplyContext } from "./apply";

function bonus(formula: string, nodeId: string): ChainIntent {
  return { type: "rollBonus", data: { formula }, blueprintId: "bp", nodeId, entry: {}, common: {} } as unknown as ChainIntent;
}

const ctx = { event: "attackRoll", roller: { rollData: {}, details: {} }, sources: new Map() } as unknown as ApplyContext;

beforeEach(() => {
  vi.stubGlobal("Roll", { validate: (formula: string) => !/\+\s*$|^\d+d\s/.test(formula) });
  vi.stubGlobal("game", { settings: { get: () => false } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applyRollIntents", () => {
  it("skips a bonus whose formula does not parse, so the roll and the other bonuses go on", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const config = { rolls: [{ parts: ["1d20"] }] };
    applyRollIntents(config, [bonus("2d +", "broken"), bonus("19", "fine")], ctx, { active: [], halted: new Set() });
    applyRollIntents(config, [bonus("2d +", "broken")], ctx, { active: [], halted: new Set() });
    expect(config.rolls[0]?.parts).toEqual(["1d20", "19"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
