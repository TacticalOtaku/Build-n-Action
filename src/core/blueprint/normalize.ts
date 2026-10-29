import type { BlueprintSource, ConditionCheck } from "./types";

/**
 * Blueprints saved before "only this item" became a tick on the condition carried it as a check.
 * In an all-of condition the two mean the same, so the check becomes the tick; any-of conditions keep it,
 * since there the check was one alternative among others. Returns the same blueprint when nothing changes.
 */
export function foldThisItemChecks(blueprint: BlueprintSource): BlueprintSource {
  let changed = false;
  const nodes = blueprint.nodes.map(node => {
    if ((node.kind !== "condition") || (node.data.mode === "any") || !Array.isArray(node.data.checks)) return node;
    const checks = node.data.checks as ConditionCheck[];
    const kept = checks.filter(check => check.type !== "thisItem");
    if (kept.length === checks.length) return node;
    changed = true;
    return { ...node, data: { ...node.data, checks: kept, thisItem: true } };
  });
  return changed ? { ...blueprint, nodes } : blueprint;
}
