import { describe, expect, it } from "vitest";
import type { BlueprintNode } from "../blueprint/types";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { canConnect, outputPins, wouldCreateCycle } from "./connections";

function withThen(node: BlueprintNode): BlueprintNode {
  return { ...node, data: { ...node.data, common: { ...(node.data.common as object), then: true } } };
}

const graph = {
  nodes: [
    makeNode("event", "attackRoll", "ev"),
    makeNode("event", "afterAttack", "after"),
    makeCondition("if", []),
    makeCondition("if2", []),
    makeNode("result", "rollBonus", "bonus")
  ],
  edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "if2")]
};

describe("outputPins", () => {
  it("reads event pins from the registry", () => {
    expect(outputPins(makeNode("event", "attackRoll", "a"))).toEqual(["out"]);
    expect(outputPins(makeNode("event", "afterAttack", "a"))).toEqual(["hit", "miss", "crit", "fumble"]);
    expect(outputPins({ kind: "event", type: "nope", data: {} })).toEqual([]);
  });

  it("gives conditions yes/no and results an output only with \"And then\" on", () => {
    expect(outputPins(makeCondition("c", []))).toEqual(["yes", "no"]);
    expect(outputPins(makeNode("result", "rollBonus", "r"))).toEqual([]);
    expect(outputPins(withThen(makeNode("result", "rollBonus", "r")))).toEqual(["then"]);
  });
});

describe("outputPins of a demanded save", () => {
  it("gives a demanded save its own outputs and never \"And then\"", () => {
    expect(outputPins(makeNode("result", "demandSave", "save"))).toEqual(["succeeded", "failed"]);
    expect(outputPins(withThen(makeNode("result", "demandSave", "save")))).toEqual(["succeeded", "failed"]);
  });
});

describe("canConnect", () => {
  it("accepts a valid wire", () => {
    expect(canConnect(graph, { source: "if2", sourcePin: "yes", target: "bonus" })).toEqual({ ok: true });
  });

  it("accepts a second event wired into the same condition", () => {
    expect(canConnect(graph, { source: "after", sourcePin: "hit", target: "if" })).toEqual({ ok: true });
  });

  it("accepts a wire from a result's \"And then\" output", () => {
    const withOutput = { ...graph, nodes: [...graph.nodes, withThen(makeNode("result", "applyEffect", "effect"))] };
    expect(canConnect(withOutput, { source: "effect", sourcePin: "then", target: "if2" })).toEqual({ ok: true });
    expect(canConnect(withOutput, { source: "effect", sourcePin: "yes", target: "if2" })).toEqual({ ok: false, reason: "unknownPin" });
  });

  it.each([
    ["missingNode", { source: "ev", sourcePin: "out", target: "nope" }],
    ["selfLoop", { source: "if", sourcePin: "yes", target: "if" }],
    ["intoEvent", { source: "if", sourcePin: "yes", target: "ev" }],
    ["fromResult", { source: "bonus", sourcePin: "out", target: "if" }],
    ["unknownPin", { source: "ev", sourcePin: "hit", target: "bonus" }],
    ["duplicate", { source: "ev", sourcePin: "out", target: "if" }],
    ["cycle", { source: "if2", sourcePin: "no", target: "if" }]
  ])("rejects %s", (reason, request) => {
    expect(canConnect(graph, request)).toEqual({ ok: false, reason });
  });
});

describe("wouldCreateCycle", () => {
  it("detects a path back to the source", () => {
    expect(wouldCreateCycle([{ source: "a", target: "b" }, { source: "b", target: "c" }], "c", "a")).toBe(true);
  });

  it("allows unrelated wires", () => {
    expect(wouldCreateCycle([{ source: "a", target: "b" }], "a", "c")).toBe(false);
  });
});
