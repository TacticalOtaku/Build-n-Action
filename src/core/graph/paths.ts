import type { BlueprintEdge, BlueprintGraph } from "../blueprint/types";
import type { PinId } from "../registry/constants";
import { outputPins } from "./connections";

/** One condition on a path and the outcome ("yes" → true, "no" → false) the path requires. */
export interface Guard {
  nodeId: string;
  expect: boolean;
}

export interface BlueprintPath {
  /** Where the route starts: an event, or for continuations the result whose output it leaves. */
  eventNodeId: string;
  eventPin: PinId;
  guards: Guard[];
  resultNodeId: string;
}

/**
 * Every route from an event (or, with `from: "results"`, from a result's output) to a result. Conditions reached through several wires yield one
 * path per route (fan-in means OR); malformed wiring is skipped rather than reported, since the
 * linter and validator own reporting.
 */
export function enumeratePaths(graph: BlueprintGraph, from: "events" | "results" = "events"): BlueprintPath[] {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, BlueprintEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const paths: BlueprintPath[] = [];
  const visit = (
    nodeId: string,
    start: { eventNodeId: string; eventPin: PinId },
    guards: Guard[],
    trail: ReadonlySet<string>
  ): void => {
    const node = nodes.get(nodeId);
    if (!node || trail.has(nodeId)) return;
    if (node.kind === "result") {
      paths.push({ ...start, guards, resultNodeId: nodeId });
      return;
    }
    if (node.kind !== "condition") return;
    const nextTrail = new Set(trail).add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if ((edge.sourcePin !== "yes") && (edge.sourcePin !== "no")) continue;
      visit(edge.target, start, [...guards, { nodeId, expect: edge.sourcePin === "yes" }], nextTrail);
    }
  };

  for (const node of graph.nodes) {
    if (node.kind !== ((from === "events") ? "event" : "result")) continue;
    const pins = outputPins(node);
    for (const edge of outgoing.get(node.id) ?? []) {
      if ((node.kind === "result") && !pins.includes(edge.sourcePin)) continue;
      visit(edge.target, { eventNodeId: node.id, eventPin: edge.sourcePin }, [], new Set([node.id]));
    }
  }
  return paths;
}
