import { describe, expect, it } from "vitest";
import { createBlueprint, createCheck, createEdge, createNode, duplicateBlueprint } from "./factory";
import { isValidId } from "./ids";
import { DEFAULT_BLUEPRINT_IMG } from "./types";

describe("createBlueprint", () => {
  it("fills every field with a default", () => {
    const blueprint = createBlueprint();
    expect(isValidId(blueprint.id)).toBe(true);
    expect(blueprint).toMatchObject({
      schemaVersion: 2, name: "", img: DEFAULT_BLUEPRINT_IMG, description: "", enabled: true, sort: 0,
      nodes: [], edges: [], flags: {}
    });
  });

  it("keeps provided values", () => {
    expect(createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "Hex", enabled: false }))
      .toMatchObject({ id: "aB3dE5gH7jK9mN1p", name: "Hex", enabled: false });
  });
});

describe("createNode", () => {
  it("creates an event with reach defaults", () => {
    const node = createNode("event", "attackRoll", { x: 10, y: 20 });
    expect(node.id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(node).toMatchObject({ kind: "event", type: "attackRoll", position: { x: 10, y: 20 } });
    expect(node.data.reach).toMatchObject({ mode: "self" });
  });

  it("creates an empty condition", () => {
    expect(createNode("condition", "condition").data).toEqual({ mode: "all", thisItem: false, checks: [] });
  });

  it("creates a result with its common properties", () => {
    expect(createNode("result", "rollBonus").data).toMatchObject({
      formula: "", damageTypes: [], common: { optional: false, limit: "none" }
    });
  });

  it("rejects unknown types", () => {
    expect(() => createNode("event", "nope")).toThrow(/Unknown event type "nope"/);
    expect(() => createNode("condition", "nope")).toThrow(/Unknown condition type "nope"/);
    expect(() => createNode("result", "attackRoll")).toThrow(/Unknown result type "attackRoll"/);
  });
});

describe("createCheck", () => {
  it("creates a check with defaults", () => {
    const check = createCheck("creatureTypes");
    expect(check).toMatchObject({ type: "creatureTypes", data: { values: [] } });
    expect(check.id).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it("rejects unknown checks", () => {
    expect(() => createCheck("nope")).toThrow(/Unknown check type "nope"/);
  });
});

describe("createEdge", () => {
  it("always targets the input pin", () => {
    expect(createEdge("a", "yes", "b")).toMatchObject({ source: "a", sourcePin: "yes", target: "b", targetPin: "in" });
  });
});

describe("duplicateBlueprint", () => {
  it("copies the graph under a new id and drops the module's own flags", () => {
    const source = createBlueprint({
      name: "Hex",
      sort: 3,
      nodes: [createNode("event", "damageRoll")],
      flags: { "build-n-action": { legacyId: "old" }, other: { keep: true } }
    });
    const copy = duplicateBlueprint(source, "Hex (copy)");
    expect(copy.id).not.toBe(source.id);
    expect(copy).toMatchObject({ name: "Hex (copy)", sort: 4, enabled: source.enabled, flags: { other: { keep: true } } });
    expect(copy.flags).not.toHaveProperty("build-n-action");
    expect(copy.nodes).toEqual(source.nodes);
    expect(copy.nodes[0]).not.toBe(source.nodes[0]);
  });
});
