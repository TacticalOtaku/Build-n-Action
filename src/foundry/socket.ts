import { randomId } from "../core/blueprint/ids";
import { TRIGGER_EVENTS, type EventType } from "../core/registry/constants";
import { asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import { readOperation, type Operation } from "../runtime/operations";
import { listOf, read } from "../runtime/read";
import { documentFromUuid } from "./documents";
import { canRunLocally, executeOperation, mayRequest } from "./operations";
import { log } from "../core/log";

const CHANNEL = `module.${MODULE_SCOPE}`;
const TIMEOUT_MS = 15_000;

interface Reply {
  ok: boolean;
  error: string | null;
}

/** Replies awaited here, each from the GM the request went to. */
const waiting = new Map<string, { gm: string; resolve(reply: Reply): void }>();

/** Runs a trigger another client sent; set by triggers.ts, which imports this module. */
let receiveTrigger: ((event: EventType, actorUuid: string, key: string) => Promise<void>) | null = null;

export function setTriggerReceiver(receiver: (event: EventType, actorUuid: string, key: string) => Promise<void>): void {
  receiveTrigger = receiver;
}

/** Handles demanded-save messages, with the id of the user who sent them; set by saves.ts. */
let receiveSave: ((message: unknown, sender: string) => void) | null = null;

export function setSaveReceiver(receiver: (message: unknown, sender: string) => void): void {
  receiveSave = receiver;
}

/** Demanded saves: requests, questions, answers and cancellations between the asking client, the GM and the player. */
export function sendSaveMessage(message: Record<string, unknown>): void {
  game.socket.emit(CHANNEL, message);
}

/** A message from another client; `senderId` comes from Foundry, everything in `message` from that client. */
export async function onMessage(message: unknown, senderId: string): Promise<void> {
  const type = read(message, "type");
  const id = asString(read(message, "id"));
  const sender = game.users.get(senderId);
  if (!sender) return;
  if (type === "reply") {
    const awaited = waiting.get(id);
    if ((read(message, "recipient") !== game.user.id) || (awaited?.gm !== senderId)) return;
    awaited.resolve({ ok: read(message, "ok") === true, error: asString(read(message, "error")) || null });
    return;
  }
  if ((typeof type === "string") && type.startsWith("save")) {
    receiveSave?.(message, senderId);
    return;
  }
  if (type === "trigger") {
    if (!game.user.isGM || (read(message, "gm") !== game.user.id)) return;
    const event = asString(read(message, "event"));
    const actorUuid = asString(read(message, "actorUuid"));
    // A player starts rests only for their own actors.
    if (!(TRIGGER_EVENTS as readonly string[]).includes(event) || (documentFromUuid(actorUuid)?.testUserPermission?.(sender, "OWNER") !== true)) return;
    await receiveTrigger?.(event as EventType, actorUuid, asString(read(message, "key")));
    return;
  }
  if ((type !== "operations") || !game.user.isGM || (read(message, "gm") !== game.user.id)) return;
  let error: string | null = null;
  for (const raw of listOf(read(message, "operations"))) {
    const op = readOperation(raw);
    if (!op || !mayRequest(op, sender)) {
      error = "Build-n-Action | a requested change was refused";
      log.warn(`refused a change user ${senderId} asked for`, raw);
      continue;
    }
    try {
      await executeOperation(op);
    } catch (failure) {
      error = (failure instanceof Error) ? failure.message : String(failure);
      log.warn("a requested change failed", op, failure);
    }
  }
  game.socket.emit(CHANNEL, { type: "reply", id, recipient: senderId, ok: error === null, error });
}

/** Ask the active GM to run a trigger (a rest finished on a player's client). */
export function sendTrigger(gm: string, event: string, actorUuid: string, key: string): void {
  game.socket.emit(CHANNEL, { type: "trigger", gm, event, actorUuid, key });
}

export function registerSocket(): void {
  game.socket.on(CHANNEL, (message, senderId) => {
    void onMessage(message, senderId);
  });
}

/** Make changes: locally where allowed, through the active GM otherwise. False when something was skipped. */
export async function performOperations(operations: readonly Operation[]): Promise<boolean> {
  const remote: Operation[] = [];
  let ok = true;
  for (const op of operations) {
    if (!canRunLocally(op)) {
      remote.push(op);
      continue;
    }
    try {
      await executeOperation(op);
    } catch (error) {
      ok = false;
      log.warn("a change failed", op, error);
    }
  }
  if (!remote.length) return ok;

  const gm = game.users.activeGM;
  if (!gm) {
    ui.notifications.warn(game.i18n.localize("BNA.Runtime.NoGM"));
    return false;
  }
  const id = randomId();
  const reply = new Promise<Reply | null>(resolve => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(null);
    }, TIMEOUT_MS);
    waiting.set(id, {
      gm: gm.id,
      resolve: answer => {
        clearTimeout(timer);
        waiting.delete(id);
        resolve(answer);
      }
    });
  });
  game.socket.emit(CHANNEL, { type: "operations", id, gm: gm.id, operations: remote });
  const answer = await reply;
  if (!answer?.ok) {
    log.warn("the GM could not make all changes", answer?.error ?? "no reply");
    ui.notifications.warn(game.i18n.localize("BNA.Runtime.RemoteFailed"));
    return false;
  }
  return ok;
}
