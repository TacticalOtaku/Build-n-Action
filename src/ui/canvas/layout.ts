import type { ELK } from "elkjs/lib/elk-api";
import type { BlueprintSource, Position } from "../../core/blueprint/types";
import type { Size } from "./flow-mapping";

// elkjs is about a third of the editor's code and only "Tidy layout" needs it, so it loads on first use.
let elk: Promise<ELK> | null = null;

function layoutEngine(): Promise<ELK> {
  elk ??= import("elkjs/lib/elk.bundled.js").then(({ default: Engine }) => new Engine());
  return elk;
}

/** Size used before React Flow has measured a node (roughly one node card). */
const FALLBACK_SIZE: Size = { width: 232, height: 120 };

const OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
  "elk.spacing.nodeNode": "36",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF"
};

/** Positions that arrange the blueprint as left-to-right chains. */
export async function autoLayout(
  blueprint: BlueprintSource,
  sizes: Readonly<Record<string, Size>>
): Promise<Record<string, Position>> {
  const result = await (await layoutEngine()).layout({
    id: "root",
    layoutOptions: OPTIONS,
    children: blueprint.nodes.map(node => ({ id: node.id, ...(sizes[node.id] ?? FALLBACK_SIZE) })),
    edges: blueprint.edges.map(edge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }))
  });
  const positions: Record<string, Position> = {};
  for (const child of result.children ?? []) positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  return positions;
}
