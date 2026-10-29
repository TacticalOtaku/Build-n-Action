import { describe, expect, it } from "vitest";
import { FLAVOR_SPECS, FX_FLAVORS, pickFlavor } from "./flavors";

describe("pickFlavor", () => {
  it("maps the first themed damage type", () => {
    expect(pickFlavor(["slashing", "fire", "cold"])).toBe("fire");
    expect(pickFlavor(["psychic"])).toBe("psychic");
  });

  it("returns null for untheme types and empty lists", () => {
    expect(pickFlavor(["slashing", "healing"])).toBeNull();
    expect(pickFlavor([])).toBeNull();
  });
});

describe("FLAVOR_SPECS", () => {
  it("defines a spec with colours for both themes for every flavour", () => {
    for (const flavor of FX_FLAVORS) {
      const spec = FLAVOR_SPECS[flavor];
      expect(spec.colors.dark.length, flavor).toBeGreaterThan(0);
      expect(spec.colors.light.length, flavor).toBeGreaterThan(0);
      expect(spec.life[0], flavor).toBeLessThanOrEqual(spec.life[1]);
      expect(spec.rate, flavor).toBeGreaterThan(0);
    }
  });

  it("gives only fire the flame band", () => {
    expect(FX_FLAVORS.filter(flavor => FLAVOR_SPECS[flavor].band)).toEqual(["fire"]);
  });
});
