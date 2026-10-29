import { asString } from "../core/registry/data";

/** How long the GM waits for a player's save before rolling it. */
export const SAVE_WAIT_MS = 30_000;

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

/** One demanded save per run, blueprint, node and saver. */
export function saveKey(run: string, blueprintId: string, nodeId: string, actorUuid: string): string {
  return `${run}|${blueprintId}|${nodeId}|${actorUuid}`;
}

/** The DC formula of a demand-save result: its own, or the blueprint owner's spell DC. */
export function saveDcFormula(data: Readonly<Record<string, unknown>>): string {
  if (asString(data.dcMode) === "spell") return "@attributes.spell.dc";
  return asString(data.dc).trim() || "10";
}

export function outcomePin(success: boolean): "succeeded" | "failed" {
  return success ? "succeeded" : "failed";
}
