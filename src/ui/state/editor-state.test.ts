import { describe, expect, it } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import type { BlueprintSource } from "../../core/blueprint/types";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import { HISTORY_LIMIT, createEditorState, editorReducer, type EditorAction, type EditorState } from "./editor-state";

function blueprint(): BlueprintSource {
  return createBlueprint({
    id: "aB3dE5gH7jK9mN1p",
    name: "Test",
    nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", []), makeNode("result", "rollBonus", "bonus")],
    edges: [makeEdge("ev", "out", "if")]
  });
}

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

describe("editorReducer", () => {
  it("adds a node, wires it from a pin and selects it", () => {
    const node = makeNode("result", "reminder", "note");
    const state = run(createEditorState(blueprint()), { type: "addNode", node, connectFrom: { source: "if", sourcePin: "no" } });
    expect(state.blueprint.nodes.map(n => n.id)).toContain("note");
    expect(state.blueprint.edges.some(e => (e.source === "if") && (e.sourcePin === "no") && (e.target === "note"))).toBe(true);
    expect(state.selection).toEqual(["note"]);
    expect(state.past).toHaveLength(1);
  });

  it("skips the wire when the connection is not allowed", () => {
    const node = makeNode("event", "attackRoll", "ev2");
    const state = run(createEditorState(blueprint()), { type: "addNode", node, connectFrom: { source: "if", sourcePin: "yes" } });
    expect(state.blueprint.edges).toHaveLength(1);
  });

  it("coalesces a drag into one undo step", () => {
    const start = createEditorState(blueprint());
    const state = run(
      start,
      { type: "moveNode", id: "ev", position: { x: 10, y: 0 }, dragging: true },
      { type: "moveNode", id: "ev", position: { x: 20, y: 0 }, dragging: true },
      { type: "moveNode", id: "ev", position: { x: 30, y: 5 }, dragging: false }
    );
    expect(state.blueprint.nodes[0]?.position).toEqual({ x: 30, y: 5 });
    expect(state.past).toHaveLength(1);
    expect(run(state, { type: "undo" }).blueprint).toBe(start.blueprint);
  });

  it("drops the wires of an output that is turned off, in one undo step", () => {
    const source = blueprint();
    const effect = makeNode("result", "applyEffect", "effect");
    const start = createEditorState({ ...source, nodes: [...source.nodes, effect] });
    const wired = (state: EditorState) => state.blueprint.edges.some(edge => (edge.source === "bonus") && (edge.sourcePin === "then"));
    const on = run(start,
      { type: "setNodeData", id: "bonus", path: ["common", "then"], value: true },
      { type: "connect", source: "bonus", sourcePin: "then", target: "effect" });
    expect(wired(on)).toBe(true);
    const off = run(on, { type: "setNodeData", id: "bonus", path: ["common", "then"], value: false });
    expect(wired(off)).toBe(false);
    expect(wired(run(off, { type: "undo" }))).toBe(true);
  });

  it("sets the blueprint's counters in one undo step", () => {
    const hits = { name: "hits", min: 0, max: 3, initial: 0, reset: "turnStart" as const };
    const next = run(createEditorState(blueprint()), { type: "setCounters", counters: [hits] });
    expect(next.blueprint.counters).toEqual([hits]);
    expect(run(next, { type: "undo" }).blueprint.counters).toBeUndefined();
  });

  it("removes nodes with their wires and selection", () => {
    const state = run(createEditorState(blueprint()), { type: "select", ids: ["if", "bonus"] }, { type: "removeNodes", ids: ["if"] });
    expect(state.blueprint.nodes.map(n => n.id)).toEqual(["ev", "bonus"]);
    expect(state.blueprint.edges).toEqual([]);
    expect(state.selection).toEqual(["bonus"]);
  });

  it("connects only valid wires", () => {
    const ok = run(createEditorState(blueprint()), { type: "connect", source: "if", sourcePin: "yes", target: "bonus" });
    expect(ok.blueprint.edges).toHaveLength(2);
    const bad = run(ok, { type: "connect", source: "bonus", sourcePin: "out", target: "if" });
    expect(bad).toBe(ok);
  });

  it("removes wires", () => {
    const state = run(createEditorState(blueprint()), { type: "removeEdges", ids: ["ev-out-if"] });
    expect(state.blueprint.edges).toEqual([]);
  });

  it("edits nested node data", () => {
    const state = run(createEditorState(blueprint()), { type: "setNodeData", id: "ev", path: ["reach", "mode"], value: "aura" });
    expect(state.blueprint.nodes[0]?.data.reach).toMatchObject({ mode: "aura", range: "10" });
  });

  it("adds, edits and removes condition checks", () => {
    const check = { id: "c1", type: "creatureTypes", data: { values: [] } };
    const added = run(createEditorState(blueprint()), { type: "addCheck", nodeId: "if", check });
    const edited = run(added, { type: "setCheckData", nodeId: "if", checkId: "c1", path: ["values"], value: ["undead"] });
    expect(edited.blueprint.nodes[1]?.data.checks).toEqual([{ id: "c1", type: "creatureTypes", data: { values: ["undead"] } }]);
    const removed = run(edited, { type: "removeCheck", nodeId: "if", checkId: "c1" });
    expect(removed.blueprint.nodes[1]?.data.checks).toEqual([]);
  });

  it("renames and toggles, ignoring no-op changes", () => {
    const start = createEditorState(blueprint());
    expect(run(start, { type: "rename", name: "Test" })).toBe(start);
    const state = run(start, { type: "rename", name: "Hex" }, { type: "setEnabled", enabled: false });
    expect(state.blueprint).toMatchObject({ name: "Hex", enabled: false });
    expect(state.past).toHaveLength(2);
  });

  it("applies a layout in one step", () => {
    const state = run(createEditorState(blueprint()), { type: "layout", positions: { ev: { x: 1, y: 2 }, bonus: { x: 3, y: 4 } } });
    expect(state.blueprint.nodes.map(n => n.position)).toEqual([{ x: 1, y: 2 }, { x: 0, y: 0 }, { x: 3, y: 4 }]);
    expect(state.past).toHaveLength(1);
  });

  it("undoes and redoes, dropping stale selection", () => {
    const node = makeNode("result", "reminder", "note");
    const added = run(createEditorState(blueprint()), { type: "addNode", node });
    const undone = run(added, { type: "undo" });
    expect(undone.blueprint.nodes.map(n => n.id)).not.toContain("note");
    expect(undone.selection).toEqual([]);
    expect(undone.future).toHaveLength(1);
    const redone = run(undone, { type: "redo" });
    expect(redone.blueprint).toBe(added.blueprint);
    expect(run(createEditorState(blueprint()), { type: "undo" }).past).toEqual([]);
  });

  it("caps the history", () => {
    let state = createEditorState(blueprint());
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) state = editorReducer(state, { type: "rename", name: `n${i}` });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });

  it("loads a different blueprint with fresh history", () => {
    const other = createBlueprint({ name: "Other" });
    const state = run(createEditorState(blueprint()), { type: "rename", name: "Hex" }, { type: "load", blueprint: other });
    expect(state).toEqual(createEditorState(other));
  });

  it("duplicates selected nodes with the wires between them, offset and selected", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", []), makeNode("result", "rollBonus", "r")],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "r")]
    });
    const state = editorReducer(createEditorState(blueprint), { type: "duplicateNodes", ids: ["if", "r"], offset: { x: 36, y: 36 } });
    const copies = state.blueprint.nodes.slice(3);
    expect(copies.map(node => node.type)).toEqual(["condition", "rollBonus"]);
    expect(copies.every(node => !["if", "r"].includes(node.id))).toBe(true);
    expect(copies[0]?.position).toEqual({ x: 36, y: 36 });
    expect(state.selection).toEqual(copies.map(node => node.id));
    const added = state.blueprint.edges.slice(2);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ source: copies[0]?.id, sourcePin: "yes", target: copies[1]?.id });
    expect(state.past).toHaveLength(1);
  });

  it("ignores duplicating nothing", () => {
    const state = createEditorState(createBlueprint());
    expect(editorReducer(state, { type: "duplicateNodes", ids: ["missing"], offset: { x: 1, y: 1 } })).toBe(state);
  });
});
