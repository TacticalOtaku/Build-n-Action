import { CONDITION_NODE_TYPE, type NodeKind, type PinId } from "../registry/constants";
import { defaultsFor } from "../registry/fields";
import { COMMON_RESULT_FIELDS, CONDITION_NODE_FIELDS, getCheck, getEvent, getResult } from "../registry/index";
import { randomId } from "./ids";
import {
  DEFAULT_BLUEPRINT_IMG,
  SCHEMA_VERSION,
  type BlueprintEdge,
  type BlueprintNode,
  type BlueprintSource,
  type ConditionCheck,
  type Position
} from "./types";

export function createBlueprint(init: Partial<Omit<BlueprintSource, "schemaVersion">> = {}): BlueprintSource {
  return {
    id: init.id ?? randomId(),
    schemaVersion: SCHEMA_VERSION,
    name: init.name ?? "",
    img: init.img ?? DEFAULT_BLUEPRINT_IMG,
    description: init.description ?? "",
    enabled: init.enabled ?? true,
    sort: init.sort ?? 0,
    nodes: init.nodes ?? [],
    edges: init.edges ?? [],
    flags: init.flags ?? {},
    ...(init.counters ? { counters: init.counters.map(counter => ({ ...counter })) } : {})
  };
}

export function createNode(kind: NodeKind, type: string, position: Position = { x: 0, y: 0 }): BlueprintNode {
  return { id: randomId(8), kind, type, position: { ...position }, data: initialData(kind, type) };
}

function initialData(kind: NodeKind, type: string): Record<string, unknown> {
  switch (kind) {
    case "event": {
      const definition = getEvent(type);
      if (!definition) throw new Error(`Unknown event type "${type}"`);
      return defaultsFor(definition.fields);
    }
    case "condition": {
      if (type !== CONDITION_NODE_TYPE) throw new Error(`Unknown condition type "${type}"`);
      return { ...defaultsFor(CONDITION_NODE_FIELDS), checks: [] };
    }
    case "result": {
      const definition = getResult(type);
      if (!definition) throw new Error(`Unknown result type "${type}"`);
      return { ...defaultsFor(definition.fields), common: defaultsFor(COMMON_RESULT_FIELDS) };
    }
  }
}

export function createCheck(type: string): ConditionCheck {
  const definition = getCheck(type);
  if (!definition) throw new Error(`Unknown check type "${type}"`);
  return { id: randomId(8), type, data: defaultsFor(definition.fields) };
}

export function createEdge(source: string, sourcePin: PinId, target: string): BlueprintEdge {
  return { id: randomId(8), source, sourcePin, target, targetPin: "in" };
}

/**
 * A copy under a new id. Node, wire and check ids stay (they are unique within a blueprint); the module's own
 * flags (the v1 legacy id, the migration mark) stay with the original.
 */
export function duplicateBlueprint(source: BlueprintSource, name: string): BlueprintSource {
  return createBlueprint({
    name,
    img: source.img,
    description: source.description,
    enabled: source.enabled,
    sort: source.sort + 1,
    nodes: structuredClone(source.nodes),
    edges: structuredClone(source.edges),
    flags: Object.fromEntries(Object.entries(structuredClone(source.flags)).filter(([scope]) => scope !== "build-n-action"))
  });
}
