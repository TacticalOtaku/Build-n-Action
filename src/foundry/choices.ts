import type { Translator } from "../core/i18n";
import type { ChoiceProvider } from "../core/phrase/formatter";
import type { Choice, DynamicChoiceSource } from "../core/registry/fields";
import { choicesFor, type ChoiceSourceData } from "../runtime/choice-sources";
import { listOf, read } from "../runtime/read";
import { traitTrees } from "./collect";
import { carrierItem, isDocument } from "./documents";

export const foundryTranslator: Translator = {
  t: (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key)),
  has: key => game.i18n.has(key)
};

function sourceData(carrier: FoundryDocument | null): ChoiceSourceData {
  const effectsOwner = carrier ? (carrierItem(carrier) ?? carrier) : null;
  return {
    dnd5e: CONFIG.DND5E,
    statusEffects: CONFIG.statusEffects,
    itemTypes: Object.fromEntries(Object.entries(CONFIG.Item.typeLabels).filter(([type]) => type !== "base")),
    trees: traitTrees(),
    effects: listOf(read(effectsOwner, "effects")).filter(isDocument).map(effect => ({ id: effect.id, name: effect.name })),
    localize: key => game.i18n.localize(key)
  };
}

/** Choice lists from CONFIG and the carrier's effects; built on first use and cached per provider. */
export function foundryChoices(carrier: FoundryDocument | null = null): ChoiceProvider {
  let data: ChoiceSourceData | null = null;
  const cache = new Map<DynamicChoiceSource, Choice[]>();
  return {
    choices(source) {
      let list = cache.get(source);
      if (!list) {
        data ??= sourceData(carrier);
        list = choicesFor(source, data);
        cache.set(source, list);
      }
      return list;
    }
  };
}
