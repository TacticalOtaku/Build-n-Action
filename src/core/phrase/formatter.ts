import type { Translator } from "../i18n";
import type { Choice, ChoiceSpec, DynamicChoiceSource } from "../registry/fields";
import type { PhraseFormatter } from "../registry/types";

/** Supplies runtime choice lists (CONFIG.DND5E, the carrying document, or test fixtures). */
export interface ChoiceProvider {
  choices(source: DynamicChoiceSource): readonly Choice[];
}

export function createPhraseFormatter(translator: Translator, provider: ChoiceProvider): PhraseFormatter {
  const label = (value: string, spec: ChoiceSpec): string => {
    if (!value) return "";
    if ("static" in spec) {
      const match = spec.static.find(choice => choice.value === value);
      return match ? translator.t(match.label) : value;
    }
    return provider.choices(spec.source).find(choice => choice.value === value)?.label ?? value;
  };

  const join = (items: readonly string[], conjunctionKey: string): string => {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} ${translator.t(conjunctionKey)} ${items.at(-1)}`;
  };
  const joinAnd = (items: readonly string[]) => join(items, "BNA.Phrase.And");
  const joinOr = (items: readonly string[]) => join(items, "BNA.Phrase.Or");

  return {
    t: (key, data) => translator.t(key, data),
    choice: label,
    choices(values, spec) {
      const included: string[] = [];
      const excluded: string[] = [];
      for (const value of values) {
        if (value.startsWith("!")) excluded.push(label(value.slice(1), spec));
        else included.push(label(value, spec));
      }
      if (!included.length && !excluded.length) return translator.t("BNA.Phrase.Any");
      if (!excluded.length) return joinOr(included);
      if (!included.length) return translator.t("BNA.Phrase.NotValues", { values: joinOr(excluded) });
      return translator.t("BNA.Phrase.ButNot", { values: joinOr(included), excluded: joinOr(excluded) });
    },
    signed(formula) {
      const trimmed = formula.trim();
      if (!trimmed) return "+0";
      return /^[+-]/.test(trimmed) ? trimmed : `+${trimmed}`;
    },
    joinAnd,
    joinOr
  };
}
