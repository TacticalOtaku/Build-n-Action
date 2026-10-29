import type { BlueprintSource, ConditionCheck } from "../blueprint/types";
import { asBoolean, asNumber, asRecord } from "../registry/data";

/**
 * The checks 2.0.0 wrongly made from v1 filters that were stored with their defaults but never turned on:
 * v1 kept `healthPercentages: {value: 50, type: null}` and `tokenSizes: {size, type: null}` on every bonus.
 */
function staleChecks(original: unknown): ConditionCheck[] {
  const filters = asRecord(asRecord(original).filters);
  const health = asRecord(filters.healthPercentages);
  const size = asRecord(filters.tokenSizes);
  const stale: ConditionCheck[] = [];
  const threshold = asNumber(health.value);
  if ((threshold !== null) && (asNumber(health.type) === null)) {
    stale.push({ id: "c-healthPercentages", type: "healthPercentages", data: { value: threshold, type: "atMost" } });
  }
  const tokenSize = asNumber(size.size);
  if ((tokenSize !== null) && (tokenSize > 0) && (asNumber(size.type) === null)) {
    stale.push({ id: "c-tokenSizes", type: "tokenSizes", data: { size: tokenSize, type: "atLeast", self: asBoolean(size.self) } });
  }
  return stale;
}

function canonical(data: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(data).sort().map(key => [key, data[key]]));
}

function isSame(a: ConditionCheck, b: ConditionCheck): boolean {
  return (a.id === b.id) && (a.type === b.type) && (canonical(a.data) === canonical(b.data));
}

/**
 * Undo the stale checks of a blueprint the migration made from `original` (its v1 bonus, kept in the backup).
 * Only checks still exactly as the migration made them go; a condition left empty is removed when the migration
 * made it and nothing but its "yes" pin leads on. Returns null when nothing changes.
 */
export function repairMigratedBlueprint(blueprint: BlueprintSource, original: unknown): BlueprintSource | null {
  if (!asRecord(blueprint.flags["build-n-action"]).migratedFrom) return null;
  const stale = staleChecks(original);
  if (!stale.length) return null;

  let changed = false;
  let nodes = blueprint.nodes.map(node => {
    if (node.kind !== "condition") return node;
    const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
    const kept = checks.filter(check => !stale.some(entry => isSame(entry, check)));
    if (kept.length === checks.length) return node;
    changed = true;
    return { ...node, data: { ...node.data, checks: kept } };
  });
  if (!changed) return null;

  let edges = blueprint.edges;
  const condition = nodes.find(node => (node.id === "condition") && (node.kind === "condition"));
  const incoming = edges.filter(edge => edge.target === "condition");
  const onlyYes = edges.every(edge => (edge.source !== "condition") || (edge.sourcePin === "yes"));
  const [from] = incoming;
  const empty = !(condition?.data.checks as ConditionCheck[] | undefined)?.length && (condition?.data.thisItem !== true);
  if (condition && from && (incoming.length === 1) && onlyYes && empty) {
    nodes = nodes.filter(node => node !== condition);
    edges = edges
      .filter(edge => edge !== from)
      .map(edge => (edge.source === "condition")
        ? { ...edge, id: `${from.source}-${from.sourcePin}-${edge.target}`, source: from.source, sourcePin: from.sourcePin }
        : edge);
  }
  return { ...blueprint, nodes, edges };
}
