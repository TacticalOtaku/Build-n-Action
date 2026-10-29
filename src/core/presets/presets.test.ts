import { describe, expect, it } from "vitest";
import { validateBlueprintSource } from "../blueprint/validate";
import { lintBlueprint } from "../engine/lint";
import { createTranslator } from "../i18n";
import { describeBlueprint } from "../phrase/describe";
import { createPhraseFormatter } from "../phrase/formatter";
import en from "../../lang/en.json";
import ru from "../../lang/ru.json";
import { PRESETS, instantiatePreset } from "./presets";

const languages = [["en", en], ["ru", ru]] as const;

describe("presets", () => {
  it("offers the 14 presets of the spec, with unique ids", () => {
    expect(PRESETS.map(preset => preset.id)).toEqual([
      "bless", "bane", "hex", "huntersMark", "sneakAttack", "greatWeapon", "archery", "brutalCritical",
      "lucky", "auraOfProtection", "divineSmite", "colossusSlayer", "poisonedBlade", "vampiricStrike"
    ]);
  });

  it.each(languages)("%s: every preset is valid, lint-clean and reads as a sentence", (_language, dictionary) => {
    const translator = createTranslator(dictionary, { strict: true });
    const fmt = createPhraseFormatter(translator, { choices: () => [] });
    for (const preset of PRESETS) {
      const blueprint = preset.build(translator.t);
      expect(validateBlueprintSource(blueprint).ok, preset.id).toBe(true);
      expect(lintBlueprint(blueprint), preset.id).toEqual([]);
      expect(describeBlueprint(blueprint, fmt).length, preset.id).toBeGreaterThan(0);
      expect(blueprint.name, preset.id).toBe(translator.t(`BNA.Preset.${preset.id}.name`));
    }
  });

  it("instantiates a copy with a fresh id and the localized name", () => {
    const { t } = createTranslator(en, { strict: true });
    const preset = PRESETS[0]!;
    const built = preset.build(t);
    const copy = instantiatePreset(preset, t);
    expect(copy.id).not.toBe(built.id);
    expect(copy.name).toBe("Bless");
    expect(copy.nodes).toEqual(built.nodes);
    expect(copy.edges).toEqual(built.edges);
  });

  it("scales Divine Smite's cost with the slot and limits Sneak Attack to once per turn", () => {
    const { t } = createTranslator(en, { strict: true });
    const smite = PRESETS.find(preset => preset.id === "divineSmite")!.build(t);
    const bonus = smite.nodes.find(node => node.id === "smite")!;
    expect(bonus.data.common).toMatchObject({ optional: true, cost: { type: "slots", scales: true, formula: "1d8" } });
    const sneak = PRESETS.find(preset => preset.id === "sneakAttack")!.build(t);
    expect(sneak.nodes.find(node => node.id === "sneak")!.data.common).toMatchObject({ optional: true, limit: "turn" });
  });
});
