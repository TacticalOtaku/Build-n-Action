import { describe, expect, it } from "vitest";
import { FX_FLAVORS, FLAVOR_SPECS, seedFrom } from "../flavors";
import { SHADER_UNIFORMS, buildFragment } from "./glsl";
import { SHADER_PALETTES, hexToRgb } from "./palettes";

describe("seedFrom", () => {
  it("is stable per key and stays in [0, 1)", () => {
    expect(seedFrom("fire")).toBe(seedFrom("fire"));
    expect(seedFrom("fire")).not.toBe(seedFrom("cold"));
    for (const key of ["", "a", "PlgFlameTongue01", "Длинный меч"]) {
      const seed = seedFrom(key);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
    }
  });
});

describe("hexToRgb", () => {
  it("converts to 0..1 channels", () => {
    expect(hexToRgb("#FF8000")).toEqual([1, 128 / 255, 0]);
  });
});

describe("shader palettes", () => {
  it("define three colours per theme for every flavour", () => {
    for (const flavor of FX_FLAVORS) {
      expect(SHADER_PALETTES[flavor].dark, flavor).toHaveLength(3);
      expect(SHADER_PALETTES[flavor].light, flavor).toHaveLength(3);
    }
  });
});

describe("buildFragment", () => {
  it.each(FX_FLAVORS)("builds a complete GLSL ES 3.0 shader for %s", flavor => {
    const source = buildFragment(flavor);
    expect(source.startsWith("#version 300 es")).toBe(true);
    expect(source).toContain("void main()");
    expect(source).toContain("emit(");
    for (const uniform of SHADER_UNIFORMS) expect(source).toMatch(new RegExp(`uniform \\w+ ${uniform};`));
    expect(source.match(/void main\(\)/g)).toHaveLength(1);
  });
});

describe("particle overlay", () => {
  it("keeps particles only where they add depth over the shader", () => {
    expect(FLAVOR_SPECS.fire.overlay).toBeGreaterThan(0);
    expect(FLAVOR_SPECS.lightning.overlay).toBe(0);
    expect(FLAVOR_SPECS.thunder.overlay).toBe(0);
  });
});
