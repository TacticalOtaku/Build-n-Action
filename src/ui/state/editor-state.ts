import { createEdge } from "../../core/blueprint/factory";
import { randomId } from "../../core/blueprint/ids";
import type { BlueprintNode, BlueprintSource, ConditionCheck, CounterDef, Position } from "../../core/blueprint/types";
import { canConnect, outputPins } from "../../core/graph/connections";
import type { PinId } from "../../core/registry/constants";
import { setIn } from "./immutable";

export const HISTORY_LIMIT = 100;

export interface EditorState {
  blueprint: BlueprintSource;
  past: BlueprintSource[];
  future: BlueprintSource[];
  /** Selected node ids. */
  selection: string[];
  /** The blueprint as it was when the current drag began; committed to history on drop. */
  dragOrigin: BlueprintSource | null;
}

export type EditorAction =
  | { type: "load"; blueprint: BlueprintSource }
  | { type: "addNode"; node: BlueprintNode; connectFrom?: { source: string; sourcePin: PinId } }
  | { type: "moveNode"; id: string; position: Position; dragging: boolean }
  | { type: "removeNodes"; ids: readonly string[] }
  | { type: "connect"; source: string; sourcePin: string; target: string }
  | { type: "removeEdges"; ids: readonly string[] }
  | { type: "setNodeData"; id: string; path: readonly string[]; value: unknown }
  | { type: "addCheck"; nodeId: string; check: ConditionCheck }
  | { type: "removeCheck"; nodeId: string; checkId: string }
  | { type: "setCheckData"; nodeId: string; checkId: string; path: readonly string[]; value: unknown }
  | { type: "rename"; name: string }
  | { type: "setEnabled"; enabled: boolean }
  | { type: "setCounters"; counters: readonly CounterDef[] }
  | { type: "layout"; positions: Readonly<Record<string, Position>> }
  | { type: "duplicateNodes"; ids: readonly string[]; offset: Position }
  | { type: "select"; ids: readonly string[] }
  | { type: "undo" }
  | { type: "redo" };

export function createEditorState(blueprint: BlueprintSource): EditorState {
  return { blueprint, past: [], future: [], selection: [], dragOrigin: null };
}

/** Record a new blueprint version; the version before an in-progress drag is what undo restores. */
function commit(state: EditorState, blueprint: BlueprintSource): EditorState {
  if (blueprint === state.blueprint) return state;
  const past = [...state.past, state.dragOrigin ?? state.blueprint].slice(-HISTORY_LIMIT);
  return { ...state, blueprint, past, future: [], dragOrigin: null };
}

function mapNode(blueprint: BlueprintSource, id: string, update: (node: BlueprintNode) => BlueprintNode): BlueprintSource {
  let changed = false;
  const nodes = blueprint.nodes.map(node => {
    if (node.id !== id) return node;
    const next = update(node);
    if (next !== node) changed = true;
    return next;
  });
  return changed ? { ...blueprint, nodes } : blueprint;
}

function mapChecks(
  blueprint: BlueprintSource,
  nodeId: string,
  update: (checks: ConditionCheck[]) => ConditionCheck[]
): BlueprintSource {
  return mapNode(blueprint, nodeId, node => {
    if (node.kind !== "condition") return node;
    const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
    return { ...node, data: { ...node.data, checks: update(checks) } };
  });
}

/** Drop wires leaving a result's outputs that no longer exist (its "And then" was turned off). */
function pruneOutputs(blueprint: BlueprintSource, nodeId: string): BlueprintSource {
  const node = blueprint.nodes.find(candidate => candidate.id === nodeId);
  if (node?.kind !== "result") return blueprint;
  const pins = outputPins(node);
  const edges = blueprint.edges.filter(edge => (edge.source !== nodeId) || pins.includes(edge.sourcePin));
  return (edges.length === blueprint.edges.length) ? blueprint : { ...blueprint, edges };
}

function keepExisting(selection: readonly string[], blueprint: BlueprintSource): string[] {
  const ids = new Set(blueprint.nodes.map(node => node.id));
  return selection.filter(id => ids.has(id));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { blueprint } = state;
  switch (action.type) {
    case "load":
      return createEditorState(action.blueprint);

    case "addNode": {
      let next: BlueprintSource = { ...blueprint, nodes: [...blueprint.nodes, action.node] };
      const from = action.connectFrom;
      if (from && canConnect(next, { ...from, target: action.node.id }).ok) {
        next = { ...next, edges: [...next.edges, createEdge(from.source, from.sourcePin, action.node.id)] };
      }
      return { ...commit(state, next), selection: [action.node.id] };
    }

    case "moveNode": {
      const next = mapNode(blueprint, action.id, node => ({ ...node, position: { ...action.position } }));
      if (action.dragging) return { ...state, blueprint: next, dragOrigin: state.dragOrigin ?? blueprint };
      return commit(state, next);
    }

    case "removeNodes": {
      const ids = new Set(action.ids);
      if (!blueprint.nodes.some(node => ids.has(node.id))) return state;
      const next: BlueprintSource = {
        ...blueprint,
        nodes: blueprint.nodes.filter(node => !ids.has(node.id)),
        edges: blueprint.edges.filter(edge => !ids.has(edge.source) && !ids.has(edge.target))
      };
      return { ...commit(state, next), selection: state.selection.filter(id => !ids.has(id)) };
    }

    case "connect": {
      if (!canConnect(blueprint, action).ok) return state;
      const edge = createEdge(action.source, action.sourcePin as PinId, action.target);
      return commit(state, { ...blueprint, edges: [...blueprint.edges, edge] });
    }

    case "removeEdges": {
      const ids = new Set(action.ids);
      const edges = blueprint.edges.filter(edge => !ids.has(edge.id));
      return (edges.length === blueprint.edges.length) ? state : commit(state, { ...blueprint, edges });
    }

    case "setNodeData": {
      const next = mapNode(blueprint, action.id, node => ({ ...node, data: setIn(node.data, action.path, action.value) }));
      return commit(state, pruneOutputs(next, action.id));
    }

    case "addCheck":
      return commit(state, mapChecks(blueprint, action.nodeId, checks => [...checks, action.check]));

    case "removeCheck":
      return commit(state, mapChecks(blueprint, action.nodeId, checks => checks.filter(check => check.id !== action.checkId)));

    case "setCheckData":
      return commit(state, mapChecks(blueprint, action.nodeId, checks => checks.map(check => {
        return (check.id === action.checkId) ? { ...check, data: setIn(check.data, action.path, action.value) } : check;
      })));

    case "rename":
      return (action.name === blueprint.name) ? state : commit(state, { ...blueprint, name: action.name });

    case "setEnabled":
      return (action.enabled === blueprint.enabled) ? state : commit(state, { ...blueprint, enabled: action.enabled });

    case "setCounters":
      return commit(state, { ...blueprint, counters: action.counters.map(def => ({ ...def })) });

    case "layout": {
      const nodes = blueprint.nodes.map(node => {
        const position = action.positions[node.id];
        return position ? { ...node, position: { ...position } } : node;
      });
      return commit(state, { ...blueprint, nodes });
    }

    case "duplicateNodes": {
      const ids = new Set(action.ids);
      const renamed = new Map<string, string>();
      const copies = blueprint.nodes.filter(node => ids.has(node.id)).map(node => {
        const id = randomId(8);
        renamed.set(node.id, id);
        return {
          ...structuredClone(node),
          id,
          position: { x: node.position.x + action.offset.x, y: node.position.y + action.offset.y }
        };
      });
      if (!copies.length) return state;
      const edges = blueprint.edges.flatMap(edge => {
        const source = renamed.get(edge.source);
        const target = renamed.get(edge.target);
        return (source && target) ? [createEdge(source, edge.sourcePin, target)] : [];
      });
      const next: BlueprintSource = { ...blueprint, nodes: [...blueprint.nodes, ...copies], edges: [...blueprint.edges, ...edges] };
      return { ...commit(state, next), selection: copies.map(node => node.id) };
    }

    case "select":
      return { ...state, selection: [...action.ids] };

    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        blueprint: previous,
        past: state.past.slice(0, -1),
        future: [blueprint, ...state.future],
        dragOrigin: null,
        selection: keepExisting(state.selection, previous)
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        blueprint: next,
        past: [...state.past, blueprint].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dragOrigin: null,
        selection: keepExisting(state.selection, next)
      };
    }
  }
}
