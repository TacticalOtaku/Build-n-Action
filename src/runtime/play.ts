import type { BlueprintSource } from "../core/blueprint/types";
import {
  buildCounterLookups,
  substituteCounters,
  substituteDeep,
  type CounterStore,
} from "../core/counters/counters";
import {
  MAX_SIGNAL_DEPTH,
  runWithSignals,
  type ChainEntry,
  type ChainIntent,
  type ChainResult,
  type LimitPeriod,
} from "../core/engine/interpreter";
import type { RollFacts, RollMode } from "../core/facts/types";
import type { EventType, PinId } from "../core/registry/constants";
import { asRecord, asString } from "../core/registry/data";
import { mapFormulaFields } from "../core/registry/fields";
import { getResult } from "../core/registry/index";
import { sortIntents, type Choice, type SortedIntents } from "./choices";
import type { RollDetailsInput } from "./facts";
import { planCounter, planOperation, type Operation } from "./operations";
import type { SourceKind } from "./reach";
import { createRider, type Rider, type RiderClock } from "./riders";
import { resolvedAdvantageMode, type ProcessConfig } from "./roll-config";
import type { SaveOutcome, SaveRequest } from "./transport";

const MEMORY_LIMIT = 20;
const MEMORY_TTL_MS = 10 * 60_000;
const REGION_EVENTS = new Set(["regionEnter", "regionExit"]);

/* -------------------------------------------------- */
/*   Pure play helpers (limits, outcomes, triggers)   */
/* -------------------------------------------------- */

/** The moment a limited result is used or checked: combat position and rest counters. */
export interface UsageClock {
  /** Id of the started combat, or null outside combat. */
  combatId: string | null;
  round: number;
  turn: number;
  shortRests: number;
  longRests: number;
}

/** Whether a result limited to once per `limit` may apply again, given when it was last used. */
export function limitAvailable(record: UsageClock | null, now: UsageClock, limit: LimitPeriod): boolean {
  if (!record) return true;
  switch (limit) {
    case "turn":
      return (
        !now.combatId ||
        record.combatId !== now.combatId ||
        record.round !== now.round ||
        record.turn !== now.turn
      );
    case "round":
      return !now.combatId || record.combatId !== now.combatId || record.round !== now.round;
    case "shortRest":
      return now.shortRests > record.shortRests || now.longRests > record.longRests;
    case "longRest":
      return now.longRests > record.longRests;
  }
}

/** Key of a usage record in `flags.build-n-action.usage` (no dots, so Foundry keeps it flat). */
export function usageKey(blueprintId: string, nodeId: string): string {
  return `${blueprintId}_${nodeId}`;
}

export interface AttackResult {
  total: number | null;
  /** AC of the target, or null without a target (or behind total cover). */
  targetAc: number | null;
  isCritical: boolean;
  isFumble: boolean;
}

/** Pins of an attack against one target: a critical always hits, a fumble always misses. */
export function attackPins(result: AttackResult): PinId[] {
  if (result.isFumble) return ["miss", "fumble"];
  if (result.isCritical) return ["hit", "crit"];
  if (result.total === null || result.targetAc === null) return [];
  return result.total >= result.targetAc ? ["hit"] : ["miss"];
}

/** Pins when Midi QOL has decided whether the attack hit this target. */
export function midiAttackPins(hit: boolean, isCritical: boolean, isFumble: boolean): PinId[] {
  const pins: PinId[] = [hit ? "hit" : "miss"];
  if (hit && isCritical) pins.push("crit");
  if (isFumble) pins.push("fumble");
  return pins;
}

export function savePins(success: boolean): PinId[] {
  return [success ? "succeeded" : "failed"];
}

/** `dealt` for positive damage; `dropped` as well when the target ends at 0 HP. */
export function damagePins(hpDamage: number, newHp: number | null): PinId[] {
  if (!(hpDamage > 0)) return [];
  return newHp !== null && newHp <= 0 ? ["dealt", "dropped"] : ["dealt"];
}

/** `success` or `failure` for a check with a DC; nothing when the DC is unknown. */
export function checkPins(total: number | null, dc: number | null): PinId[] {
  if (total === null || dc === null) return [];
  return [total >= dc ? "success" : "failure"];
}

export function outcomePin(success: boolean): "succeeded" | "failed" {
  return success ? "succeeded" : "failed";
}

/** Combat#previous and Combat#current as Foundry reports them. */
export interface TurnState {
  round: number | null;
  turn: number | null;
  combatantId: string | null;
}

export interface TurnTransition {
  event: "turnStart" | "turnEnd";
  combatantId: string;
  round: number;
  turn: number;
}

function forwardTurn(previous: TurnState, current: TurnState): boolean {
  const [roundBefore, turnBefore] = [previous.round ?? 0, previous.turn ?? -1] as const;
  const [roundAfter, turnAfter] = [current.round ?? 0, current.turn ?? -1] as const;
  return roundAfter > roundBefore || (roundAfter === roundBefore && turnAfter > turnBefore);
}

/**
 * The turn events of one combatTurnChange: the previous turn ends and the current one starts, only when combat
 * moved forward. Turns skipped on the way do not fire; going back fires nothing.
 */
export function turnTransitions(previous: TurnState | null, current: TurnState | null): TurnTransition[] {
  if (!current || !forwardTurn(previous ?? { round: 0, turn: null, combatantId: null }, current)) return [];
  const transitions: TurnTransition[] = [];
  if (previous?.combatantId && (previous.round ?? 0) > 0) {
    transitions.push({
      event: "turnEnd",
      combatantId: previous.combatantId,
      round: previous.round ?? 0,
      turn: previous.turn ?? 0,
    });
  }
  if (current.combatantId && (current.round ?? 0) > 0) {
    transitions.push({
      event: "turnStart",
      combatantId: current.combatantId,
      round: current.round ?? 0,
      turn: current.turn ?? 0,
    });
  }
  return transitions;
}

/** The event for a dnd5e rest type ("short" or "long"). */
export function restEvent(type: unknown): "shortRest" | "longRest" | null {
  if (type === "short") return "shortRest";
  if (type === "long") return "longRest";
  return null;
}

/** A gate that lets each key through once while it is remembered (`ttlMs`). */
export function createOnce(ttlMs: number): (key: string, now?: number) => boolean {
  const seen = new Map<string, number>();
  return (key, now = Date.now()) => {
    for (const [known, at] of seen) if (now - at > ttlMs) seen.delete(known);
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  };
}

/** Whether a region's blueprints need the module's region behavior to hear tokens entering or leaving. */
export function needsRegionBehavior(blueprints: readonly BlueprintSource[]): boolean {
  return blueprints.some((blueprint) =>
    blueprint.nodes.some((node) => node.kind === "event" && REGION_EVENTS.has(node.type)),
  );
}

/**
 * Applied results whose "And then" output leads somewhere, each with the key that lets its continuation
 * run exactly once: the run (activation or evaluation), the target, the blueprint and the node.
 */
export function continuationStarts(
  intents: readonly ChainIntent[],
  run: string,
  target: string | null,
): { intent: ChainIntent; key: string }[] {
  return intents
    .filter((intent) => intent.common.then && intent.entry.compiled.continuationsOf(intent.nodeId).length > 0)
    .map((intent) => ({ intent, key: `${run}|${target ?? "-"}|${intent.blueprintId}|${intent.nodeId}` }));
}

/** Whether applying this result starts more of the chain later: its "And then", or the save it demands. */
export function startsLater(intent: ChainIntent): boolean {
  return intent.common.then || intent.type === "demandSave";
}

/** One demanded save per run, blueprint, node and saver. */
export function saveKey(run: string, blueprintId: string, nodeId: string, actorUuid: string): string {
  return `${run}|${blueprintId}|${nodeId}|${actorUuid}`;
}

/** The DC formula of a demand-save result: its own, or the blueprint owner's spell DC. */
export function saveDcFormula(data: Readonly<Record<string, unknown>>): string {
  if (asString(data.dcMode) === "spell") return "@attributes.spell.dc";
  return asString(data.dc).trim() || "10";
}

/* -------------------------------------------------- */
/*   Play coordinator                                 */
/* -------------------------------------------------- */

/** Who is rolling what. */
export interface PlayRoller<TActor, TItem, TToken> {
  actor: TActor;
  item: TItem | null;
  activity: unknown;
  token: TToken | null;
  target: TToken | null;
  details: RollDetailsInput;
  /** The activity's, item's or actor's roll data with @target, for comparisons and totals. */
  rollData: Record<string, unknown>;
}

/** Where one blueprint taking part in the roll came from. */
export interface PlaySourceInfo<TActor, TDocument, TItem> {
  document: TDocument;
  kind: SourceKind;
  blueprint: BlueprintSource;
  owner: TActor | null;
  origin: TDocument | null;
  carrierItem: TItem | null;
  /** Set when the blueprint is a rider stored on the roller. */
  rider?: Rider;
}

/** What public hooks receive about an evaluation. */
export interface EvaluationContext<TActor, TItem> {
  event: EventType;
  actor: TActor;
  item: TItem | null;
  activity: unknown;
  target: TActor | null;
  facts: RollFacts;
}

export interface Evaluation<TActor, TDocument, TItem> {
  id: string;
  collected: { entries: ChainEntry[]; sources: Map<ChainEntry, PlaySourceInfo<TActor, TDocument, TItem>> };
  chain: ChainResult;
  facts: RollFacts;
  context: EvaluationContext<TActor, TItem>;
}

export interface PlayApplyContext<TActor, TDocument, TItem, TToken> {
  event: EventType;
  roller: PlayRoller<TActor, TItem, TToken>;
  sources: ReadonlyMap<ChainEntry, PlaySourceInfo<TActor, TDocument, TItem>>;
}

/** Dice modifiers keep applying to later parts until a "first die only" modifier has been used. */
export interface ModifierTracker {
  active: ChainIntent[];
  halted: Set<string>;
}

/** Stable key identifying a reminder intent within one pending roll. */
export function reminderKey(intent: Pick<ChainIntent, "blueprintId" | "nodeId">): string {
  return `${intent.blueprintId}|${intent.nodeId}`;
}

/** Combat passed to `onCombatStart`. */
export interface CombatStartInput<TActor, TToken> {
  id: string;
  combatants: readonly { id: string; actor: TActor | null; token: TToken | null }[];
}

/** Choices and reminders waiting for the roll dialog. */
export interface PendingRoll<TActor, TDocument, TItem, TToken> {
  ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>;
  sorted: SortedIntents;
  tracker: ModifierTracker;
  /** Keys of choices already applied (a dialog re-render must not offer them twice). */
  applied: Set<string>;
  /** Keys of reminders actually rendered into the roll dialog (`reminderKey(intent)`). */
  shownReminders: Set<string>;
  /** Choices the player applied, whose "And then" continues once the roll goes ahead. */
  chosen: ChainIntent[];
  /** The evaluation the choices came from, for the public applyResult hook. */
  context: EvaluationContext<TActor, TItem>;
}

/** One application of results, from which their "And then" outputs continue. */
export interface AppliedResults<TActor, TDocument, TItem, TToken> {
  intents: readonly ChainIntent[];
  ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>;
  context: EvaluationContext<TActor, TItem>;
  activation: string | null;
  /** The activation, else the evaluation id: with the target, blueprint and node it keys "exactly once". */
  run: string;
}

interface AfterRoll<TActor, TDocument, TItem, TToken> {
  applied: Omit<AppliedResults<TActor, TDocument, TItem, TToken>, "intents">;
  intents: ChainIntent[];
  immediate: ChainIntent[];
  reminders: ChainIntent[];
  riders: string[];
  pending: PendingRoll<TActor, TDocument, TItem, TToken> | null;
}

/** What the engine decided for a recent roll; read through api.debug.recentRolls(). */
export interface RollRecord {
  event: EventType;
  time: number;
  ms: number;
  actor: string;
  facts: RollFacts;
  runs: ChainResult["runs"];
  intents: { blueprintId: string; nodeId: string; type: string; optional: boolean; document: string }[];
  signals: ChainResult["signals"];
  truncated: boolean;
}

export interface ReactionInput<TActor, TItem, TToken> {
  event: EventType;
  pins: readonly PinId[];
  actor: TActor;
  item: TItem | null;
  activity: unknown;
  target: TToken | null;
  activation: string | null;
  details?: RollDetailsInput;
  /** Optional 10-minute deduplication key for hook outcomes that may fire twice. */
  dedupeKey?: string;
}

export interface TriggerInput<TActor, TDocument, TToken> {
  event: EventType;
  actor: TActor;
  token: TToken | null;
  /** Region events: only this region's blueprints take part. */
  only?: TDocument;
  /** Fires once per key (see Global Constraints). */
  key: string;
}

export interface TurnCombatInput<TActor, TToken> {
  id: string;
  previous: TurnState | null;
  current: TurnState | null;
  combatant(id: string): { actor: TActor; token: TToken | null } | null;
}

export interface ReactionApplyOptions {
  /** Origin roll data (with @scaling) of a paid choice. */
  data?: Record<string, unknown>;
  scale?: number;
  costFormula?: string;
}

export interface PlayAdapter<TActor, TDocument, TItem, TToken, TConfig> {
  now(): number;
  elapsedMs(): number;
  randomId(): string;
  isActiveGM(): boolean;
  warn(message: string, ...args: unknown[]): void;
  documentUuid(doc: TActor | TDocument | TItem): string;
  documentName(doc: TActor | TDocument): string;
  tokenDocumentUuid(token: TToken): string;
  tokenActor(token: TToken): TActor | null;
  actorToken(actor: TActor): TToken | null;
  makeRoller(
    actor: TActor,
    item: TItem | null,
    activity: unknown,
    target: TToken | null,
    details: RollDetailsInput,
    deterministic?: boolean,
  ): PlayRoller<TActor, TItem, TToken>;
  collect(
    roller: PlayRoller<TActor, TItem, TToken>,
    event: EventType,
    activation: string | null,
    options?: { only?: TDocument },
  ): { entries: ChainEntry[]; sources: Map<ChainEntry, PlaySourceInfo<TActor, TDocument, TItem>> };
  buildFacts(event: EventType, roller: PlayRoller<TActor, TItem, TToken>): RollFacts;
  counterStore(actor: TActor | null | undefined): CounterStore;
  callPreEvaluate(event: EventType, context: EvaluationContext<TActor, TItem>): boolean;
  callEvaluate(
    event: EventType,
    context: EvaluationContext<TActor, TItem>,
    intents: readonly ChainIntent[],
  ): void;
  callPreApplyResult(intent: ChainIntent, context: EvaluationContext<TActor, TItem>): boolean;
  callApplyResult(intent: ChainIntent, context: EvaluationContext<TActor, TItem>): void;
  recordUsage(actor: TActor, blueprintId: string, nodeId: string): Promise<void>;
  originRollData(document: TDocument): Record<string, unknown>;
  targetRollData(actor: TActor): Record<string, unknown>;
  resolveFormula(formula: string, data: Record<string, unknown>): string;
  simplifyFormula(formula: string, data: Record<string, unknown>): number | null;
  scaleFormula(formula: string, scaleFormula: string, data: Record<string, unknown>, scale: number): string;
  injectTargetData(config: TConfig, targetData: Record<string, unknown>): void;
  applyRollIntents(
    config: TConfig,
    intents: readonly ChainIntent[],
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
    tracker: ModifierTracker,
  ): void;
  applySaveDC(
    activity: unknown,
    intents: readonly ChainIntent[],
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
  ): void;
  setupRollDialog(dialog: unknown, pendingId: string, hasChoices: boolean): void;
  syncRollDialog?(dialog: unknown, config: TConfig): void;
  useRiders(actor: TActor, ids: readonly string[]): Promise<void>;
  riderClock(actor: TActor): RiderClock;
  performOperations(operations: readonly Operation[]): Promise<boolean>;
  whisperReminders(
    reminders: readonly ChainIntent[],
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
  ): Promise<void>;
  saversFor(
    intent: ChainIntent,
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
    data: Record<string, unknown>,
  ): TToken[];
  requestSave(request: SaveRequest): Promise<SaveOutcome | null>;
  resetCounters(actor: TActor, event: "shortRest" | "longRest" | "turnStart"): Promise<void>;
  sendTrigger(event: EventType, actorUuid: string, key: string): void;
  choiceData(
    info: PlaySourceInfo<TActor, TDocument, TItem>,
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
    scale: number,
  ): Record<string, unknown>;
  promptChoices(
    choices: readonly Choice[],
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
    apply: (choice: Choice, info: PlaySourceInfo<TActor, TDocument, TItem>, scale: number) => Promise<void>,
  ): Promise<void>;
}

/**
 * Unified roll, reaction, trigger, and continuation runtime coordinated behind `PlayAdapter`.
 */
export function createPlay<TActor, TDocument, TItem, TToken, TConfig>(
  adapter: PlayAdapter<TActor, TDocument, TItem, TToken, TConfig>,
) {
  const warnedHooks = new Set<string>();
  const pending = new Map<string, PendingRoll<TActor, TDocument, TItem, TToken>>();
  const afterRolls = new WeakMap<object, AfterRoll<TActor, TDocument, TItem, TToken>>();
  const attackConfigs = new WeakMap<object, string>();
  const attackModes = new Map<string, { mode: RollMode; at: number }>();
  const records: RollRecord[] = [];
  const activations = new Map<string, string>();
  const continued = createOnce(MEMORY_TTL_MS);
  const demanded = createOnce(MEMORY_TTL_MS);
  const triggered = createOnce(MEMORY_TTL_MS);
  const reacted = createOnce(MEMORY_TTL_MS);

  function rememberAttackMode(activation: string | null, mode: RollMode | null | undefined): void {
    if (!activation || !mode) return;
    const now = adapter.now();
    for (const [key, entry] of attackModes) if (now - entry.at > MEMORY_TTL_MS) attackModes.delete(key);
    attackModes.delete(activation);
    attackModes.set(activation, { mode, at: now });
    while (attackModes.size > MEMORY_LIMIT) {
      const oldest = attackModes.keys().next().value;
      if (oldest === undefined) break;
      attackModes.delete(oldest);
    }
  }

  function attackModeFor(activation: string | null): RollMode | null {
    if (!activation) return null;
    const entry = attackModes.get(activation);
    if (!entry) return null;
    if (adapter.now() - entry.at > MEMORY_TTL_MS) {
      attackModes.delete(activation);
      return null;
    }
    return entry.mode;
  }

  function warnOnce(name: string, error: unknown): void {
    if (warnedHooks.has(name)) return;
    warnedHooks.add(name);
    adapter.warn(`the ${name} hook failed; the game continues without blueprints.`, error);
  }

  function guarded(name: string, run: () => void): void {
    try {
      run();
    } catch (error) {
      warnOnce(name, error);
    }
  }

  async function guardedAsync(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      warnOnce(name, error);
    }
  }

  function resolveCounterIntents(
    intents: readonly ChainIntent[],
    sources: ReadonlyMap<ChainEntry, PlaySourceInfo<TActor, TDocument, TItem>>,
    roller: PlayRoller<TActor, TItem, TToken>,
  ): ChainIntent[] {
    const targetActor = roller.target ? adapter.tokenActor(roller.target) : null;
    const theirs = targetActor ? adapter.counterStore(targetActor) : null;
    return intents.map((intent) => {
      const info = sources.get(intent.entry);
      if (!info || !JSON.stringify([intent.data, intent.common]).includes("counters.")) return intent;
      const mine = adapter.counterStore(info.owner ?? roller.actor);
      const lookups = buildCounterLookups(mine, theirs, info.blueprint);
      const replace = (text: string) => substituteCounters(text, lookups.self, lookups.target);
      return {
        ...intent,
        data: substituteDeep(intent.data, replace),
        common: substituteDeep(intent.common, replace),
      };
    });
  }

  function rememberRoll(
    event: EventType,
    actor: string,
    facts: RollFacts,
    chain: ChainResult,
    ms: number,
  ): void {
    records.unshift({
      event,
      time: adapter.now(),
      ms,
      actor,
      facts,
      runs: chain.runs,
      intents: chain.intents.map((intent) => ({
        blueprintId: intent.blueprintId,
        nodeId: intent.nodeId,
        type: intent.type,
        optional: intent.common.optional,
        document: intent.entry.documentUuid,
      })),
      signals: chain.signals,
      truncated: chain.truncated,
    });
    records.length = Math.min(records.length, MEMORY_LIMIT);
  }

  function evaluateEvent(
    event: EventType,
    roller: PlayRoller<TActor, TItem, TToken>,
    pins: readonly PinId[] = ["out"],
    activation: string | null = null,
    options: { only?: TDocument } = {},
  ): Evaluation<TActor, TDocument, TItem> | null {
    const started = adapter.elapsedMs();
    const collected = adapter.collect(roller, event, activation, options);
    if (!collected.entries.length) return null;
    const facts = adapter.buildFacts(event, roller);
    const context: EvaluationContext<TActor, TItem> = {
      event,
      actor: roller.actor,
      item: roller.item,
      activity: roller.activity,
      target: roller.target ? adapter.tokenActor(roller.target) : null,
      facts,
    };
    if (!adapter.callPreEvaluate(event, context)) return null;
    const chain = runWithSignals(collected.entries, { event, pins }, facts);
    chain.intents = resolveCounterIntents(chain.intents, collected.sources, roller);
    adapter.callEvaluate(event, context, chain.intents);
    rememberRoll(event, adapter.documentUuid(roller.actor), facts, chain, adapter.elapsedMs() - started);
    return { id: adapter.randomId(), collected, chain, facts, context };
  }

  function allowIntents(
    intents: readonly ChainIntent[],
    context: EvaluationContext<TActor, TItem>,
  ): ChainIntent[] {
    return intents.filter((intent) => adapter.callPreApplyResult(intent, context));
  }

  function announceApplied(intents: readonly ChainIntent[], context: EvaluationContext<TActor, TItem>): void {
    for (const intent of intents) adapter.callApplyResult(intent, context);
  }

  function recordUsages(intents: readonly ChainIntent[], actor: TActor): void {
    for (const intent of intents) {
      if (intent.common.limit === "none") continue;
      adapter
        .recordUsage(actor, intent.blueprintId, intent.nodeId)
        .catch((error) => adapter.warn("could not record a limited use", error));
    }
  }

  function registerPending(roll: PendingRoll<TActor, TDocument, TItem, TToken>): string {
    const id = adapter.randomId();
    pending.set(id, roll);
    while (pending.size > MEMORY_LIMIT) {
      const oldest = pending.keys().next().value;
      if (oldest === undefined) break;
      pending.delete(oldest);
    }
    return id;
  }

  function riderData(
    intent: ChainIntent,
    data: Record<string, unknown>,
    options: ReactionApplyOptions,
  ): Record<string, unknown> {
    const effect = asRecord(intent.data.effect);
    const type = asString(effect.type);
    const resolved = mapFormulaFields(getResult(type)?.fields ?? [], asRecord(effect.data), (value) =>
      adapter.resolveFormula(value, data),
    );
    if (type === "rollBonus" && options.scale) {
      resolved.formula = adapter.scaleFormula(
        asString(asRecord(effect.data).formula),
        options.costFormula ?? "",
        data,
        options.scale,
      );
    }
    return { ...intent.data, effect: { type, data: resolved } };
  }

  async function applyReactionIntents(
    intents: readonly ChainIntent[],
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
    activation: string | null,
    options: ReactionApplyOptions = {},
  ): Promise<ChainIntent[]> {
    const operations: Operation[] = [];
    const applied: ChainIntent[] = [];
    const self = ctx.roller.actor;
    const target = ctx.roller.target ? adapter.tokenActor(ctx.roller.target) : null;

    for (const intent of intents) {
      const info = ctx.sources.get(intent.entry);
      if (!info) continue;
      const data = options.data ?? adapter.originRollData(info.document);
      const origin = adapter.documentUuid(info.origin ?? info.document);

      // A demanded save has no immediate operation; runContinuations rolls it after apply.
      if (intent.type === "demandSave") {
        applied.push(intent);
        continue;
      }

      if (intent.type === "counter") {
        const toTarget = asString(intent.data.who, "self") === "target";
        const me = info.owner ?? self;
        const amountFormula = asString(intent.data.amount).trim() || "1";
        const op = planCounter(
          intent.data,
          {
            self: adapter.documentUuid(me),
            target: target ? adapter.documentUuid(target) : null,
            blueprint: info.blueprint,
            amount: adapter.simplifyFormula(adapter.resolveFormula(amountFormula, data), data) ?? 0,
          },
          adapter.counterStore(toTarget ? target : me),
        );
        if (op) {
          operations.push(op);
          applied.push(intent);
        }
        continue;
      }

      if (intent.type === "rider") {
        // A same-activation rider needs an activation to match later; bare rolls have none.
        if (asString(intent.data.scope) !== "nextRoll" && !activation) continue;
        const toTarget =
          asString(intent.data.scope) === "nextRoll" && asString(intent.data.who, "self") === "target";
        const recipient = toTarget ? target : self;
        if (!recipient) continue;
        const rider = createRider(riderData(intent, data, options), {
          id: adapter.randomId(),
          activation,
          clock: adapter.riderClock(recipient),
          source: {
            name: info.blueprint.name,
            origin,
            blueprintId: intent.blueprintId,
            nodeId: intent.nodeId,
          },
        });
        if (rider) {
          operations.push({ kind: "rider", actor: adapter.documentUuid(recipient), rider });
          applied.push(intent);
        }
        continue;
      }

      const amountFormula = asString(intent.data.amount).trim() || "1";
      const amount =
        intent.type === "resource"
          ? (adapter.simplifyFormula(adapter.resolveFormula(amountFormula, data), data) ?? 0)
          : 0;
      const op = planOperation(intent.type, intent.data, {
        self: adapter.documentUuid(self),
        target: target ? adapter.documentUuid(target) : null,
        carrierItem: info.carrierItem ? adapter.documentUuid(info.carrierItem) : null,
        origin,
        amount,
      });
      if (op) {
        operations.push(op);
        applied.push(intent);
      }
    }

    if (!operations.length) return applied;
    // A change that failed or found no GM to make it must not continue the chain.
    return (await adapter.performOperations(operations))
      ? applied
      : applied.filter((intent) => intent.type === "demandSave");
  }

  /** Shared execution for non-dialog branches: resolve counters, filter, apply all, whisper, announce, record, recurse. */
  async function applyBranch(
    intents: readonly ChainIntent[],
    sent: readonly ChainIntent[],
    ctx: PlayApplyContext<TActor, TDocument, TItem, TToken>,
    context: EvaluationContext<TActor, TItem>,
    activation: string | null,
    run: string,
    depth: number,
    resolveCounters = true,
  ): Promise<void> {
    const resolved = resolveCounters ? resolveCounterIntents(intents, ctx.sources, ctx.roller) : intents;
    const sorted = sortIntents(allowIntents(resolved, context));
    // Non-dialog branches apply optional results as they are without a cost (enforced by lint).
    const toApply = [...sorted.immediate, ...sorted.choices.flatMap((choice) => choice.intents)];
    const done = await applyReactionIntents(toApply, ctx, activation);
    await adapter.whisperReminders(sorted.reminders, ctx);
    announceApplied([...done, ...sorted.reminders], context);
    recordUsages(done, ctx.roller.actor);
    await runContinuations(
      { intents: [...done, ...sorted.reminders, ...sent], ctx, context, activation, run },
      depth,
    );
  }

  async function runDemandedSave(
    intent: ChainIntent,
    applied: AppliedResults<TActor, TDocument, TItem, TToken>,
    depth: number,
  ): Promise<void> {
    const { ctx, context } = applied;
    const info = ctx.sources.get(intent.entry);
    if (!info) return;
    const data = adapter.originRollData(info.document);
    const dc = adapter.simplifyFormula(adapter.resolveFormula(saveDcFormula(intent.data), data), data);
    if (dc === null) return;
    const entries = [...ctx.sources.keys()];
    await Promise.all(
      adapter.saversFor(intent, ctx, data).map(async (saver) => {
        const actor = adapter.tokenActor(saver);
        const actorUuid = actor ? adapter.documentUuid(actor) : "";
        if (
          !actor ||
          !demanded(saveKey(applied.run, intent.blueprintId, intent.nodeId, actorUuid), adapter.now())
        )
          return;
        const outcome = await adapter.requestSave({
          actorUuid,
          ability: asString(intent.data.ability, "con"),
          dc,
          advantage: asString(intent.data.advantage, "normal") as SaveRequest["advantage"],
          source: info.blueprint.name,
          owner: adapter.documentName(info.owner ?? ctx.roller.actor),
        });
        if (!outcome || !intent.entry.compiled.continuationsOf(intent.nodeId).length) return;
        const roller = { ...ctx.roller, target: saver };
        const facts = adapter.buildFacts(context.event, roller);
        const saveCtx: PlayApplyContext<TActor, TDocument, TItem, TToken> = { ...ctx, roller };
        const saveContext: EvaluationContext<TActor, TItem> = { ...context, target: actor, facts };
        const pin = outcomePin(outcome.success);
        const chain = runWithSignals(
          entries,
          { event: "demandedSave", pins: [pin], from: intent.nodeId },
          facts,
          { starters: [intent.entry] },
        );
        await applyBranch(
          chain.intents,
          chain.sent,
          saveCtx,
          saveContext,
          applied.activation,
          applied.run,
          depth + 1,
        );
      }),
    );
  }

  async function runContinuations(
    applied: AppliedResults<TActor, TDocument, TItem, TToken>,
    depth = 0,
  ): Promise<void> {
    if (depth >= MAX_SIGNAL_DEPTH) return;
    const { ctx, context, activation } = applied;
    const entries = [...ctx.sources.keys()];
    for (const intent of applied.intents) {
      if (intent.type === "demandSave")
        void guardedAsync("demanded save", () => runDemandedSave(intent, applied, depth));
    }
    const targetUuid = ctx.roller.target ? adapter.tokenDocumentUuid(ctx.roller.target) : null;
    for (const { intent, key } of continuationStarts(applied.intents, applied.run, targetUuid)) {
      if (!continued(key, adapter.now())) continue;
      const chain = runWithSignals(
        entries,
        { event: "afterResult", pins: ["then"], from: intent.nodeId },
        context.facts,
        { starters: [intent.entry] },
      );
      await applyBranch(chain.intents, chain.sent, ctx, context, activation, applied.run, depth + 1);
    }
  }

  async function runTrigger(input: TriggerInput<TActor, TDocument, TToken>): Promise<void> {
    if (!adapter.isActiveGM() || !triggered(input.key, adapter.now())) return;
    if (input.event === "shortRest" || input.event === "longRest" || input.event === "turnStart") {
      await adapter.resetCounters(input.actor, input.event);
    }
    const roller = {
      ...adapter.makeRoller(input.actor, null, null, null, {}),
      token: input.token ?? adapter.actorToken(input.actor),
    };
    const evaluation = evaluateEvent(
      input.event,
      roller,
      ["out"],
      null,
      input.only ? { only: input.only } : {},
    );
    if (!evaluation?.chain.intents.length) return;
    const ctx: PlayApplyContext<TActor, TDocument, TItem, TToken> = {
      event: input.event,
      roller,
      sources: evaluation.collected.sources,
    };
    await applyBranch(
      evaluation.chain.intents,
      evaluation.chain.sent,
      ctx,
      evaluation.context,
      null,
      evaluation.id,
      0,
      false,
    );
  }

  return {
    guarded,
    guardedAsync,
    pendingRoll: (id: unknown) => (typeof id === "string" ? (pending.get(id) ?? null) : null),
    recentRolls: (): readonly RollRecord[] => records,
    announceApplied,
    runContinuations,
    runTrigger,

    rememberActivation(activityUuid: string, activation: string | null): void {
      if (!activityUuid) return;
      if (activation) activations.set(activityUuid, activation);
      else activations.delete(activityUuid);
    },

    activationFor(activityUuid: string): string | null {
      return activations.get(activityUuid) ?? null;
    },

    rememberAttackMode,
    attackModeFor,

    preRoll(
      event: EventType,
      config: TConfig,
      dialog: unknown,
      roller: PlayRoller<TActor, TItem, TToken>,
      activation: string | null,
    ): void {
      if (event === "attackRoll" && config && typeof config === "object" && activation) {
        attackConfigs.set(config, activation);
      }
      const activeRoller =
        event === "damageRoll" && roller.details.rollMode === undefined && activation
          ? { ...roller, details: { ...roller.details, rollMode: attackModeFor(activation) } }
          : roller;
      const evaluation = evaluateEvent(event, activeRoller, ["out"], activation);
      if (!evaluation || (!evaluation.chain.intents.length && !evaluation.chain.sent.length)) return;
      const targetActor = activeRoller.target ? adapter.tokenActor(activeRoller.target) : null;
      if (targetActor) adapter.injectTargetData(config, adapter.targetRollData(targetActor));
      const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
      const ctx: PlayApplyContext<TActor, TDocument, TItem, TToken> = {
        event,
        roller: activeRoller,
        sources: evaluation.collected.sources,
      };
      const tracker: ModifierTracker = { active: [], halted: new Set() };
      adapter.applyRollIntents(config, sorted.immediate, ctx, tracker);
      if (
        sorted.immediate.some((intent) => intent.type === "rollAdvantage") &&
        dialog &&
        typeof dialog === "object"
      ) {
        adapter.syncRollDialog?.(dialog, config);
      }
      const riders = [
        ...new Set(sorted.immediate.flatMap((intent) => ctx.sources.get(intent.entry)?.rider?.id ?? [])),
      ];

      let held: PendingRoll<TActor, TDocument, TItem, TToken> | null = null;
      if ((sorted.choices.length || sorted.reminders.length) && dialog && typeof dialog === "object") {
        held = {
          ctx,
          sorted,
          tracker,
          applied: new Set(),
          shownReminders: new Set(),
          chosen: [],
          context: evaluation.context,
        };
        adapter.setupRollDialog(dialog, registerPending(held), sorted.choices.length > 0);
      }
      if (config && typeof config === "object") {
        afterRolls.set(config, {
          applied: { ctx, context: evaluation.context, activation, run: activation ?? evaluation.id },
          intents: [...sorted.immediate, ...sorted.reminders, ...evaluation.chain.sent],
          immediate: sorted.immediate,
          reminders: sorted.reminders,
          riders,
          pending: held,
        });
      } else if (sorted.reminders.length && !held) {
        void adapter.whisperReminders(sorted.reminders, ctx);
      }
    },

    postRoll(hasRolls: boolean, config: unknown, rollMode?: RollMode | null): void {
      if (!config || typeof config !== "object") return;
      const attackActivation = attackConfigs.get(config) ?? null;
      attackConfigs.delete(config);
      if (hasRolls && attackActivation) {
        rememberAttackMode(attackActivation, rollMode ?? resolvedAdvantageMode(config as ProcessConfig));
      }
      const after = afterRolls.get(config) ?? null;
      afterRolls.delete(config);
      if (!after || !hasRolls) return;
      const actor = after.applied.ctx.roller.actor;
      const shown = after.pending?.shownReminders;
      const unshown = (after.pending?.sorted.reminders ?? after.reminders).filter(
        (reminder) => !shown?.has(reminderKey(reminder)),
      );
      if (unshown.length) void adapter.whisperReminders(unshown, after.applied.ctx);
      announceApplied(after.immediate, after.applied.context);
      recordUsages(after.immediate, actor);
      if (after.riders.length)
        adapter
          .useRiders(actor, after.riders)
          .catch((error) => adapter.warn("could not use up riders", error));
      const intents = [...after.intents, ...(after.pending?.chosen ?? [])];
      if (!intents.some(startsLater)) return;
      void guardedAsync("continuation", () => runContinuations({ ...after.applied, intents }));
    },

    applySaveDC(activity: unknown, roller: PlayRoller<TActor, TItem, TToken>): void {
      const evaluation = evaluateEvent("saveDC", roller);
      const intents = evaluation ? allowIntents(evaluation.chain.intents, evaluation.context) : [];
      const ctx: PlayApplyContext<TActor, TDocument, TItem, TToken> = {
        event: "saveDC",
        roller,
        sources: evaluation?.collected.sources ?? new Map(),
      };
      adapter.applySaveDC(activity, intents, ctx);
      if (!evaluation) return;
      announceApplied(intents, evaluation.context);
      recordUsages(intents, roller.actor);
      void guardedAsync("continuation", () =>
        runContinuations({
          intents: [...intents, ...evaluation.chain.sent],
          ctx,
          context: evaluation.context,
          activation: null,
          run: evaluation.id,
        }),
      );
    },

    async runReaction(input: ReactionInput<TActor, TItem, TToken>): Promise<void> {
      if (!input.pins.length) return;
      if (input.dedupeKey && !reacted(input.dedupeKey, adapter.now())) return;
      if (input.event === "afterAttack" && input.activation && input.details?.rollMode) {
        rememberAttackMode(input.activation, input.details.rollMode);
      }
      const details =
        input.event === "afterDamage" && input.details?.rollMode === undefined && input.activation
          ? { ...(input.details ?? {}), rollMode: attackModeFor(input.activation) }
          : { ...(input.details ?? {}) };
      const roller = adapter.makeRoller(input.actor, input.item, input.activity, input.target, details);
      const evaluation = evaluateEvent(input.event, roller, input.pins, input.activation);
      if (!evaluation?.chain.intents.length) return;
      const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
      const ctx: PlayApplyContext<TActor, TDocument, TItem, TToken> = {
        event: input.event,
        roller,
        sources: evaluation.collected.sources,
      };
      const run = input.activation ?? evaluation.id;
      const done = await applyReactionIntents(sorted.immediate, ctx, input.activation);
      announceApplied(done, evaluation.context);
      recordUsages(done, roller.actor);
      await runContinuations({
        intents: [...done, ...evaluation.chain.sent],
        ctx,
        context: evaluation.context,
        activation: input.activation,
        run,
      });
      if (!sorted.choices.length) return;
      await adapter.promptChoices(sorted.choices, ctx, async (choice, info, scale) => {
        const appliedChoice = await applyReactionIntents(choice.intents, ctx, input.activation, {
          data: adapter.choiceData(info, ctx, scale),
          scale,
          costFormula: choice.cost.formula,
        });
        announceApplied(appliedChoice, evaluation.context);
        await runContinuations({
          intents: appliedChoice,
          ctx,
          context: evaluation.context,
          activation: input.activation,
          run,
        });
      });
    },

    requestTrigger(event: EventType, actor: TActor, key: string): void {
      if (adapter.isActiveGM()) {
        void guardedAsync("trigger", () => runTrigger({ event, actor, token: null, key }));
        return;
      }
      adapter.sendTrigger(event, adapter.documentUuid(actor), key);
    },

    async onTurnChange(combat: TurnCombatInput<TActor, TToken>): Promise<void> {
      if (!adapter.isActiveGM()) return;
      for (const transition of turnTransitions(combat.previous, combat.current)) {
        const entry = combat.combatant(transition.combatantId);
        if (!entry) continue;
        await runTrigger({
          event: transition.event,
          actor: entry.actor,
          token: entry.token,
          key: `${combat.id}|${transition.event}|${transition.round}|${transition.turn}|${transition.combatantId}`,
        });
      }
    },

    async onCombatStart(combat: CombatStartInput<TActor, TToken>): Promise<void> {
      if (!adapter.isActiveGM()) return;
      const seen = new Set<string>();
      for (const entry of combat.combatants) {
        if (!entry.actor) continue;
        const uuid = adapter.documentUuid(entry.actor);
        if (uuid) {
          if (seen.has(uuid)) continue;
          seen.add(uuid);
        }
        await runTrigger({
          event: "combatStart",
          actor: entry.actor,
          token: entry.token,
          key: `${combat.id}|combatStart|${uuid || entry.id}`,
        });
      }
    },
  };
}
