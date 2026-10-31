import { effectReference, isEffectUuid, type EffectReference } from "../core/facts/effects";
import { callList, listOf, read } from "../runtime/read";
import type { EffectSelectionHost } from "../ui/host";
import { isDocument } from "./documents";

function accessibleReference(document: unknown): EffectReference | null {
  if (!isDocument(document) || document.documentName !== "ActiveEffect") return null;
  if (!game.user.isGM && !document.isOwner && document.testUserPermission?.(game.user, "OBSERVER") !== true) return null;
  return effectReference(document);
}

export function createEffectSelectionHost(carrier: unknown): EffectSelectionHost {
  return {
    choices: () => {
      const parent = read(carrier, "parent");
      const references = new Map<string, EffectReference>();
      for (const owner of [carrier, parent]) {
        for (const effect of [owner, ...listOf(read(owner, "effects")), ...callList(owner, "allApplicableEffects")]) {
          const ref = accessibleReference(effect);
          if (ref) references.set(ref.uuid, ref);
        }
      }
      return [...references.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    resolve: async uuid => {
      if (!isEffectUuid(uuid)) return null;
      try {
        return accessibleReference(await fromUuid(uuid));
      } catch {
        return null;
      }
    }
  };
}
