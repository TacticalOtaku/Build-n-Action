import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { compileBlueprint } from "../core/engine/compile";
import type { ChainEntry, ChainIntent } from "../core/engine/interpreter";
import type { BlueprintSource } from "../core/blueprint/types";
import { type CounterStore } from "../core/counters/counters";
import { passed } from "../core/engine/reasons";
import { actorFacts, creatureFacts, rollDetails, rollFacts } from "../core/testing/facts";
import { makeCondition, makeEdge, makeNode } from "../core/testing/graph";
import {
  attackPins,
  checkPins,
  continuationStarts,
  createOnce,
  createPlay,
  damagePins,
  limitAvailable,
  midiAttackPins,
  needsRegionBehavior,
  outcomePin,
  reminderKey,
  restEvent,
  saveDcFormula,
  saveKey,
  savePins,
  startsLater,
  turnTransitions,
  usageKey,
  type PlayAdapter,
  type PlaySourceInfo,
  type UsageClock,
} from "./play";
import type { SaveOutcome } from "./transport";

const clock = (partial: Partial<UsageClock> = {}): UsageClock => ({
  combatId: "c1",
  round: 2,
  turn: 3,
  shortRests: 1,
  longRests: 1,
  ...partial,
});

describe("limitAvailable & usageKey", () => {
  it("checks turn, round, and rest reset periods", () => {
    expect(limitAvailable(null, clock(), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock(), "turn")).toBe(false);
    expect(limitAvailable(clock(), clock({ turn: 4 }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ round: 3, turn: 3 }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ combatId: "c2" }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ turn: 5 }), "round")).toBe(false);
    expect(limitAvailable(clock(), clock({ round: 3 }), "round")).toBe(true);
    expect(limitAvailable(clock({ combatId: null }), clock({ combatId: null }), "turn")).toBe(true);
    expect(limitAvailable(clock(), clock({ combatId: null }), "round")).toBe(true);
    expect(limitAvailable(clock(), clock(), "shortRest")).toBe(false);
    expect(limitAvailable(clock(), clock({ shortRests: 2 }), "shortRest")).toBe(true);
    expect(limitAvailable(clock(), clock({ longRests: 2 }), "shortRest")).toBe(true);
    expect(limitAvailable(clock(), clock({ shortRests: 2 }), "longRest")).toBe(false);
    expect(limitAvailable(clock(), clock({ longRests: 2 }), "longRest")).toBe(true);
  });

  it("builds flag-safe usage keys", () => {
    expect(usageKey("aB3dE5gH7jK9mN1p", "rollBonus")).toBe("aB3dE5gH7jK9mN1p_rollBonus");
  });
});

describe("outcome pins & save helpers", () => {
  it("derives pins for attacks, Midi hits, saves, damage, checks, and demanded saves", () => {
    expect(attackPins({ total: 15, targetAc: 15, isCritical: false, isFumble: false })).toEqual(["hit"]);
    expect(attackPins({ total: 14, targetAc: 15, isCritical: false, isFumble: false })).toEqual(["miss"]);
    expect(attackPins({ total: 3, targetAc: 30, isCritical: true, isFumble: false })).toEqual([
      "hit",
      "crit",
    ]);
    expect(attackPins({ total: 40, targetAc: 10, isCritical: false, isFumble: true })).toEqual([
      "miss",
      "fumble",
    ]);
    expect(attackPins({ total: 15, targetAc: null, isCritical: false, isFumble: false })).toEqual([]);
    expect(attackPins({ total: 15, targetAc: null, isCritical: true, isFumble: false })).toEqual([
      "hit",
      "crit",
    ]);
    expect(midiAttackPins(true, false, false)).toEqual(["hit"]);
    expect(midiAttackPins(true, true, false)).toEqual(["hit", "crit"]);
    expect(midiAttackPins(false, true, false)).toEqual(["miss"]);
    expect(midiAttackPins(false, false, true)).toEqual(["miss", "fumble"]);
    expect(savePins(true)).toEqual(["succeeded"]);
    expect(savePins(false)).toEqual(["failed"]);
    expect(damagePins(7, 3)).toEqual(["dealt"]);
    expect(damagePins(7, 0)).toEqual(["dealt", "dropped"]);
    expect(damagePins(7, null)).toEqual(["dealt"]);
    expect(damagePins(0, 0)).toEqual([]);
    expect(damagePins(-5, 10)).toEqual([]);
    expect(checkPins(15, 15)).toEqual(["success"]);
    expect(checkPins(14, 15)).toEqual(["failure"]);
    expect(checkPins(14, null)).toEqual([]);
    expect(checkPins(null, 15)).toEqual([]);
    expect(outcomePin(true)).toBe("succeeded");
    expect(outcomePin(false)).toBe("failed");
    expect(saveKey("midi:card", "aB3dE5gH7jK9mN1p", "save", "Actor.foe")).toBe(
      "midi:card|aB3dE5gH7jK9mN1p|save|Actor.foe",
    );
    expect(saveDcFormula({ dcMode: "formula", dc: " 8 + @prof " })).toBe("8 + @prof");
    expect(saveDcFormula({ dcMode: "formula", dc: "" })).toBe("10");
    expect(saveDcFormula({ dcMode: "spell", dc: "13" })).toBe("@attributes.spell.dc");
  });
});

describe("triggers & continuation pure helpers", () => {
  it("detects forward turn transitions and rests", () => {
    expect(
      turnTransitions({ round: 1, turn: 0, combatantId: "a" }, { round: 1, turn: 1, combatantId: "b" }),
    ).toEqual([
      { event: "turnEnd", combatantId: "a", round: 1, turn: 0 },
      { event: "turnStart", combatantId: "b", round: 1, turn: 1 },
    ]);
    expect(
      turnTransitions({ round: 1, turn: 2, combatantId: "c" }, { round: 2, turn: 0, combatantId: "a" }),
    ).toHaveLength(2);
    expect(
      turnTransitions({ round: 0, turn: null, combatantId: null }, { round: 1, turn: 0, combatantId: "a" }),
    ).toEqual([{ event: "turnStart", combatantId: "a", round: 1, turn: 0 }]);
    expect(
      turnTransitions({ round: 2, turn: 1, combatantId: "b" }, { round: 2, turn: 0, combatantId: "a" }),
    ).toEqual([]);
    expect(
      turnTransitions({ round: 2, turn: 1, combatantId: "b" }, { round: 2, turn: 1, combatantId: "b" }),
    ).toEqual([]);
    expect(turnTransitions(null, null)).toEqual([]);
    expect(restEvent("short")).toBe("shortRest");
    expect(restEvent("long")).toBe("longRest");
    expect(restEvent("other")).toBeNull();
  });

  it("remembers keys for TTL and detects region blueprints", () => {
    const once = createOnce(1000);
    expect(once("a", 0)).toBe(true);
    expect(once("a", 500)).toBe(false);
    expect(once("b", 500)).toBe(true);
    expect(once("a", 2000)).toBe(true);

    const enter = createBlueprint({
      nodes: [makeNode("event", "regionEnter", "ev"), makeNode("result", "reminder", "r")],
      edges: [makeEdge("ev", "out", "r")],
    });
    const roll = createBlueprint({ nodes: [makeNode("event", "attackRoll", "ev")], edges: [] });
    expect(needsRegionBehavior([roll, enter])).toBe(true);
    expect(needsRegionBehavior([roll])).toBe(false);
  });

  it("identifies continuation starters and key formats", () => {
    const blueprint = createBlueprint({
      id: "aB3dE5gH7jK9mN1p",
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        makeNode("result", "rollBonus", "smite", {
          common: { optional: true, choiceGroup: "", cost: { type: "none" }, limit: "none", then: true },
        }),
        makeNode("result", "rollBonus", "plain"),
        makeNode("result", "applyEffect", "blind"),
      ],
      edges: [
        makeEdge("ev", "out", "smite"),
        makeEdge("ev", "out", "plain"),
        makeEdge("smite", "then", "blind"),
      ],
    });
    const entry = {
      compiled: compileBlueprint(blueprint),
      documentUuid: "Item.sword",
      actorUuid: "Actor.hero",
    } as unknown as ChainEntry;
    const intent = (nodeId: string, then: boolean): ChainIntent => ({
      blueprintId: blueprint.id,
      nodeId,
      type: "rollBonus",
      data: {},
      eventNodeId: "ev",
      entry,
      common: { optional: false, choiceGroup: nodeId, cost: {}, limit: "none", then },
    });
    expect(
      continuationStarts(
        [intent("smite", true), intent("plain", false), intent("plain", true)],
        "midi:card",
        "Token.foe",
      ),
    ).toEqual([{ intent: intent("smite", true), key: "midi:card|Token.foe|aB3dE5gH7jK9mN1p|smite" }]);
    expect(continuationStarts([intent("smite", true)], "ev1", null)[0]?.key).toBe(
      "ev1|-|aB3dE5gH7jK9mN1p|smite",
    );
    expect(startsLater(intent("smite", true))).toBe(true);
    expect(startsLater(intent("plain", false))).toBe(false);
    expect(startsLater({ ...intent("plain", false), type: "demandSave" })).toBe(true);
  });
});

interface Doc {
  uuid: string;
  name: string;
}
interface Token {
  document: Doc;
  actor: Doc;
}
interface RollConfig {
  advantage?: boolean;
  disadvantage?: boolean;
  rolls?: Array<{ data?: Record<string, unknown> }>;
}

function harness(blueprints: BlueprintSource[]) {
  let idSeq = 0;
  let clockMs = 1000;
  let activeGM = true;
  const counterValues: Record<string, Record<string, number>> = {};
  const performed: unknown[] = [];
  const whispered: Array<{ text: string; actor: string }> = [];
  const appliedRoll: Array<{ intents: ChainIntent[]; config: RollConfig }> = [];
  const usages: Array<{ actor: string; blueprintId: string; nodeId: string }> = [];
  const resetCalls: Array<{ actor: string; event: string }> = [];
  const triggersSent: Array<{ event: string; actorUuid: string; key: string }> = [];
  const appliedHooks: ChainIntent[] = [];
  const syncedDialogs: Array<{ dialog: unknown; config: RollConfig }> = [];
  const whisperedDetails: Array<{ text: string; audience: string; actor: string }> = [];
  let vetoResult: ((intent: ChainIntent) => boolean) | null = null;
  let saveOutcome: SaveOutcome | null = { success: false, total: 9, by: "gm" };

  const hero: Doc = { uuid: "Actor.hero", name: "Hero" };
  const foe: Doc = { uuid: "Actor.foe", name: "Foe" };
  const sword: Doc = { uuid: "Item.sword", name: "Sword" };
  const foeToken: Token = { document: { uuid: "Token.foe", name: "Foe" }, actor: foe };
  const heroToken: Token = { document: { uuid: "Token.hero", name: "Hero" }, actor: hero };

  const makeEntry = (bp: BlueprintSource): [ChainEntry, PlaySourceInfo<Doc, Doc, Doc>] => {
    const compiled = compileBlueprint(bp);
    const entry: ChainEntry = {
      compiled,
      documentUuid: sword.uuid,
      actorUuid: hero.uuid,
      env: {
        evaluateNumber: (f) => (Number.isFinite(Number(f)) ? Number(f) : null),
        replaceData: (text) => text,
        runScript: () => null,
        carrierItemUuid: sword.uuid,
        reach: () => passed("matched"),
        limitAvailable: () => true,
      },
    };
    const info: PlaySourceInfo<Doc, Doc, Doc> = {
      document: sword,
      kind: "self",
      blueprint: bp,
      owner: hero,
      origin: sword,
      carrierItem: sword,
    };
    return [entry, info];
  };

  const entriesMap = blueprints.map(makeEntry);

  const adapter: PlayAdapter<Doc, Doc, Doc, Token, RollConfig> = {
    now: () => clockMs,
    elapsedMs: () => 5,
    randomId: () => `gen-${++idSeq}`,
    isActiveGM: () => activeGM,
    warn: () => {},
    documentUuid: (doc) => doc.uuid,
    documentName: (doc) => doc.name,
    tokenDocumentUuid: (token) => token.document.uuid,
    tokenActor: (token) => token.actor,
    actorToken: (actor) => (actor.uuid === hero.uuid ? heroToken : foeToken),
    makeRoller: (actor, item, activity, target, details) => ({
      actor,
      item,
      activity,
      token: heroToken,
      target,
      details,
      rollData: {},
    }),
    collect: () => ({ entries: entriesMap.map(([entry]) => entry), sources: new Map(entriesMap) }),
    buildFacts: (event, roller) =>
      rollFacts({
        event,
        actor: actorFacts({ uuid: roller.actor.uuid }),
        target: roller.target ? creatureFacts() : null,
        roll: rollDetails({ rollMode: roller.details.rollMode ?? null }),
      }),
    counterStore: (actor): CounterStore => ({ values: counterValues[actor?.uuid ?? ""] ?? {}, defs: {} }),
    callPreEvaluate: () => true,
    callEvaluate: () => {},
    callPreApplyResult: (intent) => (vetoResult ? vetoResult(intent) : true),
    callApplyResult: (intent) => {
      appliedHooks.push(intent);
    },
    recordUsage: async (actor, blueprintId, nodeId) => {
      usages.push({ actor: actor.uuid, blueprintId, nodeId });
    },
    originRollData: () => ({ prof: 3 }),
    targetRollData: (actor) => ({ name: actor.name }),
    resolveFormula: (formula, data) => formula.replace(/@prof/g, String(data.prof ?? 0)),
    simplifyFormula: (formula) => {
      if (!formula.trim()) return null;
      const parts = formula.split("+").map((part) => Number(part.trim()));
      return parts.every(Number.isFinite) ? parts.reduce((a, b) => a + b, 0) : null;
    },
    scaleFormula: (formula, _scaleFormula, _data, scale) => `${formula} + ${scale}d8`,
    injectTargetData: (config, targetData) => {
      for (const roll of config.rolls ?? []) roll.data = { ...roll.data, target: targetData };
    },
    applyRollIntents: (config, intents) => {
      appliedRoll.push({ intents: [...intents], config });
    },
    applySaveDC: () => {},
    setupRollDialog: (dialog, pendingId, hasChoices) => {
      const record = dialog as Record<string, unknown>;
      record.pending = pendingId;
      record.configure = hasChoices;
    },
    syncRollDialog: (dialog, config) => {
      syncedDialogs.push({ dialog, config });
    },
    useRiders: async () => {},
    riderClock: () => ({
      combatId: null,
      round: 0,
      turn: 0,
      shortRests: 0,
      longRests: 0,
      time: clockMs,
      combatants: 1,
    }),
    performOperations: async (ops) => {
      performed.push(...ops);
      return true;
    },
    whisperReminders: async (reminders, ctx) => {
      for (const intent of reminders) {
        whispered.push({ text: String(intent.data.text ?? ""), actor: ctx.roller.actor.uuid });
        whisperedDetails.push({
          text: String(intent.data.text ?? ""),
          audience: String(intent.data.audience ?? "auto"),
          actor: ctx.roller.actor.uuid,
        });
      }
    },
    saversFor: (_intent, ctx) => (ctx.roller.target ? [ctx.roller.target] : [foeToken]),
    requestSave: async () => saveOutcome,
    resetCounters: async (actor, event) => {
      resetCalls.push({ actor: actor.uuid, event });
    },
    sendTrigger: (event, actorUuid, key) => {
      triggersSent.push({ event, actorUuid, key });
    },
    choiceData: (_info, _ctx, scale) => ({ prof: 3, scaling: scale }),
    promptChoices: async () => {},
  };

  return {
    play: createPlay(adapter),
    hero,
    foe,
    sword,
    foeToken,
    heroToken,
    performed,
    whispered,
    whisperedDetails,
    appliedRoll,
    usages,
    resetCalls,
    triggersSent,
    appliedHooks,
    syncedDialogs,
    counterValues,
    setClock: (ms: number) => {
      clockMs = ms;
    },
    setGM: (gm: boolean) => {
      activeGM = gm;
    },
    setVeto: (fn: (intent: ChainIntent) => boolean) => {
      vetoResult = fn;
    },
    setSaveOutcome: (outcome: SaveOutcome | null) => {
      saveOutcome = outcome;
    },
  };
}

describe("createPlay orchestration", () => {
  afterEach(() => vi.useRealTimers());

  it("handles preRoll -> pending dialog -> postRoll -> continuation and suppresses on cancelled roll", async () => {
    const bp = createBlueprint({
      id: "PreRollBp0000001",
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        makeNode("result", "rollBonus", "opt", {
          formula: "1d8",
          common: { optional: true, choiceGroup: "smite", cost: { type: "none" }, limit: "turn", then: true },
        }),
        makeNode("result", "applyEffect", "burn", { source: "status", status: "burning", who: "target" }),
      ],
      edges: [makeEdge("ev", "out", "opt"), makeEdge("opt", "then", "burn")],
    });
    const env = harness([bp]);
    const config: RollConfig = { rolls: [{ data: {} }] };
    const dialog: Record<string, unknown> = {};
    const roller = {
      actor: env.hero,
      item: env.sword,
      activity: null,
      token: env.heroToken,
      target: env.foeToken,
      details: {},
      rollData: {},
    };

    env.play.preRoll("damageRoll", config, dialog, roller, "midi:c1");
    expect(dialog.configure).toBe(true);
    const pending = env.play.pendingRoll(dialog.pending);
    expect(pending).not.toBeNull();
    expect(config.rolls?.[0]?.data).toMatchObject({ target: { name: "Foe" } });
    expect(env.play.recentRolls()).toHaveLength(1);

    // Cancelled roll: spends nothing and stops continuations.
    env.play.postRoll(false, config);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(env.performed).toEqual([]);
    expect(env.usages).toEqual([]);

    // Submitted roll with chosen optional smite -> continuation runs once.
    env.play.preRoll("damageRoll", config, dialog, roller, "midi:c2");
    const submitted = env.play.pendingRoll(dialog.pending);
    submitted?.chosen.push(submitted.sorted.choices[0]!.intents[0]!);
    env.play.postRoll(true, config);
    await vi.waitFor(() => expect(env.performed).toHaveLength(1));
    expect(env.performed[0]).toMatchObject({ kind: "status", status: "burning", actor: "Actor.foe" });
  });

  it("resolves nested diceModifiers formula fields in riders using mapFormulaFields", async () => {
    const bp = createBlueprint({
      id: "RiderNested00001",
      nodes: [
        makeNode("event", "afterAttack", "ev"),
        makeNode("result", "rider", "ride", {
          scope: "nextRoll",
          who: "self",
          roll: "damageRoll",
          effect: {
            type: "diceModifiers",
            data: { amount: { enabled: true, mode: "add", value: "@prof" }, firstOnly: true },
          },
        }),
      ],
      edges: [makeEdge("ev", "hit", "ride")],
    });
    const env = harness([bp]);
    await env.play.runReaction({
      event: "afterAttack",
      pins: ["hit"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "midi:atk1",
    });
    expect(env.performed).toHaveLength(1);
    expect(env.performed[0]).toMatchObject({
      kind: "rider",
      rider: {
        effect: {
          type: "diceModifiers",
          data: { amount: { enabled: true, mode: "add", value: "3" }, firstOnly: true },
        },
      },
    });
  });

  it("executes demanded save continuations, whispers reminders, respects veto hooks, and handles triggers & turns", async () => {
    const bp = createBlueprint({
      id: "SaveAndTurn00001",
      nodes: [
        makeNode("event", "turnStart", "ev"),
        makeNode("result", "demandSave", "save", {
          ability: "con",
          dcMode: "formula",
          dc: "10 + @prof",
          who: "target",
          common: { limit: "turn" },
        }),
        makeNode("result", "reminder", "rem", { text: "Check concentration @counters.focus" }),
      ],
      edges: [makeEdge("ev", "out", "save"), makeEdge("save", "failed", "rem")],
    });
    const env = harness([bp]);
    env.counterValues["Actor.hero"] = { focus: 4 };

    await env.play.onTurnChange({
      id: "combat-1",
      previous: { round: 1, turn: 0, combatantId: "c0" },
      current: { round: 1, turn: 1, combatantId: "c1" },
      combatant: (id) => (id === "c1" ? { actor: env.hero, token: env.heroToken } : null),
    });
    await vi.waitFor(() => expect(env.whispered).toHaveLength(1));
    expect(env.whispered[0]).toEqual({ text: "Check concentration 4", actor: "Actor.hero" });
    expect(env.resetCalls).toEqual([{ actor: "Actor.hero", event: "turnStart" }]);

    // Non-GM forwards trigger to GM socket; veto hook prevents results on replay.
    env.setGM(false);
    env.play.requestTrigger("shortRest", env.hero, "rest-key");
    expect(env.triggersSent).toEqual([{ event: "shortRest", actorUuid: "Actor.hero", key: "rest-key" }]);

    env.appliedHooks.length = 0;
    env.setGM(true);
    env.setVeto(() => false);
    await env.play.runTrigger({ event: "turnStart", actor: env.hero, token: env.heroToken, key: "k-vetoed" });
    expect(env.appliedHooks).toEqual([]);
  });

  it("deduplicates reactions by dedupeKey within ten minutes", async () => {
    const bp = createBlueprint({
      id: "DedupeReact00001",
      nodes: [
        makeNode("event", "afterAttack", "ev"),
        makeNode("result", "resource", "heal", {
          action: "restore",
          resource: "hp",
          amount: "2",
          who: "self",
        }),
      ],
      edges: [makeEdge("ev", "hit", "heal")],
    });
    const env = harness([bp]);
    await env.play.runReaction({
      event: "afterAttack",
      pins: ["hit"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "midi:x",
      dedupeKey: "afterAttack|midi:x|Token.foe",
    });
    await env.play.runReaction({
      event: "afterAttack",
      pins: ["hit"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "midi:x",
      dedupeKey: "afterAttack|midi:x|Token.foe",
    });
    expect(env.performed).toHaveLength(1);
  });

  it("fires combatStart once per distinct combatant actor only on the active GM", async () => {
    const bp = createBlueprint({
      id: "CombatStartBp001",
      nodes: [
        makeNode("event", "combatStart", "ev"),
        makeNode("result", "reminder", "rem", { audience: "all", text: "Initiative!" }),
      ],
      edges: [makeEdge("ev", "out", "rem")],
    });
    const env = harness([bp]);

    env.setGM(false);
    await env.play.onCombatStart({
      id: "cmb-1",
      combatants: [{ id: "c1", actor: env.hero, token: env.heroToken }],
    });
    expect(env.whisperedDetails).toEqual([]);

    env.setGM(true);
    await env.play.onCombatStart({
      id: "cmb-1",
      combatants: [
        { id: "c1", actor: env.hero, token: env.heroToken },
        { id: "c2", actor: env.hero, token: env.heroToken },
        { id: "c3", actor: null, token: null },
      ],
    });
    expect(env.whisperedDetails).toEqual([{ text: "Initiative!", audience: "all", actor: "Actor.hero" }]);
  });

  it("syncs dialog for rollAdvantage, allows riders with rollAdvantage, and posts only unshown reminders after roll proceeds", async () => {
    const bpAdv = createBlueprint({
      id: "RollAdvBp0000001",
      nodes: [
        makeNode("event", "attackRoll", "ev"),
        makeNode("result", "rollAdvantage", "adv", { mode: "advantage" }),
        makeNode("event", "afterAttack", "after"),
        makeNode("result", "rider", "ride", {
          scope: "nextRoll",
          who: "self",
          roll: "savingThrow",
          effect: { type: "rollAdvantage", data: { mode: "disadvantage" } },
        }),
      ],
      edges: [makeEdge("ev", "out", "adv"), makeEdge("after", "hit", "ride")],
    });
    const bpRem = createBlueprint({
      id: "RemFilterBp00001",
      nodes: [
        makeNode("event", "abilityCheck", "ev"),
        makeNode("result", "reminder", "shown", { audience: "auto", text: "In dialog" }),
        makeNode("result", "reminder", "pub", { audience: "all", text: "Public note" }),
      ],
      edges: [makeEdge("ev", "out", "shown"), makeEdge("ev", "out", "pub")],
    });
    const env = harness([bpAdv, bpRem]);
    const roller = {
      actor: env.hero,
      item: env.sword,
      activity: null,
      token: env.heroToken,
      target: env.foeToken,
      details: {},
      rollData: {},
    };

    // rollAdvantage calls syncRollDialog even without choices/reminders; riders accept rollAdvantage.
    const atkConfig: RollConfig = { rolls: [{}] };
    const atkDialog: Record<string, unknown> = {};
    env.play.preRoll("attackRoll", atkConfig, atkDialog, roller, null);
    expect(env.syncedDialogs).toHaveLength(1);
    expect(env.appliedRoll[0]?.intents.map((i) => i.type)).toEqual(["rollAdvantage"]);
    await env.play.runReaction({
      event: "afterAttack",
      pins: ["hit"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "act1",
    });
    expect(env.performed[0]).toMatchObject({
      kind: "rider",
      rider: { effect: { type: "rollAdvantage", data: { mode: "disadvantage" } } },
    });

    // Dialog shown for `shown`, skipped for `pub` -> only `pub` posts on submit.
    const cfg1: RollConfig = { rolls: [{}] };
    const dlg1: Record<string, unknown> = {};
    env.play.preRoll("abilityCheck", cfg1, dlg1, roller, "chk1");
    const p1 = env.play.pendingRoll(dlg1.pending);
    p1?.shownReminders.add(reminderKey(p1.sorted.reminders[0]!));
    env.play.postRoll(false, cfg1); // cancelled -> nothing sent
    expect(env.whisperedDetails).toEqual([]);

    env.play.preRoll("abilityCheck", cfg1, dlg1, roller, "chk2");
    const p2 = env.play.pendingRoll(dlg1.pending);
    p2?.shownReminders.add(reminderKey(p2.sorted.reminders[0]!));
    env.play.postRoll(true, cfg1);
    expect(env.whisperedDetails).toEqual([{ text: "Public note", audience: "all", actor: "Actor.hero" }]);

    // Fast-forward (dialog not rendered, so shownReminders stays empty) -> both post on submit.
    env.whisperedDetails.length = 0;
    const cfg2: RollConfig = { rolls: [{}] };
    env.play.preRoll("abilityCheck", cfg2, { configure: false }, roller, "chk3");
    env.play.postRoll(true, cfg2);
    expect(env.whisperedDetails).toHaveLength(2);
  });

  it("carries resolved attack rollMode across postRoll to same-activation damageRoll and afterDamage", async () => {
    const bp = createBlueprint({
      id: "SneakAdvBp000001",
      nodes: [
        makeNode("event", "damageRoll", "dmg"),
        makeCondition("adv", [{ id: "c1", type: "rollModes", data: { values: ["advantage"] } }]),
        makeNode("result", "rollBonus", "sneak", { formula: "2d6" }),
        makeNode("event", "afterDamage", "afterDmg"),
        makeCondition("notDis", [{ id: "c2", type: "rollModes", data: { values: ["!disadvantage"] } }]),
        makeNode("result", "resource", "heal", {
          action: "restore",
          resource: "hp",
          amount: "3",
          who: "self",
        }),
      ],
      edges: [
        makeEdge("dmg", "out", "adv"),
        makeEdge("adv", "yes", "sneak"),
        makeEdge("afterDmg", "dealt", "notDis"),
        makeEdge("notDis", "yes", "heal"),
      ],
    });
    const env = harness([bp]);
    const roller = {
      actor: env.hero,
      item: env.sword,
      activity: null,
      token: env.heroToken,
      target: env.foeToken,
      details: {},
      rollData: {},
    };

    // Cancelled attack roll records nothing for the activation.
    const cancelledAtk: RollConfig = { advantage: true, rolls: [{}] };
    env.play.preRoll("attackRoll", cancelledAtk, {}, roller, "message:m1");
    env.play.postRoll(false, cancelledAtk, "advantage");
    env.play.preRoll("damageRoll", { rolls: [{}] }, {}, roller, "message:m1");
    expect(env.appliedRoll).toHaveLength(0);

    // Completed attack roll (even without any attackRoll blueprint) shares its submitted mode on the same activation.
    const atkCfg: RollConfig = { rolls: [{}] };
    env.play.preRoll("attackRoll", atkCfg, {}, roller, "message:m1");
    env.play.postRoll(true, atkCfg, "advantage");

    env.play.preRoll("damageRoll", { rolls: [{}] }, {}, roller, "message:m1");
    expect(env.appliedRoll).toHaveLength(1);
    expect(env.appliedRoll[0]?.intents.map((i) => i.nodeId)).toEqual(["sneak"]);

    // Unrelated activation does not inherit message:m1's attack rollMode.
    env.play.preRoll("damageRoll", { rolls: [{}] }, {}, roller, "message:m2");
    expect(env.appliedRoll).toHaveLength(1);

    // afterDamage on message:m1 inherits the attack's rollMode; disadvantageous afterAttack overwrites it.
    await env.play.runReaction({
      event: "afterDamage",
      pins: ["dealt"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "message:m1",
    });
    expect(env.performed).toHaveLength(1);
    expect(env.performed[0]).toMatchObject({ kind: "resource", resource: "hp", delta: 3 });

    env.performed.length = 0;
    await env.play.runReaction({
      event: "afterAttack",
      pins: ["hit"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "message:m1",
      details: { rollMode: "disadvantage" },
    });
    await env.play.runReaction({
      event: "afterDamage",
      pins: ["dealt"],
      actor: env.hero,
      item: env.sword,
      activity: null,
      target: env.foeToken,
      activation: "message:m1",
    });
    expect(env.performed).toEqual([]);
  });
});
