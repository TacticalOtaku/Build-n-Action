import type { BlueprintNode, BlueprintSource } from "../blueprint/types";
import type { RollFacts } from "../facts/types";
import { CONTINUATION_EVENT_BY_PIN, type EventType, type PinId } from "../registry/constants";
import { asBoolean, asRecord, asString } from "../registry/data";
import { getResult } from "../registry/index";
import { compileBlueprint, type CompiledBlueprint, type CompiledGuard } from "./compile";
import { evaluateCheck, type CheckEnv } from "./evaluators";
import type { CheckOutcome, Reason } from "./reasons";

/** What happened: the event, the outcome pins that fired (["out"] for rolls and signals), the signal name. */
export interface Trigger {
  event: EventType;
  pins: readonly PinId[];
  signal?: string;
  /** A continuation: the result whose outputs the run continues from. The event's reach is not asked again. */
  from?: string;
}

export type LimitPeriod = "turn" | "round" | "shortRest" | "longRest";

/** Host services for one blueprint: check helpers plus reach and frequency-limit state. */
export interface BlueprintEnv extends CheckEnv {
  /** Whether this event node's "whose roll" includes the current roller. */
  reach(event: BlueprintNode): CheckOutcome;
  /** Whether a result limited to once per period may still apply. */
  limitAvailable(blueprintId: string, nodeId: string, limit: LimitPeriod): boolean;
}

export interface CheckTrace {
  checkId: string;
  type: string;
  outcome: CheckOutcome;
}

export interface NodeTrace {
  status: "passed" | "failed" | "skipped";
  reason?: Reason;
  checks?: CheckTrace[];
}

export interface ResultCommon {
  optional: boolean;
  /** Results sharing a group are offered as one choice; defaults to the node id. */
  choiceGroup: string;
  cost: Readonly<Record<string, unknown>>;
  limit: LimitPeriod | "none";
  /** Whether the result's "And then" output is on. */
  then: boolean;
}

/** A result the runtime should apply (or offer, when optional). */
export interface ResultIntent {
  blueprintId: string;
  nodeId: string;
  type: string;
  data: Readonly<Record<string, unknown>>;
  common: ResultCommon;
  eventNodeId: string;
}

export interface BlueprintRun {
  blueprintId: string;
  intents: ResultIntent[];
  nodes: Record<string, NodeTrace>;
  edges: string[];
  skipped: Reason | null;
}

const LIMITS: readonly string[] = ["turn", "round", "shortRest", "longRest"];

export function readCommon(data: Readonly<Record<string, unknown>>, nodeId: string): ResultCommon {
  const common = asRecord(data.common);
  const limit = asString(common.limit, "none");
  return {
    optional: asBoolean(common.optional),
    choiceGroup: asString(common.choiceGroup).trim() || nodeId,
    cost: asRecord(common.cost),
    limit: LIMITS.includes(limit) ? limit as LimitPeriod : "none",
    then: asBoolean(common.then)
  };
}

function evaluateGuard(
  guard: CompiledGuard,
  facts: RollFacts,
  env: BlueprintEnv,
  cache: Map<string, boolean>,
  nodes: Record<string, NodeTrace>
): boolean {
  const cached = cache.get(guard.node.id);
  if (cached !== undefined) return cached;
  // Every check is evaluated (no short-circuit) so the trace can explain all of them.
  const checks = guard.checks.map(check => ({
    checkId: check.id, type: check.type, outcome: evaluateCheck(check.type, check.data, facts, env)
  }));
  let value = true;
  if (checks.length) {
    value = (guard.mode === "any") ? checks.some(check => check.outcome.pass) : checks.every(check => check.outcome.pass);
  }
  // "Only this item" is required on top of the checks, whatever the mode; the trace lists it first.
  if (guard.thisItem) {
    const outcome = evaluateCheck("thisItem", {}, facts, env);
    checks.unshift({ checkId: "thisItem", type: "thisItem", outcome });
    value = outcome.pass && value;
  }
  nodes[guard.node.id] = checks.length
    ? { status: value ? "passed" : "failed", checks }
    : { status: "passed", checks, reason: { code: "noChecks" } };
  cache.set(guard.node.id, value);
  return value;
}

/** Run one blueprint for a trigger: which results apply, and a trace of every node and wire. */
export function runBlueprint(
  blueprint: BlueprintSource | CompiledBlueprint,
  trigger: Trigger,
  facts: RollFacts,
  env: BlueprintEnv
): BlueprintRun {
  const compiled = ("paths" in blueprint) ? blueprint : compileBlueprint(blueprint);
  const { source } = compiled;
  const run: BlueprintRun = {
    blueprintId: source.id,
    intents: [],
    nodes: Object.fromEntries(source.nodes.map(node => [node.id, { status: "skipped" } as NodeTrace])),
    edges: [],
    skipped: null
  };
  if (!source.enabled) {
    run.skipped = { code: "disabled" };
    return run;
  }

  const reaches = new Map<string, CheckOutcome>();
  const guards = new Map<string, boolean>();
  const edges = new Set<string>();
  const applied = new Set<string>();
  const take = (edge: string | undefined) => {
    if (edge) edges.add(edge);
  };

  const paths = trigger.from ? compiled.continuationsOf(trigger.from) : compiled.pathsFor(trigger.event);
  if (trigger.from) run.nodes[trigger.from] = { status: "passed" };
  for (const path of paths) {
    if (!trigger.pins.includes(path.pin)) continue;
    if (!trigger.from) {
      if ((trigger.event === "signal") && (asString(path.event.data.name).trim() !== (trigger.signal ?? ""))) continue;
      let reach = reaches.get(path.event.id);
      if (!reach) {
        reach = env.reach(path.event);
        reaches.set(path.event.id, reach);
        run.nodes[path.event.id] = reach.pass ? { status: "passed" } : { status: "failed", reason: reach.reason };
      }
      if (!reach.pass) continue;
    }

    take(path.hops[0]);
    let open = true;
    for (const [index, guard] of path.guards.entries()) {
      if (evaluateGuard(guard, facts, env, guards, run.nodes) !== guard.expect) {
        open = false;
        break;
      }
      take(path.hops[index + 1]);
    }
    if (!open || applied.has(path.result.id)) continue;

    const common = readCommon(path.result.data, path.result.id);
    if ((common.limit !== "none") && !env.limitAvailable(source.id, path.result.id, common.limit)) {
      run.nodes[path.result.id] = { status: "failed", reason: { code: "limitUsed" } };
      continue;
    }
    applied.add(path.result.id);
    run.nodes[path.result.id] = { status: "passed" };
    run.intents.push({
      blueprintId: source.id,
      nodeId: path.result.id,
      type: path.result.type,
      data: path.result.data,
      common,
      eventNodeId: path.event.id
    });
  }

  run.edges = [...edges];
  return run;
}

/** A run whose continuations were followed as if every result applied (the Test tab). */
export interface ThroughRun extends BlueprintRun {
  /** Whether a continuation was followed from a player's choice, assumed chosen. */
  assumedChoice: boolean;
}

export interface ThroughOptions {
  maxDepth?: number;
  /** The outcome a demanded save is assumed to have (the Test tab asks); failure by default. */
  outcome?: "succeeded" | "failed";
}

/** The pin a result's continuation leaves from when followed in a test run, or null when it has none. */
function followedPin(intent: ResultIntent, outcome: PinId): PinId | null {
  if (getResult(intent.type)?.pins?.length) return outcome;
  return intent.common.then ? "then" : null;
}

/** Run a blueprint, then follow each result's continuation ("And then", a demanded save's outcome) as if it applied. */
export function runThrough(
  blueprint: BlueprintSource | CompiledBlueprint,
  trigger: Trigger,
  facts: RollFacts,
  env: BlueprintEnv,
  options: ThroughOptions = {}
): ThroughRun {
  const maxDepth = options.maxDepth ?? MAX_SIGNAL_DEPTH;
  const outcome = options.outcome ?? "failed";
  const compiled = ("paths" in blueprint) ? blueprint : compileBlueprint(blueprint);
  const run = runBlueprint(compiled, trigger, facts, env);
  const through: ThroughRun = { ...run, intents: [...run.intents], nodes: { ...run.nodes }, edges: [...run.edges], assumedChoice: false };
  let wave: readonly ResultIntent[] = run.intents;
  for (let depth = 0; wave.length && (depth < maxDepth); depth++) {
    const next: ResultIntent[] = [];
    for (const intent of wave) {
      const pin = followedPin(intent, outcome);
      const event = pin ? CONTINUATION_EVENT_BY_PIN[pin] : undefined;
      if (!pin || !event || !compiled.continuationsOf(intent.nodeId).length) continue;
      if (intent.common.optional) through.assumedChoice = true;
      const more = runBlueprint(compiled, { event, pins: [pin], from: intent.nodeId }, facts, env);
      for (const [id, trace] of Object.entries(more.nodes)) if (trace.status !== "skipped") through.nodes[id] = trace;
      for (const edge of more.edges) if (!through.edges.includes(edge)) through.edges.push(edge);
      through.intents.push(...more.intents);
      next.push(...more.intents);
    }
    wave = next;
  }
  return through;
}

/* -------------------------------------------------- */
/*   Signals                                          */
/* -------------------------------------------------- */

export const MAX_SIGNAL_DEPTH = 8;

/** One blueprint taking part in a roll, with where it lives (for signal scopes). */
export interface ChainEntry {
  compiled: CompiledBlueprint;
  env: BlueprintEnv;
  documentUuid: string;
  actorUuid: string | null;
}

/** A result produced in a chain, with the blueprint entry that produced it. */
export interface ChainIntent extends ResultIntent {
  entry: ChainEntry;
}

export interface ChainOptions {
  maxDepth?: number;
  /** Who hears the first trigger (all entries by default); signals still reach every entry. */
  starters?: readonly ChainEntry[];
}

export interface ChainResult {
  runs: BlueprintRun[];
  /** Every non-signal result to apply, in the order produced. */
  intents: ChainIntent[];
  signals: { name: string; depth: number }[];
  /** Signal results that were delivered, with the entry that sent them. */
  sent: ChainIntent[];
  /** True when a loop or the depth limit cut the chain short. */
  truncated: boolean;
}

/**
 * Run a trigger across blueprints and then deliver the signals they send, wave by wave. A sender
 * reaches blueprints on the same actor ("actor" scope) or on its own document ("document" scope).
 */
export function runWithSignals(
  entries: readonly ChainEntry[],
  trigger: Trigger,
  facts: RollFacts,
  options: ChainOptions = {}
): ChainResult {
  const maxDepth = options.maxDepth ?? MAX_SIGNAL_DEPTH;
  const result: ChainResult = { runs: [], intents: [], signals: [], sent: [], truncated: false };
  const sent = new Set<string>();
  let wave: { trigger: Trigger; receivers: readonly ChainEntry[] }[] = [{ trigger, receivers: options.starters ?? entries }];

  for (let depth = 0; wave.length; depth++) {
    const next: typeof wave = [];
    for (const step of wave) {
      for (const entry of step.receivers) {
        const run = runBlueprint(entry.compiled, step.trigger, facts, entry.env);
        const tookPart = (depth === 0) || Object.values(run.nodes).some(node => node.status !== "skipped");
        if (!tookPart) continue;
        result.runs.push(run);
        for (const intent of run.intents) {
          if (intent.type !== "signal") {
            result.intents.push({ ...intent, entry });
            continue;
          }
          const name = asString(intent.data.name).trim();
          if (!name) continue;
          const key = `${intent.blueprintId}:${intent.nodeId}:${name}`;
          if (sent.has(key) || (depth + 1 > maxDepth)) {
            result.truncated = true;
            continue;
          }
          sent.add(key);
          result.sent.push({ ...intent, entry });
          result.signals.push({ name, depth: depth + 1 });
          const byDocument = asString(intent.data.scope, "actor") === "document";
          next.push({
            trigger: { event: "signal", pins: ["out"], signal: name },
            receivers: entries.filter(other => byDocument
              ? (other.documentUuid === entry.documentUuid)
              : ((entry.actorUuid !== null) && (other.actorUuid === entry.actorUuid)))
          });
        }
      }
    }
    wave = next;
  }
  return result;
}
