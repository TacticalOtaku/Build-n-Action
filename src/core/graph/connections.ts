import type { BlueprintEdge, BlueprintGraph, BlueprintNode } from "../blueprint/types";
import { CONDITION_NODE_TYPE, type PinId } from "../registry/constants";
import { asRecord } from "../registry/data";
import { getEvent, getResult } from "../registry/index";

export const CONNECT_REJECTIONS = [
  "missingNode", "selfLoop", "intoEvent", "fromResult", "unknownPin", "duplicate", "cycle"
] as const;

/** Why a wire was refused; the message key is `BNA.Connect.<reason>`. */
export type ConnectRejection = (typeof CONNECT_REJECTIONS)[number];

export type ConnectResult = { ok: true } | { ok: false; reason: ConnectRejection };

export interface ConnectRequest {
  source: string;
  sourcePin: string;
  target: string;
}

const CONDITION_PINS: readonly PinId[] = ["yes", "no"];
const THEN_PINS: readonly PinId[] = ["then"];

/** The outputs a node has: an event's outcomes, a condition's yes/no, a result's "And then" while it is on. */
export function outputPins(node: Pick<BlueprintNode, "kind" | "type" | "data">): readonly PinId[] {
  switch (node.kind) {
    case "event": return getEvent(node.type)?.pins ?? [];
    case "condition": return (node.type === CONDITION_NODE_TYPE) ? CONDITION_PINS : [];
    case "result": {
      const definition = getResult(node.type);
      if (!definition) return [];
      if (definition.pins?.length) return definition.pins;
      return (asRecord(node.data.common).then === true) ? THEN_PINS : [];
    }
  }
}

/** Whether adding source → target would close a loop, i.e. source is reachable from target. */
export function wouldCreateCycle(
  edges: readonly Pick<BlueprintEdge, "source" | "target">[],
  source: string,
  target: string
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
  }
  const seen = new Set<string>();
  const stack = [target];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function canConnect(graph: BlueprintGraph, request: ConnectRequest): ConnectResult {
  const source = graph.nodes.find(node => node.id === request.source);
  const target = graph.nodes.find(node => node.id === request.target);
  if (!source || !target) return reject("missingNode");
  if (source.id === target.id) return reject("selfLoop");
  if (target.kind === "event") return reject("intoEvent");
  const pins = outputPins(source);
  if ((source.kind === "result") && !pins.length) return reject("fromResult");
  if (!pins.includes(request.sourcePin as PinId)) return reject("unknownPin");
  const duplicate = graph.edges.some(edge => (edge.source === source.id)
    && (edge.sourcePin === request.sourcePin) && (edge.target === target.id));
  if (duplicate) return reject("duplicate");
  if (wouldCreateCycle(graph.edges, source.id, target.id)) return reject("cycle");
  return { ok: true };
}

function reject(reason: ConnectRejection): ConnectResult {
  return { ok: false, reason };
}
