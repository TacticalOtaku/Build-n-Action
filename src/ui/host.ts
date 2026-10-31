import type { BlueprintSource, CounterDef, CounterScope } from "../core/blueprint/types";
import type { EffectReference } from "../core/facts/effects";
import type { BlueprintRun } from "../core/engine/interpreter";
import type { LintEnv } from "../core/engine/lint";
import type { EventType, PinId } from "../core/registry/constants";
import type { ImportResult } from "../core/storage/library";

/** One entry of a subject list; `label` is already localized. */
export interface SimulationOption {
  value: string;
  label: string;
  group?: string;
}

/** An item the test actor can use, with its activities. */
export interface SimulationItem {
  uuid: string;
  name: string;
  activities: readonly SimulationOption[];
}

/** What to simulate: who rolls what, against whom, and which outcome happened. */
export interface SimulationRequest {
  actorUuid: string;
  itemUuid: string | null;
  activityId: string | null;
  /** Token document UUID of the target, or null. */
  targetUuid: string | null;
  event: EventType;
  /** Outcome pins that fired (["out"] for rolls and signals). */
  pins: readonly PinId[];
  /** Signal name, for the signal event. */
  signal: string | null;
  /** Ability of a check or saving throw; skill of a skill check. */
  abilityId: string | null;
  skillId: string | null;
  /** Assumed outcome of demanded saves. */
  saveOutcome: "succeeded" | "failed";
  /** "My" counter values for the run, by "<scope>:<name>". */
  counters: Readonly<Record<string, number>>;
}

/**
 * Collector-level facts the run itself cannot show:
 * - `suppressed`: the carrier is switched off (an unequipped item, an inactive effect), so the blueprint is ignored;
 * - `noToken`: the test actor has no token on the scene, so auras and templates cannot reach it.
 */
export type SimulationNote = "suppressed" | "noToken" | "trigger" | "chosen";

export interface SimulationResult {
  run: BlueprintRun;
  notes: readonly SimulationNote[];
}

export interface SimulatorHost {
  actors(): readonly SimulationOption[];
  items(actorUuid: string): readonly SimulationItem[];
  targets(): readonly SimulationOption[];
  /** Starting subjects: the selected token's actor (else the carrier's owner), the carrier item when that actor has it, and the current target. */
  defaults(): { actorUuid: string | null; itemUuid: string | null; targetUuid: string | null };
  /** Run the (possibly unsaved) blueprint as if it were stored on the edited document; null when the actor is gone. */
  run(blueprint: BlueprintSource, request: SimulationRequest): SimulationResult | null;
  /** Current values of the counters the blueprint uses, on this actor. */
  counterValues?(actorUuid: string, blueprint: BlueprintSource): readonly CounterRow[];
  /** Call `listener` when the subject lists may have changed (tokens created, deleted or renamed; another scene). */
  subscribe?(listener: () => void): () => void;
  /** A number that changes whenever the subject lists do; the lists are re-read only then. */
  revision?(): number;
}

/** A counter the blueprint uses and its value. */
export interface CounterRow {
  name: string;
  scope: CounterScope;
  value: number;
}

/** Counters of the edited blueprint's owner: values, definitions, resets. */
export interface CountersHost {
  /** Values of the counters this blueprint uses, on the carrier's owner (empty without one). */
  rows(blueprint: BlueprintSource): readonly CounterRow[];
  /** Names to suggest: the owner's shared counters and this blueprint's. */
  names(blueprint: BlueprintSource): readonly string[];
  reset(blueprint: BlueprintSource, row: CounterRow): Promise<void>;
  /** The owner's shared definitions, or null when the blueprint has no owning actor. */
  actorDefs(): readonly CounterDef[] | null;
  saveActorDefs(defs: readonly CounterDef[]): Promise<void>;
  /** Call `listener` when counter values or definitions change. */
  subscribe(listener: () => void): () => void;
}

export interface FormulaHost {
  /** `@` paths of the test actor's roll data, sorted. */
  paths(): readonly string[];
  /** The formula evaluated on the test actor (dice kept as dice), or null when it does not parse. */
  preview(formula: string): string | null;
}

export interface PreferencesHost {
  coachSeen(): boolean;
  markCoachSeen(): void;
}

/** The world library as the editor sees it. `entries` returns the same array until the library changes. */
export interface LibraryHost {
  entries(): readonly BlueprintSource[];
  /** Whether this user may change the library (the GM in Foundry). */
  canEdit(): boolean;
  add(blueprint: BlueprintSource): Promise<void>;
  remove(id: string): Promise<void>;
  /** Add the blueprints in a JSON text to the library. */
  import(text: string): Promise<ImportResult>;
  /** Offer these blueprints as a JSON file download. */
  download(blueprints: readonly BlueprintSource[]): void;
  subscribe(listener: () => void): () => void;
}

/** Drag and drop of blueprint rows between documents. */
export interface TransferHost {
  dragData(blueprint: BlueprintSource): Record<string, unknown>;
  /** The blueprint a drop carries; null for a drop from this same document or data that is not a blueprint. */
  resolveDrop(data: unknown): Promise<BlueprintSource | null>;
}

/** The effect a blueprint lives on, as the title block shows it; labels are already localized. */
export interface EffectStatus {
  state: "active" | "disabled" | "expired" | "suppressed";
  disableCondition: string | null;
  enableCondition: string | null;
  specialDurations: readonly string[];
  openConfig(): void;
}

/** Moving a blueprint from an actor or item onto a new Active Effect of it. */
export interface EffectsHost {
  moveToEffect(blueprint: BlueprintSource): Promise<void>;
}

export interface EffectSelectionHost {
  choices(): readonly EffectReference[];
  resolve(uuid: string): Promise<EffectReference | null>;
}

/** What a host (the playground or Foundry) lends the editor; every part is optional. */
export interface EditorHost {
  /** Environment for the linter, given the blueprint being edited. */
  lintEnv?(blueprint: BlueprintSource): LintEnv;
  simulator?: SimulatorHost;
  formula?: FormulaHost;
  preferences?: PreferencesHost;
  library?: LibraryHost;
  transfer?: TransferHost;
  effects?: EffectsHost;
  effectSelection?: EffectSelectionHost;
  counters?: CountersHost;
}
