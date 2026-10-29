import { describe, expect, it } from "vitest";
import { attackPins, checkPins, damagePins, midiAttackPins, savePins } from "./outcomes";

describe("attack pins", () => {
  it("compares the total with the target's AC", () => {
    expect(attackPins({ total: 15, targetAc: 15, isCritical: false, isFumble: false })).toEqual(["hit"]);
    expect(attackPins({ total: 14, targetAc: 15, isCritical: false, isFumble: false })).toEqual(["miss"]);
  });

  it("lets criticals hit and fumbles miss whatever the AC", () => {
    expect(attackPins({ total: 3, targetAc: 30, isCritical: true, isFumble: false })).toEqual(["hit", "crit"]);
    expect(attackPins({ total: 40, targetAc: 10, isCritical: false, isFumble: true })).toEqual(["miss", "fumble"]);
  });

  it("fires no hit or miss without a target", () => {
    expect(attackPins({ total: 15, targetAc: null, isCritical: false, isFumble: false })).toEqual([]);
    expect(attackPins({ total: 15, targetAc: null, isCritical: true, isFumble: false })).toEqual(["hit", "crit"]);
  });

  it("follows Midi's hit decision", () => {
    expect(midiAttackPins(true, false, false)).toEqual(["hit"]);
    expect(midiAttackPins(true, true, false)).toEqual(["hit", "crit"]);
    expect(midiAttackPins(false, true, false)).toEqual(["miss"]);
    expect(midiAttackPins(false, false, true)).toEqual(["miss", "fumble"]);
  });
});

describe("other pins", () => {
  it("reports saves", () => {
    expect(savePins(true)).toEqual(["succeeded"]);
    expect(savePins(false)).toEqual(["failed"]);
  });

  it("reports damage and dropping to 0 HP", () => {
    expect(damagePins(7, 3)).toEqual(["dealt"]);
    expect(damagePins(7, 0)).toEqual(["dealt", "dropped"]);
    expect(damagePins(7, null)).toEqual(["dealt"]);
    expect(damagePins(0, 0)).toEqual([]);
    expect(damagePins(-5, 10)).toEqual([]);
  });

  it("reports checks only when they have a DC", () => {
    expect(checkPins(15, 15)).toEqual(["success"]);
    expect(checkPins(14, 15)).toEqual(["failure"]);
    expect(checkPins(14, null)).toEqual([]);
    expect(checkPins(null, 15)).toEqual([]);
  });
});
