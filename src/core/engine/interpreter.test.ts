import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../blueprint/factory";
import type { BlueprintSource } from "../blueprint/types";
import { creatureFacts, itemFacts, rollFacts } from "../testing/facts";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { failed, passed } from "./reasons";
import { MAX_SIGNAL_DEPTH, runBlueprint, runThrough, runWithSignals, type BlueprintEnv, type ChainEntry } from "./interpreter";
import { compileBlueprint } from "./compile";

function env(overrides: Partial<BlueprintEnv> = {}): BlueprintEnv {
  return {
    evaluateNumber: () => null,
    replaceData: text => text,
    runScript: () => null,
    carrierItemUuid: null,
    reach: () => passed("matched"),
    limitAvailable: () => true,
    ...overrides
  };
}

const undeadCheck = { id: "c1", type: "creatureTypes", data: { values: ["undead"] } };

function flameTongue(): BlueprintSource {
  return createBlueprint({
    id: "aB3dE5gH7jK9mN1p",
    nodes: [
      makeNode("event", "damageRoll", "ev"),
      makeCondition("if", [undeadCheck]),
      makeNode("result", "rollBonus", "fire", { formula: "1d6", damageTypes: ["fire"] }),
      makeNode("result", "reminder", "note", { text: "Not undead" }),
      makeNode("result", "critDamage", "crit", { dice: "1" })
    ],
    edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "fire"), makeEdge("if", "no", "note"), makeEdge("ev", "out", "crit")]
  });
}

const THEN = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: true };

/** Smite (optional, with "And then") → if the target is undead, blind it; otherwise a note. */
function smite(optional = true, limit = "none"): BlueprintSource {
  return createBlueprint({
    id: "aB3dE5gH7jK9mN2p",
    nodes: [
      makeNode("event", "damageRoll", "ev"),
      makeNode("result", "rollBonus", "smite", { formula: "2d8", common: { ...THEN, optional, limit } }),
      makeCondition("if", [undeadCheck]),
      makeNode("result", "applyEffect", "blind", { source: "status", status: "blinded", who: "target" }),
      makeNode("result", "reminder", "note", { text: "Living" })
    ],
    edges: [makeEdge("ev", "out", "smite"), makeEdge("smite", "then", "if"), makeEdge("if", "yes", "blind"), makeEdge("if", "no", "note")]
  });
}

const damage = { event: "damageRoll", pins: ["out"] } as const;

describe("runBlueprint", () => {
  it("applies results on passing paths and traces the route", () => {
    const run = runBlueprint(flameTongue(), damage, rollFacts({ target: creatureFacts({ creatureTypes: ["undead"] }) }), env());
    expect(run.intents.map(intent => intent.nodeId)).toEqual(["fire", "crit"]);
    expect(run.nodes.ev?.status).toBe("passed");
    expect(run.nodes.if).toMatchObject({ status: "passed", checks: [{ checkId: "c1", type: "creatureTypes", outcome: { pass: true } }] });
    expect(run.nodes.note?.status).toBe("skipped");
    expect(run.edges.sort()).toEqual(["ev-out-crit", "ev-out-if", "if-yes-fire"]);
  });

  it("follows the otherwise branch when the condition fails", () => {
    const run = runBlueprint(flameTongue(), damage, rollFacts(), env());
    expect(run.intents.map(intent => intent.nodeId)).toEqual(["note", "crit"]);
    expect(run.nodes.if?.status).toBe("failed");
    expect(run.nodes.if?.checks?.[0]?.outcome.reason.code).toBe("notMatched");
  });

  it("ignores other events", () => {
    const run = runBlueprint(flameTongue(), { event: "attackRoll", pins: ["out"] }, rollFacts(), env());
    expect(run.intents).toEqual([]);
    expect(Object.values(run.nodes).every(node => node.status === "skipped")).toBe(true);
  });

  it("skips disabled blueprints", () => {
    const run = runBlueprint({ ...flameTongue(), enabled: false }, damage, rollFacts(), env());
    expect(run.skipped).toEqual({ code: "disabled" });
    expect(run.intents).toEqual([]);
  });

  it("stops at events whose reach excludes the roller", () => {
    const run = runBlueprint(flameTongue(), damage, rollFacts(), env({ reach: () => failed("outOfReach", { actual: "15 ft" }) }));
    expect(run.intents).toEqual([]);
    expect(run.nodes.ev).toEqual({ status: "failed", reason: { code: "outOfReach", values: { actual: "15 ft" } } });
  });

  it("respects frequency limits", () => {
    const blueprint = flameTongue();
    const limited = {
      ...blueprint,
      nodes: blueprint.nodes.map(node => (node.id === "crit")
        ? { ...node, data: { ...node.data, common: { ...(node.data.common as object), limit: "turn" } } }
        : node)
    };
    const run = runBlueprint(limited, damage, rollFacts(), env({ limitAvailable: () => false }));
    expect(run.intents.map(intent => intent.nodeId)).toEqual(["note"]);
    expect(run.nodes.crit).toEqual({ status: "failed", reason: { code: "limitUsed" } });
  });

  it("uses outcome pins for reactions", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "afterAttack", "ev"), makeNode("result", "applyEffect", "hit"), makeNode("result", "resource", "miss")],
      edges: [makeEdge("ev", "hit", "hit"), makeEdge("ev", "miss", "miss")]
    });
    const run = runBlueprint(blueprint, { event: "afterAttack", pins: ["hit", "crit"] }, rollFacts({ event: "afterAttack" }), env());
    expect(run.intents.map(intent => intent.nodeId)).toEqual(["hit"]);
  });

  it("applies a result reached by several routes once", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "a"), makeNode("event", "damageRoll", "b"), makeNode("result", "rollBonus", "bonus")],
      edges: [makeEdge("a", "out", "bonus"), makeEdge("b", "out", "bonus")]
    });
    expect(runBlueprint(blueprint, damage, rollFacts(), env()).intents).toHaveLength(1);
  });

  it("marks the wire into a failed condition but nothing after it", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", [undeadCheck]), makeNode("result", "rollBonus", "bonus")],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    const run = runBlueprint(blueprint, damage, rollFacts(), env());
    expect(run.edges).toEqual(["ev-out-if"]);
    expect(run.nodes.bonus?.status).toBe("skipped");
  });

  it("passes empty conditions and records why", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", []), makeNode("result", "rollBonus", "bonus")],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    const run = runBlueprint(blueprint, damage, rollFacts(), env());
    expect(run.nodes.if).toEqual({ status: "passed", checks: [], reason: { code: "noChecks" } });
    expect(run.intents).toHaveLength(1);
  });

  it("evaluates any-of conditions", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        makeCondition("if", [undeadCheck, { id: "c2", type: "creatureTypes", data: { values: ["humanoid"] } }], "any"),
        makeNode("result", "rollBonus", "bonus")
      ],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    expect(runBlueprint(blueprint, damage, rollFacts(), env()).intents).toHaveLength(1);
  });

  it("requires rolls with the carrying item when \"only this item\" is ticked, even in any-of conditions", () => {
    const blueprint = (checks: typeof undeadCheck[], mode: "all" | "any") => createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        { ...makeCondition("if", checks, mode), data: { mode, checks, thisItem: true } },
        makeNode("result", "rollBonus", "bonus")
      ],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    const sword = env({ carrierItemUuid: "Actor.hero.Item.sword" });
    const withSword = rollFacts({ item: itemFacts(), target: creatureFacts({ creatureTypes: ["undead"] }) });
    const withAxe = rollFacts({ item: itemFacts({ uuid: "Actor.hero.Item.axe" }), target: creatureFacts({ creatureTypes: ["undead"] }) });
    const humanoid = { id: "c2", type: "creatureTypes", data: { values: ["humanoid"] } };

    expect(runBlueprint(blueprint([], "all"), damage, withSword, sword).intents).toHaveLength(1);
    expect(runBlueprint(blueprint([], "all"), damage, withAxe, sword).intents).toHaveLength(0);
    expect(runBlueprint(blueprint([undeadCheck, humanoid], "any"), damage, withAxe, sword).intents).toHaveLength(0);
    expect(runBlueprint(blueprint([undeadCheck, humanoid], "any"), damage, withSword, sword).intents).toHaveLength(1);

    const traced = runBlueprint(blueprint([undeadCheck], "all"), damage, withAxe, sword).nodes.if;
    expect(traced?.status).toBe("failed");
    expect(traced?.checks?.map(check => [check.checkId, check.type, check.outcome.pass])).toEqual([["thisItem", "thisItem", false], ["c1", "creatureTypes", true]]);
  });

  it("carries the common properties with a default choice group", () => {
    const intent = runBlueprint(flameTongue(), damage, rollFacts(), env()).intents[1];
    expect(intent).toMatchObject({
      blueprintId: "aB3dE5gH7jK9mN1p", nodeId: "crit", type: "critDamage", eventNodeId: "ev",
      common: { optional: false, choiceGroup: "crit", limit: "none" }
    });
  });

  it("matches signal events by name", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "signal", "sig", { name: "smite" }), makeNode("result", "rollBonus", "bonus")],
      edges: [makeEdge("sig", "out", "bonus")]
    });
    expect(runBlueprint(blueprint, { event: "signal", pins: ["out"], signal: "smite" }, rollFacts(), env()).intents).toHaveLength(1);
    expect(runBlueprint(blueprint, { event: "signal", pins: ["out"], signal: "other" }, rollFacts(), env()).intents).toHaveLength(0);
  });

  it("accepts compiled blueprints", () => {
    expect(runBlueprint(compileBlueprint(flameTongue()), damage, rollFacts(), env()).intents).toHaveLength(2);
  });
});

function sender(id: string, signal: string, scope: "actor" | "document", event = "afterAttack"): BlueprintSource {
  return createBlueprint({
    id,
    nodes: [makeNode("event", event, "ev"), makeNode("result", "signal", "send", { name: signal, scope })],
    edges: [makeEdge("ev", event === "afterAttack" ? "hit" : "out", "send")]
  });
}

function receiver(id: string, signal: string, then: "bonus" | "relay" = "bonus", relay = ""): BlueprintSource {
  return createBlueprint({
    id,
    nodes: [
      makeNode("event", "signal", "sig", { name: signal }),
      then === "bonus"
        ? makeNode("result", "rollBonus", "bonus", { formula: "2d8" })
        : makeNode("result", "signal", "bonus", { name: relay, scope: "actor" })
    ],
    edges: [makeEdge("sig", "out", "bonus")]
  });
}

function entry(blueprint: BlueprintSource, documentUuid: string, actorUuid: string | null = "Actor.hero"): ChainEntry {
  return { compiled: compileBlueprint(blueprint), env: env(), documentUuid, actorUuid };
}

describe("continuations", () => {
  const undead = rollFacts({ target: creatureFacts({ creatureTypes: ["undead"] }) });

  it("keeps a result's continuation out of the event's own run", () => {
    const run = runBlueprint(smite(), damage, undead, env());
    expect(run.intents.map(intent => [intent.nodeId, intent.common.then])).toEqual([["smite", true]]);
    expect(run.nodes.blind?.status).toBe("skipped");
  });

  it("runs the continuation of one result without asking the event's reach again", () => {
    const reach = vi.fn(() => failed("outOfReach"));
    const run = runBlueprint(smite(), { event: "afterResult", pins: ["then"], from: "smite" }, undead, env({ reach }));
    expect(run.intents.map(intent => [intent.nodeId, intent.eventNodeId])).toEqual([["blind", "smite"]]);
    expect(run.edges.sort()).toEqual(["if-yes-blind", "smite-then-if"]);
    expect(reach).not.toHaveBeenCalled();
  });

  it("compiles continuations by the result they leave from", () => {
    const compiled = compileBlueprint(smite());
    expect(compiled.continuationsOf("smite").map(path => [path.eventType, path.pin, path.result.id])).toEqual([
      ["afterResult", "then", "blind"], ["afterResult", "then", "note"]
    ]);
    expect(compiled.continuationsOf("blind")).toEqual([]);
    expect(compiled.pathsFor("afterResult")).toEqual([]);
  });

  it("follows every continuation for the Test tab and says when it assumed a choice", () => {
    const through = runThrough(smite(), damage, undead, env());
    expect(through.intents.map(intent => intent.nodeId)).toEqual(["smite", "blind"]);
    expect(through.edges.sort()).toEqual(["ev-out-smite", "if-yes-blind", "smite-then-if"]);
    expect(through.nodes.blind?.status).toBe("passed");
    expect(through.assumedChoice).toBe(true);
    expect(runThrough(smite(false), damage, undead, env()).assumedChoice).toBe(false);
  });

  it("follows a demanded save's branch by the chosen outcome", () => {
    const blueprint = createBlueprint({
      id: "aB3dE5gH7jK9mN3p",
      nodes: [
        makeNode("event", "afterAttack", "ev"), makeNode("result", "demandSave", "save"),
        makeNode("result", "applyEffect", "poison", { source: "status", status: "poisoned", who: "target" }),
        makeNode("result", "resource", "heal", { action: "restore", resource: "hp", amount: "1", who: "self" })
      ],
      edges: [makeEdge("ev", "hit", "save"), makeEdge("save", "failed", "poison"), makeEdge("save", "succeeded", "heal")]
    });
    const hit = { event: "afterAttack", pins: ["hit"] } as const;
    expect(runThrough(blueprint, hit, rollFacts(), env()).intents.map(intent => intent.nodeId)).toEqual(["save", "poison"]);
    expect(runThrough(blueprint, hit, rollFacts(), env(), { outcome: "succeeded" }).intents.map(intent => intent.nodeId)).toEqual(["save", "heal"]);
  });

  it("does not continue from a result whose limit is used up", () => {
    const through = runThrough(smite(false, "turn"), damage, undead, env({ limitAvailable: () => false }));
    expect(through.intents).toEqual([]);
  });
});

describe("runWithSignals", () => {
  const hit = { event: "afterAttack", pins: ["hit"] } as const;

  it("starts from the given entries and still delivers signals to everyone", () => {
    const senderEntry = entry(sender("aB3dE5gH7jK9mN1a", "smite", "actor"), "Item.sword");
    const other = entry(sender("aB3dE5gH7jK9mN1c", "other", "actor"), "Item.axe");
    const result = runWithSignals([senderEntry, other, entry(receiver("aB3dE5gH7jK9mN1b", "smite"), "Item.spell")], hit,
      rollFacts({ event: "afterAttack" }), { starters: [senderEntry] });
    expect(result.signals).toEqual([{ name: "smite", depth: 1 }]);
    expect(result.sent.map(intent => [intent.nodeId, intent.entry])).toEqual([["send", senderEntry]]);
    expect(result.intents.map(intent => intent.type)).toEqual(["rollBonus"]);
  });

  it("delivers signals to receivers on the same actor", () => {
    const result = runWithSignals([
      entry(sender("aB3dE5gH7jK9mN1a", "smite", "actor"), "Item.sword"),
      entry(receiver("aB3dE5gH7jK9mN1b", "smite"), "Item.spell")
    ], hit, rollFacts({ event: "afterAttack" }));
    expect(result.intents.map(intent => [intent.blueprintId, intent.type])).toEqual([["aB3dE5gH7jK9mN1b", "rollBonus"]]);
    expect(result.signals).toEqual([{ name: "smite", depth: 1 }]);
    expect(result.truncated).toBe(false);
  });

  it("keeps the entry that produced each chained result", () => {
    const receiverEntry = entry(receiver("aB3dE5gH7jK9mN1b", "smite"), "Item.spell");
    const result = runWithSignals([entry(sender("aB3dE5gH7jK9mN1a", "smite", "actor"), "Item.sword"), receiverEntry], hit,
      rollFacts({ event: "afterAttack" }));
    expect(result.intents.map(intent => intent.entry)).toEqual([receiverEntry]);
  });

  it("keeps document-scoped signals on their document", () => {
    const result = runWithSignals([
      entry(sender("aB3dE5gH7jK9mN1a", "smite", "document"), "Item.sword"),
      entry(receiver("aB3dE5gH7jK9mN1b", "smite"), "Item.spell")
    ], hit, rollFacts({ event: "afterAttack" }));
    expect(result.intents).toEqual([]);
  });

  it("does not reach other actors", () => {
    const result = runWithSignals([
      entry(sender("aB3dE5gH7jK9mN1a", "smite", "actor"), "Item.sword"),
      entry(receiver("aB3dE5gH7jK9mN1b", "smite"), "Item.other", "Actor.villain")
    ], hit, rollFacts({ event: "afterAttack" }));
    expect(result.intents).toEqual([]);
  });

  it("breaks loops", () => {
    const result = runWithSignals([
      entry(sender("aB3dE5gH7jK9mN1a", "ping", "actor"), "Item.a"),
      entry(receiver("aB3dE5gH7jK9mN1b", "ping", "relay", "ping"), "Item.b")
    ], hit, rollFacts({ event: "afterAttack" }));
    expect(result.truncated).toBe(true);
    expect(result.signals.length).toBeLessThanOrEqual(2);
  });

  it("stops at the depth limit", () => {
    const entries = [entry(sender("aB3dE5gH7jK9mN0s", "s0", "actor"), "Item.start")];
    for (let i = 0; i < MAX_SIGNAL_DEPTH + 3; i++) {
      entries.push(entry(receiver(`aB3dE5gH7jK9mN${String(i).padStart(2, "0")}`, `s${i}`, "relay", `s${i + 1}`), `Item.r${i}`));
    }
    const result = runWithSignals(entries, hit, rollFacts({ event: "afterAttack" }));
    expect(result.truncated).toBe(true);
    expect(Math.max(...result.signals.map(signal => signal.depth))).toBe(MAX_SIGNAL_DEPTH);
  });

  it("records runs of blueprints that took part", () => {
    const result = runWithSignals([
      entry(sender("aB3dE5gH7jK9mN1a", "smite", "actor"), "Item.sword"),
      entry(receiver("aB3dE5gH7jK9mN1b", "smite"), "Item.spell")
    ], hit, rollFacts({ event: "afterAttack" }));
    expect(result.runs.map(run => run.blueprintId)).toEqual(["aB3dE5gH7jK9mN1a", "aB3dE5gH7jK9mN1b", "aB3dE5gH7jK9mN1b"]);
  });
});
