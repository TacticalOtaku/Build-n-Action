import { randomId } from "../core/blueprint/ids";
import { asNumber, asString } from "../core/registry/data";
import { listOf, read } from "../runtime/read";
import { createWaiter, pickSaveUser, SAVE_WAIT_MS } from "../runtime/saves";
import { documentFromUuid } from "./documents";
import { sendSaveMessage, setSaveReceiver } from "./socket";
import { log } from "../core/log";

export interface SaveRequest {
  actorUuid: string;
  ability: string;
  dc: number;
  advantage: "normal" | "advantage" | "disadvantage";
  /** The blueprint that demands it, and the actor it belongs to, for the player's prompt. */
  source: string;
  owner: string;
}

export interface SaveOutcome {
  success: boolean;
  total: number;
  by: "player" | "gm";
}

/** The asking client outwaits the GM: two player waits (the prompt, then the roll dialog) and the GM's own roll. */
const ASKER_WAIT_MS = (2 * SAVE_WAIT_MS) + 20_000;

const results = createWaiter<SaveOutcome | null>();
const answers = createWaiter<SaveOutcome | "declined">();
const prompts = new Map<string, () => void>();
/** On the GM: requests whose player pressed "Roll" and is in the roll dialog. */
const rolling = new Set<string>();
/** On the GM: which player each open request asked; only they may answer it. */
const asked = new Map<string, string>();
/** On the player: requests being rolled here. */
const rollingHere = new Set<string>();
let warnedNoGM = false;

function isActiveGM(): boolean {
  return game.users.activeGM?.id === game.user.id;
}

function outcomeOf(rolls: unknown, by: SaveOutcome["by"]): SaveOutcome | null {
  const roll = listOf(rolls)[0];
  const total = asNumber(read(roll, "total"));
  if (!roll || (total === null)) return null;
  return { success: read(roll, "isSuccess") === true, total, by };
}

async function rollSave(actor: FoundryDocument, request: SaveRequest, configure: boolean): Promise<SaveOutcome | null> {
  const roll = read(actor, "rollSavingThrow");
  if (typeof roll !== "function") return null;
  const rolls: unknown = await roll.call(actor, {
    ability: request.ability, target: request.dc,
    advantage: request.advantage === "advantage", disadvantage: request.advantage === "disadvantage"
  }, { configure }, {});
  return outcomeOf(rolls, configure ? "player" : "gm");
}

/** On the GM: ask the owning player and wait, else roll without a dialog. */
async function coordinate(request: SaveRequest): Promise<SaveOutcome | null> {
  const actor = documentFromUuid(request.actorUuid);
  if (!actor) return null;
  const player = pickSaveUser([...game.users].map(user => ({
    id: user.id, isGM: user.isGM, active: user.active,
    owner: actor.testUserPermission?.(user, "OWNER") ?? false,
    character: user.character?.uuid === actor.uuid
  })));
  if (player) {
    const id = randomId();
    asked.set(id, player);
    sendSaveMessage({ type: "saveAsk", id, user: player, request });
    let answer = await answers.wait(id, SAVE_WAIT_MS);
    // A player who pressed "Roll" is in the roll dialog (their bonuses, Midi's choices): give them another wait.
    if ((answer === null) && rolling.has(id)) answer = await answers.wait(id, SAVE_WAIT_MS);
    rolling.delete(id);
    asked.delete(id);
    if (answer && (answer !== "declined")) return answer;
    sendSaveMessage({ type: "saveCancel", id, user: player });
  }
  return rollSave(actor, request, false);
}

/** Ask for a demanded save from any client; null when it could not be rolled (no GM, no actor, a cancelled roll). */
export async function requestSave(request: SaveRequest): Promise<SaveOutcome | null> {
  if (isActiveGM()) return coordinate(request);
  const gm = game.users.activeGM;
  if (!gm) {
    if (!warnedNoGM) log.warn("no GM is connected, so demanded saving throws are not rolled.");
    warnedNoGM = true;
    return null;
  }
  const id = randomId();
  sendSaveMessage({ type: "saveRequest", id, gm: gm.id, request });
  // A null answer (the GM could not roll) and a timeout both mean "no outcome".
  return (await results.wait(id, ASKER_WAIT_MS)) ?? null;
}

/** On the player: a prompt naming the save and who demands it, then the normal dnd5e dialog. */
async function promptPlayer(id: string, request: SaveRequest): Promise<void> {
  const actor = documentFromUuid(request.actorUuid);
  if (!actor) return;
  const ability = asString(read(CONFIG.DND5E.abilities, `${request.ability}.label`)) || request.ability;
  const text = game.i18n.format("BNA.Save.Prompt", { ability, dc: request.dc, source: request.source, owner: request.owner });
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("BNA.Save.Title", { name: actor.name }), icon: "fa-solid fa-shield-halved" },
    content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
    buttons: [{ action: "roll", label: game.i18n.localize("BNA.Save.Roll"), default: true }],
    rejectClose: false,
    render: (_event: unknown, dialog: unknown) => {
      prompts.set(id, () => {
        const close = read(dialog, "close");
        if (typeof close === "function") void close.call(dialog);
      });
    }
  });
  prompts.delete(id);
  let outcome: SaveOutcome | null = null;
  if (action === "roll") {
    sendSaveMessage({ type: "saveRolling", id });
    rollingHere.add(id);
    outcome = await rollSave(actor, request, true);
    rollingHere.delete(id);
  }
  sendSaveMessage({ type: "saveAnswer", id, outcome: outcome ?? "declined" });
}

function isRequest(value: unknown): value is SaveRequest {
  return (typeof read(value, "actorUuid") === "string") && (typeof read(value, "ability") === "string")
    && (typeof read(value, "dc") === "number");
}

function asOutcome(value: unknown): SaveOutcome | null {
  return (value && (typeof value === "object") && (typeof read(value, "total") === "number")) ? value as SaveOutcome : null;
}

/** `sender` is the user Foundry says sent the message: results, questions and cancellations come from the GM, answers from the player asked. */
function receive(message: unknown, sender: string): void {
  const type = read(message, "type");
  const id = asString(read(message, "id"));
  const request = read(message, "request");
  const fromGM = sender === game.users.activeGM?.id;
  const fromAsked = isActiveGM() && (asked.get(id) === sender);
  if ((type === "saveRequest") && isActiveGM() && (read(message, "gm") === game.user.id) && isRequest(request)) {
    void coordinate(request).then(outcome => sendSaveMessage({ type: "saveResult", id, recipient: sender, outcome }));
  } else if ((type === "saveResult") && fromGM && (read(message, "recipient") === game.user.id)) {
    results.answer(id, asOutcome(read(message, "outcome")));
  } else if ((type === "saveAsk") && fromGM && (read(message, "user") === game.user.id) && isRequest(request)) {
    void promptPlayer(id, request);
  } else if ((type === "saveRolling") && fromAsked) {
    rolling.add(id);
  } else if ((type === "saveAnswer") && fromAsked) {
    answers.answer(id, asOutcome(read(message, "outcome")) ?? "declined");
  } else if ((type === "saveCancel") && fromGM && (read(message, "user") === game.user.id) && (prompts.has(id) || rollingHere.has(id))) {
    prompts.get(id)?.();
    prompts.delete(id);
    ui.notifications.info(game.i18n.localize("BNA.Save.TakenByGM"));
  }
}

export function registerSaves(): void {
  setSaveReceiver(receive);
}
