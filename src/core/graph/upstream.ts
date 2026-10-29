import type { BlueprintGraph } from "../blueprint/types";
import { CONTINUATION_EVENT_BY_PIN, type EventType, type PinId } from "../registry/constants";

/**
 * Event types whose chains can reach a node, found by walking wires backwards. Used to offer
 * only compatible results, hide fields that do not apply, and flag irrelevant checks.
 */
export function upstreamEvents(graph: BlueprintGraph, nodeId: string): EventType[] {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const start = nodes.get(nodeId);
  if (!start) return [];
  if (start.kind === "event") return [start.type as EventType];

  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push(edge.source);
    incoming.set(edge.target, list);
  }

  const found: EventType[] = [];
  const seen = new Set<string>([nodeId]);
  const queue = [...(incoming.get(nodeId) ?? [])];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    if (seen.has(current)) continue;
    seen.add(current);
    const node = nodes.get(current);
    if (!node) continue;
    if (node.kind === "event") {
      const type = node.type as EventType;
      if (!found.includes(type)) found.push(type);
      continue;
    }
    queue.push(...(incoming.get(current) ?? []));
  }
  return found;
}

/**
 * The events a result placed after this node would run under. A result on the way stands for the
 * continuation of the pin the route leaves it from ("afterResult" for "And then", "demandedSave" for a
 * save's outcomes) and hides what came before it; conditions pass the search on.
 */
export function resultEvents(graph: BlueprintGraph, nodeId: string, pin?: PinId): EventType[] {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, { id: string; pin: PinId }[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.target) ?? [];
    list.push({ id: edge.source, pin: edge.sourcePin });
    incoming.set(edge.target, list);
  }
  const found: EventType[] = [];
  const add = (type: EventType) => {
    if (!found.includes(type)) found.push(type);
  };
  const seen = new Set<string>();
  const queue: { id: string; pin: PinId | undefined }[] = [{ id: nodeId, pin }];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    const node = nodes.get(current.id);
    if (!node) continue;
    if (node.kind === "event") add(node.type as EventType);
    else if (node.kind === "result") add((current.pin && CONTINUATION_EVENT_BY_PIN[current.pin]) || "afterResult");
    else queue.push(...(incoming.get(current.id) ?? []));
  }
  return found;
}
