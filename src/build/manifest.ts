/** Version used by the built package and the generated root module.json. */
export const MODULE_VERSION = "2.4.1";

const REPOSITORY = "https://github.com/TacticalOtaku/Build-n-Action";
const SCREENSHOTS_BASE = "https://raw.githubusercontent.com/TacticalOtaku/Build-n-Action/main/docs/screenshots";

/** The Foundry manifest of the built package. */
export function createManifest(version = MODULE_VERSION) {
  return {
    id: "build-n-action",
    title: "Build-n-Action",
    description: "Blueprints: When → If → Then graphs that change rolls and react to their outcome.",
    version,
    authors: [{ name: "TacticalOtaku", url: "https://github.com/TacticalOtaku" }],
    compatibility: { minimum: "14.367", verified: "14.367", maximum: "14" },
    esmodules: ["module.mjs"],
    styles: ["module.css"],
    relationships: {
      systems: [{ id: "dnd5e", type: "system", compatibility: { minimum: "5.3.3", verified: "5.3.3" } }],
      recommends: [
        { id: "midi-qol", type: "module", compatibility: { minimum: "14.0.12", verified: "14.0.12" } },
        { id: "dae", type: "module", compatibility: { minimum: "14.0.14", verified: "14.0.14" } }
      ]
    },
    languages: [
      { lang: "en", name: "English", path: "lang/en.json", flags: {} },
      { lang: "ru", name: "Русский", path: "lang/ru.json", flags: {} }
    ],
    url: REPOSITORY,
    manifest: `${REPOSITORY}/releases/latest/download/module.json`,
    download: `${REPOSITORY}/releases/download/v${version}/build-n-action-v${version}.zip`,
    readme: `${REPOSITORY}/blob/main/README.md`,
    changelog: `${REPOSITORY}/blob/main/CHANGELOG.md`,
    bugs: `${REPOSITORY}/issues`,
    license: `${REPOSITORY}/blob/main/LICENSE`,
    media: [
      {
        type: "cover",
        url: `${SCREENSHOTS_BASE}/editor-graph.png`,
        caption: "Visual When → If → Then blueprint editor and inspector in dark theme"
      },
      {
        type: "screenshot",
        url: `${SCREENSHOTS_BASE}/editor-test-simulator.png`,
        caption: "Built-in Test simulator showing evaluated steps and applied roll bonuses"
      },
      {
        type: "screenshot",
        url: `${SCREENSHOTS_BASE}/editor-templates.png`,
        caption: "Built-in template gallery with 14 ready-to-use D&D 5e blueprint presets"
      }
    ],
    socket: true,
    documentTypes: { RegionBehavior: { blueprints: {} } }
  };
}
