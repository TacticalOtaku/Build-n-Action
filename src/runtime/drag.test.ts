import { describe, expect, it } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { BLUEPRINT_DRAG, LEGACY_DRAG, parseBlueprintDrop } from "./drag";

const blueprint = createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "Hex" });

describe("parseBlueprintDrop", () => {
  it("reads blueprint and v1 UUID drags", () => {
    expect(parseBlueprintDrop({ type: BLUEPRINT_DRAG, uuid: "Actor.a.Item.b.Blueprint.aB3dE5gH7jK9mN1p" }))
      .toEqual({ kind: "uuid", uuid: "Actor.a.Item.b.Blueprint.aB3dE5gH7jK9mN1p" });
    expect(parseBlueprintDrop({ type: LEGACY_DRAG, uuid: "Item.b.ContextualBonus.aB3dE5gH7jK9mN1p" }))
      .toEqual({ kind: "uuid", uuid: "Item.b.ContextualBonus.aB3dE5gH7jK9mN1p" });
  });

  it("reads a blueprint carried as data", () => {
    expect(parseBlueprintDrop({ type: BLUEPRINT_DRAG, data: blueprint })).toEqual({ kind: "data", blueprint });
  });

  it("rejects other drags, malformed UUIDs and invalid data", () => {
    expect(parseBlueprintDrop({ type: "Item", uuid: "Item.b" })).toBeNull();
    expect(parseBlueprintDrop({ type: BLUEPRINT_DRAG, uuid: "Item.b\");alert(1);(\".Blueprint.aB3dE5gH7jK9mN1p" })).toBeNull();
    expect(parseBlueprintDrop({ type: BLUEPRINT_DRAG, data: { id: "bad" } })).toBeNull();
    expect(parseBlueprintDrop(undefined)).toBeNull();
  });
});
