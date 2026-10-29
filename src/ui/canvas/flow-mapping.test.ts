import { describe, expect, it } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import { toFlowEdges, toFlowNodes } from "./flow-mapping";

const blueprint = createBlueprint({
  nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", []), makeNode("result", "rollBonus", "bonus")],
  edges: [makeEdge("ev", "out", "if"), makeEdge("if", "no", "bonus")]
});

describe("toFlowNodes", () => {
  it("maps kind to the React Flow node type and keeps positions", () => {
    const nodes = toFlowNodes(blueprint, [], {}, null);
    expect(nodes.map(node => [node.id, node.type])).toEqual([["ev", "event"], ["if", "condition"], ["bonus", "result"]]);
    expect(nodes[0]?.data.node).toBe(blueprint.nodes[0]);
    expect(nodes[0]?.data.status).toBeNull();
  });

  it("marks selection and measured sizes", () => {
    const nodes = toFlowNodes(blueprint, ["if"], { if: { width: 200, height: 90 } }, null);
    expect(nodes[1]).toMatchObject({ selected: true, measured: { width: 200, height: 90 } });
    expect(nodes[0]?.selected).toBe(false);
    expect(nodes[0]).not.toHaveProperty("measured");
  });

  it("marks nodes a test run did not reach as skipped", () => {
    const nodes = toFlowNodes(blueprint, [], {}, { nodes: { ev: "passed", if: "failed" }, edges: new Set() });
    expect(nodes.map(node => node.data.status)).toEqual(["passed", "failed", "skipped"]);
  });

  it("attaches each node's lint", () => {
    const lint = { level: "warning" as const, messages: ["Nothing leads into this node, so it never runs."] };
    const nodes = toFlowNodes(blueprint, [], {}, null, { bonus: lint });
    expect(nodes.map(node => node.data.lint)).toEqual([null, null, lint]);
  });
});

describe("toFlowEdges", () => {
  it("routes wires through pin handles", () => {
    const edges = toFlowEdges(blueprint, new Set(), null);
    expect(edges[1]).toMatchObject({
      id: "if-no-bonus", type: "draft", source: "if", sourceHandle: "no", target: "bonus", targetHandle: "in",
      selected: false, data: { pin: "no", status: null }
    });
  });

  it("marks selected wires and taken wires", () => {
    const edges = toFlowEdges(blueprint, new Set(["ev-out-if"]), { nodes: {}, edges: new Set(["ev-out-if"]) });
    expect(edges.map(edge => [edge.selected, edge.data?.status])).toEqual([[true, "taken"], [false, "idle"]]);
  });

  it("labels wires for screen readers", () => {
    const edges = toFlowEdges(blueprint, new Set(), null, edge => `${edge.source} ${edge.sourcePin} ${edge.target}`);
    expect(edges.map(edge => edge.ariaLabel)).toEqual(["ev out if", "if no bonus"]);
    expect(toFlowEdges(blueprint, new Set(), null)[0]).not.toHaveProperty("ariaLabel");
  });
});
