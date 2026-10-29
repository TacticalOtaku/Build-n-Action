import { describe, expect, it } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { makeNode } from "../../core/testing/graph";
import { eventOptions, outcomeOptions } from "./outcomes";

describe("outcomeOptions", () => {
  it("fires the pins play would fire", () => {
    expect(outcomeOptions("afterAttack")).toEqual([
      { id: "hit", pins: ["hit"] },
      { id: "crit", pins: ["hit", "crit"] },
      { id: "miss", pins: ["miss"] },
      { id: "fumble", pins: ["miss", "fumble"] }
    ]);
    expect(outcomeOptions("afterDamage").map(option => option.pins)).toEqual([["dealt"], ["dealt", "dropped"]]);
    expect(outcomeOptions("afterTargetSave").map(option => option.id)).toEqual(["failed", "succeeded"]);
    expect(outcomeOptions("afterCheck").map(option => option.id)).toEqual(["success", "failure"]);
  });

  it("has no outcomes for rolls and signals", () => {
    expect(outcomeOptions("damageRoll")).toEqual([]);
    expect(outcomeOptions("signal")).toEqual([]);
  });
});

describe("eventOptions", () => {
  it("offers each event type once and each signal name once", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "a"),
        makeNode("event", "damageRoll", "b"),
        makeNode("event", "signal", "s1", { name: "smite" }),
        makeNode("event", "signal", "s2", { name: "smite" }),
        makeNode("event", "signal", "s3", { name: "" }),
        makeNode("result", "rollBonus", "r")
      ]
    });
    expect(eventOptions(blueprint)).toEqual([
      { key: "damageRoll", event: "damageRoll", signal: null },
      { key: "signal:smite", event: "signal", signal: "smite" }
    ]);
  });
});
