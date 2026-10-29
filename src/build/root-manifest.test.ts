/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createManifest, MODULE_VERSION } from "./manifest";

const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

describe("the repository's release metadata", () => {
  it("serves the built manifest from the root, where the update URL points", () => {
    expect(readJson("module.json")).toEqual(createManifest());
  });

  it("gives the package the module's version", () => {
    const lock = readJson("package-lock.json") as { version: string; packages: Record<string, { version: string }> };
    expect((readJson("package.json") as { version: string }).version).toBe(MODULE_VERSION);
    expect(lock.version).toBe(MODULE_VERSION);
    expect(lock.packages[""]?.version).toBe(MODULE_VERSION);
  });
});
