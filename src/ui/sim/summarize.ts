import type { BlueprintNode, BlueprintSource } from "../../core/blueprint/types";
import type { BlueprintRun, CheckTrace } from "../../core/engine/interpreter";
import type { Reason } from "../../core/engine/reasons";
import type { NodeKind } from "../../core/registry/constants";
import type { CanvasTrace, NodeRunStatus } from "../canvas/trace";

export interface RunStep {
  nodeId: string;
  kind: NodeKind;
  status: NodeRunStatus;
  reason: Reason | null;
  checks: readonly CheckTrace[];
}

export interface RunSummary {
  trace: CanvasTrace;
  /** Nodes the run reached, in reading order. */
  steps: RunStep[];
  /** Why nothing applies: the first failed node and check; null when something would apply. */
  firstFailure: { nodeId: string | null; checkId: string | null; reason: Reason } | null;
}

const KIND_ORDER: Record<NodeKind, number> = { event: 0, condition: 1, result: 2 };

function readingOrder(a: BlueprintNode, b: BlueprintNode): number {
  return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (a.position.x - b.position.x) || (a.position.y - b.position.y);
}

export function summarizeRun(blueprint: BlueprintSource, run: BlueprintRun): RunSummary {
  const nodes: Record<string, NodeRunStatus> = {};
  for (const node of blueprint.nodes) nodes[node.id] = run.nodes[node.id]?.status ?? "skipped";
  const trace: CanvasTrace = { nodes, edges: new Set(run.edges) };

  const steps: RunStep[] = [...blueprint.nodes].sort(readingOrder).flatMap(node => {
    const traced = run.nodes[node.id];
    if (!traced || (traced.status === "skipped")) return [];
    return [{ nodeId: node.id, kind: node.kind, status: traced.status, reason: traced.reason ?? null, checks: traced.checks ?? [] }];
  });

  let firstFailure: RunSummary["firstFailure"] = null;
  if (run.skipped) {
    firstFailure = { nodeId: null, checkId: null, reason: run.skipped };
  } else if (!run.intents.length) {
    const failed = steps.find(step => step.status === "failed");
    const check = failed?.checks.find(entry => !entry.outcome.pass);
    const reason = check?.outcome.reason ?? failed?.reason;
    if (failed && reason) firstFailure = { nodeId: failed.nodeId, checkId: check?.checkId ?? null, reason };
  }
  return { trace, steps, firstFailure };
}
