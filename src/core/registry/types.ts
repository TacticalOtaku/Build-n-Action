import type { CounterScope } from "../blueprint/types";
import type { CheckOutcome } from "../engine/reasons";
import type { RollFacts } from "../facts/types";
import type { EventType, PinId } from "./constants";
import type { ChoiceSpec, FieldSpec } from "./fields";

export type NodeData = Readonly<Record<string, unknown>>;

/** What evaluating checks needs from the host besides the facts. */
export interface CheckEnv {
  /** Evaluate a formula against the roller's roll data (including @target); null when not a number. */
  evaluateNumber(formula: string): number | null;
  /** Replace roll-data references in text, for string comparisons. */
  replaceData(text: string): string;
  /** The script's answer; null when scripts are turned off, "untrusted" when another user wrote it. */
  runScript(script: string, facts: RollFacts): boolean | null | "untrusted";
  /** UUID of the item that carries the blueprint, or null when it is not on an item. */
  carrierItemUuid: string | null;
  /** A counter's value: mine or the target's; 0 when unknown or without counters (see core/counters). */
  counter?(name: string, scope: CounterScope, whose: "self" | "target"): number;
}

/** Formatting helpers handed to phrase builders; implemented in core/phrase/formatter.ts. */
export interface PhraseFormatter {
  t(key: string, data?: Record<string, string | number>): string;
  /** Label of one value, or "" when the value is blank. */
  choice(value: string, spec: ChoiceSpec): string;
  /** Labels joined with "or"; `!`-prefixed values are phrased as exclusions; empty → "anything". */
  choices(values: readonly string[], spec: ChoiceSpec): string;
  /** A formula with an explicit sign: "1d4" → "+1d4", "-2" → "-2", "" → "+0". */
  signed(formula: string): string;
  joinAnd(items: readonly string[]): string;
  joinOr(items: readonly string[]): string;
}

export type EventPhase = "pre" | "post" | "signal" | "trigger";

export interface EventDefinition {
  readonly kind: "event";
  readonly type: EventType;
  readonly phase: EventPhase;
  /** Lucide icon name. */
  readonly icon: string;
  readonly pins: readonly PinId[];
  readonly fields: readonly FieldSpec[];
}

export const CHECK_CATEGORIES = ["item", "spell", "self", "target", "roll", "advanced"] as const;

export type CheckCategory = (typeof CHECK_CATEGORIES)[number];

export interface CheckDefinition {
  readonly type: string;
  readonly category: CheckCategory;
  readonly icon: string;
  readonly fields: readonly FieldSpec[];
  /** Events for which this check can ever pass; others are flagged by the linter. */
  readonly relevantTo: readonly EventType[];
  /** Choice list used when localizing reason values for this check. */
  readonly reasonChoices?: ChoiceSpec;
  phrase(data: NodeData, fmt: PhraseFormatter): string;
  evaluate(data: NodeData, facts: RollFacts, env: CheckEnv): CheckOutcome;
  /** Included values in an all-of condition that contradict disjoint values of the same check type. */
  contradictionValues?(data: NodeData): readonly string[];
  /** Referenced counter name, if this check depends on a counter definition. */
  counterRef?(data: NodeData): { name: string } | null;
}

export const RESULT_CATEGORIES = ["roll", "reaction"] as const;

export type ResultCategory = (typeof RESULT_CATEGORIES)[number];

export interface ResultDefinition {
  readonly kind: "result";
  readonly type: string;
  readonly category: ResultCategory;
  readonly icon: string;
  readonly fields: readonly FieldSpec[];
  readonly compatibleEvents: readonly EventType[];
  /** Whether "Ask the player" and "Cost" apply to this result. */
  readonly supportsOptional: boolean;
  /** Outputs the result always has (a demanded save's outcomes); results without them may turn on "And then". */
  readonly pins?: readonly PinId[];
  /** Damage types this result adds, used to theme its card (fire, cold, …). */
  flavor(data: NodeData): readonly string[];
  phrase(data: NodeData, fmt: PhraseFormatter): string;
  /** Referenced counter name, if this result depends on a counter definition. */
  counterRef?(data: NodeData): { name: string } | null;
}
