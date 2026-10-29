/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from disk: Vitest replaces CSS imports (even ?raw) with an empty string.
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--bna-[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2]!.trim()]));
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return (0.2126 * channels[0]!) + (0.7152 * channels[1]!) + (0.0722 * channels[2]!);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const dark = block(".bna-app");
const light = { ...dark, ...block(`.bna-app[data-theme="light"]`) };

describe("theme tokens", () => {
  it("uses the approved cyanotype palette", () => {
    expect(dark["--bna-paper"]).toBe("#0C1522");
    expect(dark["--bna-raised"]).toBe("#131E30");
    expect(dark["--bna-ink"]).toBe("#D5DEEA");
    expect(light["--bna-paper"]).toBe("#EEF2F7");
    expect(light["--bna-ink"]).toBe("#1A2B52");
  });

  it.each([["dark", dark], ["light", light]] as const)("keeps %s text readable (WCAG AA)", (_name, tokens) => {
    for (const text of ["--bna-ink", "--bna-muted", "--bna-when-text", "--bna-if-text", "--bna-then-text", "--bna-danger"]) {
      for (const surface of ["--bna-paper", "--bna-raised"]) {
        expect(contrast(tokens[text]!, tokens[surface]!), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
