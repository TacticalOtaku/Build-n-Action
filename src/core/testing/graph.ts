import { createEdge, createNode } from "../blueprint/factory";
import type { BlueprintEdge, BlueprintNode, ConditionCheck } from "../blueprint/types";
import type { NodeKind, PinId } from "../registry/constants";

/** A node with a fixed id whose data is merged over the registry defaults. */
export function makeNode(kind: NodeKind, type: string, id: string, data: Record<string, unknown> = {}): BlueprintNode {
  const node = createNode(kind, type);
  return { ...node, id, data: { ...node.data, ...data } };
}

export function makeCondition(id: string, checks: ConditionCheck[], mode: "all" | "any" = "all"): BlueprintNode {
  return makeNode("condition", "condition", id, { mode, checks });
}

/** An edge with a readable, deterministic id. */
export function makeEdge(source: string, sourcePin: PinId, target: string): BlueprintEdge {
  return { ...createEdge(source, sourcePin, target), id: `${source}-${sourcePin}-${target}` };
}
