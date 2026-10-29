import { describe, expect, it } from "vitest";
import { resolveEditorTheme } from "./settings";

describe("resolveEditorTheme", () => {
  it("uses the editor's own choice first", () => {
    expect(resolveEditorTheme("light", "dark", false)).toBe("light");
    expect(resolveEditorTheme("dark", "light", true)).toBe("dark");
  });

  it("follows Foundry's application colour scheme in auto", () => {
    expect(resolveEditorTheme("auto", "light", false)).toBe("light");
    expect(resolveEditorTheme(undefined, "dark", true)).toBe("dark");
  });

  it("follows the browser when Foundry does not choose", () => {
    expect(resolveEditorTheme("auto", "", true)).toBe("light");
    expect(resolveEditorTheme("auto", undefined, false)).toBe("dark");
  });
});
