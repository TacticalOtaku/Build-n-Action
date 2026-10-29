import type { BlueprintNode, BlueprintSource, ConditionCheck } from "../blueprint/types";
import { enumeratePaths, type BlueprintPath } from "../graph/paths";
import { CONTINUATION_EVENT_BY_PIN, type EventType, type PinId } from "../registry/constants";
import { asString } from "../registry/data";

export interface CompiledGuard {
  node: BlueprintNode;
  /** The condition outcome this path needs: true for "yes", false for "no". */
  expect: boolean;
  mode: "all" | "any";
  checks: readonly ConditionCheck[];
  /** "Only this item": the roll must use the item carrying the blueprint, whatever the mode. */
  thisItem: boolean;
}

export interface CompiledPath {
  /** Where the route starts: the event, or for a continuation the result it leaves from. */
  event: BlueprintNode;
  eventType: EventType;
  pin: PinId;
  guards: readonly CompiledGuard[];
  result: BlueprintNode;
  /** Edge ids along the path: hops[i] leads into guard i, the last hop into the result. */
  hops: readonly string[];
}

export interface CompiledBlueprint {
  source: BlueprintSource;
  paths: readonly CompiledPath[];
  pathsFor(event: EventType): readonly CompiledPath[];
  /** Routes continuing from results' outputs ("And then"), all of them. */
  continuations: readonly CompiledPath[];
  /** Routes continuing from this result's outputs. */
  continuationsOf(nodeId: string): readonly CompiledPath[];
}

// Blueprint sources are replaced, never mutated, so the object itself is a safe cache key.
const cache = new WeakMap<BlueprintSource, CompiledBlueprint>();

function groupBy(paths: readonly CompiledPath[], key: (path: CompiledPath) => string): Map<string, CompiledPath[]> {
  const groups = new Map<string, CompiledPath[]>();
  for (const path of paths) {
    const list = groups.get(key(path)) ?? [];
    list.push(path);
    groups.set(key(path), list);
  }
  return groups;
}

export function compileBlueprint(source: BlueprintSource): CompiledBlueprint {
  const cached = cache.get(source);
  if (cached) return cached;

  const nodes = new Map(source.nodes.map(node => [node.id, node]));
  const edgeId = (from: string, pin: string, to: string): string => {
    return source.edges.find(edge => (edge.source === from) && (edge.sourcePin === pin) && (edge.target === to))?.id ?? "";
  };

  const build = (path: BlueprintPath, eventType: EventType | undefined): CompiledPath | null => {
    const event = nodes.get(path.eventNodeId);
    const result = nodes.get(path.resultNodeId);
    if (!event || !result || !eventType) return null;
    const guards: CompiledGuard[] = [];
    const hops: string[] = [];
    let previous = event.id;
    let pin: string = path.eventPin;
    for (const guard of path.guards) {
      const node = nodes.get(guard.nodeId);
      if (!node) continue;
      hops.push(edgeId(previous, pin, node.id));
      guards.push({
        node,
        expect: guard.expect,
        mode: (asString(node.data.mode) === "any") ? "any" : "all",
        checks: Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [],
        thisItem: node.data.thisItem === true
      });
      previous = node.id;
      pin = guard.expect ? "yes" : "no";
    }
    hops.push(edgeId(previous, pin, result.id));
    return { event, eventType, pin: path.eventPin, guards, result, hops };
  };

  const paths = enumeratePaths(source).flatMap(path => build(path, nodes.get(path.eventNodeId)?.type as EventType) ?? []);
  const continuations = enumeratePaths(source, "results").flatMap(path => build(path, CONTINUATION_EVENT_BY_PIN[path.eventPin]) ?? []);
  const byEvent = groupBy(paths, path => path.eventType);
  const byResult = groupBy(continuations, path => path.event.id);

  const compiled: CompiledBlueprint = {
    source,
    paths,
    pathsFor: event => byEvent.get(event) ?? [],
    continuations,
    continuationsOf: nodeId => byResult.get(nodeId) ?? []
  };
  cache.set(source, compiled);
  return compiled;
}
