import type { FxFlavor } from "../flavors";

type Triple = readonly [string, string, string];

/**
 * Shader colours per flavour: base, body and highlight. Dark-theme colours glow on the navy paper;
 * light-theme colours are deeper so they stay visible on white with normal blending.
 */
export const SHADER_PALETTES: Record<FxFlavor, { dark: Triple; light: Triple }> = {
  fire: { dark: ["#8F1D0B", "#FF6A1F", "#FFE39A"], light: ["#B02A13", "#E8590C", "#FFB84D"] },
  cold: { dark: ["#6FB7FF", "#DDF3FF", "#FFFFFF"], light: ["#1971C2", "#4DABF7", "#74C0FC"] },
  lightning: { dark: ["#4DABF7", "#A5D8FF", "#F1F9FF"], light: ["#1864AB", "#3B5BDB", "#5F3DC4"] },
  radiant: { dark: ["#FFD43B", "#FFF3BF", "#FFFFFF"], light: ["#E67700", "#F59F00", "#FFC933"] },
  necrotic: { dark: ["#020405", "#69DB7C", "#B2F2BB"], light: ["#212529", "#2B8A3E", "#40C057"] },
  acid: { dark: ["#5C940D", "#A9E34B", "#D8F5A2"], light: ["#5C940D", "#74B816", "#8CC21F"] },
  poison: { dark: ["#5F3DC4", "#38D9A9", "#B197FC"], light: ["#5F3DC4", "#0CA678", "#7048E8"] },
  thunder: { dark: ["#339AF0", "#D0EBFF", "#FFFFFF"], light: ["#1864AB", "#1C7ED6", "#4DABF7"] },
  force: { dark: ["#4C6EF5", "#BAC8FF", "#E5DBFF"], light: ["#364FC7", "#5C7CFA", "#7048E8"] },
  psychic: { dark: ["#D6336C", "#9C36B5", "#FFDEEB"], light: ["#C2255C", "#9C36B5", "#E64980"] }
};

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}
