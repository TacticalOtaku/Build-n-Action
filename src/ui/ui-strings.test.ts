import { describe, expect, it } from "vitest";
import { createTranslator } from "../core/i18n";
import en from "../lang/en.json";
import ru from "../lang/ru.json";

const sources = import.meta.glob<string>(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true
});

const KEY_PATTERN = /["'`](BNA\.(?:UI|Palette)\.[A-Za-z0-9_.]+)["'`]/g;

function usedKeys(): string[] {
  const keys = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const match of text.matchAll(KEY_PATTERN)) if (match[1]) keys.add(match[1]);
  }
  return [...keys].sort();
}

describe("editor strings", () => {
  it.each([["en", en], ["ru", ru]] as const)("%s defines every UI key used in src/ui", (_language, dictionary) => {
    const translator = createTranslator(dictionary);
    expect(usedKeys().filter(key => !translator.has(key))).toEqual([]);
  });

  it("finds the keys it is meant to guard", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });
});
