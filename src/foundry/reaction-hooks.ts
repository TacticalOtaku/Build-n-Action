import { asNumber, asString } from "../core/registry/data";
import { attackPins, checkPins, damagePins, midiAttackPins, savePins } from "../runtime/outcomes";
import { listOf, read } from "../runtime/read";
import { actorToken, documentFromUuid, isDocument } from "./documents";
import { activationFor, guardedAsync, midiActivation } from "./evaluate";
import { runReaction } from "./reactions";

const MEMORY_MS = 10 * 60 * 1000;
const handled = new Map<string, number>();

/** True the first time a reaction key is seen (within ten minutes). */
function firstTime(key: string): boolean {
  const now = Date.now();
  for (const [seen, time] of handled) if ((now - time) > MEMORY_MS) handled.delete(seen);
  if (handled.has(key)) return false;
  handled.set(key, now);
  return true;
}

function call(target: unknown, method: string, ...args: unknown[]): unknown {
  const fn = read(target, method);
  return (typeof fn === "function") ? fn.apply(target, args) : undefined;
}

/** A token placeable from a placeable, a token document or a token UUID. */
function tokenOf(value: unknown): TokenPlaceable | null {
  if (!value) return null;
  if (typeof value === "string") return (read(documentFromUuid(value), "object") as TokenPlaceable | null) ?? null;
  if (read(value, "document") && read(value, "center")) return value as TokenPlaceable;
  return (read(value, "object") as TokenPlaceable | null) ?? null;
}

function tokens(value: unknown): TokenPlaceable[] {
  return listOf(value).map(tokenOf).filter((token): token is TokenPlaceable => !!token);
}

interface Attacker {
  actor: FoundryDocument;
  item: FoundryDocument | null;
  activity: unknown;
}

function attackerOfActivity(activity: unknown): Attacker | null {
  const item = read(activity, "item");
  const actor = read(item, "actor");
  return (isDocument(item) && isDocument(actor)) ? { actor, item, activity } : null;
}

function attackerOfWorkflow(workflow: unknown): Attacker | null {
  const actor = read(workflow, "actor");
  const item = read(workflow, "item");
  if (!isDocument(actor)) return null;
  return { actor, item: isDocument(item) ? item : null, activity: read(workflow, "activity") ?? null };
}

/* -------------------------------------------------- */
/*   Midi QOL                                         */
/* -------------------------------------------------- */

/** Whether Midi QOL decides hits itself (its "Auto check hits" setting); otherwise totals are compared with AC here. */
function midiChecksHits(): boolean {
  const settings = call(read(globalThis, "MidiQOL"), "configSettings");
  return asString(read(settings, "autoCheckHit"), "none") !== "none";
}

/**
 * Whether Midi QOL rolls targets' saves itself (its "Auto check saves" setting) and reports them in postCheckSaves.
 * Otherwise the targets roll from the save buttons on the card, as in plain dnd5e.
 */
function midiChecksSaves(): boolean {
  const settings = call(read(globalThis, "MidiQOL"), "configSettings");
  return asString(read(settings, "autoCheckSaves"), "none") !== "none";
}

function targetAc(target: TokenPlaceable): number | null {
  const covered = call(read(target.actor, "statuses"), "has", "coverTotal") === true;
  return covered ? null : asNumber(read(target.actor, "system.attributes.ac.value"));
}

async function midiAttack(workflow: unknown): Promise<void> {
  const attacker = attackerOfWorkflow(workflow);
  if (!attacker) return;
  const activation = midiActivation(workflow);
  const isCritical = read(workflow, "isCritical") === true;
  const isFumble = read(workflow, "isFumble") === true;
  const hits = new Set([...tokens(read(workflow, "hitTargets")), ...tokens(read(workflow, "hitTargetsEC"))]);
  const targets = tokens(read(workflow, "targets"));
  if (!targets.length) {
    if (!firstTime(`afterAttack|${activation}|-`)) return;
    await runReaction({ ...attacker, event: "afterAttack", pins: attackPins({ total: null, targetAc: null, isCritical, isFumble }), target: null, activation });
    return;
  }
  const checked = midiChecksHits();
  const total = asNumber(read(workflow, "attackTotal")) ?? asNumber(read(workflow, "attackRoll.total"));
  for (const target of targets) {
    if (!firstTime(`afterAttack|${activation}|${target.document.uuid}`)) continue;
    const pins = checked
      ? midiAttackPins(hits.has(target), isCritical, isFumble)
      : attackPins({ total, targetAc: targetAc(target), isCritical, isFumble });
    await runReaction({ ...attacker, event: "afterAttack", pins, target, activation });
  }
}

async function midiSaves(workflow: unknown): Promise<void> {
  const attacker = attackerOfWorkflow(workflow);
  if (!attacker) return;
  const activation = midiActivation(workflow);
  const saved = new Set(tokens(read(workflow, "saves")));
  const failed = tokens(read(workflow, "failedSaves"));
  for (const target of new Set([...saved, ...failed])) {
    if (!firstTime(`afterTargetSave|${activation}|${target.document.uuid}`)) continue;
    await runReaction({ ...attacker, event: "afterTargetSave", pins: savePins(saved.has(target)), target, activation });
  }
}

async function midiDamage(workflow: unknown): Promise<void> {
  const attacker = attackerOfWorkflow(workflow);
  if (!attacker) return;
  const activation = midiActivation(workflow);
  for (const entry of listOf(read(workflow, "damageList"))) {
    const actorUuid = asString(read(entry, "actorUuid"));
    const actor = documentFromUuid(actorUuid);
    const target = tokenOf(asString(read(entry, "targetUuid"))) ?? (actor ? actorToken(actor) : null);
    if (!firstTime(`afterDamage|${activation}|${target?.document.uuid ?? actorUuid}`)) continue;
    const pins = damagePins(asNumber(read(entry, "hpDamage")) ?? 0, asNumber(read(entry, "newHP")));
    await runReaction({ ...attacker, event: "afterDamage", pins, target, activation });
  }
}

/* -------------------------------------------------- */
/*   Plain dnd5e                                      */
/* -------------------------------------------------- */

async function dndAttack(rolls: unknown, data: unknown): Promise<void> {
  const activity = read(data, "subject");
  const attacker = attackerOfActivity(activity);
  const roll = listOf(rolls)[0];
  if (!attacker || !roll) return;
  const total = asNumber(read(roll, "total"));
  const isCritical = read(roll, "isCritical") === true;
  const isFumble = read(roll, "isFumble") === true;
  const activation = activationFor(asString(read(activity, "uuid")));
  const targets = [...game.user.targets];
  if (!targets.length) {
    await runReaction({ ...attacker, event: "afterAttack", pins: attackPins({ total, targetAc: null, isCritical, isFumble }), target: null, activation });
    return;
  }
  for (const target of targets) {
    await runReaction({ ...attacker, event: "afterAttack", pins: attackPins({ total, targetAc: targetAc(target), isCritical, isFumble }), target, activation });
  }
}

function speakerToken(message: unknown): TokenPlaceable | null {
  const scene = game.scenes.get(asString(read(message, "speaker.scene")));
  const document = call(read(scene, "tokens"), "get", asString(read(message, "speaker.token")));
  const token = tokenOf(document);
  if (token) return token;
  const actor = call(message, "getAssociatedActor");
  return isDocument(actor) ? actorToken(actor) : null;
}

/** A save rolled from a save button on a usage card; under Midi only when Midi leaves the saves to the targets. */
async function dndSave(message: unknown, midi: boolean): Promise<void> {
  if (asString(read(message, "flags.dnd5e.roll.type")) !== "save") return;
  if (midi && midiChecksSaves()) return;
  const originId = asString(read(message, "flags.dnd5e.originatingMessage"));
  const origin = originId ? game.messages.get(originId) : null;
  const activity = call(origin, "getAssociatedActivity");
  if (read(activity, "type") !== "save") return;
  const attacker = attackerOfActivity(activity);
  if (!attacker) return;
  const author = read(origin, "author");
  const executor = (read(author, "active") === true) ? asString(read(author, "id")) : (game.users.activeGM?.id ?? "");
  if (executor !== game.user.id) return;
  const roll = listOf(read(message, "rolls"))[0];
  const total = asNumber(read(roll, "total"));
  const dc = asNumber(read(roll, "options.target"));
  if ((total === null) || (dc === null)) return;
  if (!firstTime(`afterTargetSave|${asString(read(message, "id"))}`)) return;
  // Under Midi the card is the workflow's, so the reaction shares its activation (see midiActivation).
  const activation = midi ? `midi:${asString(read(origin, "uuid"))}` : `message:${originId}`;
  await runReaction({ ...attacker, event: "afterTargetSave", pins: savePins(total >= dc), target: speakerToken(message), activation });
}

async function dndDamage(actor: unknown, amount: unknown, options: unknown): Promise<void> {
  const damageMessage = read(options, "originatingMessage");
  const attacker = attackerOfActivity(call(damageMessage, "getAssociatedActivity"));
  if (!attacker || !isDocument(actor)) return;
  const messageId = asString(read(damageMessage, "id"));
  if (!firstTime(`afterDamage|${messageId}|${actor.uuid}`)) return;
  const origin = asString(read(damageMessage, "flags.dnd5e.originatingMessage")) || messageId;
  const pins = damagePins(asNumber(amount) ?? 0, asNumber(read(actor, "system.attributes.hp.value")));
  await runReaction({ ...attacker, event: "afterDamage", pins, target: actorToken(actor), activation: `message:${origin}` });
}

async function dndCheck(rolls: unknown, data: unknown): Promise<void> {
  const actor = read(data, "subject");
  const roll = listOf(rolls)[0];
  if (!isDocument(actor) || !roll) return;
  const pins = checkPins(asNumber(read(roll, "total")), asNumber(read(roll, "options.target")));
  if (!pins.length) return;
  await runReaction({
    event: "afterCheck", pins, actor, item: null, activity: null, target: null, activation: null,
    details: {
      abilityId: asString(read(data, "ability")) || null,
      skillId: asString(read(data, "skill")) || null,
      toolId: asString(read(data, "tool")) || null
    }
  });
}

/**
 * Listen for roll outcomes: Midi's workflow when Midi is active, plain dnd5e otherwise; checks always from dnd5e,
 * and targets' saves from dnd5e's save buttons whenever Midi does not roll them itself.
 */
export function registerReactionHooks(): void {
  const midi = game.modules.get("midi-qol")?.active === true;
  Hooks.on("createChatMessage", (message: unknown) => {
    void guardedAsync("after save", () => dndSave(message, midi));
  });
  if (midi) {
    Hooks.on("midi-qol.AttackRollComplete", (workflow: unknown) => guardedAsync("after attack", () => midiAttack(workflow)));
    Hooks.on("midi-qol.postCheckSaves", (workflow: unknown) => guardedAsync("after save", () => midiSaves(workflow)));
    Hooks.on("midi-qol.RollComplete", (workflow: unknown) => guardedAsync("after damage", () => midiDamage(workflow)));
  } else {
    // The documented name: dnd5e 6 calls only the hooks without the "V2" suffix.
    Hooks.on("dnd5e.rollAttack", (rolls: unknown, data: unknown) => {
      void guardedAsync("after attack", () => dndAttack(rolls, data));
    });
    Hooks.on("dnd5e.applyDamage", (actor: unknown, amount: unknown, options: unknown) => {
      void guardedAsync("after damage", () => dndDamage(actor, amount, options));
    });
  }
  for (const hook of ["dnd5e.rollAbilityCheck", "dnd5e.rollSkill", "dnd5e.rollToolCheck"]) {
    Hooks.on(hook, (rolls: unknown, data: unknown) => {
      void guardedAsync("after check", () => dndCheck(rolls, data));
    });
  }
}
