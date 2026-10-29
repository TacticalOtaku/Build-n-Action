import { createContext, useContext } from "react";

export type ThemeName = "dark" | "light";

export const ThemeContext = createContext<ThemeName>("dark");

export function useThemeName(): ThemeName {
  return useContext(ThemeContext);
}
