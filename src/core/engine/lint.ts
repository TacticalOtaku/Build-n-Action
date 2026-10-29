import type { BlueprintNode, BlueprintSource, ConditionCheck } from "../blueprint/types";
import { counterName } from "../counters/counters";
import { upstreamEvents } from "../graph/upstream";
import { CONTINUATION_EVENTS, TRIGGER_EVENTS, type EventType } from "../registry/constants";
import { asRecord, asString, asStrings } from "../registry/data";
import type { FieldSpec } from "../registry/fields";
import { COMMON_RESULT_FIELDS, getCheck, getEvent, getResult } from "../registry/index";
import { compileBlueprint } from "./compile";
import { splitSelection } from "./inclusion";

export const LINT_CODES = [
  "orphan-node", "dead-event", "incompatible-result", "irrelevant-check", "invalid-formula", "unknown-path",
  "contradiction", "signal-unmatched", "cost-without-optional", "item-tick-off-item", "optional-on-trigger", "region-event-off-region", "counter-unknown", "migrated"
] as const;

export type LintCode = (typeof LINT_CODES)[number];
export type LintLevel = "error" | "warning" | "info";

/** One finding; the message is `BNA.Lint.<code>` filled with `values`. */
export interface LintIssue {
  code: LintCode;
  level: LintLevel;
  nodeId?: string;
  checkId?: string;
  values?: Readonly<Record<string, string>>;
}

export interface LintEnv {
  /** Whether a formula parses (Foundry's Roll.validate); formulas are not checked without it. */
  validateFormula?(formula: string): boolean;
  /** Whether a roll-data path (without "@") exists for a sample actor; paths are not checked without it. */
  hasPath?(path: string): boolean;
  /** Signal names sent by other blueprints on the same actor; signals are not checked without both sets. */
  signalsSent?: ReadonlySet<string>;
  signalsReceived?: ReadonlySet<string>;
  /** Whether the blueprint lives on an item; "only this item" is not checked without it. */
  itemCarrier?: boolean;
  /** Whether the blueprint lives on a region; region events are not checked without it. */
  regionCarrier?: boolean;
  /** Known "my" counter names (the owner's shared ones); names are not checked without it. */
  counterNames?: ReadonlySet<string>;
}

const LEVELS: Record<LintCode, LintLevel> = {
  "orphan-node": "warning",
  "dead-event": "warning",
  "incompatible-result": "error",
  "irrelevant-check": "error",
  "invalid-formula": "error",
  "unknown-path": "warning",
  "contradiction": "warning",
  "signal-unmatched": "warning",
  "cost-without-optional": "error",
  "item-tick-off-item": "info",
  "optional-on-trigger": "warning",
  "region-event-off-region": "warning",
  "counter-unknown": "warning",
  "migrated": "info"
};

/** Checks whose values are one-of lists, so two in an all-of condition can contradict each other. */
const LIST_CHECKS = new Set([
  "itemTypes", "identifiers", "baseWeapons", "damageTypes", "spellLevels", "spellSchools", "preparationModes",
  "actorCreatureTypes", "actorCreatureSizes", "creatureTypes", "skillIds", "saveAbilities"
]);

/** Roll-data paths (without "@") referenced by a formula. */
export function formulaPaths(formula: string): string[] {
  return [...formula.matchAll(/@([A-Za-z_][\w.]*)/g)].map(match => match[1] ?? "").filter(Boolean);
}

function formulaFields(fields: readonly FieldSpec[], data: Readonly<Record<string, unknown>>): string[] {
  const formulas: string[] = [];
  const visit = (specs: readonly FieldSpec[], values: Readonly<Record<string, unknown>>) => {
    for (const spec of specs) {
      if (spec.kind === "formula") {
        const value = asString(values[spec.key]).trim();
        if (value) formulas.push(value);
      } else if (spec.kind === "group") {
        visit(spec.fields, asRecord(values[spec.key]));
      } else if (spec.kind === "embeddedResult") {
        const embedded = asRecord(values[spec.key]);
        const definition = getResult(asString(embedded.type));
        if (definition) visit(definition.fields, asRecord(embedded.data));
      }
    }
  };
  visit(fields, data);
  return formulas;
}

function nodeFormulas(node: BlueprintNode): string[] {
  if (node.kind === "event") return formulaFields(getEvent(node.type)?.fields ?? [], node.data);
  if (node.kind === "result") {
    return [
      ...formulaFields(getResult(node.type)?.fields ?? [], node.data),
      ...formulaFields(COMMON_RESULT_FIELDS, asRecord(node.data.common))
    ];
  }
  const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
  return checks.flatMap(check => formulaFields(getCheck(check.type)?.fields ?? [], check.data));
}

export function lintBlueprint(blueprint: BlueprintSource, env: LintEnv = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const report = (code: LintCode, extra: Omit<LintIssue, "code" | "level"> = {}) => {
    issues.push({ code, level: LEVELS[code], ...extra });
  };
  const compiled = compileBlueprint(blueprint);

  if (asRecord(blueprint.flags["build-n-action"]).migratedFrom) report("migrated");

  // Wiring.
  const incoming = new Set(blueprint.edges.map(edge => edge.target));
  for (const node of blueprint.nodes) {
    if (node.kind === "event") {
      if (!compiled.paths.some(path => path.event.id === node.id)) report("dead-event", { nodeId: node.id });
    } else if (!incoming.has(node.id)) {
      report("orphan-node", { nodeId: node.id });
    }
  }

  // Compatibility along each route.
  const seen = new Set<string>();
  const once = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  for (const path of [...compiled.paths, ...compiled.continuations]) {
    const eventType: EventType = path.eventType;
    const result = getResult(path.result.type);
    if (result && !result.compatibleEvents.includes(eventType) && once(`result:${path.result.id}`)) {
      report("incompatible-result", { nodeId: path.result.id, values: { event: eventType } });
    }
    const noDialog = TRIGGER_EVENTS.includes(eventType) || CONTINUATION_EVENTS.includes(eventType);
    if (noDialog && (asRecord(path.result.data.common).optional === true) && once(`optional:${path.result.id}`)) {
      report("optional-on-trigger", { nodeId: path.result.id });
    }
    // A continuation's conditions see the original event, so they are judged by the events before its result.
    const origins = (path.event.kind === "result") ? upstreamEvents(blueprint, path.event.id) : [eventType];
    for (const guard of path.guards) {
      for (const check of guard.checks) {
        const definition = getCheck(check.type);
        if (definition && origins.length && !origins.some(event => definition.relevantTo.includes(event)) && once(`check:${check.id}`)) {
          report("irrelevant-check", { nodeId: guard.node.id, checkId: check.id, values: { event: origins[0] ?? eventType } });
        }
      }
    }
  }

  // Contradictions inside all-of conditions.
  for (const node of blueprint.nodes) {
    if ((node.kind !== "condition") || (asString(node.data.mode) === "any")) continue;
    const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
    const firstByType = new Map<string, string[]>();
    for (const check of checks) {
      if (!LIST_CHECKS.has(check.type)) continue;
      const included = splitSelection(asStrings(check.data.values)).included;
      if (!included.length) continue;
      const earlier = firstByType.get(check.type);
      if (earlier && !earlier.some(value => included.includes(value))) {
        report("contradiction", { nodeId: node.id, checkId: check.id });
      } else if (!earlier) {
        firstByType.set(check.type, included);
      }
    }
  }

  // Formulas and roll-data paths.
  for (const node of blueprint.nodes) {
    for (const formula of nodeFormulas(node)) {
      if (env.validateFormula && !env.validateFormula(formula)) report("invalid-formula", { nodeId: node.id, values: { formula } });
      if (env.hasPath) {
        for (const path of formulaPaths(formula)) {
          if (!env.hasPath(path)) report("unknown-path", { nodeId: node.id, values: { path: `@${path}` } });
        }
      }
    }
  }

  // Signals that nobody hears or that nobody sends.
  if (env.signalsSent && env.signalsReceived) {
    for (const node of blueprint.nodes) {
      const name = asString(node.data.name).trim();
      if (!name) continue;
      if ((node.kind === "result") && (node.type === "signal") && !env.signalsReceived.has(name)) {
        report("signal-unmatched", { nodeId: node.id, values: { name } });
      }
      if ((node.kind === "event") && (node.type === "signal") && !env.signalsSent.has(name)) {
        report("signal-unmatched", { nodeId: node.id, values: { name } });
      }
    }
  }

  // Counter names nobody defines (a typo), among the owner's shared counters and this blueprint's own.
  if (env.counterNames) {
    const known = new Set([...env.counterNames, ...(blueprint.counters ?? []).map(def => counterName(def.name))]);
    const unknown = (data: Readonly<Record<string, unknown>>) => {
      const name = counterName(asString(data.name));
      return !!name && !known.has(name);
    };
    for (const node of blueprint.nodes) {
      if ((node.kind === "result") && (node.type === "counter") && unknown(node.data)) {
        report("counter-unknown", { nodeId: node.id, values: { name: counterName(asString(node.data.name)) } });
      }
      if (node.kind !== "condition") continue;
      for (const check of (Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [])) {
        if ((check.type === "counter") && unknown(check.data)) {
          report("counter-unknown", { nodeId: node.id, checkId: check.id, values: { name: counterName(asString(check.data.name)) } });
        }
      }
    }
  }

  // Region events only fire on regions.
  if (env.regionCarrier === false) {
    for (const node of blueprint.nodes) {
      if ((node.kind === "event") && ((node.type === "regionEnter") || (node.type === "regionExit"))) report("region-event-off-region", { nodeId: node.id });
    }
  }

  // "Only this item" on a blueprint that is not on an item always passes.
  if (env.itemCarrier === false) {
    for (const node of blueprint.nodes) {
      if ((node.kind === "condition") && (node.data.thisItem === true)) report("item-tick-off-item", { nodeId: node.id });
    }
  }

  // Player choice.
  for (const node of blueprint.nodes) {
    if (node.kind !== "result") continue;
    const common = asRecord(node.data.common);
    const costType = asString(asRecord(common.cost).type, "none");
    if ((costType !== "none") && (common.optional !== true)) report("cost-without-optional", { nodeId: node.id });
  }

  return issues;
}

/** Signal names the blueprints send (signal results) and receive (signal events), for LintEnv. */
export function blueprintSignals(blueprints: readonly BlueprintSource[]): { sent: Set<string>; received: Set<string> } {
  const sent = new Set<string>();
  const received = new Set<string>();
  for (const blueprint of blueprints) {
    for (const node of blueprint.nodes) {
      if (node.type !== "signal") continue;
      const name = asString(node.data.name).trim();
      if (!name) continue;
      if (node.kind === "result") sent.add(name);
      else if (node.kind === "event") received.add(name);
    }
  }
  return { sent, received };
}
