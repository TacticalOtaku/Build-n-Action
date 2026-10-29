import type { Reason } from "../../core/engine/reasons";
import type { Translator } from "../../core/i18n";
import type { ChoiceSpec } from "../../core/registry/fields";
import { getCheck } from "../../core/registry/index";
import type { PhraseFormatter } from "../../core/registry/types";

/** Reason values that hold stored choice values joined with ", ". */
const LISTED = ["actual", "expected"] as const;

/** The choice list a check's values come from, if it has one. */
export function checkChoices(type: string): ChoiceSpec | null {
  for (const field of getCheck(type)?.fields ?? []) {
    if (("choices" in field) && field.choices) return field.choices;
  }
  return null;
}

/** A reason as text; with a choice list, stored values ("humanoid, elf") show as their labels. */
export function reasonText(reason: Reason, t: Translator["t"], fmt?: PhraseFormatter, spec?: ChoiceSpec | null): string {
  if (!reason.values) return t(`BNA.Reason.${reason.code}`);
  const values: Record<string, string | number> = { ...reason.values };
  if (fmt && spec) {
    for (const key of LISTED) {
      const value = values[key];
      if ((typeof value === "string") && (value !== "—")) values[key] = value.split(", ").map(part => fmt.choice(part, spec)).join(", ");
    }
  }
  return t(`BNA.Reason.${reason.code}`, values);
}
