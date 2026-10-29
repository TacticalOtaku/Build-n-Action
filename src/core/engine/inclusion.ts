import { failed, passed, type CheckOutcome } from "./reasons";

/** Split stored values into included ones and `!`-prefixed exclusions (any number of `!`, as in v1). */
export function splitSelection(values: readonly string[]): { included: string[]; excluded: string[] } {
  const included: string[] = [];
  const excluded: string[] = [];
  for (const value of values) {
    const match = /^(!*)(.+)$/.exec(value);
    if (!match?.[2]) continue;
    if (match[1]) excluded.push(match[2]);
    else included.push(match[2]);
  }
  return { included, excluded };
}

export function hasIncluded(values: readonly string[]): boolean {
  return splitSelection(values).included.length > 0;
}

/** Pass when any included value is present and no excluded value is present. */
export function matchValues(actual: readonly string[], selection: readonly string[]): CheckOutcome {
  const { included, excluded } = splitSelection(selection);
  if (!included.length && !excluded.length) return passed("empty");
  const shown = actual.length ? actual.join(", ") : "—";
  if (included.length && !included.some(value => actual.includes(value))) {
    return failed("notMatched", { actual: shown, expected: included.join(", ") });
  }
  const hit = excluded.find(value => actual.includes(value));
  if (hit) return failed("excluded", { actual: hit });
  return passed("matched", { actual: shown });
}
