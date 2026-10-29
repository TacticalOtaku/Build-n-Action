import { useMemo } from "react";
import type { Choice, ChoiceSpec } from "../../core/registry/fields";
import { useServices } from "../services";

/** Options for a select or chip list, with module-owned labels translated. */
export function useChoiceOptions(spec: ChoiceSpec): Choice[] {
  const { translator, choices } = useServices();
  return useMemo(() => {
    if ("static" in spec) return spec.static.map(choice => ({ value: choice.value, label: translator.t(choice.label) }));
    return [...choices.choices(spec.source)];
  }, [spec, translator, choices]);
}
