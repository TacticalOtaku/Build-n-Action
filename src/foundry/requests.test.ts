import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addRider, useRiders } from "./riders";
import { trustedScriptCarrier } from "./collect";
import { executeOperation, mayRequest } from "./operations";
import { onMessage } from "./socket";

// A small world: the GM, a player who owns Hero and looks at the scene with Foe on it, and Stranger elsewhere.
const gm = { id: "gm", isGM: true, active: true };
const player = { id: "player", isGM: false, active: true, viewedScene: "battle" };
const other = { id: "other", isGM: false, active: true, viewedScene: "battle" };
const users = [gm, player, other];

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let at = target;
  for (const key of keys.slice(0, -1)) at = (at[key] ??= {}) as Record<string, unknown>;
  const last = keys.at(-1) ?? "";
  if (value instanceof Deletion) delete at[last];
  else at[last] = (value instanceof Replacement) ? value.value : value;
}

class Deletion {}
class Replacement {
  constructor(readonly value: unknown) {}
}

function actor(id: string, owners: string[], flags: Record<string, unknown> = {}) {
  return {
    documentName: "Actor", id, uuid: `Actor.${id}`, name: id, flags: { "build-n-action": flags },
    updates: [] as Record<string, unknown>[],
    get isOwner() {
      return owners.includes(game.user.id);
    },
    testUserPermission: (user: { id: string }) => owners.includes(user.id),
    applyDamage: vi.fn(),
    async update(changes: Record<string, unknown>) {
      // A round trip to the server: the stored value changes only afterwards.
      await new Promise(resolve => setTimeout(resolve, 5));
      this.updates.push(changes);
      for (const [path, value] of Object.entries(changes)) setPath(this as unknown as Record<string, unknown>, path, value);
      return this;
    }
  };
}

let hero: ReturnType<typeof actor>;
let foe: ReturnType<typeof actor>;
let stranger: ReturnType<typeof actor>;
const emit = vi.fn();

function world(me: typeof gm | typeof player) {
  const documents = new Map<string, unknown>([hero, foe, stranger].map(entry => [entry.uuid, entry]));
  vi.stubGlobal("fromUuidSync", (uuid: string) => documents.get(uuid) ?? null);
  vi.stubGlobal("fromUuid", (uuid: string) => Promise.resolve(documents.get(uuid) ?? null));
  vi.stubGlobal("foundry", {
    data: { operators: { ForcedDeletion: Deletion, ForcedReplacement: { create: (value: unknown) => new Replacement(value) } } }
  });
  vi.stubGlobal("game", {
    user: me,
    users: Object.assign(users, { activeGM: gm, get: (id: string) => users.find(user => user.id === id) }),
    scenes: { get: (id: string) => ((id === "battle") ? { tokens: [{ actor: foe }, { actor: hero }] } : null) },
    socket: { emit, on: vi.fn() },
    combat: null
  });
}

beforeEach(() => {
  hero = actor("hero", ["player"]);
  foe = actor("foe", []);
  stranger = actor("stranger", ["other"]);
  emit.mockClear();
  world(gm);
});
afterEach(() => vi.unstubAllGlobals());

const damage = (target: string) => ({ kind: "resource", actor: target, item: null, resource: "hp", delta: -5, slot: "", currency: "gp" }) as const;

describe("what the GM does for another user", () => {
  it("reaches the sender's own actors and the creatures on the scene they look at, nothing else", () => {
    expect(mayRequest(damage(hero.uuid), player)).toBe(true);
    expect(mayRequest(damage(foe.uuid), player)).toBe(true);
    expect(mayRequest(damage(stranger.uuid), player)).toBe(false);
    expect(mayRequest({ kind: "copyEffect", actor: foe.uuid, effect: stranger.uuid, origin: "" }, player)).toBe(false);
  });

  it("refuses a change outside the sender's reach and answers the user Foundry names, not the message", async () => {
    await onMessage({ type: "operations", id: "r1", gm: "gm", sender: "gm", operations: [damage(stranger.uuid), damage(foe.uuid)] }, "player");
    expect(stranger.applyDamage).not.toHaveBeenCalled();
    expect(foe.applyDamage).toHaveBeenCalledWith(5);
    expect(emit).toHaveBeenCalledWith("module.build-n-action", expect.objectContaining({ type: "reply", id: "r1", recipient: "player", ok: false }));
  });

  it("ignores messages from someone who is not a user, and malformed operations", async () => {
    await onMessage({ type: "operations", id: "r2", gm: "gm", operations: [damage(foe.uuid)] }, "ghost");
    await onMessage({ type: "operations", id: "r3", gm: "gm", operations: [{ ...damage(foe.uuid), currency: "gp.value" }, { kind: "hp", actor: foe.uuid }] }, "player");
    expect(foe.applyDamage).not.toHaveBeenCalled();
  });
});

describe("counter changes", () => {
  it("add up when they are made at once, instead of overwriting each other", async () => {
    const def = { name: "combo", min: 0, max: null, initial: 0, reset: "manual" as const };
    const plusOne = { kind: "counter", actor: hero.uuid, key: "combo", action: "add", amount: 1, def } as const;
    await Promise.all([executeOperation(plusOne), executeOperation(plusOne)]);
    expect(hero.flags["build-n-action"]).toMatchObject({ counters: { values: { combo: 2 } } });
  });
});

describe("riders", () => {
  const rider = (id: string) => ({ id, effect: { type: "rollBonus", data: {} }, scope: "nextRoll", roll: "attackRoll", uses: 1, created: Date.now(), until: null, activation: null, source: { name: "", origin: "", blueprintId: "", nodeId: "" } });

  it("are written by id, so a write touches only its own rider", async () => {
    hero.flags["build-n-action"] = { riders: { keep: rider("keep") } };
    await addRider(hero as unknown as FoundryDocument, rider("new") as never);
    expect(Object.keys(hero.updates[0] ?? {})).toEqual(["flags.build-n-action.riders.new"]);
    await useRiders(hero as unknown as FoundryDocument, ["keep"]);
    expect(Object.keys(hero.flags["build-n-action"].riders as object)).toEqual(["new"]);
  });

  it("replace a list stored before 2.3.0 once", async () => {
    hero.flags["build-n-action"] = { riders: [rider("old")] };
    await addRider(hero as unknown as FoundryDocument, rider("new") as never);
    expect(Object.keys(hero.flags["build-n-action"].riders as object)).toEqual(["old", "new"]);
  });
});

describe("script checks", () => {
  it("run only where no other player can edit them", () => {
    world(gm);
    expect(trustedScriptCarrier(hero as unknown as FoundryDocument)).toBe(false);
    expect(trustedScriptCarrier(foe as unknown as FoundryDocument)).toBe(true);
    world(player);
    expect(trustedScriptCarrier(hero as unknown as FoundryDocument)).toBe(true);
    expect(trustedScriptCarrier(stranger as unknown as FoundryDocument)).toBe(false);
  });
});
