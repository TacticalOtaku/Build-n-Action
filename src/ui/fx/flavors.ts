export const FX_FLAVORS = [
  "fire", "cold", "lightning", "radiant", "necrotic", "acid", "poison", "thunder", "force", "psychic"
] as const;

export type FxFlavor = (typeof FX_FLAVORS)[number];

/** A stable value in [0, 1) derived from a key, so each card animates differently but consistently. */
export function seedFrom(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/** The first damage type that has an effect; physical and healing types stay plain. */
export function pickFlavor(types: readonly string[]): FxFlavor | null {
  for (const type of types) {
    if ((FX_FLAVORS as readonly string[]).includes(type)) return type as FxFlavor;
  }
  return null;
}

export type ParticleShape = "ember" | "flake" | "spark" | "mote" | "bubble" | "wisp" | "ring" | "shard";

type Range = readonly [number, number];

export interface FlavorSpec {
  shape: ParticleShape;
  /** Particles per second at the "full" level. */
  rate: number;
  /** Lifetime in seconds. */
  life: Range;
  /** Velocity in px/s. */
  vx: Range;
  vy: Range;
  size: Range;
  /** Vertical acceleration in px/s²; negative rises. */
  gravity: number;
  spawn: "bottom" | "top" | "edges" | "anywhere";
  colors: { dark: readonly string[]; light: readonly string[] };
  /** Draw a moving flame band along the bottom edge (fallback when shaders are unavailable). */
  band?: boolean;
  /** Share of the particle rate kept on top of the GPU shader; 0 when the shader covers it alone. */
  overlay: number;
}

export const FLAVOR_SPECS: Record<FxFlavor, FlavorSpec> = {
  fire: {
    shape: "ember", rate: 26, life: [0.6, 1.3], vx: [-8, 8], vy: [-44, -22], size: [1.1, 2.4], gravity: -16, overlay: 0.8,
    spawn: "bottom", band: true,
    colors: { dark: ["#FFB347", "#FF7A3D", "#FFD27A"], light: ["#D9480F", "#F08C00", "#C92A2A"] }
  },
  cold: {
    shape: "flake", rate: 9, life: [1.8, 3], vx: [-6, 6], vy: [6, 16], size: [2, 3.4], gravity: 0, spawn: "top", overlay: 0.6,
    colors: { dark: ["#BFE6FF", "#E6F6FF"], light: ["#1C7ED6", "#4DABF7"] }
  },
  lightning: {
    shape: "spark", rate: 5, life: [0.14, 0.3], vx: [0, 0], vy: [0, 0], size: [18, 36], gravity: 0, spawn: "edges", overlay: 0,
    colors: { dark: ["#E7F5FF", "#A5D8FF"], light: ["#1864AB", "#5F3DC4"] }
  },
  radiant: {
    shape: "mote", rate: 12, life: [1.2, 2.2], vx: [-4, 4], vy: [-14, -6], size: [1, 2.2], gravity: 0, spawn: "anywhere", overlay: 0.6,
    colors: { dark: ["#FFF3BF", "#FFE066"], light: ["#E67700", "#F59F00"] }
  },
  necrotic: {
    shape: "wisp", rate: 6, life: [1.6, 2.8], vx: [-6, 6], vy: [-10, -4], size: [6, 12], gravity: 0, spawn: "bottom", overlay: 0.35,
    colors: { dark: ["#8CE99A", "#5C677D"], light: ["#2B8A3E", "#343A40"] }
  },
  acid: {
    shape: "bubble", rate: 9, life: [1, 1.8], vx: [-3, 3], vy: [-24, -12], size: [1.6, 3.6], gravity: 0, spawn: "bottom", overlay: 0.25,
    colors: { dark: ["#C0EB75", "#94D82D"], light: ["#5C940D", "#2B8A3E"] }
  },
  poison: {
    shape: "wisp", rate: 9, life: [1.4, 2.4], vx: [-8, 8], vy: [-6, 6], size: [6, 12], gravity: 0, spawn: "anywhere", overlay: 0.3,
    colors: { dark: ["#B197FC", "#63E6BE"], light: ["#6741D9", "#087F5B"] }
  },
  thunder: {
    shape: "ring", rate: 1.8, life: [0.9, 1.3], vx: [0, 0], vy: [0, 0], size: [10, 16], gravity: 0, spawn: "anywhere", overlay: 0,
    colors: { dark: ["#A5D8FF"], light: ["#1864AB"] }
  },
  force: {
    shape: "shard", rate: 7, life: [1, 1.6], vx: [-10, 10], vy: [-10, 10], size: [3, 5], gravity: 0, spawn: "anywhere", overlay: 0.4,
    colors: { dark: ["#91A7FF", "#D0BFFF"], light: ["#364FC7", "#7048E8"] }
  },
  psychic: {
    shape: "ring", rate: 2.2, life: [1.4, 2], vx: [0, 0], vy: [0, 0], size: [4, 8], gravity: 0, spawn: "anywhere", overlay: 0,
    colors: { dark: ["#F783AC", "#DA77F2"], light: ["#C2255C", "#9C36B5"] }
  }
};
