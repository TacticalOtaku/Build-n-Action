import { TRIGGER_EVENTS, type EventType } from "../core/registry/constants";
import { asString } from "../core/registry/data";
import { readOperation, type Operation } from "./operations";
import { listOf, read } from "./read";

/** How long the GM waits for a player's save before rolling it. */
export const SAVE_WAIT_MS = 30_000;

/** The asking client outwaits the GM: two player waits (prompt, then roll dialog) and the GM's own roll. */
export const ASKER_WAIT_MS = (2 * SAVE_WAIT_MS) + 20_000;

/** How long a client waits for the GM to reply to a batch of operations. */
export const OPERATION_TIMEOUT_MS = 15_000;

/** What the GM knows about a user when choosing who rolls a demanded save. */
export interface SaveUser {
  id: string;
  isGM: boolean;
  active: boolean;
  /** Owns the saving actor. */
  owner: boolean;
  /** The saving actor is this user's assigned character. */
  character: boolean;
}

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

interface OperationReply {
  ok: boolean;
  error: string | null;
}

export interface TransportAdapter {
  userId(): string;
  isGM(): boolean;
  isActiveGM(): boolean;
  activeGMId(): string | null;
  hasUser(userId: string): boolean;
  emit(message: Record<string, unknown>): void;
  randomId(): string;
  notify(level: "info" | "warn", key: string): void;
  warn(message: string, ...args: unknown[]): void;
  canRunLocally(op: Operation): boolean;
  mayRequest(op: Operation, senderId: string): boolean;
  executeOperation(op: Operation): Promise<void>;
  mayRequestTrigger(actorUuid: string, senderId: string): boolean;
  onTrigger(event: EventType, actorUuid: string, key: string): Promise<void>;
  /** Returns null when the saving actor does not exist on this client. */
  saveUsers(actorUuid: string): SaveUser[] | null;
  rollSave(actorUuid: string, request: SaveRequest, configure: boolean): Promise<SaveOutcome | null>;
  promptSaveDialog(request: SaveRequest, onReady: (close: () => void) => void): Promise<"roll" | "declined" | "missing">;
}

export interface Transport {
  performOperations(operations: readonly Operation[]): Promise<boolean>;
  sendTrigger(event: EventType, actorUuid: string, key: string): boolean;
  requestSave(request: SaveRequest): Promise<SaveOutcome | null>;
  onMessage(message: unknown, senderId: string): Promise<void>;
}

/** The player who rolls: an active non-GM owner, preferring the one whose character it is; null lets the GM roll. */
export function pickSaveUser(users: readonly SaveUser[]): string | null {
  const owners = users.filter(user => user.active && !user.isGM && user.owner);
  return (owners.find(user => user.character) ?? owners[0])?.id ?? null;
}

/** Requests that wait for an answer by id, or resolve to null after a timeout. */
export function createWaiter<T>(): { wait(id: string, ms: number): Promise<T | null>; answer(id: string, value: T): boolean } {
  const pending = new Map<string, (value: T | null) => void>();
  return {
    wait: (id, ms) => new Promise(resolve => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(null);
      }, ms);
      pending.set(id, value => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(value);
      });
    }),
    answer: (id, value) => {
      const settle = pending.get(id);
      if (!settle) return false;
      settle(value);
      return true;
    }
  };
}

function isSaveRequest(value: unknown): value is SaveRequest {
  return (typeof read(value, "actorUuid") === "string")
    && (typeof read(value, "ability") === "string")
    && (typeof read(value, "dc") === "number");
}

function asSaveOutcome(value: unknown): SaveOutcome | null {
  return (value && (typeof value === "object") && (typeof read(value, "total") === "number"))
    ? value as SaveOutcome
    : null;
}

/** Multi-client transport: operation RPC, cross-client triggers, and demanded-save coordination. */
export function createTransport(adapter: TransportAdapter): Transport {
  const replies = createWaiter<OperationReply>();
  const replyGms = new Map<string, string>();
  const results = createWaiter<SaveOutcome | null>();
  const answers = createWaiter<SaveOutcome | "declined">();
  const prompts = new Map<string, () => void>();
  /** On the GM: requests whose player pressed "Roll" and is in the roll dialog. */
  const rolling = new Set<string>();
  /** On the GM: which player each open request asked; only they may answer it. */
  const asked = new Map<string, string>();
  /** On the player: requests being rolled here. */
  const rollingHere = new Set<string>();
  let warnedNoTriggerGM = false;
  let warnedNoSaveGM = false;

  async function coordinateSave(request: SaveRequest): Promise<SaveOutcome | null> {
    const users = adapter.saveUsers(request.actorUuid);
    if (!users) return null;
    const player = pickSaveUser(users);
    if (player) {
      const id = adapter.randomId();
      asked.set(id, player);
      adapter.emit({ type: "saveAsk", id, user: player, request });
      let answer = await answers.wait(id, SAVE_WAIT_MS);
      // A player who pressed "Roll" is in the roll dialog (bonuses, Midi choices): give them another wait.
      if ((answer === null) && rolling.has(id)) answer = await answers.wait(id, SAVE_WAIT_MS);
      rolling.delete(id);
      asked.delete(id);
      if (answer && (answer !== "declined")) return answer;
      adapter.emit({ type: "saveCancel", id, user: player });
    }
    return adapter.rollSave(request.actorUuid, request, false);
  }

  async function promptPlayer(id: string, request: SaveRequest): Promise<void> {
    const action = await adapter.promptSaveDialog(request, close => prompts.set(id, close));
    prompts.delete(id);
    if (action === "missing") return;
    let outcome: SaveOutcome | null = null;
    if (action === "roll") {
      adapter.emit({ type: "saveRolling", id });
      rollingHere.add(id);
      outcome = await adapter.rollSave(request.actorUuid, request, true);
      rollingHere.delete(id);
    }
    adapter.emit({ type: "saveAnswer", id, outcome: outcome ?? "declined" });
  }

  async function handleSaveMessage(type: string, id: string, message: unknown, senderId: string): Promise<void> {
    const request = read(message, "request");
    const userId = adapter.userId();
    const isActiveGM = adapter.isActiveGM();
    const fromGM = senderId === adapter.activeGMId();
    const fromAsked = isActiveGM && (asked.get(id) === senderId);
    if ((type === "saveRequest") && isActiveGM && (read(message, "gm") === userId) && isSaveRequest(request)) {
      const outcome = await coordinateSave(request);
      adapter.emit({ type: "saveResult", id, recipient: senderId, outcome });
    } else if ((type === "saveResult") && fromGM && (read(message, "recipient") === userId)) {
      results.answer(id, asSaveOutcome(read(message, "outcome")));
    } else if ((type === "saveAsk") && fromGM && (read(message, "user") === userId) && isSaveRequest(request)) {
      await promptPlayer(id, request);
    } else if ((type === "saveRolling") && fromAsked) {
      rolling.add(id);
    } else if ((type === "saveAnswer") && fromAsked) {
      answers.answer(id, asSaveOutcome(read(message, "outcome")) ?? "declined");
    } else if ((type === "saveCancel") && fromGM && (read(message, "user") === userId) && (prompts.has(id) || rollingHere.has(id))) {
      prompts.get(id)?.();
      prompts.delete(id);
      adapter.notify("info", "BNA.Save.TakenByGM");
    }
  }

  async function handleOperations(id: string, message: unknown, senderId: string): Promise<void> {
    if (!adapter.isGM() || (read(message, "gm") !== adapter.userId())) return;
    let error: string | null = null;
    for (const raw of listOf(read(message, "operations"))) {
      const op = readOperation(raw);
      if (!op || !adapter.mayRequest(op, senderId)) {
        error = "Build-n-Action | a requested change was refused";
        adapter.warn(`refused a change user ${senderId} asked for`, raw);
        continue;
      }
      try {
        await adapter.executeOperation(op);
      } catch (failure) {
        error = (failure instanceof Error) ? failure.message : String(failure);
        adapter.warn("a requested change failed", op, failure);
      }
    }
    adapter.emit({ type: "reply", id, recipient: senderId, ok: error === null, error });
  }

  return {
    async performOperations(operations) {
      const remote: Operation[] = [];
      let ok = true;
      for (const op of operations) {
        if (!adapter.canRunLocally(op)) {
          remote.push(op);
          continue;
        }
        try {
          await adapter.executeOperation(op);
        } catch (error) {
          ok = false;
          adapter.warn("a change failed", op, error);
        }
      }
      if (!remote.length) return ok;

      const gm = adapter.activeGMId();
      if (!gm) {
        adapter.notify("warn", "BNA.Runtime.NoGM");
        return false;
      }
      const id = adapter.randomId();
      replyGms.set(id, gm);
      const pending = replies.wait(id, OPERATION_TIMEOUT_MS);
      adapter.emit({ type: "operations", id, gm, operations: remote });
      const answer = await pending;
      replyGms.delete(id);
      if (!answer?.ok) {
        adapter.warn("the GM could not make all changes", answer?.error ?? "no reply");
        adapter.notify("warn", "BNA.Runtime.RemoteFailed");
        return false;
      }
      return ok;
    },

    sendTrigger(event, actorUuid, key) {
      const gm = adapter.activeGMId();
      if (!gm) {
        if (!warnedNoTriggerGM) adapter.warn("no GM is connected, so turn, region and rest events do not run.");
        warnedNoTriggerGM = true;
        return false;
      }
      adapter.emit({ type: "trigger", gm, event, actorUuid, key });
      return true;
    },

    async requestSave(request) {
      if (adapter.isActiveGM()) return coordinateSave(request);
      const gm = adapter.activeGMId();
      if (!gm) {
        if (!warnedNoSaveGM) adapter.warn("no GM is connected, so demanded saving throws are not rolled.");
        warnedNoSaveGM = true;
        return null;
      }
      const id = adapter.randomId();
      adapter.emit({ type: "saveRequest", id, gm, request });
      return (await results.wait(id, ASKER_WAIT_MS)) ?? null;
    },

    async onMessage(message, senderId) {
      const type = read(message, "type");
      const id = asString(read(message, "id"));
      if (!adapter.hasUser(senderId)) return;
      if (type === "reply") {
        if ((read(message, "recipient") !== adapter.userId()) || (replyGms.get(id) !== senderId)) return;
        replies.answer(id, { ok: read(message, "ok") === true, error: asString(read(message, "error")) || null });
        return;
      }
      if ((typeof type === "string") && type.startsWith("save")) {
        await handleSaveMessage(type, id, message, senderId);
        return;
      }
      if (type === "trigger") {
        if (!adapter.isGM() || (read(message, "gm") !== adapter.userId())) return;
        const event = asString(read(message, "event"));
        const actorUuid = asString(read(message, "actorUuid"));
        if (!(TRIGGER_EVENTS as readonly string[]).includes(event) || !adapter.mayRequestTrigger(actorUuid, senderId)) return;
        await adapter.onTrigger(event as EventType, actorUuid, asString(read(message, "key")));
        return;
      }
      if (type === "operations") await handleOperations(id, message, senderId);
    }
  };
}
