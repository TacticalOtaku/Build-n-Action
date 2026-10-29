import { describe, expect, it } from "vitest";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { resultEvents, upstreamEvents } from "./upstream";

const graph = {
  nodes: [
    makeNode("event", "damageRoll", "dmg"),
    makeNode("event", "afterAttack", "after"),
    makeCondition("if", []),
    makeCondition("dangling", []),
    makeNode("result", "rollBonus", "bonus"),
    makeNode("result", "reminder", "loose")
  ],
  edges: [
    makeEdge("dmg", "out", "if"),
    makeEdge("after", "hit", "if"),
    makeEdge("if", "yes", "bonus"),
    makeEdge("dmg", "out", "dangling")
  ]
};

describe("upstreamEvents", () => {
  it("returns the event's own type for an event", () => {
    expect(upstreamEvents(graph, "after")).toEqual(["afterAttack"]);
  });

  it("collects every event that reaches a node", () => {
    expect(upstreamEvents(graph, "bonus")).toEqual(["damageRoll", "afterAttack"]);
  });

  it("works for conditions that lead nowhere yet", () => {
    expect(upstreamEvents(graph, "dangling")).toEqual(["damageRoll"]);
  });

  it("returns nothing for unconnected or unknown nodes", () => {
    expect(upstreamEvents(graph, "loose")).toEqual([]);
    expect(upstreamEvents(graph, "missing")).toEqual([]);
  });
});

describe("resultEvents", () => {
  const chained = {
    nodes: [...graph.nodes, makeCondition("after-then", [])],
    edges: [...graph.edges, makeEdge("bonus", "then", "after-then")]
  };

  it("gives the events a result placed here would follow", () => {
    expect(resultEvents(graph, "if")).toEqual(["damageRoll", "afterAttack"]);
    expect(resultEvents(graph, "dmg")).toEqual(["damageRoll"]);
  });

  it("names a demanded save's branch by the pin it leaves from", () => {
    const save = {
      nodes: [makeNode("event", "afterAttack", "hit"), makeNode("result", "demandSave", "save"), makeCondition("branch", [])],
      edges: [makeEdge("hit", "hit", "save"), makeEdge("save", "failed", "branch")]
    };
    expect(resultEvents(save, "save", "failed")).toEqual(["demandedSave"]);
    expect(resultEvents(save, "branch")).toEqual(["demandedSave"]);
    expect(resultEvents(save, "save")).toEqual(["afterResult"]);
  });

  it("stands a result on the way for its continuation", () => {
    expect(resultEvents(chained, "bonus")).toEqual(["afterResult"]);
    expect(resultEvents(chained, "after-then")).toEqual(["afterResult"]);
  });
});
