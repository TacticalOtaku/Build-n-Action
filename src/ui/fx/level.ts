import { createContext, useContext } from "react";

export type FxLevel = "full" | "reduced" | "off";

export const FX_LEVELS: readonly FxLevel[] = ["full", "reduced", "off"];

export function nextFxLevel(level: FxLevel): FxLevel {
  return FX_LEVELS[(FX_LEVELS.indexOf(level) + 1) % FX_LEVELS.length] ?? "full";
}

export const FxLevelContext = createContext<FxLevel>("full");

export function useFxLevel(): FxLevel {
  return useContext(FxLevelContext);
}
