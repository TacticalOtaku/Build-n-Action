import { outputPins, wouldCreateCycle } from "../graph/connections";
import { NODE_KINDS, type NodeKind, type PinId } from "../registry/constants";
import { hasDefinition } from "../registry/index";
import { isValidId } from "./ids";
import { COUNTER_RESETS } from "../counters/counters";
import { SCHEMA_VERSION, type BlueprintSource, type CounterReset } from "./types";

export type ValidationCode =
  | "notObject"
  | "invalidId"
  | "schemaVersion"
  | "invalidField"
  | "duplicateNodeId"
  | "unknownKind"
  | "unknownType"
  | "duplicateEdgeId"
  | "danglingEdge"
  | "invalidDirection"
  | "invalidPin"
  | "cycle";

export interface ValidationIssue {
  /** Dotted path of the offending value, "" for the root. */
  path: string;
  code: ValidationCode;
}

export type ValidationResult = { ok: true; value: BlueprintSource } | { ok: false; issues: ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

/**
 * Structural validation of blueprint data from an untrusted source (imports, other modules,
 * hand-edited flags). Field-level values inside node data are not validated here; the
 * interpreter reads them defensively and the linter reports meaningless values.
 */
export function validateBlueprintSource(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", code: "notObject" }] };
  const issues: ValidationIssue[] = [];
  const report = (path: string, code: ValidationCode) => issues.push({ path, code });

  if (!isValidId(input.id)) report("id", "invalidId");
  if (input.schemaVersion !== SCHEMA_VERSION) report("schemaVersion", "schemaVersion");
  for (const key of ["name", "img", "description"] as const) {
    if (typeof input[key] !== "string") report(key, "invalidField");
  }
  if (typeof input.enabled !== "boolean") report("enabled", "invalidField");
  if ((typeof input.sort !== "number") || !Number.isFinite(input.sort)) report("sort", "invalidField");
  if (!isRecord(input.flags)) report("flags", "invalidField");
  if (input.counters !== undefined) {
    if (!Array.isArray(input.counters)) report("counters", "invalidField");
    else input.counters.forEach((entry: unknown, index: number) => {
      const ok = isRecord(entry) && (typeof entry.name === "string") && !!entry.name.trim()
        && (typeof entry.min === "number") && ((entry.max === null) || (typeof entry.max === "number"))
        && (typeof entry.initial === "number") && COUNTER_RESETS.includes(entry.reset as CounterReset);
      if (!ok) report(`counters.${index}`, "invalidField");
    });
  }

  const nodes = new Map<string, { kind: NodeKind; type: string; data: Record<string, unknown> }>();
  const rawNodes: unknown[] = Array.isArray(input.nodes) ? input.nodes : [];
  if (!Array.isArray(input.nodes)) report("nodes", "invalidField");
  rawNodes.forEach((node, index) => {
    const path = `nodes.${index}`;
    if (!isRecord(node) || (typeof node.id !== "string") || !node.id) return report(path, "invalidField");
    if (nodes.has(node.id)) return report(`${path}.id`, "duplicateNodeId");
    if (!NODE_KINDS.includes(node.kind as NodeKind)) return report(`${path}.kind`, "unknownKind");
    const kind = node.kind as NodeKind;
    const type = (typeof node.type === "string") ? node.type : "";
    if (!hasDefinition(kind, type)) report(`${path}.type`, "unknownType");
    const position = node.position;
    if (!isRecord(position) || (typeof position.x !== "number") || (typeof position.y !== "number")) {
      report(`${path}.position`, "invalidField");
    }
    if (!isRecord(node.data)) report(`${path}.data`, "invalidField");
    nodes.set(node.id, { kind, type, data: isRecord(node.data) ? node.data : {} });
  });

  const edgeIds = new Set<string>();
  const accepted: { source: string; target: string }[] = [];
  const rawEdges: unknown[] = Array.isArray(input.edges) ? input.edges : [];
  if (!Array.isArray(input.edges)) report("edges", "invalidField");
  rawEdges.forEach((edge, index) => {
    const path = `edges.${index}`;
    if (!isRecord(edge) || (typeof edge.id !== "string") || (typeof edge.source !== "string")
      || (typeof edge.target !== "string") || (typeof edge.sourcePin !== "string")) {
      return report(path, "invalidField");
    }
    if (edgeIds.has(edge.id)) return report(`${path}.id`, "duplicateEdgeId");
    edgeIds.add(edge.id);
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) return report(path, "danglingEdge");
    if ((target.kind === "event") || (edge.source === edge.target) || (edge.targetPin !== "in")) {
      return report(path, "invalidDirection");
    }
    if (!outputPins(source).includes(edge.sourcePin as PinId)) return report(`${path}.sourcePin`, "invalidPin");
    if (wouldCreateCycle(accepted, edge.source, edge.target)) return report(path, "cycle");
    accepted.push({ source: edge.source, target: edge.target });
  });

  return issues.length ? { ok: false, issues } : { ok: true, value: input as unknown as BlueprintSource };
}
