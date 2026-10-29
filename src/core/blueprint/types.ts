import type { NodeKind, PinId } from "../registry/constants";

export const SCHEMA_VERSION = 2 as const;

/** Foundry core icon, the same default image v1 bonuses used. */
export const DEFAULT_BLUEPRINT_IMG = "icons/svg/dice-target.svg";

export interface Position {
  x: number;
  y: number;
}

export interface BlueprintNode {
  id: string;
  kind: NodeKind;
  /** Registry type within the kind; "condition" for condition nodes. */
  type: string;
  position: Position;
  data: Record<string, unknown>;
}

export interface BlueprintEdge {
  id: string;
  source: string;
  sourcePin: PinId;
  target: string;
  targetPin: "in";
}

export type CounterScope = "actor" | "blueprint";
export type CounterReset = "manual" | "shortRest" | "longRest" | "turnStart";

/** A counter's settings: shared on an actor (flags) or private to a blueprint (its `counters`). */
export interface CounterDef {
  name: string;
  min: number;
  /** null: no upper limit. */
  max: number | null;
  /** The value before any change, and after a reset. */
  initial: number;
  reset: CounterReset;
}

/** The persisted form of a blueprint, stored in `flags.build-n-action.blueprints`. */
export interface BlueprintSource {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  img: string;
  description: string;
  enabled: boolean;
  sort: number;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  flags: Record<string, unknown>;
  /** Counters private to this blueprint (optional; older blueprints have none). */
  counters?: CounterDef[];
}

/** The part of a blueprint graph utilities work on. */
export interface BlueprintGraph {
  readonly nodes: readonly BlueprintNode[];
  readonly edges: readonly BlueprintEdge[];
}

export interface ConditionCheck {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ConditionNodeData {
  mode: "all" | "any";
  checks: ConditionCheck[];
}
