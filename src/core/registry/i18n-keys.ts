import { STATIC } from "./choices";
import { CHECKS, CONDITION_NODE_FIELDS } from "./checks";
import { CONTINUATION_EVENTS, NODE_KINDS, PIN_IDS } from "./constants";
import { EVENTS } from "./events";
import { walkFields, type FieldSpec } from "./fields";
import { COMMON_RESULT_FIELDS, RESULTS } from "./results";
import { CHECK_CATEGORIES, RESULT_CATEGORIES, type EventPhase } from "./types";

const EVENT_PHASES: readonly EventPhase[] = ["pre", "post", "signal", "trigger"];
const NODE_TEXT = ["Label", "Summary", "Help"] as const;

/** Glue used by the phrase formatter and sentence builder. */
const PHRASE_KEYS = [
  "Sentence", "SentenceIf", "Then", "ThenIf", "And", "Or", "Not", "Any", "NotValues", "ButNot", "Optional", "Cost", "Unset",
  "Limit.turn", "Limit.round", "Limit.shortRest", "Limit.longRest",
  "Outcome.succeeded", "Outcome.failed", "OutcomeIf.succeeded", "OutcomeIf.failed"
] as const;

/**
 * Every i18n key the registry references statically. Keys built inside phrase functions from
 * data (e.g. `Phrase.atMost`) are covered by the phrase smoke tests instead.
 */
export function requiredI18nKeys(): string[] {
  const keys = new Set<string>();
  const addFields = (fields: readonly FieldSpec[]) => walkFields(fields, field => {
    keys.add(field.label);
    if (field.hint) keys.add(field.hint);
    if (((field.kind === "select") || (field.kind === "multiselect")) && ("static" in field.choices)) {
      for (const choice of field.choices.static) keys.add(choice.label);
    }
  });

  for (const kind of NODE_KINDS) keys.add(`BNA.Kind.${kind}`);
  for (const pin of PIN_IDS) {
    keys.add(`BNA.Pin.${pin}.Label`);
    keys.add(`BNA.Pin.${pin}.Hint`);
  }
  for (const phase of EVENT_PHASES) keys.add(`BNA.Category.Event.${phase}`);
  for (const category of CHECK_CATEGORIES) keys.add(`BNA.Category.Check.${category}`);
  for (const category of RESULT_CATEGORIES) keys.add(`BNA.Category.Result.${category}`);
  for (const key of PHRASE_KEYS) keys.add(`BNA.Phrase.${key}`);

  for (const event of EVENTS) {
    for (const part of NODE_TEXT) keys.add(`BNA.Event.${event.type}.${part}`);
    if (event.phase === "signal") keys.add(`BNA.Event.${event.type}.Phrase`);
    else {
      for (const pin of event.pins) {
        keys.add(`BNA.Event.${event.type}.Phrase.${pin}.Self`);
        keys.add(`BNA.Event.${event.type}.Phrase.${pin}.Other`);
      }
    }
    addFields(event.fields);
  }
  for (const event of CONTINUATION_EVENTS) keys.add(`BNA.Event.${event}.Label`);
  for (const check of CHECKS) {
    for (const part of NODE_TEXT) keys.add(`BNA.Check.${check.type}.${part}`);
    addFields(check.fields);
  }
  for (const result of RESULTS) {
    for (const part of NODE_TEXT) keys.add(`BNA.Result.${result.type}.${part}`);
    addFields(result.fields);
  }
  // Built from data in demandSave's phrase.
  for (const who of ["target", "self", "aura"]) keys.add(`BNA.Result.demandSave.Phrase.${who}`);
  for (const mode of ["advantage", "disadvantage"]) keys.add(`BNA.Result.demandSave.With.${mode}`);
  keys.add("BNA.Result.demandSave.DcSpell");
  keys.add("BNA.Result.demandSave.DcFormula");
  for (const who of ["self", "target"]) {
    for (const action of ["add", "subtract", "set", "reset"]) keys.add(`BNA.Result.counter.Phrase.${who}.${action}`);
    keys.add(`BNA.Check.counter.Phrase.${who}`);
  }
  addFields(COMMON_RESULT_FIELDS);
  addFields(CONDITION_NODE_FIELDS);

  for (const group of Object.values(STATIC)) {
    for (const choice of group) keys.add(choice.label);
  }
  for (const mode of ["aura", "template"]) {
    for (const disposition of ["any", "ally", "enemy"]) keys.add(`BNA.Reach.Who.${mode}.${disposition}`);
  }
  keys.add("BNA.Reach.Who.region.any");

  return [...keys].sort();
}
