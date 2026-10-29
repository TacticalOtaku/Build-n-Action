import type { EventType, PinId } from "./constants";
import type { ChoiceSpec, FieldSpec } from "./fields";

export type NodeData = Readonly<Record<string, unknown>>;

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
  phrase(data: NodeData, fmt: PhraseFormatter): string;
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
}
