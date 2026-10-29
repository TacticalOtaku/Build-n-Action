import { afterEach, describe, expect, it, vi } from "vitest";
import { createWaiter, outcomePin, pickSaveUser, saveDcFormula, saveKey, type SaveUser } from "./saves";

const user = (id: string, extra: Partial<SaveUser> = {}): SaveUser => ({ id, isGM: false, active: true, owner: true, character: false, ...extra });

describe("pickSaveUser", () => {
  it("prefers the active owner whose character it is", () => {
    expect(pickSaveUser([user("a"), user("b", { character: true })])).toBe("b");
    expect(pickSaveUser([user("a"), user("b")])).toBe("a");
  });

  it("skips GMs, absent users and non-owners", () => {
    expect(pickSaveUser([user("gm", { isGM: true }), user("away", { active: false }), user("other", { owner: false })])).toBeNull();
  });
});

describe("createWaiter", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves with the answer", async () => {
    const waiter = createWaiter<number>();
    const pending = waiter.wait("r1", 30_000);
    expect(waiter.answer("r1", 17)).toBe(true);
    await expect(pending).resolves.toBe(17);
    expect(waiter.answer("r1", 3)).toBe(false);
  });

  it("gives null when the time runs out", async () => {
    vi.useFakeTimers();
    const waiter = createWaiter<number>();
    const pending = waiter.wait("r2", 30_000);
    vi.advanceTimersByTime(30_000);
    await expect(pending).resolves.toBeNull();
    expect(waiter.answer("r2", 5)).toBe(false);
  });
});

describe("save helpers", () => {
  it("keys a save by run, blueprint, node and saver", () => {
    expect(saveKey("midi:card", "aB3dE5gH7jK9mN1p", "save", "Actor.foe")).toBe("midi:card|aB3dE5gH7jK9mN1p|save|Actor.foe");
  });

  it("reads the DC as a formula or my spell DC", () => {
    expect(saveDcFormula({ dcMode: "formula", dc: " 8 + @prof " })).toBe("8 + @prof");
    expect(saveDcFormula({ dcMode: "formula", dc: "" })).toBe("10");
    expect(saveDcFormula({ dcMode: "spell", dc: "13" })).toBe("@attributes.spell.dc");
  });

  it("names the outcome pin", () => {
    expect(outcomePin(true)).toBe("succeeded");
    expect(outcomePin(false)).toBe("failed");
  });
});
