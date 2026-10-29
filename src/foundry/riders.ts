import type { EventType } from "../core/registry/constants";
import { MODULE_SCOPE } from "../core/storage/repository";
import { listOf, read } from "../runtime/read";
import { readRiders, riderApplies, riderExpired, useRider, type Rider, type RiderClock } from "../runtime/riders";
import { deletion, queueFor, replacement } from "./documents";
import { usageClock } from "./usage";

/** Now, for an actor's riders: wall time, combat position and its rest counters. */
export function riderClock(actor: FoundryDocument): RiderClock {
  const combat = game.combat;
  return { ...usageClock(actor), time: Date.now(), combatants: Math.max(1, listOf(combat?.turns).length) };
}

const RIDERS = `flags.${MODULE_SCOPE}.riders`;

export function storedRiders(actor: FoundryDocument): Rider[] {
  return readRiders(read(actor, RIDERS));
}

/**
 * Store and drop riders by id, so writes from different clients (a GM's reaction adding one, the player's roll
 * using another) touch different keys and never overwrite each other. A list stored before 2.3.0 is replaced whole.
 */
async function writeRiders(actor: FoundryDocument, changed: readonly Rider[], removed: readonly string[]): Promise<void> {
  if (Array.isArray(read(actor, RIDERS))) {
    const kept = storedRiders(actor).filter(rider => !removed.includes(rider.id) && !changed.some(entry => entry.id === rider.id));
    await actor.update({ [RIDERS]: replacement(Object.fromEntries([...kept, ...changed].map(rider => [rider.id, rider]))) });
    return;
  }
  const changes: Record<string, unknown> = Object.fromEntries(changed.map(rider => [`${RIDERS}.${rider.id}`, rider]));
  for (const id of removed) changes[`${RIDERS}.${id}`] = deletion();
  if (Object.keys(changes).length) await actor.update(changes);
}

/**
 * Uses spent on this client that the actor's flags do not show yet: rolls made right after each other
 * must not reuse a rider whose update is still on its way.
 */
const pendingUses = new Map<string, number>();

function withPending(rider: Rider): Rider {
  const spent = pendingUses.get(rider.id) ?? 0;
  return ((rider.uses === null) || !spent) ? rider : { ...rider, uses: rider.uses - spent };
}

/** Riders on this actor that change this roll now. */
export function activeRiders(actor: FoundryDocument, event: EventType, activation: string | null): Rider[] {
  const now = riderClock(actor);
  return storedRiders(actor).map(withPending).filter(rider => !riderExpired(rider, now) && riderApplies(rider, event, activation));
}

/** After a roll: use up the riders that changed it and drop expired ones. */
export async function useRiders(actor: FoundryDocument, ids: readonly string[]): Promise<void> {
  for (const id of ids) pendingUses.set(id, (pendingUses.get(id) ?? 0) + 1);
  try {
    await queueFor(actor, async () => {
      const now = riderClock(actor);
      const next = storedRiders(actor).map(rider => (ids.includes(rider.id) ? useRider(rider) : rider));
      const removed = next.filter(rider => riderExpired(rider, now)).map(rider => rider.id);
      await writeRiders(actor, next.filter(rider => ids.includes(rider.id) && !removed.includes(rider.id)), removed);
    });
  } finally {
    for (const id of ids) {
      const left = (pendingUses.get(id) ?? 1) - 1;
      if (left > 0) pendingUses.set(id, left);
      else pendingUses.delete(id);
    }
  }
}

export async function addRider(actor: FoundryDocument, rider: Rider): Promise<void> {
  await queueFor(actor, async () => {
    const now = riderClock(actor);
    await writeRiders(actor, [rider], storedRiders(actor).filter(entry => riderExpired(entry, now)).map(entry => entry.id));
  });
}
