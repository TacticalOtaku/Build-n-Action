import assert from "node:assert/strict";
import test from "node:test";
import {BlueprintHistory, connectNodes, removeNode, fitGraph, graphPoint, freeNodePosition, NODE_WIDTH, NODE_HEIGHT} from "../scripts/services/blueprint-state.mjs";

const graph = () => ({version: 1, enabled: true, nodes: [
  {id: "c", type: "condition", filter: "health", x: 100, y: 50},
  {id: "n", type: "not", x: 400, y: 50}, {id: "r", type: "result", x: 700, y: 50}
], edges: [{from: "c", to: "n"}, {from: "n", to: "r"}]});

test("new nodes leave room for existing nodes and their connection ports", () => {
  const nodes = [{x: 100, y: 100}];
  for (let i = 0; i < 30; i++) {
    const point = freeNodePosition(nodes, {x: 100, y: 100});
    assert.ok(nodes.every(node => Math.abs(node.x - point.x) >= NODE_WIDTH + 24 || Math.abs(node.y - point.y) >= NODE_HEIGHT + 24));
    nodes.push(point);
  }
  assert.deepEqual(freeNodePosition([], {x: 12, y: 34}), {x: 12, y: 34});
});

test("history copies snapshots and branches after undo", () => {
  const history = new BlueprintHistory({graph: graph(), filters: {hp: 50}});
  const next = history.current; next.filters.hp = 25; history.push(next);
  next.filters.hp = 0;
  assert.equal(history.current.filters.hp, 25);
  assert.equal(history.undo().filters.hp, 50);
  const branch = history.current; branch.filters.hp = 75; history.push(branch);
  assert.equal(history.canRedo, false);
  assert.equal(history.current.filters.hp, 75);
});

test("connections reject cycles, inputs on conditions and outputs on result", () => {
  assert.equal(connectNodes(graph(), "n", "n"), false);
  assert.equal(connectNodes(graph(), "n", "c"), false);
  assert.equal(connectNodes(graph(), "r", "n"), false);
  const value = graph(); value.nodes.push({id: "a", type: "and", x: 0, y: 0});
  assert.equal(connectNodes(value, "n", "a"), true);
  assert.equal(connectNodes(value, "a", "n"), false);
});

test("single-input connections replace atomically and duplicates are ignored", () => {
  const value = graph();
  assert.equal(connectNodes(value, "c", "r"), true);
  assert.deepEqual(value.edges.filter(e => e.to === "r"), [{from: "c", to: "r"}]);
  assert.equal(connectNodes(value, "c", "r"), false);
});

test("node deletion removes attached edges but protects the result", () => {
  const value = graph();
  assert.equal(removeNode(value, "r"), false);
  assert.equal(removeNode(value, "n"), true);
  assert.deepEqual(value.edges, []);
});

test("viewport fit and inverse coordinates remain finite for empty/small screens", () => {
  const view = fitGraph(graph(), 800, 500);
  const point = graphPoint({x: 100 * view.scale + view.x, y: 50 * view.scale + view.y}, view);
  assert.ok(Math.abs(point.x - 100) < 1e-8);
  assert.ok(Math.abs(point.y - 50) < 1e-8);
  assert.ok(Number.isFinite(fitGraph({nodes: []}, 0, 0).scale));
});
