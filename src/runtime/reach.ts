import { failed, passed, type CheckOutcome } from "../core/engine/reasons";
import { asRecord, asString, asStrings } from "../core/registry/data";

/** Where a blueprint was found, relative to the roller. */
export type SourceKind = "self" | "token" | "template" | "region";

/** CONST.TOKEN_DISPOSITIONS values used by reach. */
export const DISPOSITION = { HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 } as const;

/** What the collector knows about a blueprint's source; geometry is computed lazily. */
export interface SourceContext {
  kind: SourceKind;
  /** Disposition of the source token (auras) or of the template's creator; null when unknown. */
  sourceDisposition: number | null;
  rollerDisposition: number | null;
  /** For templates: whether the roller created it. */
  own: boolean;
  /** Statuses and condition immunities of the blueprint's actor, for aura blockers. */
  sourceStatuses: readonly string[];
  sourceImmunities: readonly string[];
  /** Evaluate the aura range formula with the source's roll data (feet); null when not a number. */
  evaluateRange(formula: string): number | null;
  /** Whether the roller stands within `range` feet of the source (-1 = anywhere), honouring wall requirements. */
  withinRange(range: number, require: readonly string[]): boolean;
}

export function matchDisposition(wanted: string, source: number | null, roller: number | null): boolean {
  if (wanted === "2") return true;
  if ((source === null) || (roller === null)) return false;
  if (wanted === "1") return source === roller;
  if (wanted === "-1") {
    return ((source === DISPOSITION.FRIENDLY) && (roller === DISPOSITION.HOSTILE))
      || ((source === DISPOSITION.HOSTILE) && (roller === DISPOSITION.FRIENDLY));
  }
  return false;
}

/** Whether any blocking status is present, ignoring statuses the creature is immune to. */
export function isBlocked(blockers: readonly string[], statuses: readonly string[], immunities: readonly string[]): boolean {
  return blockers.some(blocker => !immunities.includes(blocker) && statuses.includes(blocker));
}

function outOfReach(actual: string): CheckOutcome {
  return failed("outOfReach", { actual });
}

function requirements(value: unknown): string[] {
  return Object.entries(asRecord(value)).filter(([, required]) => required === true).map(([key]) => key);
}

/** Decide whether an event node's "whose roll" setting includes the current roller. */
export function reachOutcome(reachData: unknown, context: SourceContext): CheckOutcome {
  const reach = asRecord(reachData);
  const mode = asString(reach.mode, "self");
  const includeSelf = reach.includeSelf !== false;
  const blocked = isBlocked(asStrings(reach.blockers), context.sourceStatuses, context.sourceImmunities);

  switch (context.kind) {
    case "self":
      if (mode === "self") return passed("matched", { actual: "self" });
      if (mode !== "aura") return outOfReach(mode);
      if (blocked) return outOfReach("blocked");
      return includeSelf ? passed("matched", { actual: "aura" }) : outOfReach("self");

    case "token": {
      if (mode !== "aura") return outOfReach(mode);
      if (blocked) return outOfReach("blocked");
      if (!matchDisposition(asString(reach.disposition, "2"), context.sourceDisposition, context.rollerDisposition)) {
        return outOfReach("disposition");
      }
      const range = context.evaluateRange(asString(reach.range));
      if ((range === null) || ((range !== -1) && (range <= 0))) return outOfReach("range");
      if (!context.withinRange(range, requirements(reach.require))) return outOfReach("range");
      return passed("matched", { actual: "aura" });
    }

    case "template":
      if (mode !== "template") return outOfReach(mode);
      if (blocked) return outOfReach("blocked");
      if (context.own) return includeSelf ? passed("matched", { actual: "template" }) : outOfReach("self");
      return matchDisposition(asString(reach.disposition, "2"), context.sourceDisposition, context.rollerDisposition)
        ? passed("matched", { actual: "template" })
        : outOfReach("disposition");

    case "region":
      return ((mode === "region") || (mode === "self")) ? passed("matched", { actual: "region" }) : outOfReach(mode);
  }
}

/** Region events: whether the token that entered or left counts, by its own disposition. */
export function regionTokensOutcome(wanted: string, rollerDisposition: number | null): CheckOutcome {
  if (wanted === "friendly") return (rollerDisposition === DISPOSITION.FRIENDLY) ? passed("matched", { actual: "friendly" }) : outOfReach("disposition");
  if (wanted === "hostile") return (rollerDisposition === DISPOSITION.HOSTILE) ? passed("matched", { actual: "hostile" }) : outOfReach("disposition");
  return passed("matched", { actual: "any" });
}
