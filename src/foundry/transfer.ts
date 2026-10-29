import type { BlueprintSource } from "../core/blueprint/types";
import { blueprintUuid } from "../core/storage/repository";
import { BLUEPRINT_DRAG, parseBlueprintDrop } from "../runtime/drag";
import type { TransferHost } from "../ui/host";
import { blueprintFromUuid } from "./api";

export function blueprintDragData(document: FoundryDocument, blueprint: BlueprintSource): { type: string; uuid: string } {
  return { type: BLUEPRINT_DRAG, uuid: blueprintUuid(document.uuid, blueprint.id) };
}

/** The blueprint a drop carries and the document it lives on (null when it came as data). */
export async function resolveBlueprintDrop(data: unknown): Promise<{ document: FoundryDocument | null; blueprint: BlueprintSource } | null> {
  const drop = parseBlueprintDrop(data);
  if (!drop) return null;
  if (drop.kind === "data") return { document: null, blueprint: drop.blueprint };
  return blueprintFromUuid(drop.uuid);
}

export function createTransferHost(carrier: FoundryDocument): TransferHost {
  return {
    dragData: blueprint => blueprintDragData(carrier, blueprint),
    resolveDrop: async data => {
      const found = await resolveBlueprintDrop(data);
      return (found && (found.document !== carrier)) ? found.blueprint : null;
    }
  };
}
