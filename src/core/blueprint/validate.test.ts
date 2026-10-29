import { describe, expect, it } from "vitest";
import { makeCondition, makeEdge, makeNode } from "../testing/graph";
import { createBlueprint } from "./factory";
import type { BlueprintSource } from "./types";
import { validateBlueprintSource } from "./validate";

function validBlueprint(): BlueprintSource {
  return createBlueprint({
    id: "aB3dE5gH7jK9mN1p",
    name: "Test",
    nodes: [makeNode("event", "attackRoll", "ev"), makeNode("result", "rollBonus", "bonus")],
    edges: [makeEdge("ev", "out", "bonus")]
  });
}

function codes(input: unknown): string[] {
  const result = validateBlueprintSource(input);
  return result.ok ? [] : result.issues.map(issue => `${issue.path}:${issue.code}`);
}

describe("validateBlueprintSource", () => {
  it("accepts a well-formed blueprint", () => {
    const blueprint = validBlueprint();
    expect(validateBlueprintSource(blueprint)).toEqual({ ok: true, value: blueprint });
  });

  it("rejects non-objects", () => {
    expect(codes("nope")).toEqual([":notObject"]);
    expect(codes([])).toEqual([":notObject"]);
  });

  it("reports invalid top-level fields", () => {
    const input = { ...validBlueprint(), id: "x", schemaVersion: 1, name: 3, enabled: "yes", sort: Number.NaN, flags: [] };
    expect(codes(input)).toEqual([
      "id:invalidId", "schemaVersion:schemaVersion", "name:invalidField", "enabled:invalidField",
      "sort:invalidField", "flags:invalidField"
    ]);
  });

  it("reports node problems", () => {
    const event = makeNode("event", "attackRoll", "ev");
    const input = {
      ...validBlueprint(),
      nodes: [
        event,
        { ...event },
        { id: "k", kind: "widget", type: "x", position: { x: 0, y: 0 }, data: {} },
        { id: "t", kind: "event", type: "nope", position: { x: 0, y: 0 }, data: {} },
        { id: "p", kind: "result", type: "rollBonus", position: null, data: null },
        "garbage"
      ],
      edges: []
    };
    expect(codes(input)).toEqual([
      "nodes.1.id:duplicateNodeId", "nodes.2.kind:unknownKind", "nodes.3.type:unknownType",
      "nodes.4.position:invalidField", "nodes.4.data:invalidField", "nodes.5:invalidField"
    ]);
  });

  it("accepts wires from a result's \"And then\" output only while it is on", () => {
    const smite = makeNode("result", "rollBonus", "bonus");
    const blind = makeNode("result", "applyEffect", "blind");
    const on = { ...smite, data: { ...smite.data, common: { ...(smite.data.common as object), then: true } } };
    const event = makeNode("event", "attackRoll", "ev");
    const base = { ...validBlueprint(), nodes: [event, on, blind] };
    const edges = [makeEdge("ev", "out", "bonus"), makeEdge("bonus", "then", "blind")];
    expect(codes({ ...base, edges })).toEqual([]);
    expect(codes({ ...base, nodes: [event, smite, blind], edges })).toEqual(["edges.1.sourcePin:invalidPin"]);
  });

  it("checks blueprint counters when present", () => {
    const blueprint = validBlueprint();
    expect(codes({ ...blueprint, counters: [{ name: "hits", min: 0, max: null, initial: 0, reset: "turnStart" }] })).toEqual([]);
    expect(codes({ ...blueprint, counters: "nope" })).toEqual(["counters:invalidField"]);
    expect(codes({ ...blueprint, counters: [{ name: "", min: 0, max: null, initial: 0, reset: "turnStart" }, { name: "x", min: 0, max: 3, initial: 0, reset: "weekly" }] }))
      .toEqual(["counters.0:invalidField", "counters.1:invalidField"]);
  });

  it("reports edge problems", () => {
    const first = makeEdge("ev", "out", "if");
    const input = {
      ...validBlueprint(),
      nodes: [makeNode("event", "attackRoll", "ev"), makeCondition("if", []), makeCondition("if2", []), makeNode("result", "rollBonus", "bonus")],
      edges: [
        first,
        { ...first },
        makeEdge("ev", "out", "missing"),
        makeEdge("bonus", "out", "ev"),
        makeEdge("ev", "yes", "if2"),
        makeEdge("if", "yes", "if2"),
        makeEdge("if2", "no", "if"),
        { id: "bad" }
      ]
    };
    expect(codes(input)).toEqual([
      "edges.1.id:duplicateEdgeId", "edges.2:danglingEdge", "edges.3:invalidDirection",
      "edges.4.sourcePin:invalidPin", "edges.6:cycle", "edges.7:invalidField"
    ]);
  });
});
