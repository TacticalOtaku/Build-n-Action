/** Why a check, condition, event or result passed or failed; the text is `BNA.Reason.<code>`. */
export const REASON_CODES = [
  "empty", "matched", "notMatched", "excluded",
  "noTarget", "noItem", "noActivity", "notSpell", "notWeapon", "notFeature", "noValue",
  "threshold", "comparisonFailed", "scriptFalse", "scriptError", "scriptDisabled", "scriptUntrusted", "otherItem",
  "noChecks", "disabled", "outOfReach", "limitUsed"
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export interface Reason {
  code: ReasonCode;
  values?: Readonly<Record<string, string | number>>;
}

export interface CheckOutcome {
  pass: boolean;
  reason: Reason;
}

function reason(code: ReasonCode, values?: Record<string, string | number>): Reason {
  return values ? { code, values } : { code };
}

export function passed(code: ReasonCode, values?: Record<string, string | number>): CheckOutcome {
  return { pass: true, reason: reason(code, values) };
}

export function failed(code: ReasonCode, values?: Record<string, string | number>): CheckOutcome {
  return { pass: false, reason: reason(code, values) };
}
