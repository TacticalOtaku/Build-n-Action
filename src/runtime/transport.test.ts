import { afterEach, describe, expect, it, vi } from "vitest";
import type { Operation } from "./operations";
import {
  ASKER_WAIT_MS, SAVE_WAIT_MS, createTransport, createWaiter, pickSaveUser,
  type SaveOutcome, type SaveRequest, type SaveUser, type Transport, type TransportAdapter
} from "./transport";

const user = (id: string, extra: Partial<SaveUser> = {}): SaveUser => ({ id, isGM: false, active: true, owner: true, character: false, ...extra });

const SAVE_REQUEST: SaveRequest = {
  actorUuid: "Actor.hero",
  ability: "dex",
  dc: 15,
  advantage: "normal",
  source: "Fireball",
  owner: "Wizard"
};

const RESOURCE_OP: Operation = {
  kind: "resource",
  actor: "Actor.foe",
  item: null,
  resource: "hp",
  delta: -4,
  slot: "",
  currency: "gp"
};

function createCluster(activeGM: string | null = "gm") {
  let seq = 0;
  const users = new Set(["gm", "player", "asker"]);
  const clients = new Map<string, Transport>();
  const notifies = new Map<string, Array<{ level: string; key: string }>>();
  const warnings = new Map<string, unknown[][]>();
  const executed: Array<{ by: string; op: Operation }> = [];
  const triggers: Array<{ event: string; actorUuid: string; key: string }> = [];
  const promptHooks = new Map<string, (req: SaveRequest, onReady: (close: () => void) => void) => Promise<"roll" | "declined" | "missing">>();
  const rollHooks = new Map<string, (actorUuid: string, req: SaveRequest, configure: boolean) => Promise<SaveOutcome | null>>();
  const localAllowed = new Set<string>(["gm"]);
  let gmId = activeGM;

  function make(id: string, overrides: Partial<TransportAdapter> = {}): Transport {
    notifies.set(id, []);
    warnings.set(id, []);
    const instance = createTransport({
      userId: () => id,
      isGM: () => id === "gm",
      isActiveGM: () => gmId === id,
      activeGMId: () => gmId,
      hasUser: uid => users.has(uid),
      emit: message => {
        for (const [peerId, peer] of clients) {
          if (peerId === id) continue;
          void peer.onMessage(structuredClone(message), id);
        }
      },
      randomId: () => `id-${++seq}`,
      notify: (level, key) => { notifies.get(id)?.push({ level, key }); },
      warn: (...args) => { warnings.get(id)?.push(args); },
      canRunLocally: () => localAllowed.has(id),
      mayRequest: op => op.actor !== "Actor.stranger",
      executeOperation: async op => { executed.push({ by: id, op }); },
      mayRequestTrigger: (actorUuid, senderId) => (actorUuid === "Actor.hero") && (senderId === "player"),
      onTrigger: async (event, actorUuid, key) => { triggers.push({ event, actorUuid, key }); },
      saveUsers: actorUuid => (actorUuid === "Actor.missing")
        ? null
        : [
            user("gm", { isGM: true, owner: true }),
            user("player", { owner: actorUuid === "Actor.hero", character: true }),
            user("asker", { owner: false })
          ],
      rollSave: async (actorUuid, request, configure) => {
        const hook = rollHooks.get(id);
        if (hook) return hook(actorUuid, request, configure);
        return { success: true, total: configure ? 18 : 12, by: configure ? "player" : "gm" };
      },
      promptSaveDialog: async (request, onReady) => {
        const hook = promptHooks.get(id);
        if (hook) return hook(request, onReady);
        return "roll";
      },
      ...overrides
    });
    clients.set(id, instance);
    return instance;
  }

  return {
    gm: make("gm"),
    player: make("player"),
    asker: make("asker"),
    clients,
    notifies,
    warnings,
    executed,
    triggers,
    promptHooks,
    rollHooks,
    setActiveGM: (next: string | null) => { gmId = next; }
  };
}

describe("pickSaveUser", () => {
  it("prefers the active owner whose character it is", () => {
    expect(pickSaveUser([user("a"), user("b", { character: true })])).toBe("b");
    expect(pickSaveUser([user("a"), user("b")])).toBe("a");
  });

  it("skips GMs, absent users and non-owners", () => {
    expect(pickSaveUser([user("gm", { isGM: true }), user("away", { active: false }), user("other", { owner: false })])).toBeNull();
  });
});

describe("createWaiter", () => {
  afterEach(() => vi.useRealTimers());

  it("resolves with the answer", async () => {
    const waiter = createWaiter<number>();
    const pending = waiter.wait("r1", 30_000);
    expect(waiter.answer("r1", 17)).toBe(true);
    await expect(pending).resolves.toBe(17);
    expect(waiter.answer("r1", 3)).toBe(false);
  });

  it("gives null when the time runs out", async () => {
    vi.useFakeTimers();
    const waiter = createWaiter<number>();
    const pending = waiter.wait("r2", 30_000);
    vi.advanceTimersByTime(30_000);
    await expect(pending).resolves.toBeNull();
    expect(waiter.answer("r2", 5)).toBe(false);
  });
});

describe("createTransport saves", () => {
  afterEach(() => vi.useRealTimers());

  it("lets a non-GM ask the GM to coordinate a save with the owning player", async () => {
    const bus = createCluster();
    const outcome = await bus.asker.requestSave(SAVE_REQUEST);
    expect(outcome).toEqual({ success: true, total: 18, by: "player" });
  });

  it("rolls directly on the GM when no player owns the saving creature", async () => {
    const bus = createCluster();
    const outcome = await bus.gm.requestSave({ ...SAVE_REQUEST, actorUuid: "Actor.npc" });
    expect(outcome).toEqual({ success: true, total: 12, by: "gm" });
  });

  it("returns null on the GM when the actor does not exist, and warns once without an active GM", async () => {
    const bus = createCluster();
    await expect(bus.gm.requestSave({ ...SAVE_REQUEST, actorUuid: "Actor.missing" })).resolves.toBeNull();
    bus.setActiveGM(null);
    await expect(bus.asker.requestSave(SAVE_REQUEST)).resolves.toBeNull();
    await expect(bus.asker.requestSave(SAVE_REQUEST)).resolves.toBeNull();
    expect(bus.warnings.get("asker")).toHaveLength(1);
  });

  it("gives the player a second wait window once they press Roll, before taking over", async () => {
    vi.useFakeTimers();
    const bus = createCluster();
    let finishRoll!: (outcome: SaveOutcome) => void;
    bus.rollHooks.set("player", () => new Promise(resolve => { finishRoll = resolve; }));

    const pending = bus.gm.requestSave(SAVE_REQUEST);
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS);
    expect(bus.notifies.get("player")).toEqual([]);
    finishRoll({ success: false, total: 9, by: "player" });
    await expect(pending).resolves.toEqual({ success: false, total: 9, by: "player" });
  });

  it("cancels the player prompt and falls back to a GM roll when the prompt times out or declines", async () => {
    vi.useFakeTimers();
    const bus = createCluster();
    const closed = vi.fn();
    bus.promptHooks.set("player", (_req, onReady) => {
      onReady(closed);
      return new Promise(() => {});
    });

    const pending = bus.gm.requestSave(SAVE_REQUEST);
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS);
    await expect(pending).resolves.toEqual({ success: true, total: 12, by: "gm" });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(bus.notifies.get("player")).toContainEqual({ level: "info", key: "BNA.Save.TakenByGM" });
  });

  it("ignores spoofed save answers from unasked users", async () => {
    vi.useFakeTimers();
    const emitted: Record<string, unknown>[] = [];
    const gmTransport = createTransport({
      userId: () => "gm",
      isGM: () => true,
      isActiveGM: () => true,
      activeGMId: () => "gm",
      hasUser: uid => uid === "gm" || uid === "player" || uid === "spoof",
      emit: msg => emitted.push(msg),
      randomId: () => "save-1",
      notify: () => {},
      warn: () => {},
      canRunLocally: () => true,
      mayRequest: () => true,
      executeOperation: async () => {},
      mayRequestTrigger: () => true,
      onTrigger: async () => {},
      saveUsers: () => [user("player", { owner: true, character: true })],
      rollSave: async (_uuid, _req, cfg) => ({ success: false, total: 7, by: cfg ? "player" : "gm" }),
      promptSaveDialog: async () => "declined"
    });

    const pending = gmTransport.requestSave(SAVE_REQUEST);
    await gmTransport.onMessage({ type: "saveAnswer", id: "save-1", outcome: { success: true, total: 25, by: "player" } }, "spoof");
    await vi.advanceTimersByTimeAsync(SAVE_WAIT_MS);
    await expect(pending).resolves.toEqual({ success: false, total: 7, by: "gm" });
    expect(emitted).toContainEqual(expect.objectContaining({ type: "saveCancel", id: "save-1", user: "player" }));
  });

  it("resolves asker request to null if the GM never replies", async () => {
    vi.useFakeTimers();
    const bus = createCluster();
    bus.clients.delete("gm");
    const pending = bus.asker.requestSave(SAVE_REQUEST);
    await vi.advanceTimersByTimeAsync(ASKER_WAIT_MS);
    await expect(pending).resolves.toBeNull();
  });
});

describe("createTransport operations & triggers", () => {
  afterEach(() => vi.useRealTimers());

  it("batches non-local operations to the GM and reports missing GM or refused operations", async () => {
    const bus = createCluster();
    await expect(bus.player.performOperations([RESOURCE_OP])).resolves.toBe(true);
    expect(bus.executed).toEqual([{ by: "gm", op: RESOURCE_OP }]);

    await expect(bus.player.performOperations([{ ...RESOURCE_OP, actor: "Actor.stranger" }])).resolves.toBe(false);
    expect(bus.notifies.get("player")).toContainEqual({ level: "warn", key: "BNA.Runtime.RemoteFailed" });

    bus.setActiveGM(null);
    await expect(bus.player.performOperations([RESOURCE_OP])).resolves.toBe(false);
    expect(bus.notifies.get("player")).toContainEqual({ level: "warn", key: "BNA.Runtime.NoGM" });
  });

  it("accepts triggers only for allowed event types and owned actors", async () => {
    const bus = createCluster();
    await bus.gm.onMessage({ type: "trigger", gm: "gm", event: "shortRest", actorUuid: "Actor.hero", key: "k1" }, "player");
    await bus.gm.onMessage({ type: "trigger", gm: "gm", event: "shortRest", actorUuid: "Actor.foe", key: "k2" }, "player");
    await bus.gm.onMessage({ type: "trigger", gm: "gm", event: "notAnEvent", actorUuid: "Actor.hero", key: "k3" }, "player");
    expect(bus.triggers).toEqual([{ event: "shortRest", actorUuid: "Actor.hero", key: "k1" }]);

    bus.setActiveGM(null);
    expect(bus.player.sendTrigger("shortRest", "Actor.hero", "k4")).toBe(false);
    expect(bus.player.sendTrigger("shortRest", "Actor.hero", "k5")).toBe(false);
    expect(bus.warnings.get("player")).toHaveLength(1);
  });
});
