import { randomId } from "../core/blueprint/ids";
import { MAX_SIGNAL_DEPTH, runWithSignals, type ChainIntent } from "../core/engine/interpreter";
import type { EventType, PinId } from "../core/registry/constants";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { sortIntents } from "../runtime/choices";
import { continuationStarts } from "../runtime/continuations";
import { buildRollFacts, type RollDetailsInput } from "../runtime/facts";
import { planOperation, type Operation } from "../runtime/operations";
import { matchDisposition } from "../runtime/reach";
import { read } from "../runtime/read";
import { planCounter } from "../runtime/counters";
import { createRider } from "../runtime/riders";
import { outcomePin, saveDcFormula, saveKey } from "../runtime/saves";
import { createOnce } from "../runtime/triggers";
import type { ApplyContext } from "./apply";
import { whisperReminders } from "./chat";
import { choiceData, renderChoices, type ChoiceHost } from "./choice-panel";
import { counterStore, resolveCounterIntents } from "./counters";
import { traitTrees } from "./collect";
import { originRollData } from "./documents";
import { allowIntents, announceApplied, evaluateEvent, guardedAsync, makeRoller, recordUsages, type EvaluationContext } from "./evaluate";
import { resolveForeign, scaledFormula, simplifyNumber } from "./formulas";
import { withinAura } from "./geometry";
import { riderClock } from "./riders";
import { requestSave, type SaveRequest } from "./saves";
import { SETTINGS, setting } from "./settings";
import { performOperations } from "./socket";

/** Formula fields of roll results that a rider carries; resolved when the rider is made. */
const RIDER_FORMULAS = ["formula", "damage", "dice", "critical", "fumble", "targetValue", "deathSaveCritical"];

export interface ReactionInput {
  event: EventType;
  pins: readonly PinId[];
  actor: FoundryDocument;
  item: FoundryDocument | null;
  activity: unknown;
  target: TokenPlaceable | null;
  activation: string | null;
  details?: RollDetailsInput;
}

export interface ReactionOptions {
  /** Origin roll data (with @scaling) of a paid choice. */
  data?: Record<string, unknown>;
  scale?: number;
  costFormula?: string;
}

function riderData(intent: ChainIntent, data: Record<string, unknown>, options: ReactionOptions): Record<string, unknown> {
  const effect = asRecord(intent.data.effect);
  const fields: Record<string, unknown> = { ...asRecord(effect.data) };
  for (const key of RIDER_FORMULAS) {
    const value = asString(fields[key]).trim();
    if (value) fields[key] = resolveForeign(value, data);
  }
  if ((asString(effect.type) === "rollBonus") && options.scale) {
    fields.formula = scaledFormula(asString(asRecord(effect.data).formula), options.costFormula ?? "", data, options.scale);
  }
  return { ...intent.data, effect: { type: asString(effect.type), data: fields } };
}

/** Turn reaction results into operations (riders, effects, resources) and perform them; returns the intents that applied. */
export async function applyReactionIntents(
  intents: readonly ChainIntent[],
  ctx: ApplyContext,
  activation: string | null,
  options: ReactionOptions = {}
): Promise<ChainIntent[]> {
  const operations: Operation[] = [];
  const applied: ChainIntent[] = [];
  const self = ctx.roller.actor;
  const target = ctx.roller.target?.actor ?? null;
  for (const intent of intents) {
    const info = ctx.sources.get(intent.entry);
    if (!info) continue;
    const data = options.data ?? originRollData(info.document);
    const origin = info.origin?.uuid ?? info.document.uuid;

    // A demanded save has no change to make now; runContinuations rolls it.
    if (intent.type === "demandSave") {
      applied.push(intent);
      continue;
    }

    if (intent.type === "counter") {
      const toTarget = asString(intent.data.who, "self") === "target";
      const me = info.owner ?? self;
      const amountFormula = asString(intent.data.amount).trim() || "1";
      const op = planCounter(intent.data, {
        self: me.uuid, target: target?.uuid ?? null, blueprint: info.blueprint,
        amount: simplifyNumber(resolveForeign(amountFormula, data), data) ?? 0
      }, counterStore(toTarget ? target : me));
      if (op) {
        operations.push(op);
        applied.push(intent);
      }
      continue;
    }

    if (intent.type === "rider") {
      // A same-activation rider needs an activation to meet; without one (a bare roll) it could never apply.
      if ((asString(intent.data.scope) !== "nextRoll") && !activation) continue;
      const toTarget = (asString(intent.data.scope) === "nextRoll") && (asString(intent.data.who, "self") === "target");
      const recipient = toTarget ? target : self;
      if (!recipient) continue;
      const rider = createRider(riderData(intent, data, options), {
        id: randomId(),
        activation,
        clock: riderClock(recipient),
        source: { name: info.blueprint.name, origin, blueprintId: intent.blueprintId, nodeId: intent.nodeId }
      });
      if (rider) {
        operations.push({ kind: "rider", actor: recipient.uuid, rider });
        applied.push(intent);
      }
      continue;
    }

    const amountFormula = asString(intent.data.amount).trim() || "1";
    const amount = (intent.type === "resource") ? (simplifyNumber(resolveForeign(amountFormula, data), data) ?? 0) : 0;
    const op = planOperation(intent.type, intent.data, {
      self: self.uuid, target: target?.uuid ?? null, carrierItem: info.carrierItem?.uuid ?? null, origin, amount
    });
    if (op) {
      operations.push(op);
      applied.push(intent);
    }
  }
  if (!operations.length) return applied;
  // A change that failed (or found no GM to make it) must not continue the chain.
  return (await performOperations(operations)) ? applied : applied.filter(intent => intent.type === "demandSave");
}

/** One application of results, from which their "And then" outputs continue. */
export interface AppliedResults {
  intents: readonly ChainIntent[];
  ctx: ApplyContext;
  context: EvaluationContext;
  activation: string | null;
  /** The activation, else the evaluation id: with the target, blueprint and node it keys "exactly once". */
  run: string;
}

/** A result's continuation runs once per application (ten-minute memory). */
const continued = createOnce(10 * 60_000);

/**
 * Follow "And then" from results that were really applied: evaluate each continuation with the original
 * facts, apply it at once (there is no roll dialog to ask in), whisper its reminders, and go on from what
 * it applied, up to MAX_SIGNAL_DEPTH levels.
 */
export async function runContinuations(applied: AppliedResults, depth = 0): Promise<void> {
  if (depth >= MAX_SIGNAL_DEPTH) return;
  const { ctx, context, activation } = applied;
  const entries = [...ctx.sources.keys()];
  for (const intent of applied.intents) {
    if (intent.type === "demandSave") void guardedAsync("demanded save", () => runDemandedSave(intent, applied, depth));
  }
  for (const { intent, key } of continuationStarts(applied.intents, applied.run, ctx.roller.target?.document.uuid ?? null)) {
    if (!continued(key)) continue;
    const chain = runWithSignals(entries, { event: "afterResult", pins: ["then"], from: intent.nodeId }, context.facts, { starters: [intent.entry] });
    const sorted = sortIntents(allowIntents(resolveCounterIntents(chain.intents, ctx.sources, ctx.roller), context));
    const done = await applyReactionIntents([...sorted.immediate, ...sorted.choices.flatMap(choice => choice.intents)], ctx, activation);
    await whisperReminders(sorted.reminders, ctx);
    announceApplied([...done, ...sorted.reminders], context);
    recordUsages(done, ctx.roller.actor);
    await runContinuations({ ...applied, intents: [...done, ...sorted.reminders, ...chain.sent] }, depth + 1);
  }
}

/** A demanded save's key memory: one save per run, blueprint, node and saver (ten minutes). */
const demanded = createOnce(10 * 60_000);

/** Who a demand-save result asks: the target, me, or the creatures in my aura (by disposition). */
function saversFor(intent: ChainIntent, ctx: ApplyContext, data: Record<string, unknown>): TokenPlaceable[] {
  const who = asString(intent.data.who, "target");
  const me = ctx.roller.token;
  if (who === "self") return me ? [me] : [];
  if (who !== "aura") return ctx.roller.target ? [ctx.roller.target] : [];
  if (!me || !canvas.ready) return [];
  const range = simplifyNumber(resolveForeign(asString(intent.data.range).trim() || "10", data), data) ?? 0;
  const pad = !canvas.grid.isGridless || setting(SETTINGS.padAuraRadius);
  const wanted = asString(intent.data.disposition, "-1");
  const mine = asNumber(read(me.document, "disposition"));
  return canvas.tokens.placeables.filter(token => {
    if (!token.actor) return false;
    if (token === me) return intent.data.includeSelf === true;
    return matchDisposition(wanted, mine, asNumber(read(token.document, "disposition"))) && withinAura(me, token, range, [], pad);
  });
}

/** Roll one demanded save per saver, then continue down its "Succeeded" or "Failed" branch with the saver as the target. */
async function runDemandedSave(intent: ChainIntent, applied: AppliedResults, depth: number): Promise<void> {
  const { ctx, context } = applied;
  const info = ctx.sources.get(intent.entry);
  if (!info) return;
  const data = originRollData(info.document);
  const dc = simplifyNumber(resolveForeign(saveDcFormula(intent.data), data), data);
  if (dc === null) return;
  const entries = [...ctx.sources.keys()];
  await Promise.all(saversFor(intent, ctx, data).map(async saver => {
    const actor = saver.actor;
    if (!actor || !demanded(saveKey(applied.run, intent.blueprintId, intent.nodeId, actor.uuid))) return;
    const outcome = await requestSave({
      actorUuid: actor.uuid, ability: asString(intent.data.ability, "con"), dc,
      advantage: asString(intent.data.advantage, "normal") as SaveRequest["advantage"],
      source: info.blueprint.name, owner: info.owner?.name ?? ctx.roller.actor.name
    });
    if (!outcome || !intent.entry.compiled.continuationsOf(intent.nodeId).length) return;
    const roller = { ...ctx.roller, target: saver };
    const facts = buildRollFacts({
      event: context.event, actor: roller.actor, token: roller.token?.document ?? null, item: roller.item, activity: roller.activity,
      target: { actor, document: saver.document }, details: roller.details
    }, traitTrees());
    const saveCtx: ApplyContext = { ...ctx, roller };
    const saveContext: EvaluationContext = { ...context, target: actor, facts };
    const pin = outcomePin(outcome.success);
    const chain = runWithSignals(entries, { event: "demandedSave", pins: [pin], from: intent.nodeId }, facts, { starters: [intent.entry] });
    const sorted = sortIntents(allowIntents(resolveCounterIntents(chain.intents, saveCtx.sources, saveCtx.roller), saveContext));
    const done = await applyReactionIntents([...sorted.immediate, ...sorted.choices.flatMap(choice => choice.intents)], saveCtx, applied.activation);
    await whisperReminders(sorted.reminders, saveCtx);
    announceApplied([...done, ...sorted.reminders], saveContext);
    recordUsages(done, roller.actor);
    await runContinuations({ ...applied, intents: [...done, ...sorted.reminders, ...chain.sent], ctx: saveCtx, context: saveContext }, depth + 1);
  }));
}

async function promptChoices(host: ChoiceHost, choices: ReturnType<typeof sortIntents>["choices"], actor: FoundryDocument): Promise<void> {
  const panel = renderChoices(host, { choices, reminders: [] });
  if (!panel) return;
  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("BNA.Reaction.Title", { name: actor.name }), icon: "fa-solid fa-diagram-project" },
    position: { width: 420 },
    content: "<div class=\"bna-reaction\"></div>",
    buttons: [{ action: "done", label: game.i18n.localize("BNA.Reaction.Done"), default: true }],
    rejectClose: false,
    render: (_event: unknown, dialog: unknown) => {
      const element = asRecord(dialog).element;
      if (element instanceof HTMLElement) element.querySelector(".bna-reaction")?.append(panel);
    }
  });
}

/** Run blueprints reacting to an outcome: immediate results now, optional ones through a prompt. */
export async function runReaction(input: ReactionInput): Promise<void> {
  if (!input.pins.length) return;
  const roller = makeRoller(input.actor, input.item, input.activity, input.target, { ...(input.details ?? {}) });
  const evaluation = evaluateEvent(input.event, roller, input.pins, input.activation);
  if (!evaluation?.chain.intents.length) return;
  const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
  const ctx: ApplyContext = { event: input.event, roller, sources: evaluation.collected.sources };

  const run = input.activation ?? evaluation.id;
  const done = await applyReactionIntents(sorted.immediate, ctx, input.activation);
  announceApplied(done, evaluation.context);
  recordUsages(done, roller.actor);
  await runContinuations({ intents: [...done, ...evaluation.chain.sent], ctx, context: evaluation.context, activation: input.activation, run });
  if (!sorted.choices.length) return;

  const host: ChoiceHost = {
    ctx,
    applied: new Set(),
    apply: async (choice, info, scale) => {
      const done = await applyReactionIntents(choice.intents, ctx, input.activation, {
        data: choiceData(info, ctx, scale), scale, costFormula: choice.cost.formula
      });
      announceApplied(done, evaluation.context);
      await runContinuations({ intents: done, ctx, context: evaluation.context, activation: input.activation, run });
    }
  };
  await promptChoices(host, sorted.choices, input.actor);
}
