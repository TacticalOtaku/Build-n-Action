import type { BlueprintSource } from "../core/blueprint/types";
import { validateBlueprintSource } from "../core/blueprint/validate";
import { runThrough, type ChainEntry } from "../core/engine/interpreter";
import { blueprintSignals } from "../core/engine/lint";
import { isEffectUuid, type EffectReference, type RollFacts, type RollMode } from "../core/facts/types";
import { TRIGGER_EVENTS, type EventType } from "../core/registry/constants";
import { asRecord, asString } from "../core/registry/data";
import { parseBlueprintUuid } from "../core/storage/repository";
import type {
  CounterRow,
  CountersHost,
  EditorHost,
  EffectsHost,
  LibraryHost,
  PreferencesHost,
  SimulationItem,
  SimulationNote,
  SimulationOption,
  SimulationRequest,
  SimulationResult,
  SimulatorHost,
} from "../ui/host";

export const BLUEPRINT_DRAG = "Blueprint";
/** v1 drag type still accepted from older macros and links. */
export const LEGACY_DRAG = "ContextualBonus";

/** Roll-data roots supplied per roll rather than on the carrier document. */
export const ROLL_ROOTS = ["target.", "item.", "activity.", "counters."] as const;

export type BlueprintDrop = { kind: "uuid"; uuid: string } | { kind: "data"; blueprint: BlueprintSource };

/** Default drag payload when a host has no UUID identity: the blueprint travels as JSON data. */
export function defaultDragData(blueprint: BlueprintSource): Record<string, unknown> {
  return { type: BLUEPRINT_DRAG, data: blueprint };
}

/** Parses JSON drag-and-drop payload text, returning null on empty or malformed JSON. */
export function parseDragText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Validates an embedded blueprint carried directly on a drop payload. */
export function readDroppedBlueprint(data: unknown): BlueprintSource | null {
  const record = asRecord(data);
  if (record.type !== BLUEPRINT_DRAG) return null;
  const result = validateBlueprintSource(record.data);
  return result.ok ? result.value : null;
}

/** Parses a dropped blueprint payload (UUID link or inline blueprint data); ignores unrelated drags. */
export function parseBlueprintDrop(data: unknown): BlueprintDrop | null {
  const record = asRecord(data);
  if (record.type !== BLUEPRINT_DRAG && record.type !== LEGACY_DRAG) return null;
  const uuid = asString(record.uuid);
  if (uuid) return parseBlueprintUuid(uuid) && /^[\w.-]+$/.test(uuid) ? { kind: "uuid", uuid } : null;
  if (record.type !== BLUEPRINT_DRAG) return null;
  const result = validateBlueprintSource(record.data);
  return result.ok ? { kind: "data", blueprint: result.value } : null;
}

/** Parses an ActiveEffect drop payload at the host boundary; null when unrelated or not JSON. */
export function parseEffectDrop(raw: string): { uuid: string; valid: boolean } | null {
  const parsed = parseDragText(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const data = asRecord(parsed);
  if (data.type !== "ActiveEffect") return null;
  const uuid = asString(data.uuid).trim();
  return { uuid, valid: isEffectUuid(uuid) };
}

const D20_EVENTS: readonly EventType[] = [
  "attackRoll",
  "savingThrow",
  "abilityCheck",
  "afterAttack",
  "afterCheck",
];

/** Simulated roll mode from the test request, defaulting to normal on inherently d20 events. */
export function simulatedRollMode(request: SimulationRequest): RollMode | null {
  if (request.rollMode !== undefined) return request.rollMode;
  return D20_EVENTS.includes(request.event) ? "normal" : null;
}

export interface SimulationPrepared {
  entry: ChainEntry;
  facts: RollFacts;
  suppressed: boolean;
  hasToken: boolean;
}

/** Executes one Test-tab simulation run through the full interpreter (including continuations and assumed saves). */
export function runSimulation(
  prepared: SimulationPrepared | null,
  request: SimulationRequest,
): SimulationResult | null {
  if (!prepared) return null;
  const { entry, facts, suppressed, hasToken } = prepared;
  const trigger = {
    event: request.event,
    pins: request.pins,
    ...(request.signal ? { signal: request.signal } : {}),
  };
  const notes: SimulationNote[] = [];
  if (suppressed) notes.push("suppressed");
  if (!hasToken) notes.push("noToken");
  if (TRIGGER_EVENTS.includes(request.event)) notes.push("trigger");
  const run = runThrough(entry.compiled, trigger, facts, entry.env, { outcome: request.saveOutcome });
  if (run.assumedChoice) notes.push("chosen");
  return { run, notes };
}

export interface EditorHostSpec {
  lint: {
    validateFormula(formula: string): boolean;
    hasKnownPath(path: string): boolean;
    neighbourBlueprints(editingId: string): readonly BlueprintSource[];
    itemCarrier?: boolean;
    regionCarrier?: boolean;
    counterNames?: (blueprint: BlueprintSource) => ReadonlySet<string>;
  };
  formula: {
    paths(): readonly string[];
    preview(formula: string): string | null;
  };
  effectSelection?: {
    choices(): readonly EffectReference[];
    resolve(uuid: string): Promise<EffectReference | null>;
  };
  transfer?: {
    dragData(blueprint: BlueprintSource): Record<string, unknown>;
    resolveDrop(data: unknown): Promise<BlueprintSource | null>;
  };
  simulator?: {
    actors(): readonly SimulationOption[];
    subscribe?(listener: () => void): () => void;
    revision?(): number;
    items(actorUuid: string): readonly SimulationItem[];
    targets(): readonly SimulationOption[];
    defaults(): ReturnType<SimulatorHost["defaults"]>;
    counterValues?(actorUuid: string, blueprint: BlueprintSource): readonly CounterRow[];
    prepare(blueprint: BlueprintSource, request: SimulationRequest): SimulationPrepared | null;
  };
  library?: LibraryHost;
  effects?: EffectsHost;
  counters?: CountersHost;
  preferences?: PreferencesHost;
}

/** Shared EditorHost factory unifying linting, formula previews, transfer, effect selection, and simulations across hosts. */
export function createEditorHost(spec: EditorHostSpec): EditorHost {
  const { lint, formula, effectSelection, transfer, simulator, library, effects, counters, preferences } =
    spec;
  return {
    library,
    effects,
    counters,
    preferences,
    lintEnv: (blueprint) => {
      const { sent, received } = blueprintSignals([...lint.neighbourBlueprints(blueprint.id), blueprint]);
      return {
        validateFormula: lint.validateFormula,
        hasPath: (path) => ROLL_ROOTS.some((root) => path.startsWith(root)) || lint.hasKnownPath(path),
        signalsSent: sent,
        signalsReceived: received,
        itemCarrier: lint.itemCarrier,
        regionCarrier: lint.regionCarrier,
        counterNames: lint.counterNames?.(blueprint),
      };
    },
    formula: {
      paths: () => formula.paths(),
      preview: (expression) => formula.preview(expression),
    },
    effectSelection: effectSelection
      ? {
          choices: () => effectSelection.choices(),
          resolve: (uuid) => (isEffectUuid(uuid) ? effectSelection.resolve(uuid) : Promise.resolve(null)),
          parseDrop: parseEffectDrop,
        }
      : undefined,
    transfer: transfer
      ? {
          dragData: (blueprint) => transfer.dragData(blueprint),
          resolveDrop: (data) => transfer.resolveDrop(data),
        }
      : undefined,
    simulator: simulator
      ? {
          actors: () => simulator.actors(),
          subscribe: simulator.subscribe,
          revision: simulator.revision,
          items: (actorUuid) => simulator.items(actorUuid),
          targets: () => simulator.targets(),
          defaults: () => simulator.defaults(),
          counterValues: simulator.counterValues,
          run: (blueprint, request) => runSimulation(simulator.prepare(blueprint, request), request),
        }
      : undefined,
  };
}
