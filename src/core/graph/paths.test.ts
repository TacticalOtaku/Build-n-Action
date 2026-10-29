import { describe, expect, it } from "vitest";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { enumeratePaths } from "./paths";

const damage = makeNode("event", "damageRoll", "ev");
const afterAttack = makeNode("event", "afterAttack", "hit");
const undead = makeCondition("if", [{ id: "c", type: "creatureTypes", data: { values: ["undead"] } }]);
const empty = makeCondition("if2", []);
const bonus = makeNode("result", "rollBonus", "bonus");
const note = makeNode("result", "reminder", "note");

describe("enumeratePaths", () => {
  it("follows a direct wire from an event to a result", () => {
    expect(enumeratePaths({ nodes: [damage, bonus], edges: [makeEdge("ev", "out", "bonus")] })).toEqual([
      { eventNodeId: "ev", eventPin: "out", guards: [], resultNodeId: "bonus" }
    ]);
  });

  it("records condition polarity", () => {
    const paths = enumeratePaths({
      nodes: [damage, undead, bonus, note],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus"), makeEdge("if", "no", "note")]
    });
    expect(paths).toEqual([
      { eventNodeId: "ev", eventPin: "out", guards: [{ nodeId: "if", expect: true }], resultNodeId: "bonus" },
      { eventNodeId: "ev", eventPin: "out", guards: [{ nodeId: "if", expect: false }], resultNodeId: "note" }
    ]);
  });

  it("accumulates guards along chained conditions", () => {
    const paths = enumeratePaths({
      nodes: [damage, undead, empty, bonus],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "if2"), makeEdge("if2", "no", "bonus")]
    });
    expect(paths[0]?.guards).toEqual([{ nodeId: "if", expect: true }, { nodeId: "if2", expect: false }]);
  });

  it("keeps the outcome pin of a reaction event", () => {
    const paths = enumeratePaths({
      nodes: [afterAttack, bonus, note],
      edges: [makeEdge("hit", "crit", "bonus"), makeEdge("hit", "miss", "note")]
    });
    expect(paths.map(path => [path.eventPin, path.resultNodeId])).toEqual([["crit", "bonus"], ["miss", "note"]]);
  });

  it("produces one path per event when wires fan into the same condition", () => {
    const paths = enumeratePaths({
      nodes: [damage, afterAttack, undead, bonus],
      edges: [makeEdge("ev", "out", "if"), makeEdge("hit", "hit", "if"), makeEdge("if", "yes", "bonus")]
    });
    expect(paths.map(path => path.eventNodeId)).toEqual(["ev", "hit"]);
  });

  it("enumerates continuations from results' \"And then\" outputs", () => {
    const smite = makeNode("result", "rollBonus", "smite", { common: { optional: true, choiceGroup: "", cost: { type: "none" }, limit: "none", then: true } });
    const blind = makeNode("result", "applyEffect", "blind");
    const graph = {
      nodes: [damage, smite, undead, blind, note],
      edges: [makeEdge("ev", "out", "smite"), makeEdge("smite", "then", "if"), makeEdge("if", "yes", "blind"), makeEdge("if", "no", "note")]
    };
    expect(enumeratePaths(graph)).toEqual([{ eventNodeId: "ev", eventPin: "out", guards: [], resultNodeId: "smite" }]);
    expect(enumeratePaths(graph, "results")).toEqual([
      { eventNodeId: "smite", eventPin: "then", guards: [{ nodeId: "if", expect: true }], resultNodeId: "blind" },
      { eventNodeId: "smite", eventPin: "then", guards: [{ nodeId: "if", expect: false }], resultNodeId: "note" }
    ]);
  });

  it("ignores dangling wires, wires out of results and loops", () => {
    const loop = makeCondition("loop", []);
    const paths = enumeratePaths({
      nodes: [damage, loop, bonus],
      edges: [
        makeEdge("ev", "out", "missing"),
        makeEdge("bonus", "out", "ev"),
        makeEdge("ev", "out", "loop"),
        makeEdge("loop", "yes", "loop"),
        makeEdge("loop", "no", "bonus")
      ]
    });
    expect(paths).toEqual([
      { eventNodeId: "ev", eventPin: "out", guards: [{ nodeId: "loop", expect: false }], resultNodeId: "bonus" }
    ]);
  });
});
