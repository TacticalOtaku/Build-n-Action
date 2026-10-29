import { describe, expect, it } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { makeEdge, makeNode } from "../core/testing/graph";
import { createOnce, needsRegionBehavior, restEvent, turnTransitions } from "./triggers";

describe("turnTransitions", () => {
  it("ends the previous turn and starts the current one when combat moves forward", () => {
    expect(turnTransitions({ round: 1, turn: 0, combatantId: "a" }, { round: 1, turn: 1, combatantId: "b" })).toEqual([
      { event: "turnEnd", combatantId: "a", round: 1, turn: 0 },
      { event: "turnStart", combatantId: "b", round: 1, turn: 1 }
    ]);
    expect(turnTransitions({ round: 1, turn: 2, combatantId: "c" }, { round: 2, turn: 0, combatantId: "a" })).toHaveLength(2);
  });

  it("only starts the first turn when combat begins", () => {
    expect(turnTransitions({ round: 0, turn: null, combatantId: null }, { round: 1, turn: 0, combatantId: "a" })).toEqual([
      { event: "turnStart", combatantId: "a", round: 1, turn: 0 }
    ]);
  });

  it("does nothing when combat goes back or stays", () => {
    expect(turnTransitions({ round: 2, turn: 1, combatantId: "b" }, { round: 2, turn: 0, combatantId: "a" })).toEqual([]);
    expect(turnTransitions({ round: 2, turn: 1, combatantId: "b" }, { round: 2, turn: 1, combatantId: "b" })).toEqual([]);
    expect(turnTransitions(null, null)).toEqual([]);
  });
});

describe("restEvent", () => {
  it("maps dnd5e rest types", () => {
    expect(restEvent("short")).toBe("shortRest");
    expect(restEvent("long")).toBe("longRest");
    expect(restEvent("other")).toBeNull();
  });
});

describe("createOnce", () => {
  it("lets each key through once while it is remembered", () => {
    const once = createOnce(1000);
    expect(once("a", 0)).toBe(true);
    expect(once("a", 500)).toBe(false);
    expect(once("b", 500)).toBe(true);
    expect(once("a", 2000)).toBe(true);
  });
});

describe("needsRegionBehavior", () => {
  it("is true when a blueprint starts on entering or leaving the region", () => {
    const enter = createBlueprint({ nodes: [makeNode("event", "regionEnter", "ev"), makeNode("result", "reminder", "r")], edges: [makeEdge("ev", "out", "r")] });
    const roll = createBlueprint({ nodes: [makeNode("event", "attackRoll", "ev")], edges: [] });
    expect(needsRegionBehavior([roll, enter])).toBe(true);
    expect(needsRegionBehavior([roll])).toBe(false);
  });
});
