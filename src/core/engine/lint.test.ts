import { describe, expect, it } from "vitest";
import { createBlueprint } from "../blueprint/factory";
import type { BlueprintNode } from "../blueprint/types";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { blueprintSignals, formulaPaths, lintBlueprint, type LintIssue } from "./lint";

function codes(issues: LintIssue[]): string[] {
  return issues.map(issue => [issue.code, issue.nodeId, issue.checkId].filter(Boolean).join(":")).sort();
}

function withCommon(node: BlueprintNode, common: Record<string, unknown>): BlueprintNode {
  return { ...node, data: { ...node.data, common: { ...(node.data.common as object), ...common } } };
}

describe("lintBlueprint", () => {
  it("is quiet for a well-formed blueprint", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "bonus", { formula: "1d6" })],
      edges: [makeEdge("ev", "out", "bonus")]
    });
    expect(lintBlueprint(blueprint, { validateFormula: () => true })).toEqual([]);
  });

  it("finds unconnected nodes and events that lead nowhere", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeCondition("if", []), makeNode("result", "reminder", "loose")],
      edges: [makeEdge("ev", "out", "if")]
    });
    expect(codes(lintBlueprint(blueprint))).toEqual(["dead-event:ev", "orphan-node:loose"]);
  });

  it("flags results that cannot follow their event", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "afterAttack", "ev"), makeNode("result", "critRange", "crit")],
      edges: [makeEdge("ev", "hit", "crit")]
    });
    expect(codes(lintBlueprint(blueprint))).toEqual(["incompatible-result:crit"]);
  });

  it("flags counter names that nobody defines", () => {
    const blueprint = createBlueprint({
      counters: [{ name: "hits", min: 0, max: null, initial: 0, reset: "manual" }],
      nodes: [
        makeNode("event", "afterAttack", "ev"),
        makeNode("result", "counter", "a", { name: "Rage", scope: "actor", action: "add", amount: "1", who: "self" }),
        makeNode("result", "counter", "b", { name: "hits", scope: "blueprint", action: "add", amount: "1", who: "self" }),
        makeNode("result", "counter", "c", { name: "tyop", scope: "actor", action: "add", amount: "1", who: "self" })
      ],
      edges: [makeEdge("ev", "hit", "a"), makeEdge("ev", "hit", "b"), makeEdge("ev", "hit", "c")]
    });
    expect(codes(lintBlueprint(blueprint, { counterNames: new Set(["rage"]) }))).toEqual(["counter-unknown:c"]);
    expect(codes(lintBlueprint(blueprint))).toEqual([]);
  });

  describe("after \"And then\"", () => {
    const then = (node: BlueprintNode) => withCommon(node, { then: true });

    it("lets reaction results follow a demanded save and flags roll changes", () => {
      const blueprint = createBlueprint({
        nodes: [
          makeNode("event", "afterAttack", "ev"), makeNode("result", "demandSave", "save"),
          makeNode("result", "applyEffect", "poison", { source: "status", status: "poisoned", who: "target" }),
          makeNode("result", "critDamage", "crit")
        ],
        edges: [makeEdge("ev", "hit", "save"), makeEdge("save", "failed", "poison"), makeEdge("save", "succeeded", "crit")]
      });
      expect(codes(lintBlueprint(blueprint, { validateFormula: () => true }))).toEqual(["incompatible-result:crit"]);
    });

    it("flags results that change the roll", () => {
      const blueprint = createBlueprint({
        nodes: [makeNode("event", "damageRoll", "ev"), then(makeNode("result", "rollBonus", "bonus", { formula: "1" })), makeNode("result", "critDamage", "crit")],
        edges: [makeEdge("ev", "out", "bonus"), makeEdge("bonus", "then", "crit")]
      });
      expect(lintBlueprint(blueprint, { validateFormula: () => true })).toContainEqual({
        code: "incompatible-result", level: "error", nodeId: "crit", values: { event: "afterResult" }
      });
    });

    it("judges conditions by the original event and warns about optional results", () => {
      const blueprint = createBlueprint({
        nodes: [
          makeNode("event", "damageRoll", "ev"),
          then(makeNode("result", "rollBonus", "bonus", { formula: "1" })),
          makeCondition("if", [{ id: "c1", type: "creatureTypes", data: { values: ["undead"] } }, { id: "c2", type: "skillIds", data: { values: ["ath"] } }]),
          withCommon(makeNode("result", "applyEffect", "blind", { source: "status", status: "blinded", who: "target" }), { optional: true })
        ],
        edges: [makeEdge("ev", "out", "bonus"), makeEdge("bonus", "then", "if"), makeEdge("if", "yes", "blind")]
      });
      expect(codes(lintBlueprint(blueprint, { validateFormula: () => true }))).toEqual(["irrelevant-check:if:c2", "optional-on-trigger:blind"]);
    });
  });

  it("flags checks that never pass for the event", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "savingThrow", "ev"),
        makeCondition("if", [{ id: "c1", type: "baseWeapons", data: { values: ["longsword"] } }]),
        makeNode("result", "rollBonus", "bonus", { formula: "1" })
      ],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    expect(codes(lintBlueprint(blueprint))).toEqual(["irrelevant-check:if:c1"]);
  });

  it("validates formulas through the host", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "bonus", { formula: "1d6 +" })],
      edges: [makeEdge("ev", "out", "bonus")]
    });
    const issues = lintBlueprint(blueprint, { validateFormula: formula => !formula.trim().endsWith("+") });
    expect(issues).toEqual([{ code: "invalid-formula", level: "error", nodeId: "bonus", values: { formula: "1d6 +" } }]);
  });

  it("warns about unknown roll data paths", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "bonus", { formula: "@abilities.cha.mod + @nope.x" })],
      edges: [makeEdge("ev", "out", "bonus")]
    });
    const issues = lintBlueprint(blueprint, { hasPath: path => path.startsWith("abilities") });
    expect(issues).toEqual([{ code: "unknown-path", level: "warning", nodeId: "bonus", values: { path: "@nope.x" } }]);
  });

  it("finds contradictory checks in an all-of condition", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        makeCondition("if", [
          { id: "c1", type: "creatureTypes", data: { values: ["undead"] } },
          { id: "c2", type: "creatureTypes", data: { values: ["fiend"] } }
        ]),
        makeNode("result", "rollBonus", "bonus", { formula: "1" })
      ],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    expect(codes(lintBlueprint(blueprint))).toEqual(["contradiction:if:c2"]);
  });

  it("allows the same check twice in an any-of condition", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        makeCondition("if", [
          { id: "c1", type: "creatureTypes", data: { values: ["undead"] } },
          { id: "c2", type: "creatureTypes", data: { values: ["fiend"] } }
        ], "any"),
        makeNode("result", "rollBonus", "bonus", { formula: "1" })
      ],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    expect(lintBlueprint(blueprint)).toEqual([]);
  });

  it("matches signals against the rest of the actor", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "afterAttack", "ev"),
        makeNode("result", "signal", "send", { name: "smite" }),
        makeNode("event", "signal", "listen", { name: "echo" }),
        makeNode("result", "rollBonus", "bonus", { formula: "1" })
      ],
      edges: [makeEdge("ev", "hit", "send"), makeEdge("listen", "out", "bonus")]
    });
    const issues = lintBlueprint(blueprint, { signalsSent: new Set(["smite"]), signalsReceived: new Set(["echo"]) });
    expect(issues).toEqual([
      { code: "signal-unmatched", level: "warning", nodeId: "send", values: { name: "smite" } },
      { code: "signal-unmatched", level: "warning", nodeId: "listen", values: { name: "echo" } }
    ]);
  });

  it("requires ask-the-player for a cost", () => {
    const blueprint = createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        withCommon(makeNode("result", "rollBonus", "bonus", { formula: "1" }), { optional: false, cost: { type: "slots" } })
      ],
      edges: [makeEdge("ev", "out", "bonus")]
    });
    expect(codes(lintBlueprint(blueprint))).toEqual(["cost-without-optional:bonus"]);
  });

  it("notes blueprints converted from v1", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "bonus", { formula: "1" })],
      edges: [makeEdge("ev", "out", "bonus")],
      flags: { "build-n-action": { migratedFrom: "1.0.6" } }
    });
    expect(lintBlueprint(blueprint)).toEqual([{ code: "migrated", level: "info" }]);
  });
});

describe("lintBlueprint and \"only this item\"", () => {
  it("notes the tick on a blueprint that does not live on an item, and only when the host says so", () => {
    const ticked = makeCondition("if", []);
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "damageRoll", "ev"), { ...ticked, data: { ...ticked.data, thisItem: true } }, makeNode("result", "rollBonus", "bonus", { formula: "1" })],
      edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
    });
    expect(codes(lintBlueprint(blueprint, { itemCarrier: false }))).toEqual(["item-tick-off-item:if"]);
    expect(lintBlueprint(blueprint, { itemCarrier: true })).toEqual([]);
    expect(lintBlueprint(blueprint)).toEqual([]);
  });
});

describe("lintBlueprint and triggers", () => {
  it("warns that optional results apply at once on events without a roll", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "turnStart", "ev"), withCommon(makeNode("result", "resource", "heal"), { optional: true })],
      edges: [makeEdge("ev", "out", "heal")]
    });
    expect(codes(lintBlueprint(blueprint))).toEqual(["optional-on-trigger:heal"]);
  });

  it("warns about region events on a blueprint that is not on a region", () => {
    const blueprint = createBlueprint({
      nodes: [makeNode("event", "regionEnter", "ev"), makeNode("result", "reminder", "r")],
      edges: [makeEdge("ev", "out", "r")]
    });
    expect(codes(lintBlueprint(blueprint, { regionCarrier: false }))).toEqual(["region-event-off-region:ev"]);
    expect(lintBlueprint(blueprint, { regionCarrier: true })).toEqual([]);
  });
});

describe("formulaPaths", () => {
  it("extracts roll data references", () => {
    expect(formulaPaths("1d6 + @abilities.cha.mod + @target.attributes.hp.value - @prof")).toEqual([
      "abilities.cha.mod", "target.attributes.hp.value", "prof"
    ]);
    expect(formulaPaths("2d8")).toEqual([]);
  });
});

describe("blueprintSignals", () => {
  it("collects names sent by signal results and received by signal events", () => {
    const sender = createBlueprint({ nodes: [makeNode("result", "signal", "s", { name: " smite " }), makeNode("result", "signal", "blank", { name: "" })] });
    const receiver = createBlueprint({ nodes: [makeNode("event", "signal", "e", { name: "smite" }), makeNode("event", "signal", "e2", { name: "mark" })] });
    const { sent, received } = blueprintSignals([sender, receiver]);
    expect([...sent]).toEqual(["smite"]);
    expect([...received].sort()).toEqual(["mark", "smite"]);
  });
});
