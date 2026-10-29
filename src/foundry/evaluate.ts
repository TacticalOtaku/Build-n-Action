import { randomId } from "../core/blueprint/ids";
import { runWithSignals, type ChainIntent, type ChainResult } from "../core/engine/interpreter";
import type { RollFacts } from "../core/facts/types";
import type { EventType, PinId } from "../core/registry/constants";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import { buildRollFacts, type RollDetailsInput } from "../runtime/facts";
import { listOf, read } from "../runtime/read";
import { collect, traitTrees, type CollectOptions, type Collected, type Roller } from "./collect";
import { resolveCounterIntents } from "./counters";
import { actorToken, rollDataOf } from "./documents";
import { remember } from "./roll-state";
import { recordUsage } from "./usage";
import { log } from "../core/log";

const warned = new Set<string>();

function warnOnce(name: string, error: unknown): void {
  if (warned.has(name)) return;
  warned.add(name);
  log.warn(`the ${name} hook failed; the game continues without blueprints.`, error);
}

/** Run a hook body; the first failure per hook and session is logged, and the game goes on. */
export function guarded(name: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    warnOnce(name, error);
  }
}

export async function guardedAsync(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    warnOnce(name, error);
  }
}

function first(targets: unknown): TokenPlaceable | null {
  return (listOf(targets)[0] as TokenPlaceable | undefined) ?? null;
}

/** The roll's target: Midi's workflow targets (hit targets first for damage), else the user's first target. */
export function resolveRollTarget(config: unknown, preferHit: boolean): TokenPlaceable | null {
  const workflow = read(config, "workflow") ?? read(config, "midiOptions.workflow");
  if (workflow && (typeof workflow === "object") && (("targets" in workflow) || ("hitTargets" in workflow))) {
    if (preferHit) {
      const hit = first(read(workflow, "hitTargets"));
      if (hit) return hit;
    }
    return first(read(workflow, "targets"));
  }
  return first(game.user.targets);
}

export function makeRoller(
  actor: FoundryDocument,
  item: FoundryDocument | null,
  activity: unknown,
  target: TokenPlaceable | null,
  details: RollDetailsInput,
  deterministic = false
): Roller {
  const rollData = rollDataOf(activity ?? item ?? actor, deterministic);
  if (target?.actor) rollData.target = rollDataOf(target.actor, deterministic);
  if (activity && (details.spellLevel === undefined)) details.spellLevel = asNumber(read(rollData, "item.level"));
  return { actor, item, activity, token: actorToken(actor), target, details, rollData };
}

/** What public hooks receive about an evaluation. */
export interface EvaluationContext {
  event: EventType;
  actor: FoundryDocument;
  item: FoundryDocument | null;
  activity: unknown;
  target: FoundryDocument | null;
  facts: RollFacts;
}

export interface Evaluation {
  /** Keys "exactly once" for continuations when the roll has no activation. */
  id: string;
  collected: Collected;
  chain: ChainResult;
  facts: RollFacts;
  context: EvaluationContext;
}

/** Collect, build facts and run the chain for the fired pins; null when nothing takes part or a hook vetoes. */
export function evaluateEvent(
  event: EventType,
  roller: Roller,
  pins: readonly PinId[] = ["out"],
  activation: string | null = null,
  options: CollectOptions = {}
): Evaluation | null {
  const started = performance.now();
  const collected = collect(roller, event, activation, options);
  if (!collected.entries.length) return null;
  const facts = buildRollFacts({
    event,
    actor: roller.actor,
    token: roller.token?.document ?? null,
    item: roller.item,
    activity: roller.activity,
    target: roller.target ? { actor: roller.target.actor, document: roller.target.document } : null,
    details: roller.details
  }, traitTrees());
  const context: EvaluationContext = {
    event, actor: roller.actor, item: roller.item, activity: roller.activity, target: roller.target?.actor ?? null, facts
  };
  if (Hooks.call(`${MODULE_SCOPE}.preEvaluate`, event, context) === false) return null;
  const chain = runWithSignals(collected.entries, { event, pins }, facts);
  chain.intents = resolveCounterIntents(chain.intents, collected.sources, roller);
  Hooks.callAll(`${MODULE_SCOPE}.evaluate`, event, context, chain.intents);
  remember(event, roller.actor.uuid, facts, chain, performance.now() - started);
  return { id: randomId(), collected, chain, facts, context };
}

/** Results that no `build-n-action.preApplyResult` hook vetoed. */
export function allowIntents(intents: readonly ChainIntent[], context: EvaluationContext): ChainIntent[] {
  return intents.filter(intent => Hooks.call(`${MODULE_SCOPE}.preApplyResult`, intent, context) !== false);
}

export function announceApplied(intents: readonly ChainIntent[], context: EvaluationContext): void {
  for (const intent of intents) Hooks.callAll(`${MODULE_SCOPE}.applyResult`, intent, context);
}

export function recordUsages(intents: readonly ChainIntent[], actor: FoundryDocument): void {
  for (const intent of intents) {
    if (intent.common.limit === "none") continue;
    recordUsage(actor, intent.blueprintId, intent.nodeId)
      .catch(error => log.warn("could not record a limited use", error));
  }
}

/** Activation key of a Midi workflow: its item card, else its id. */
export function midiActivation(workflow: unknown): string | null {
  const id = asString(read(workflow, "itemCardUuid")) || asString(read(workflow, "id"));
  return id ? `midi:${id}` : null;
}

/** Activation key of a roll: Midi's workflow, else the usage card it came from. */
export function activationOf(config: unknown, message: unknown): string | null {
  const workflow = read(config, "workflow") ?? read(config, "midiOptions.workflow");
  if (workflow && (typeof workflow === "object")) return midiActivation(workflow);
  const data = asRecord(read(message, "data"));
  const origin = asString(data["flags.dnd5e.originatingMessage"]) || asString(read(data, "flags.dnd5e.originatingMessage"));
  if (origin) return `message:${origin}`;
  const target = read(config, "event.target");
  const card = (target instanceof Element) ? target.closest("[data-message-id]") : null;
  const id = (card instanceof HTMLElement) ? (card.dataset.messageId ?? "") : "";
  return id ? `message:${id}` : null;
}

const activations = new Map<string, string>();

/** Remember the activation of an activity's latest attack, for the plain dnd5e attack reaction. */
export function rememberActivation(activityUuid: string, activation: string | null): void {
  if (!activityUuid) return;
  if (activation) activations.set(activityUuid, activation);
  else activations.delete(activityUuid);
}

export function activationFor(activityUuid: string): string | null {
  return activations.get(activityUuid) ?? null;
}
