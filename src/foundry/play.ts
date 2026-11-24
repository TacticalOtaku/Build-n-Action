import { randomId } from "../core/blueprint/ids";
import type { BlueprintSource } from "../core/blueprint/types";
import { log } from "../core/log";
import type { EventType } from "../core/registry/constants";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import { buildRollFacts, type RollDetailsInput } from "../runtime/facts";
import {
  attackPins,
  checkPins,
  createPlay,
  damagePins,
  midiAttackPins,
  restEvent,
  savePins,
  type PlayApplyContext,
  type PlayRoller,
  type TurnState,
} from "../runtime/play";
import { matchDisposition } from "../runtime/reach";
import { listOf, read, stringList } from "../runtime/read";
import {
  resolvedConfigRollMode,
  resolvedSubmittedRollMode,
  rollModeFromRoll,
  workflowAttackRollMode,
  type ProcessConfig,
} from "../runtime/roll-config";
import { applyRollIntents, applySaveDC } from "./apply";
import { choiceData, promptChoices, renderRollPanel, syncDialogAdvantage } from "./choice-panel";
import type { Operation } from "../runtime/operations";
import { reminderNoteHtml, reminderRecipients } from "./operations";
import { collect, traitTrees } from "./collect";
import { counterStore, resetCounters } from "./counters";
import {
  actorToken,
  countRest,
  documentBlueprints,
  documentFromUuid,
  isDocument,
  originRollData,
  recordUsage,
  rollDataOf,
  usageClock,
} from "./documents";
import { resolveForeign, scaledFormula, simplifyNumber } from "./formulas";
import { withinAura } from "./geometry";
import { useRiders } from "./riders";
import { SETTINGS, setting } from "./settings";
import { performOperations, requestSave, sendTrigger } from "./socket";

type FoundryRoller = PlayRoller<FoundryDocument, FoundryDocument, TokenPlaceable>;
type FoundryApplyContext = PlayApplyContext<
  FoundryDocument,
  FoundryDocument,
  FoundryDocument,
  TokenPlaceable
>;

function isActiveGM(): boolean {
  return game.users.activeGM?.id === game.user.id;
}

function call(target: unknown, method: string, ...args: unknown[]): unknown {
  const fn = read(target, method);
  return typeof fn === "function" ? fn.apply(target, args) : undefined;
}

function firstToken(targets: unknown): TokenPlaceable | null {
  return (listOf(targets)[0] as TokenPlaceable | undefined) ?? null;
}

function rollWorkflow(config: unknown): unknown {
  return read(config, "workflow") ?? read(config, "midiOptions.workflow");
}

/** The roll's target: Midi's workflow targets (hit targets first for damage), else the user's first target. */
function resolveRollTarget(config: unknown, preferHit: boolean): TokenPlaceable | null {
  const workflow = rollWorkflow(config);
  if (workflow && typeof workflow === "object" && ("targets" in workflow || "hitTargets" in workflow)) {
    if (preferHit) {
      const hit = firstToken(read(workflow, "hitTargets"));
      if (hit) return hit;
    }
    return firstToken(read(workflow, "targets"));
  }
  return firstToken(game.user.targets);
}

/** A token placeable from a placeable, token document, or token UUID. */
function tokenOf(value: unknown): TokenPlaceable | null {
  if (!value) return null;
  if (typeof value === "string")
    return (read(documentFromUuid(value), "object") as TokenPlaceable | null) ?? null;
  if (read(value, "document") && read(value, "center")) return value as TokenPlaceable;
  return (read(value, "object") as TokenPlaceable | null) ?? null;
}

function tokens(value: unknown): TokenPlaceable[] {
  return listOf(value)
    .map(tokenOf)
    .filter((token): token is TokenPlaceable => !!token);
}

export function makeRoller(
  actor: FoundryDocument,
  item: FoundryDocument | null,
  activity: unknown,
  target: TokenPlaceable | null,
  details: RollDetailsInput,
  deterministic = false,
): FoundryRoller {
  const rollData = rollDataOf(activity ?? item ?? actor, deterministic);
  if (target?.actor) rollData.target = rollDataOf(target.actor, deterministic);
  if (activity && details.spellLevel === undefined)
    details.spellLevel = asNumber(read(rollData, "item.level"));
  return { actor, item, activity, token: actorToken(actor), target, details, rollData };
}

function midiActivation(workflow: unknown): string | null {
  const id = asString(read(workflow, "itemCardUuid")) || asString(read(workflow, "id"));
  return id ? `midi:${id}` : null;
}

function activationOf(config: unknown, message: unknown): string | null {
  const workflow = read(config, "workflow") ?? read(config, "midiOptions.workflow");
  if (workflow && typeof workflow === "object") return midiActivation(workflow);
  const data = asRecord(read(message, "data"));
  const origin =
    asString(data["flags.dnd5e.originatingMessage"]) ||
    asString(read(data, "flags.dnd5e.originatingMessage"));
  if (origin) return `message:${origin}`;
  const target = read(config, "event.target");
  const card = target instanceof Element ? target.closest("[data-message-id]") : null;
  const id = card instanceof HTMLElement ? (card.dataset.messageId ?? "") : "";
  return id ? `message:${id}` : null;
}

function saversFor(
  intent: { data: Readonly<Record<string, unknown>> },
  ctx: FoundryApplyContext,
  data: Record<string, unknown>,
): TokenPlaceable[] {
  const who = asString(intent.data.who, "target");
  const me = ctx.roller.token;
  if (who === "self") return me ? [me] : [];
  if (who !== "aura") return ctx.roller.target ? [ctx.roller.target] : [];
  if (!me || !canvas.ready) return [];
  const range = simplifyNumber(resolveForeign(asString(intent.data.range).trim() || "10", data), data) ?? 0;
  const pad = !canvas.grid.isGridless || setting(SETTINGS.padAuraRadius);
  const wanted = asString(intent.data.disposition, "-1");
  const mine = asNumber(read(me.document, "disposition"));
  return canvas.tokens.placeables.filter((token) => {
    if (!token.actor) return false;
    if (token === me) return intent.data.includeSelf === true;
    return (
      matchDisposition(wanted, mine, asNumber(read(token.document, "disposition"))) &&
      withinAura(me, token, range, [], pad)
    );
  });
}

const play = createPlay<FoundryDocument, FoundryDocument, FoundryDocument, TokenPlaceable, ProcessConfig>({
  now: () => Date.now(),
  elapsedMs: () => performance.now(),
  randomId,
  isActiveGM,
  warn: (message, ...args) => log.warn(message, ...args),
  documentUuid: (doc) => doc.uuid,
  documentName: (doc) => doc.name,
  tokenDocumentUuid: (token) => token.document.uuid,
  tokenActor: (token) => token.actor ?? null,
  actorToken,
  makeRoller,
  collect: (roller, event, activation, options) => collect(roller, event, activation, options),
  buildFacts: (event, roller) =>
    buildRollFacts(
      {
        event,
        actor: roller.actor,
        token: roller.token?.document ?? null,
        item: roller.item,
        activity: roller.activity,
        target: roller.target ? { actor: roller.target.actor, document: roller.target.document } : null,
        details: roller.details,
      },
      traitTrees(),
    ),
  counterStore,
  callPreEvaluate: (event, context) => Hooks.call(`${MODULE_SCOPE}.preEvaluate`, event, context) !== false,
  callEvaluate: (event, context, intents) => {
    Hooks.callAll(`${MODULE_SCOPE}.evaluate`, event, context, intents);
  },
  callPreApplyResult: (intent, context) =>
    Hooks.call(`${MODULE_SCOPE}.preApplyResult`, intent, context) !== false,
  callApplyResult: (intent, context) => {
    Hooks.callAll(`${MODULE_SCOPE}.applyResult`, intent, context);
  },
  recordUsage,
  originRollData: (doc) => originRollData(doc),
  targetRollData: (actor) => rollDataOf(actor),
  resolveFormula: resolveForeign,
  simplifyFormula: simplifyNumber,
  scaleFormula: scaledFormula,
  injectTargetData: (config, targetData) => {
    for (const roll of config.rolls ?? []) roll.data = { ...roll.data, target: targetData };
  },
  applyRollIntents,
  applySaveDC,
  setupRollDialog: (dialog, pendingId, hasChoices) => {
    const holder = dialog as Record<string, unknown>;
    const options = asRecord(holder.options);
    holder.options = options;
    options[MODULE_SCOPE] = { pending: pendingId };
    if (hasChoices) holder.configure = true;
  },
  syncRollDialog: (dialog, config) => syncDialogAdvantage(dialog, config),
  useRiders,
  riderClock: (actor) => ({
    ...usageClock(actor),
    time: Date.now(),
    combatants: Math.max(1, listOf(game.combat?.turns).length),
  }),
  performOperations,
  whisperReminders: async (reminders, ctx) => {
    const actor = ctx.roller.actor;
    const targetActor = ctx.roller.target?.actor ?? null;
    const remote: Operation[] = [];
    for (const intent of reminders) {
      const text = asString(intent.data.text).trim();
      if (!text) continue;
      const audience = asString(intent.data.audience, "auto");
      const label = ctx.sources.get(intent.entry)?.blueprint.name ?? "";
      if (!game.user.isGM && (audience === "gm" || audience === "target") && game.users.activeGM) {
        if (audience === "target" && !targetActor) continue;
        remote.push({
          kind: "chat",
          actor: actor.uuid,
          target: targetActor?.uuid ?? null,
          audience,
          label,
          text,
        });
        continue;
      }
      if (audience === "gm" && !game.user.isGM) continue;
      const whisper = reminderRecipients(audience, actor, targetActor);
      if (whisper === null) continue;
      await ChatMessage.implementation.create({
        content: reminderNoteHtml(label, text),
        whisper,
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
      });
    }
    if (remote.length) await performOperations(remote);
  },
  saversFor,
  requestSave,
  resetCounters,
  sendTrigger: (event, actorUuid, key) => {
    sendTrigger(event, actorUuid, key);
  },
  choiceData: (info, ctx, scale) => choiceData(info, ctx, scale),
  promptChoices: (choices, ctx, apply) =>
    promptChoices(choices, ctx, (choice, info, scale) => apply(choice, info, scale)),
});

export const guarded = play.guarded;
export const guardedAsync = play.guardedAsync;
export const recentRolls = play.recentRolls;
export const runTrigger = play.runTrigger;

/** A trigger the GM received from another client. */
export async function receiveTrigger(event: EventType, actorUuid: string, key: string): Promise<void> {
  const actor = documentFromUuid(actorUuid);
  if (actor) await play.runTrigger({ event, actor, token: null, key });
}

/* -------------------------------------------------- */
/*   Foundry hook extraction & registration           */
/* -------------------------------------------------- */

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
  return isDocument(subject) && subject.documentName === "Actor" ? subject : null;
}

function activityRoll(
  event: "attackRoll" | "damageRoll",
  config: unknown,
  dialog: unknown,
  message: unknown,
): void {
  const activity = read(config, "subject");
  const item = itemOf(activity);
  const actor = actorOf(item);
  if (!item || !actor) return;
  const activation = activationOf(config, message);
  if (event === "attackRoll") play.rememberActivation(asString(read(activity, "uuid")), activation);
  const workflow = rollWorkflow(config);
  const rollMode =
    event === "attackRoll"
      ? resolvedConfigRollMode(config as ProcessConfig, workflow)
      : (play.attackModeFor(activation) ?? workflowAttackRollMode(workflow) ?? undefined);
  const roller = makeRoller(actor, item, activity, resolveRollTarget(config, event === "damageRoll"), {
    attackMode: asString(read(config, "attackMode")) || null,
    ...(rollMode === undefined ? {} : { rollMode }),
  });
  play.preRoll(event, config as ProcessConfig, dialog, roller, activation);
}

function usesTemplateReach(blueprint: BlueprintSource): boolean {
  return blueprint.nodes.some(
    (node) => node.kind === "event" && asString(asRecord(node.data.reach).mode) === "template",
  );
}

function copyTemplateBlueprints(activity: unknown, templateData: unknown): void {
  const item = itemOf(activity);
  const actor = actorOf(item);
  if (!item || !actor || !templateData || typeof templateData !== "object") return;
  const blueprints = documentBlueprints(item).blueprints.filter(usesTemplateReach);
  if (!blueprints.length) return;
  const getActiveTokens = read(actor, "getActiveTokens");
  const token =
    read(actor, "isToken") === true
      ? read(actor, "token")
      : typeof getActiveTokens === "function"
        ? listOf(getActiveTokens.call(actor, false, true))[0]
        : null;
  const disposition =
    asNumber(read(token, "disposition")) ?? asNumber(read(actor, "prototypeToken.disposition"));
  const data = templateData as Record<string, unknown>;
  const flags = asRecord(data.flags);
  data.flags = flags;
  flags[MODULE_SCOPE] = {
    ...asRecord(flags[MODULE_SCOPE]),
    blueprints: structuredClone(blueprints),
    templateDisposition: disposition,
  };
}

function targetAc(target: TokenPlaceable): number | null {
  const covered = call(read(target.actor, "statuses"), "has", "coverTotal") === true;
  return covered ? null : asNumber(read(target.actor, "system.attributes.ac.value"));
}

function speakerToken(message: unknown): TokenPlaceable | null {
  const scene = game.scenes.get(asString(read(message, "speaker.scene")));
  const document = call(read(scene, "tokens"), "get", asString(read(message, "speaker.token")));
  const token = tokenOf(document);
  if (token) return token;
  const actor = call(message, "getAssociatedActor");
  return isDocument(actor) ? actorToken(actor) : null;
}

function turnState(value: unknown): TurnState {
  const number = (key: string) => {
    const found = read(value, key);
    return typeof found === "number" ? found : null;
  };
  return {
    round: number("round"),
    turn: number("turn"),
    combatantId: asString(read(value, "combatantId")) || null,
  };
}

function attackerOfWorkflow(
  workflow: unknown,
): { actor: FoundryDocument; item: FoundryDocument | null; activity: unknown } | null {
  const actor = read(workflow, "actor");
  const item = read(workflow, "item");
  return isDocument(actor)
    ? { actor, item: isDocument(item) ? item : null, activity: read(workflow, "activity") ?? null }
    : null;
}

function attackerOfActivity(
  activity: unknown,
): { actor: FoundryDocument; item: FoundryDocument | null; activity: unknown } | null {
  const item = itemOf(activity);
  const actor = item ? actorOf(item) : null;
  return item && actor ? { actor, item, activity } : null;
}

function midiSetting(key: string): string {
  const settings = call(read(globalThis, "MidiQOL"), "configSettings");
  return asString(read(settings, key), "none");
}

function registerPreRollHooks(): void {
  Hooks.on("dnd5e.preRollAttack", (c: unknown, d: unknown, m: unknown) =>
    guarded("attack", () => activityRoll("attackRoll", c, d, m)),
  );
  Hooks.on("dnd5e.preRollDamage", (c: unknown, d: unknown, m: unknown) =>
    guarded("damage", () => activityRoll("damageRoll", c, d, m)),
  );
  Hooks.on("dnd5e.preRollSavingThrow", (config: unknown, dialog: unknown, message: unknown) =>
    guarded("saving throw", () => {
      const actor = subjectActor(config);
      if (!actor) return;
      const hookNames = stringList(read(config, "hookNames"));
      const roller = makeRoller(actor, null, null, resolveRollTarget(config, false), {
        saveAbility: asString(read(config, "ability")) || null,
        isConcentration: read(config, "isConcentration") === true || hookNames.includes("concentration"),
        isDeath: hookNames.includes("deathSave"),
        rollMode: resolvedConfigRollMode(config as ProcessConfig, rollWorkflow(config)),
      });
      play.preRoll("savingThrow", config as ProcessConfig, dialog, roller, activationOf(config, message));
    }),
  );
  Hooks.on("dnd5e.preRollAbilityCheck", (config: unknown, dialog: unknown, message: unknown) =>
    guarded("ability check", () => {
      const actor = subjectActor(config);
      if (!actor) return;
      const item = read(config, "item");
      const roller = makeRoller(
        actor,
        isDocument(item) ? item : null,
        null,
        resolveRollTarget(config, false),
        {
          abilityId: asString(read(config, "ability")) || null,
          skillId: asString(read(config, "skill")) || null,
          toolId: asString(read(config, "tool")) || null,
          rollMode: resolvedConfigRollMode(config as ProcessConfig, rollWorkflow(config)),
        },
      );
      play.preRoll("abilityCheck", config as ProcessConfig, dialog, roller, activationOf(config, message));
    }),
  );
  Hooks.on("dnd5e.preRollHitDie", (config: unknown, dialog: unknown, message: unknown) =>
    guarded("hit die", () => {
      const actor = subjectActor(config);
      if (actor)
        play.preRoll(
          "hitDie",
          config as ProcessConfig,
          dialog,
          makeRoller(actor, null, null, resolveRollTarget(config, false), {}),
          activationOf(config, message),
        );
    }),
  );
  Hooks.on("dnd5e.postRollConfiguration", (rolls: unknown, config: unknown) => {
    const list = listOf(rolls);
    play.postRoll(list.length > 0, config, resolvedSubmittedRollMode(list, config as ProcessConfig));
  });
  Hooks.on("dnd5e.postActivityConsumption", (activity: unknown, usageConfig: unknown) =>
    guarded("save DC", () => {
      if (read(activity, "type") !== "save") return;
      const item = itemOf(activity);
      const actor = item ? actorOf(item) : null;
      if (!item || !actor) return;
      play.applySaveDC(
        activity,
        makeRoller(actor, item, activity, resolveRollTarget(usageConfig, false), {}, true),
      );
    }),
  );
  Hooks.on("dnd5e.preCreateActivityTemplate", (activity: unknown, data: unknown) =>
    guarded("template", () => copyTemplateBlueprints(activity, data)),
  );
  Hooks.on("renderRollConfigurationDialog", (app: unknown) => {
    guarded("roll dialog", () =>
      renderRollPanel(
        play.pendingRoll(read(app, `options.${MODULE_SCOPE}.pending`)),
        app,
        play.announceApplied,
      ),
    );
  });
}

function registerReactionHooks(): void {
  const midi = game.modules.get("midi-qol")?.active === true;
  Hooks.on(
    "createChatMessage",
    (message: unknown) =>
      void guardedAsync("after save", async () => {
        if (asString(read(message, "flags.dnd5e.roll.type")) !== "save") return;
        if (midi && midiSetting("autoCheckSaves") !== "none") return;
        const originId = asString(read(message, "flags.dnd5e.originatingMessage"));
        const origin = originId ? game.messages.get(originId) : null;
        const activity = call(origin, "getAssociatedActivity");
        if (read(activity, "type") !== "save") return;
        const attacker = attackerOfActivity(activity);
        const author = read(origin, "author");
        const executor =
          read(author, "active") === true ? asString(read(author, "id")) : (game.users.activeGM?.id ?? "");
        if (!attacker || executor !== game.user.id) return;
        const roll = listOf(read(message, "rolls"))[0];
        const [total, dc] = [asNumber(read(roll, "total")), asNumber(read(roll, "options.target"))];
        if (total === null || dc === null) return;
        const activation = midi ? `midi:${asString(read(origin, "uuid"))}` : `message:${originId}`;
        await play.runReaction({
          ...attacker,
          event: "afterTargetSave",
          pins: savePins(total >= dc),
          target: speakerToken(message),
          activation,
          dedupeKey: `afterTargetSave|${asString(read(message, "id"))}`,
        });
      }),
  );
  if (midi) {
    Hooks.on("midi-qol.AttackRollComplete", (workflow: unknown) =>
      guardedAsync("after attack", async () => {
        const attacker = attackerOfWorkflow(workflow);
        if (!attacker) return;
        const activation = midiActivation(workflow);
        const rollMode = workflowAttackRollMode(workflow, true);
        const [isCritical, isFumble] = [
          read(workflow, "isCritical") === true,
          read(workflow, "isFumble") === true,
        ];
        const hits = new Set([
          ...tokens(read(workflow, "hitTargets")),
          ...tokens(read(workflow, "hitTargetsEC")),
        ]);
        const targets = tokens(read(workflow, "targets"));
        if (!targets.length) {
          await play.runReaction({
            ...attacker,
            event: "afterAttack",
            pins: attackPins({ total: null, targetAc: null, isCritical, isFumble }),
            target: null,
            activation,
            details: { rollMode },
            dedupeKey: `afterAttack|${activation}|-`,
          });
          return;
        }
        const checked = midiSetting("autoCheckHit") !== "none";
        const total = asNumber(read(workflow, "attackTotal")) ?? asNumber(read(workflow, "attackRoll.total"));
        for (const target of targets) {
          const pins = checked
            ? midiAttackPins(hits.has(target), isCritical, isFumble)
            : attackPins({ total, targetAc: targetAc(target), isCritical, isFumble });
          await play.runReaction({
            ...attacker,
            event: "afterAttack",
            pins,
            target,
            activation,
            details: { rollMode },
            dedupeKey: `afterAttack|${activation}|${target.document.uuid}`,
          });
        }
      }),
    );
    Hooks.on("midi-qol.postCheckSaves", (workflow: unknown) =>
      guardedAsync("after save", async () => {
        const attacker = attackerOfWorkflow(workflow);
        if (!attacker) return;
        const activation = midiActivation(workflow);
        const saved = new Set(tokens(read(workflow, "saves")));
        for (const target of new Set([...saved, ...tokens(read(workflow, "failedSaves"))])) {
          await play.runReaction({
            ...attacker,
            event: "afterTargetSave",
            pins: savePins(saved.has(target)),
            target,
            activation,
            dedupeKey: `afterTargetSave|${activation}|${target.document.uuid}`,
          });
        }
      }),
    );
    Hooks.on("midi-qol.RollComplete", (workflow: unknown) =>
      guardedAsync("after damage", async () => {
        const attacker = attackerOfWorkflow(workflow);
        if (!attacker) return;
        const activation = midiActivation(workflow);
        const rollMode = play.attackModeFor(activation) ?? workflowAttackRollMode(workflow) ?? undefined;
        for (const entry of listOf(read(workflow, "damageList"))) {
          const actorUuid = asString(read(entry, "actorUuid"));
          const actor = documentFromUuid(actorUuid);
          const target = tokenOf(asString(read(entry, "targetUuid"))) ?? (actor ? actorToken(actor) : null);
          const pins = damagePins(asNumber(read(entry, "hpDamage")) ?? 0, asNumber(read(entry, "newHP")));
          await play.runReaction({
            ...attacker,
            event: "afterDamage",
            pins,
            target,
            activation,
            ...(rollMode === undefined ? {} : { details: { rollMode } }),
            dedupeKey: `afterDamage|${activation}|${target?.document.uuid ?? actorUuid}`,
          });
        }
      }),
    );
  } else {
    Hooks.on(
      "dnd5e.rollAttack",
      (rolls: unknown, data: unknown) =>
        void guardedAsync("after attack", async () => {
          const activity = read(data, "subject");
          const attacker = attackerOfActivity(activity);
          const roll = listOf(rolls)[0];
          if (!attacker || !roll) return;
          const [total, isCritical, isFumble] = [
            asNumber(read(roll, "total")),
            read(roll, "isCritical") === true,
            read(roll, "isFumble") === true,
          ];
          const activation = play.activationFor(asString(read(activity, "uuid")));
          const details = { rollMode: rollModeFromRoll(roll) };
          const list = [...game.user.targets];
          if (!list.length) {
            await play.runReaction({
              ...attacker,
              event: "afterAttack",
              pins: attackPins({ total, targetAc: null, isCritical, isFumble }),
              target: null,
              activation,
              details,
            });
            return;
          }
          for (const target of list) {
            await play.runReaction({
              ...attacker,
              event: "afterAttack",
              pins: attackPins({ total, targetAc: targetAc(target), isCritical, isFumble }),
              target,
              activation,
              details,
            });
          }
        }),
    );
    Hooks.on(
      "dnd5e.applyDamage",
      (actor: unknown, amount: unknown, options: unknown) =>
        void guardedAsync("after damage", async () => {
          const damageMessage = read(options, "originatingMessage");
          const attacker = attackerOfActivity(call(damageMessage, "getAssociatedActivity"));
          if (!attacker || !isDocument(actor)) return;
          const messageId = asString(read(damageMessage, "id"));
          const origin = asString(read(damageMessage, "flags.dnd5e.originatingMessage")) || messageId;
          await play.runReaction({
            ...attacker,
            event: "afterDamage",
            pins: damagePins(asNumber(amount) ?? 0, asNumber(read(actor, "system.attributes.hp.value"))),
            target: actorToken(actor),
            activation: `message:${origin}`,
            dedupeKey: `afterDamage|${messageId}|${actor.uuid}`,
          });
        }),
    );
  }
  for (const hook of ["dnd5e.rollAbilityCheck", "dnd5e.rollSkill", "dnd5e.rollToolCheck"]) {
    Hooks.on(
      hook,
      (rolls: unknown, data: unknown) =>
        void guardedAsync("after check", async () => {
          const actor = read(data, "subject");
          const roll = listOf(rolls)[0];
          if (!isDocument(actor) || !roll) return;
          const pins = checkPins(asNumber(read(roll, "total")), asNumber(read(roll, "options.target")));
          await play.runReaction({
            event: "afterCheck",
            pins,
            actor,
            item: null,
            activity: null,
            target: null,
            activation: null,
            details: {
              abilityId: asString(read(data, "ability")) || null,
              skillId: asString(read(data, "skill")) || null,
              toolId: asString(read(data, "tool")) || null,
              rollMode: rollModeFromRoll(roll),
            },
          });
        }),
    );
  }
}

function combatantActorToken(
  entry: unknown,
): { actor: FoundryDocument; token: TokenPlaceable | null } | null {
  const actor = read(entry, "actor");
  if (!isDocument(actor)) return null;
  return { actor, token: (read(entry, "token.object") as TokenPlaceable | null | undefined) ?? null };
}

export function registerPlayHooks(): void {
  registerPreRollHooks();
  registerReactionHooks();
  Hooks.on(
    "combatStart",
    (combat: unknown) =>
      void guardedAsync("combat start", () =>
        play.onCombatStart({
          id: asString(read(combat, "id")),
          combatants: listOf(read(combat, "combatants")).flatMap((entry) => {
            const resolved = combatantActorToken(entry);
            return resolved ? [{ id: asString(read(entry, "id")), ...resolved }] : [];
          }),
        }),
      ),
  );
  Hooks.on(
    "combatTurnChange",
    (combat: unknown, previous: unknown, current: unknown) =>
      void guardedAsync("turn", () =>
        play.onTurnChange({
          id: asString(read(combat, "id")),
          previous: previous ? turnState(previous) : null,
          current: current ? turnState(current) : null,
          combatant: (id) =>
            combatantActorToken(listOf(read(combat, "combatants")).find((c) => read(c, "id") === id)),
        }),
      ),
  );
  Hooks.on("dnd5e.restCompleted", (actor: unknown, result: unknown, config: unknown) => {
    countRest(actor, result).catch((error) => log.warn("could not count a rest", error));
    const event = restEvent(read(config, "type"));
    if (!event || !isDocument(actor)) return;
    play.requestTrigger(event, actor, `${actor.uuid}|${event}|${Date.now()}`);
  });
}
