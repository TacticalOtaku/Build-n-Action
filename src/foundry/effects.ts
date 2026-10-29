import type { BlueprintSource } from "../core/blueprint/types";
import { effectSummary } from "../runtime/effect-state";
import { read } from "../runtime/read";
import type { EffectStatus, EffectsHost } from "../ui/host";
import { saveBlueprint } from "./api";

/** DAE's localized special-duration labels, when DAE is active; keys otherwise. */
function durationLabels(keys: readonly string[]): string[] {
  const api = read(game.modules.get("dae"), "api");
  const labelsOf = read(api, "daeSpecialDurations");
  const labels = (typeof labelsOf === "function") ? (labelsOf.call(api) as Record<string, string> | undefined) : undefined;
  return keys.map(key => labels?.[key] ?? key);
}

export function effectStatus(effect: FoundryDocument): EffectStatus {
  const summary = effectSummary(effect);
  return {
    ...summary,
    specialDurations: durationLabels(summary.specialDurations),
    openConfig: () => {
      effect.sheet?.render({ force: true });
    }
  };
}

/** For actors and items the user owns: move a blueprint onto a new effect of theirs. */
export function createEffectsHost(carrier: FoundryDocument): EffectsHost | undefined {
  const create = carrier.createEmbeddedDocuments?.bind(carrier);
  if (!["Actor", "Item"].includes(carrier.documentName) || !carrier.isOwner || !create) return undefined;
  return {
    moveToEffect: async (blueprint: BlueprintSource) => {
      const name = blueprint.name || game.i18n.localize("BNA.UI.Rail.untitled");
      const [effect] = await create("ActiveEffect", [{
        name,
        img: blueprint.img,
        // An item's effect follows the item: it applies while the item is equipped (or attuned).
        transfer: carrier.documentName === "Item",
        disabled: false
      }]);
      if (!effect) throw new Error("Build-n-Action | the effect was not created");
      await saveBlueprint(effect, blueprint);
      ui.notifications.info(game.i18n.format("BNA.Effects.moved", { name }));
      effect.sheet?.render({ force: true });
    }
  };
}
