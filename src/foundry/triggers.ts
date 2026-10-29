import type { EventType } from "../core/registry/constants";
import { asString } from "../core/registry/data";
import { sortIntents } from "../runtime/choices";
import { listOf, read } from "../runtime/read";
import { createOnce, restEvent, turnTransitions, type TurnState } from "../runtime/triggers";
import type { ApplyContext } from "./apply";
import { actorToken, documentFromUuid, isDocument } from "./documents";
import { allowIntents, announceApplied, evaluateEvent, guardedAsync, makeRoller, recordUsages } from "./evaluate";
import { whisperReminders } from "./chat";
import { resetCounters } from "./counters";
import { applyReactionIntents, runContinuations } from "./reactions";
import { sendTrigger, setTriggerReceiver } from "./socket";
import { log } from "../core/log";

export interface TriggerInput {
  event: EventType;
  actor: FoundryDocument;
  token: TokenPlaceable | null;
  /** Region events: only this region's blueprints take part. */
  only?: FoundryDocument;
  /** Fires once per key (see the plan's Global Constraints). */
  key: string;
}

/** Turns, regions and rests: a trigger is remembered for ten minutes. */
const once = createOnce(10 * 60_000);
let warnedNoGM = false;

function isActiveGM(): boolean {
  return game.users.activeGM?.id === game.user.id;
}

/** Run the blueprints a trigger starts. Only the active GM does; others ignore it (see requestTrigger). */
export async function runTrigger(input: TriggerInput): Promise<void> {
  if (!isActiveGM() || !once(input.key)) return;
  if ((input.event === "shortRest") || (input.event === "longRest") || (input.event === "turnStart")) await resetCounters(input.actor, input.event);
  const roller = { ...makeRoller(input.actor, null, null, null, {}), token: input.token ?? actorToken(input.actor) };
  const evaluation = evaluateEvent(input.event, roller, ["out"], null, input.only ? { only: input.only } : {});
  if (!evaluation?.chain.intents.length) return;
  const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
  // There is no roll dialog to ask in: optional results apply as they are, without their cost (the linter says so).
  const intents = [...sorted.immediate, ...sorted.choices.flatMap(choice => choice.intents)];
  const ctx: ApplyContext = { event: input.event, roller, sources: evaluation.collected.sources };
  const done = await applyReactionIntents(intents, ctx, null);
  await whisperReminders(sorted.reminders, ctx);
  announceApplied([...done, ...sorted.reminders], evaluation.context);
  recordUsages(done, roller.actor);
  await runContinuations({
    intents: [...done, ...sorted.reminders, ...evaluation.chain.sent], ctx, context: evaluation.context, activation: null, run: evaluation.id
  });
}

/** Start a trigger from any client: here when this is the active GM, otherwise through the GM. */
export function requestTrigger(input: { event: EventType; actor: FoundryDocument; key: string }): void {
  if (isActiveGM()) {
    void guardedAsync("trigger", () => runTrigger({ ...input, token: null }));
    return;
  }
  const gm = game.users.activeGM;
  if (!gm) {
    if (!warnedNoGM) log.warn("no GM is connected, so turn, region and rest events do not run.");
    warnedNoGM = true;
    return;
  }
  sendTrigger(gm.id, input.event, input.actor.uuid, input.key);
}

function turnState(value: unknown): TurnState {
  const number = (key: string) => {
    const found = read(value, key);
    return (typeof found === "number") ? found : null;
  };
  return { round: number("round"), turn: number("turn"), combatantId: asString(read(value, "combatantId")) || null };
}

async function onTurnChange(combat: unknown, previous: unknown, current: unknown): Promise<void> {
  if (!isActiveGM()) return;
  const combatId = asString(read(combat, "id"));
  for (const transition of turnTransitions(previous ? turnState(previous) : null, current ? turnState(current) : null)) {
    const combatant = listOf(read(combat, "combatants")).find(entry => read(entry, "id") === transition.combatantId);
    const actor = read(combatant, "actor");
    if (!isDocument(actor)) continue;
    const token = (read(combatant, "token.object") as TokenPlaceable | null | undefined) ?? null;
    await runTrigger({
      event: transition.event, actor, token,
      key: `${combatId}|${transition.event}|${transition.round}|${transition.turn}|${transition.combatantId}`
    });
  }
}

export function registerTriggerHooks(): void {
  setTriggerReceiver(receiveTrigger);
  Hooks.on("combatTurnChange", (combat: unknown, previous: unknown, current: unknown) => {
    void guardedAsync("turn", () => onTurnChange(combat, previous, current));
  });
  Hooks.on("dnd5e.restCompleted", (actor: unknown, _result: unknown, config: unknown) => {
    const event = restEvent(read(config, "type"));
    if (!event || !isDocument(actor)) return;
    requestTrigger({ event, actor, key: `${actor.uuid}|${event}|${Date.now()}` });
  });
}

/** A trigger the GM received from another client. */
export async function receiveTrigger(event: EventType, actorUuid: string, key: string): Promise<void> {
  const actor = documentFromUuid(actorUuid);
  if (actor) await runTrigger({ event, actor, token: null, key });
}
