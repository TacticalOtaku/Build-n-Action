import type { BlueprintSource } from "../core/blueprint/types";
import type { EventType } from "../core/registry/constants";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import { sortIntents } from "../runtime/choices";
import { startsLater } from "../runtime/continuations";
import { listOf, read, stringList } from "../runtime/read";
import { injectTargetData, type ProcessConfig } from "../runtime/roll-config";
import { applyRollIntents, applySaveDC, type ApplyContext, type ModifierTracker } from "./apply";
import type { Roller } from "./collect";
import { documentBlueprints, isDocument, rollDataOf } from "./documents";
import {
  activationOf, allowIntents, announceApplied, evaluateEvent, guarded, guardedAsync, makeRoller, recordUsages, rememberActivation,
  resolveRollTarget
} from "./evaluate";
import { runContinuations } from "./reactions";
import { useRiders } from "./riders";
import { registerPending, rememberAfterRoll, takeAfterRoll, type PendingRoll } from "./roll-state";
import { countRest } from "./usage";
import { log } from "../core/log";

function runRoll(event: EventType, config: unknown, dialog: unknown, message: unknown, roller: Roller): void {
  const activation = activationOf(config, message);
  const evaluation = evaluateEvent(event, roller, ["out"], activation);
  if (!evaluation || (!evaluation.chain.intents.length && !evaluation.chain.sent.length)) return;
  const process = config as ProcessConfig;
  if (roller.target?.actor) injectTargetData(process, rollDataOf(roller.target.actor));
  const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
  const ctx: ApplyContext = { event, roller, sources: evaluation.collected.sources };
  const tracker: ModifierTracker = { active: [], halted: new Set() };
  applyRollIntents(process, sorted.immediate, ctx, tracker);
  const riders = [...new Set(sorted.immediate.flatMap(intent => ctx.sources.get(intent.entry)?.rider?.id ?? []))];

  let pending: PendingRoll | null = null;
  if ((sorted.choices.length || sorted.reminders.length) && dialog && (typeof dialog === "object")) {
    pending = { ctx, sorted, tracker, applied: new Set(), chosen: [], context: evaluation.context };
    const id = registerPending(pending);
    const holder = dialog as Record<string, unknown>;
    const options = asRecord(holder.options);
    holder.options = options;
    options[MODULE_SCOPE] = { pending: id };
    if (sorted.choices.length) holder.configure = true;
  }
  rememberAfterRoll(config, {
    applied: { ctx, context: evaluation.context, activation, run: activation ?? evaluation.id },
    intents: [...sorted.immediate, ...sorted.reminders, ...evaluation.chain.sent],
    immediate: sorted.immediate,
    riders,
    pending
  });
}

/**
 * The roll goes ahead (dialog submitted or skipped): spend limits and riders, then continue from what it applied.
 * A cancelled dialog gives no rolls, so nothing is spent for it.
 */
function postRollConfiguration(rolls: unknown, config: unknown): void {
  const after = takeAfterRoll(config);
  if (!after || !listOf(rolls).length) return;
  const actor = after.applied.ctx.roller.actor;
  announceApplied(after.immediate, after.applied.context);
  recordUsages(after.immediate, actor);
  if (after.riders.length) useRiders(actor, after.riders).catch(error => log.warn("could not use up riders", error));
  const intents = [...after.intents, ...(after.pending?.chosen ?? [])];
  if (!intents.some(startsLater)) return;
  void guardedAsync("continuation", () => runContinuations({ ...after.applied, intents }));
}

function itemOf(activity: unknown): FoundryDocument | null {
  const item = read(activity, "item");
  return isDocument(item) ? item : null;
}

function actorOf(document: unknown): FoundryDocument | null {
  const actor = read(document, "actor");
  return isDocument(actor) ? actor : null;
}

function subjectActor(config: unknown): FoundryDocument | null {
  const subject = read(config, "subject");
  return (isDocument(subject) && (subject.documentName === "Actor")) ? subject : null;
}

function activityRoll(event: "attackRoll" | "damageRoll", config: unknown, dialog: unknown, message: unknown): void {
  const activity = read(config, "subject");
  const item = itemOf(activity);
  const actor = actorOf(item);
  if (!item || !actor) return;
  if (event === "attackRoll") rememberActivation(asString(read(activity, "uuid")), activationOf(config, message));
  const target = resolveRollTarget(config, event === "damageRoll");
  const roller = makeRoller(actor, item, activity, target, { attackMode: asString(read(config, "attackMode")) || null });
  runRoll(event, config, dialog, message, roller);
}

function preRollAttack(config: unknown, dialog: unknown, message: unknown): void {
  guarded("attack", () => activityRoll("attackRoll", config, dialog, message));
}

function preRollDamage(config: unknown, dialog: unknown, message: unknown): void {
  guarded("damage", () => activityRoll("damageRoll", config, dialog, message));
}

function preRollSavingThrow(config: unknown, dialog: unknown, message: unknown): void {
  guarded("saving throw", () => {
    const actor = subjectActor(config);
    if (!actor) return;
    const hookNames = stringList(read(config, "hookNames"));
    const roller = makeRoller(actor, null, null, resolveRollTarget(config, false), {
      saveAbility: asString(read(config, "ability")) || null,
      isConcentration: (read(config, "isConcentration") === true) || hookNames.includes("concentration"),
      isDeath: hookNames.includes("deathSave")
    });
    runRoll("savingThrow", config, dialog, message, roller);
  });
}

function preRollAbilityCheck(config: unknown, dialog: unknown, message: unknown): void {
  guarded("ability check", () => {
    const actor = subjectActor(config);
    if (!actor) return;
    const item = read(config, "item");
    const roller = makeRoller(actor, isDocument(item) ? item : null, null, resolveRollTarget(config, false), {
      abilityId: asString(read(config, "ability")) || null,
      skillId: asString(read(config, "skill")) || null,
      toolId: asString(read(config, "tool")) || null
    });
    runRoll("abilityCheck", config, dialog, message, roller);
  });
}

function preRollHitDie(config: unknown, dialog: unknown, message: unknown): void {
  guarded("hit die", () => {
    const actor = subjectActor(config);
    if (!actor) return;
    runRoll("hitDie", config, dialog, message, makeRoller(actor, null, null, resolveRollTarget(config, false), {}));
  });
}

function postActivityConsumption(activity: unknown, usageConfig: unknown): void {
  guarded("save DC", () => {
    if (read(activity, "type") !== "save") return;
    const item = itemOf(activity);
    const actor = actorOf(item);
    if (!item || !actor) return;
    const roller = makeRoller(actor, item, activity, resolveRollTarget(usageConfig, false), {}, true);
    const evaluation = evaluateEvent("saveDC", roller);
    const intents = evaluation ? allowIntents(evaluation.chain.intents, evaluation.context) : [];
    applySaveDC(activity, intents, { event: "saveDC", roller, sources: evaluation?.collected.sources ?? new Map() });
    if (evaluation) announceApplied(intents, evaluation.context);
    recordUsages(intents, actor);
    if (evaluation) {
      void guardedAsync("continuation", () => runContinuations({
        intents: [...intents, ...evaluation.chain.sent], ctx: { event: "saveDC", roller, sources: evaluation.collected.sources },
        context: evaluation.context, activation: null, run: evaluation.id
      }));
    }
  });
}

function usesTemplateReach(blueprint: BlueprintSource): boolean {
  return blueprint.nodes.some(node => (node.kind === "event") && (asString(asRecord(node.data.reach).mode) === "template"));
}

/** Copy the item's template-reach blueprints (and the placer's disposition) onto the new template. */
function preCreateActivityTemplate(activity: unknown, templateData: unknown): void {
  guarded("template", () => {
    const item = itemOf(activity);
    const actor = actorOf(item);
    if (!item || !actor || !templateData || (typeof templateData !== "object")) return;
    const blueprints = documentBlueprints(item).blueprints.filter(usesTemplateReach);
    if (!blueprints.length) return;
    const getActiveTokens = read(actor, "getActiveTokens");
    const token = (read(actor, "isToken") === true)
      ? read(actor, "token")
      : ((typeof getActiveTokens === "function") ? listOf(getActiveTokens.call(actor, false, true))[0] : null);
    const disposition = asNumber(read(token, "disposition")) ?? asNumber(read(actor, "prototypeToken.disposition"));
    const data = templateData as Record<string, unknown>;
    const flags = asRecord(data.flags);
    data.flags = flags;
    flags[MODULE_SCOPE] = { ...asRecord(flags[MODULE_SCOPE]), blueprints: structuredClone(blueprints), templateDisposition: disposition };
  });
}

export function registerPreRollHooks(): void {
  Hooks.on("dnd5e.preRollAttack", preRollAttack);
  Hooks.on("dnd5e.preRollDamage", preRollDamage);
  Hooks.on("dnd5e.preRollSavingThrow", preRollSavingThrow);
  Hooks.on("dnd5e.preRollAbilityCheck", preRollAbilityCheck);
  Hooks.on("dnd5e.preRollHitDie", preRollHitDie);
  Hooks.on("dnd5e.postRollConfiguration", postRollConfiguration);
  Hooks.on("dnd5e.postActivityConsumption", postActivityConsumption);
  Hooks.on("dnd5e.preCreateActivityTemplate", preCreateActivityTemplate);
  Hooks.on("dnd5e.restCompleted", (actor: unknown, result: unknown) => {
    countRest(actor, result).catch(error => log.warn("could not count a rest", error));
  });
}
