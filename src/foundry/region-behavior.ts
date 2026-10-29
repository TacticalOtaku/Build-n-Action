import { MODULE_SCOPE } from "../core/storage/repository";
import { read } from "../runtime/read";
import { needsRegionBehavior } from "../runtime/triggers";
import { documentBlueprints, isDocument, touchesBlueprints } from "./documents";
import { guardedAsync } from "./evaluate";
import { runTrigger } from "./triggers";

export const REGION_BEHAVIOR_TYPE = `${MODULE_SCOPE}.blueprints`;

async function onToken(this: RegionBehaviorTypeLike, event: RegionEventLike, trigger: "regionEnter" | "regionExit"): Promise<void> {
  const token = event.data.token;
  const actor = read(token, "actor");
  if (!token || !isDocument(actor)) return;
  await runTrigger({
    event: trigger,
    actor,
    token: (read(token, "object") as TokenPlaceable | null | undefined) ?? null,
    only: this.region,
    key: `${this.region.uuid}|${token.uuid}|${trigger}|${event.data.movement?.id ?? Date.now()}`
  });
}

/**
 * Hears tokens entering and leaving its region and runs the region's blueprints on the active GM.
 * Region events reach every client; runTrigger acts only on the active GM.
 */
class BlueprintsRegionBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema(): Record<string, unknown> {
    return { events: foundry.data.regionBehaviors.RegionBehaviorType._createEventsField() };
  }

  static events = {
    tokenEnter(this: RegionBehaviorTypeLike, event: RegionEventLike) {
      return guardedAsync("region enter", () => onToken.call(this, event, "regionEnter"));
    },
    tokenExit(this: RegionBehaviorTypeLike, event: RegionEventLike) {
      return guardedAsync("region exit", () => onToken.call(this, event, "regionExit"));
    }
  };
}

/** Register the behavior type (init). */
export function registerRegionBehavior(): void {
  CONFIG.RegionBehavior.dataModels[REGION_BEHAVIOR_TYPE] = BlueprintsRegionBehavior;
  CONFIG.RegionBehavior.typeLabels[REGION_BEHAVIOR_TYPE] = "BNA.RegionBehavior.label";
  CONFIG.RegionBehavior.typeIcons[REGION_BEHAVIOR_TYPE] = "fa-solid fa-diagram-project";
  // Foundry lists every registered type in "Add behavior"; the hint says the module manages this one.
  CONFIG.RegionBehavior.typeHints[REGION_BEHAVIOR_TYPE] = "BNA.RegionBehavior.hint";
}

/** Add the behavior while the region's blueprints start on entering or leaving it, and remove it otherwise. */
export async function syncRegionBehavior(region: FoundryDocument): Promise<void> {
  const wanted = needsRegionBehavior(documentBlueprints(region).blueprints);
  const behaviors = [...(read(region, "behaviors") as Iterable<FoundryDocument> | undefined ?? [])]
    .filter(behavior => read(behavior, "type") === REGION_BEHAVIOR_TYPE);
  if (wanted && !behaviors.length) {
    await region.createEmbeddedDocuments?.("RegionBehavior", [{ type: REGION_BEHAVIOR_TYPE, name: game.i18n.localize("BNA.RegionBehavior.label") }]);
  } else if (!wanted && behaviors.length) {
    await region.deleteEmbeddedDocuments?.("RegionBehavior", behaviors.map(behavior => behavior.id));
  }
}

/** Keep regions' behaviors in step with their blueprints (active GM). */
export function registerRegionBehaviorSync(): void {
  const sync = (region: unknown) => {
    if (!isDocument(region) || (game.users.activeGM?.id !== game.user.id)) return;
    void guardedAsync("region behavior", () => syncRegionBehavior(region));
  };
  Hooks.on("createRegion", (region: unknown) => sync(region));
  Hooks.on("updateRegion", (region: unknown, changes: unknown) => {
    if (touchesBlueprints(changes)) sync(region);
  });
}
