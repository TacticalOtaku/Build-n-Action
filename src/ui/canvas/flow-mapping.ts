import type { Edge, Node } from "@xyflow/react";
import type { BlueprintEdge, BlueprintNode, BlueprintSource } from "../../core/blueprint/types";
import type { NodeKind, PinId } from "../../core/registry/constants";
import type { NodeLint } from "../lint/lint-view";
import type { CanvasTrace, NodeRunStatus } from "./trace";

export type BnaNodeData = { node: BlueprintNode; status: NodeRunStatus | null; lint: NodeLint | null };
export type BnaFlowNode = Node<BnaNodeData, NodeKind>;
export type BnaEdgeData = { pin: PinId; status: "taken" | "idle" | null };
export type BnaFlowEdge = Edge<BnaEdgeData, "draft">;

export interface Size {
  width: number;
  height: number;
}

/** React Flow nodes for a blueprint; sizes are fed back from React Flow's own measurements. */
export function toFlowNodes(
  blueprint: BlueprintSource,
  selection: readonly string[],
  sizes: Readonly<Record<string, Size>>,
  trace: CanvasTrace | null,
  lints: Readonly<Record<string, NodeLint>> = {}
): BnaFlowNode[] {
  const selected = new Set(selection);
  return blueprint.nodes.map(node => {
    const measured = sizes[node.id];
    return {
      id: node.id,
      type: node.kind,
      position: node.position,
      data: { node, status: trace ? (trace.nodes[node.id] ?? "skipped") : null, lint: lints[node.id] ?? null },
      selected: selected.has(node.id),
      ...(measured ? { measured } : {})
    };
  });
}

export function toFlowEdges(
  blueprint: BlueprintSource,
  selectedEdges: ReadonlySet<string>,
  trace: CanvasTrace | null,
  label?: (edge: BlueprintEdge) => string
): BnaFlowEdge[] {
  return blueprint.edges.map(edge => ({
    id: edge.id,
    type: "draft",
    source: edge.source,
    sourceHandle: edge.sourcePin,
    target: edge.target,
    targetHandle: "in",
    selected: selectedEdges.has(edge.id),
    data: { pin: edge.sourcePin, status: trace ? (trace.edges.has(edge.id) ? "taken" : "idle") : null },
    ...(label ? { ariaLabel: label(edge) } : {})
  }));
}
