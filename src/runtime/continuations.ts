import type { ChainIntent } from "../core/engine/interpreter";

/**
 * Applied results whose "And then" output leads somewhere, each with the key that lets its continuation
 * run exactly once: the run (activation or evaluation), the target, the blueprint and the node.
 */
export function continuationStarts(
  intents: readonly ChainIntent[],
  run: string,
  target: string | null
): { intent: ChainIntent; key: string }[] {
  return intents
    .filter(intent => intent.common.then && (intent.entry.compiled.continuationsOf(intent.nodeId).length > 0))
    .map(intent => ({ intent, key: `${run}|${target ?? "-"}|${intent.blueprintId}|${intent.nodeId}` }));
}

/** Whether applying this result starts more of the chain later: its "And then", or the save it demands. */
export function startsLater(intent: ChainIntent): boolean {
  return intent.common.then || (intent.type === "demandSave");
}
