import test from "node:test";
import assert from "node:assert/strict";
import {createConditionGraph, validateConditionGraph, evaluateConditionGraph} from "../scripts/services/condition-graph.mjs";
import {evaluateBonusFilters} from "../scripts/services/filter-evaluator.mjs";

test("legacy conversion preserves conjunction and unconditional bonuses", () => {
  const graph = createConditionGraph(["hp", "type"]);
  assert.equal(validateConditionGraph(graph, {knownFilters: ["hp", "type"], configuredFilters: ["hp", "type"]}).valid, true);
  assert.equal(evaluateConditionGraph(graph, n => n.filter === "hp").result, false);
  assert.equal(evaluateConditionGraph(createConditionGraph([]), () => {throw Error();}).result, true);
});

test("OR short circuits, NOT inverts and shared nodes evaluate once", () => {
  const graph = createConditionGraph(["a", "b"]);
  const gate = graph.nodes.find(n => n.type === "and"); gate.type = "or";
  let calls = 0;
  const result = evaluateConditionGraph(graph, () => { calls++; return true; });
  assert.equal(result.result, true); assert.equal(calls, 1);
  assert.equal(result.trace.filter(t => t.status === "skipped").length, 1);
  gate.type = "not"; graph.edges = graph.edges.filter(e => e.from !== "condition-2");
  graph.nodes = graph.nodes.filter(n => n.id !== "condition-2");
  assert.equal(evaluateConditionGraph(graph, () => true).result, false);
});

test("tri-state operators do not turn missing context into success", () => {
  for (const [type, a, b, expected] of [["and", null, true, null], ["and", null, false, false], ["or", null, true, true], ["or", null, false, null]]) {
    const graph = createConditionGraph(["a", "b"]); graph.nodes.find(n => n.type === "and").type = type;
    assert.equal(evaluateConditionGraph(graph, n => n.filter === "a" ? a : b).result, expected);
  }
  const graph = createConditionGraph(["a"]); graph.nodes.find(n => n.type === "and").type = "not";
  assert.equal(evaluateConditionGraph(graph, () => null).result, null);
});

test("cycles, dangling edges, duplicate ids, unconfigured/unknown/omitted filters are rejected", () => {
  const base = createConditionGraph(["a"]);
  const bad = [];
  let g = structuredClone(base); g.edges.push({from: "result", to: "all"}); bad.push(g);
  g = structuredClone(base); g.edges.push({from: "missing", to: "result"}); bad.push(g);
  g = structuredClone(base); g.nodes.push({...g.nodes[0]}); bad.push(g);
  g = structuredClone(base); g.nodes.push({id: "unused", type: "or"}); bad.push(g);
  for (const graph of bad) assert.equal(validateConditionGraph(graph).valid, false);
  assert.equal(validateConditionGraph(base, {knownFilters: ["b"]}).valid, false);
  assert.equal(validateConditionGraph(base, {configuredFilters: []}).valid, false);
  assert.equal(validateConditionGraph(base, {configuredFilters: ["a", "b"]}).valid, false);
});

test("malformed imported graphs fail closed without exceptions or executing callbacks", () => {
  const invalid = [null, {}, {version: 2}, {version: 1, nodes: null}, {version: 1, nodes: [null], edges: []}, {version: 1, nodes: [], edges: [null]}];
  for (const graph of invalid) {
    assert.equal(validateConditionGraph(graph).valid, false);
    assert.equal(evaluateConditionGraph(graph, () => {throw Error("must not run");}).result, null);
  }
});

test("runtime uses active graph and preserves legacy evaluation with no graph", () => {
  const registry = {a: (_s, value) => value, b: (_s, value) => value};
  const graph = createConditionGraph(["a", "b"]); graph.nodes.find(n => n.type === "and").type = "or";
  const bonuses = new Map([["legacy", {filters: {a: true, b: false}}], ["graph", {filters: {a: true, b: false}, conditionGraph: graph}]]);
  evaluateBonusFilters(bonuses, registry, {}, {});
  assert.deepEqual([...bonuses.keys()], ["graph"]);
});

test("runtime rejects invalid graphs and exception/async results without granting bonus", () => {
  for (const callback of [() => {throw Error();}, () => Promise.resolve(true)]) {
    const bonuses = new Map([["x", {filters: {a: true}, conditionGraph: createConditionGraph(["a"])}]]);
    evaluateBonusFilters(bonuses, {a: callback}, {}, {});
    assert.equal(bonuses.size, 0);
  }
});
