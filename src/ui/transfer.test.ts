import { describe, expect, it } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { DRAG_TYPE, defaultDragData, parseDragText, readDroppedBlueprint } from "./transfer";

const blueprint = createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "Hex" });

describe("transfer", () => {
  it("carries the blueprint itself by default", () => {
    expect(defaultDragData(blueprint)).toEqual({ type: DRAG_TYPE, data: blueprint });
    expect(readDroppedBlueprint(defaultDragData(blueprint))).toEqual(blueprint);
  });

  it("ignores other drops and invalid blueprints", () => {
    expect(readDroppedBlueprint({ type: "Item", uuid: "Item.x" })).toBeNull();
    expect(readDroppedBlueprint({ type: DRAG_TYPE, data: { id: "bad" } })).toBeNull();
    expect(readDroppedBlueprint(null)).toBeNull();
  });

  it("parses drag text leniently", () => {
    expect(parseDragText(JSON.stringify({ type: "Blueprint", uuid: "Item.a.Blueprint.b" }))).toEqual({ type: "Blueprint", uuid: "Item.a.Blueprint.b" });
    expect(parseDragText("not json")).toBeNull();
    expect(parseDragText("")).toBeNull();
  });
});
