import { describe, expect, it } from "vitest";
import type { FlavorSpec } from "./flavors";
import { MAX_PARTICLES, ParticleSystem, seededRandom } from "./particles";

function spec(overrides: Partial<FlavorSpec> = {}): FlavorSpec {
  return {
    shape: "mote", rate: 10, life: [5, 5], vx: [0, 0], vy: [0, 0], size: [1, 1], gravity: 0, spawn: "anywhere", overlay: 1,
    colors: { dark: ["#fff"], light: ["#000"] },
    ...overrides
  };
}

function system(overrides: Partial<FlavorSpec> = {}, seed = 1): ParticleSystem {
  const result = new ParticleSystem(spec(overrides), ["#fff"], seededRandom(seed));
  result.resize(200, 100);
  return result;
}

describe("ParticleSystem", () => {
  it("spawns particles at the configured rate", () => {
    const fx = system();
    for (let i = 0; i < 10; i++) fx.step(0.1);
    expect(fx.particles).toHaveLength(10);
  });

  it("scales the rate for the reduced level", () => {
    const fx = system();
    fx.step(1, 0.5);
    expect(fx.particles).toHaveLength(5);
  });

  it("removes particles at the end of their life", () => {
    const fx = system({ life: [0.5, 0.5] });
    fx.step(1);
    expect(fx.particles).toHaveLength(10);
    fx.step(0.6, 0);
    expect(fx.particles).toHaveLength(0);
  });

  it("never exceeds the particle cap", () => {
    const fx = system({ rate: 1000 });
    fx.step(1);
    expect(fx.particles).toHaveLength(MAX_PARTICLES);
  });

  it("spawns along the bottom edge for rising effects", () => {
    const fx = system({ spawn: "bottom" });
    fx.step(1);
    for (const particle of fx.particles) {
      expect(particle.y).toBeGreaterThanOrEqual(94);
      expect(particle.y).toBeLessThanOrEqual(100);
    }
  });

  it("moves particles by velocity and gravity", () => {
    const fx = system({ rate: 1, vx: [10, 10], vy: [-20, -20], gravity: -10 });
    fx.step(1);
    const particle = fx.particles[0]!;
    const { x, y } = particle;
    fx.step(0.5, 0);
    expect(particle.x).toBeCloseTo(x + 5);
    expect(particle.y).toBeCloseTo(y + ((-20 - 5) * 0.5));
  });

  it("is deterministic for a given seed", () => {
    const a = system({}, 42);
    const b = system({}, 42);
    a.step(1);
    b.step(1);
    expect(a.particles).toEqual(b.particles);
  });
});
