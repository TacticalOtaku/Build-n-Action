import { describe, expect, it } from "vitest";
import { createManifest, MODULE_VERSION } from "./manifest";

describe("createManifest", () => {
  const manifest = createManifest();

  it("describes the 2.0 package for Foundry 14.367 and dnd5e 5.3.3", () => {
    expect(manifest).toMatchObject({
      id: "build-n-action",
      version: MODULE_VERSION,
      compatibility: { minimum: "14.367", verified: "14.367" },
      esmodules: ["module.mjs"],
      styles: ["module.css"],
      socket: true
    });
    expect(manifest.relationships.systems).toEqual([
      { id: "dnd5e", type: "system", compatibility: { minimum: "5.3.3", verified: "5.3.3", maximum: "5.3.3" } }
    ]);
  });

  it("recommends Midi QOL 14.0.12 and DAE 14.0.14", () => {
    expect(manifest.relationships.recommends).toEqual([
      { id: "midi-qol", type: "module", compatibility: { minimum: "14.0.12", verified: "14.0.12" } },
      { id: "dae", type: "module", compatibility: { minimum: "14.0.14", verified: "14.0.14" } }
    ]);
  });

  it("ships English and Russian", () => {
    expect(manifest.languages.map(language => [language.lang, language.path])).toEqual([["en", "lang/en.json"], ["ru", "lang/ru.json"]]);
  });

  it("declares the region behavior that hears tokens entering and leaving", () => {
    expect(manifest.documentTypes).toEqual({ RegionBehavior: { blueprints: {} } });
  });

  it("points the download at the release of this version", () => {
    expect(createManifest("2.1.0").download).toBe(
      "https://github.com/TacticalOtaku/Build-n-Action/releases/download/v2.1.0/build-n-action-v2.1.0.zip"
    );
  });
});
