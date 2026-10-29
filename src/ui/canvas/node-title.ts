import type { BlueprintNode, ConditionCheck } from "../../core/blueprint/types";
import type { Translator } from "../../core/i18n";
import { getCheck, getEvent, getResult } from "../../core/registry/index";

type Translate = Translator["t"];

/** The card title of a node: its event or result type, or a condition's first check. */
export function nodeTitle(node: BlueprintNode, t: Translate): string {
  switch (node.kind) {
    case "event":
      return getEvent(node.type) ? t(`BNA.Event.${node.type}.Label`) : t("BNA.UI.Node.unknown");
    case "result":
      return getResult(node.type) ? t(`BNA.Result.${node.type}.Label`) : t("BNA.UI.Node.unknown");
    case "condition": {
      const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
      const first = checks[0];
      if (!first) return (node.data.thisItem === true) ? t("BNA.Check.thisItem.Label") : t("BNA.UI.Node.noChecksTitle");
      const label = getCheck(first.type) ? t(`BNA.Check.${first.type}.Label`) : first.type;
      return (checks.length > 1) ? `${label} +${checks.length - 1}` : label;
    }
  }
}
