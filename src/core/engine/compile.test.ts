import { describe, expect, it } from "vitest";
import { createBlueprint } from "../blueprint/factory";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { compileBlueprint } from "./compile";

const blueprint = createBlueprint({
  nodes: [
    makeNode("event", "afterAttack", "ev"),
    makeCondition("if", [{ id: "c", type: "creatureTypes", data: { values: ["undead"] } }], "any"),
    makeNode("result", "applyEffect", "apply"),
    makeNode("result", "rider", "rider")
  ],
  edges: [makeEdge("ev", "hit", "if"), makeEdge("if", "no", "apply"), makeEdge("ev", "crit", "rider")]
});

describe("compileBlueprint", () => {
  it("turns routes into paths with their guards and wires", () => {
    const compiled = compileBlueprint(blueprint);
    expect(compiled.paths.map(path => [path.pin, path.guards.map(guard => [guard.node.id, guard.expect, guard.mode]), path.result.id, path.hops]))
      .toEqual([
        ["hit", [["if", false, "any"]], "apply", ["ev-hit-if", "if-no-apply"]],
        ["crit", [], "rider", ["ev-crit-rider"]]
      ]);
    expect(compiled.paths[0]?.guards[0]?.checks).toHaveLength(1);
  });

  it("indexes paths by event type", () => {
    const compiled = compileBlueprint(blueprint);
    expect(compiled.pathsFor("afterAttack")).toHaveLength(2);
    expect(compiled.pathsFor("damageRoll")).toEqual([]);
  });

  it("caches per source object", () => {
    expect(compileBlueprint(blueprint)).toBe(compileBlueprint(blueprint));
    expect(compileBlueprint({ ...blueprint })).not.toBe(compileBlueprint(blueprint));
  });
});
