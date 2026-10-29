import type { FlavorSpec } from "./flavors";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  /** Stable per-particle random value for shape jitter. */
  seed: number;
}

/** Upper bound per card, so a busy canvas stays cheap. */
export const MAX_PARTICLES = 80;

/** Deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(range: readonly [number, number], r: number): number {
  return range[0] + ((range[1] - range[0]) * r);
}

export class ParticleSystem {
  readonly particles: Particle[] = [];
  readonly colors: readonly string[];
  width = 1;
  height = 1;
  readonly #spec: FlavorSpec;
  readonly #random: () => number;
  #carry = 0;

  constructor(spec: FlavorSpec, colors: readonly string[], random: () => number = Math.random) {
    this.#spec = spec;
    this.colors = colors;
    this.#random = random;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  /** Advance by `dt` seconds; `rateScale` thins new particles (reduced effects). */
  step(dt: number, rateScale = 1): void {
    const spec = this.#spec;
    for (const particle of this.particles) {
      particle.age += dt;
      particle.vy += spec.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    let alive = 0;
    for (const particle of this.particles) {
      if (particle.age < particle.life) this.particles[alive++] = particle;
    }
    this.particles.length = alive;

    this.#carry += spec.rate * rateScale * dt;
    while (this.#carry >= 1) {
      this.#carry -= 1;
      if (this.particles.length < MAX_PARTICLES) this.particles.push(this.#spawn());
    }
  }

  #spawn(): Particle {
    const random = this.#random;
    const spec = this.#spec;
    const { width, height } = this;
    let x = random() * width;
    let y = random() * height;
    if (spec.spawn === "bottom") y = height - (random() * 6);
    else if (spec.spawn === "top") y = random() * 6;
    else if (spec.spawn === "edges") {
      const side = Math.floor(random() * 4);
      if (side === 0) y = 0;
      else if (side === 1) x = width;
      else if (side === 2) y = height;
      else x = 0;
    }
    return {
      x,
      y,
      vx: between(spec.vx, random()),
      vy: between(spec.vy, random()),
      age: 0,
      life: between(spec.life, random()),
      size: between(spec.size, random()),
      color: this.colors[Math.floor(random() * this.colors.length)] ?? "#ffffff",
      seed: random()
    };
  }
}
