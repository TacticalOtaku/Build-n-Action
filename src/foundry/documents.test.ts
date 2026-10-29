import { describe, expect, it } from "vitest";
import { touchesBlueprints } from "./documents";

describe("touchesBlueprints", () => {
  it("sees nested and dotted changes to the module's flags", () => {
    expect(touchesBlueprints({ flags: { "build-n-action": { blueprints: {} } } })).toBe(true);
    expect(touchesBlueprints({ "flags.build-n-action.blueprints": {} })).toBe(true);
    expect(touchesBlueprints({ flags: { "-=build-n-action": null } })).toBe(true);
  });

  it("ignores other changes", () => {
    expect(touchesBlueprints({ name: "Sword" })).toBe(false);
    expect(touchesBlueprints({ flags: { other: { a: 1 } } })).toBe(false);
    expect(touchesBlueprints(null)).toBe(false);
  });
});
