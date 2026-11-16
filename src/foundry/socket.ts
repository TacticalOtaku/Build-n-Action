import { randomId } from "../core/blueprint/ids";
import { log } from "../core/log";
import type { EventType } from "../core/registry/constants";
import { asNumber, asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import type { Operation } from "../runtime/operations";
import { listOf, read } from "../runtime/read";
import { createTransport, type SaveOutcome, type SaveRequest } from "../runtime/transport";
import { documentFromUuid } from "./documents";
import { canRunLocally, executeOperation, mayRequest } from "./operations";

export type { SaveOutcome, SaveRequest } from "../runtime/transport";

const CHANNEL = `module.${MODULE_SCOPE}`;
type TriggerReceiver = (event: EventType, actorUuid: string, key: string) => Promise<void>;

let triggerReceiver: TriggerReceiver | null = null;

function outcomeOf(rolls: unknown, by: SaveOutcome["by"]): SaveOutcome | null {
  const roll = listOf(rolls)[0];
  const total = asNumber(read(roll, "total"));
  if (!roll || (total === null)) return null;
  return { success: read(roll, "isSuccess") === true, total, by };
}

const transport = createTransport({
  userId: () => game.user.id,
  isGM: () => game.user.isGM,
  isActiveGM: () => game.users.activeGM?.id === game.user.id,
  activeGMId: () => game.users.activeGM?.id ?? null,
  hasUser: id => Boolean(game.users.get(id)),
  emit: message => game.socket.emit(CHANNEL, message),
  randomId,
  notify: (level, key) => ui.notifications[level](game.i18n.localize(key)),
  warn: (message, ...args) => log.warn(message, ...args),
  canRunLocally,
  mayRequest: (op, senderId) => {
    const sender = game.users.get(senderId);
    return sender ? mayRequest(op, sender) : false;
  },
  executeOperation,
  mayRequestTrigger: (actorUuid, senderId) => {
    const sender = game.users.get(senderId);
    // A player starts rests only for their own actors.
    return sender ? (documentFromUuid(actorUuid)?.testUserPermission?.(sender, "OWNER") === true) : false;
  },
  onTrigger: async (event, actorUuid, key) => {
    await triggerReceiver?.(event, actorUuid, key);
  },
  saveUsers: actorUuid => {
    const actor = documentFromUuid(actorUuid);
    if (!actor) return null;
    return [...game.users].map(user => ({
      id: user.id,
      isGM: user.isGM,
      active: user.active,
      owner: actor.testUserPermission?.(user, "OWNER") ?? false,
      character: user.character?.uuid === actor.uuid
    }));
  },
  rollSave: async (actorUuid, request, configure) => {
    const actor = documentFromUuid(actorUuid);
    const roll = actor ? read(actor, "rollSavingThrow") : null;
    if (typeof roll !== "function") return null;
    const rolls: unknown = await roll.call(actor, {
      ability: request.ability, target: request.dc,
      advantage: request.advantage === "advantage", disadvantage: request.advantage === "disadvantage"
    }, { configure }, {});
    return outcomeOf(rolls, configure ? "player" : "gm");
  },
  promptSaveDialog: async (request, onReady) => {
    const actor = documentFromUuid(request.actorUuid);
    if (!actor) return "missing";
    const ability = asString(read(CONFIG.DND5E.abilities, `${request.ability}.label`)) || request.ability;
    const text = game.i18n.format("BNA.Save.Prompt", { ability, dc: request.dc, source: request.source, owner: request.owner });
    const action = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format("BNA.Save.Title", { name: actor.name }), icon: "fa-solid fa-shield-halved" },
      content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      buttons: [{ action: "roll", label: game.i18n.localize("BNA.Save.Roll"), default: true }],
      rejectClose: false,
      render: (_event: unknown, dialog: unknown) => {
        onReady(() => {
          const close = read(dialog, "close");
          if (typeof close === "function") void close.call(dialog);
        });
      }
    });
    return (action === "roll") ? "roll" : "declined";
  }
});

/** A message from another client; `senderId` comes from Foundry, everything in `message` from that client. */
export function onMessage(message: unknown, senderId: string): Promise<void> {
  return transport.onMessage(message, senderId);
}

/** Ask the active GM to run a trigger (for example, a rest finished on a player's client). */
export function sendTrigger(event: EventType, actorUuid: string, key: string): boolean {
  return transport.sendTrigger(event, actorUuid, key);
}

/** Ask for a demanded save from any client; null when it could not be rolled (no GM, no actor, cancelled roll). */
export function requestSave(request: SaveRequest): Promise<SaveOutcome | null> {
  return transport.requestSave(request);
}

/** Make changes: locally where allowed, through the active GM otherwise. False when something was skipped. */
export function performOperations(operations: readonly Operation[]): Promise<boolean> {
  return transport.performOperations(operations);
}

export function registerSocket(onTrigger: TriggerReceiver): void {
  triggerReceiver = onTrigger;
  game.socket.on(CHANNEL, (message, senderId) => {
    void transport.onMessage(message, senderId);
  });
}
