import type { BlueprintGraph, BlueprintNode, ConditionNodeData } from "../blueprint/types";
import { enumeratePaths, type Guard } from "../graph/paths";
import { STATIC } from "../registry/choices";
import { asRecord, asString } from "../registry/data";
import { getCheck, getEvent, getResult } from "../registry/index";
import type { PhraseFormatter } from "../registry/types";

const DISPOSITION_KEYS: Record<string, string> = { "2": "any", "1": "ally", "-1": "enemy" };

export function describeEvent(node: BlueprintNode, pin: string, fmt: PhraseFormatter): string {
  const definition = getEvent(node.type);
  if (!definition) return node.type;
  if (definition.phase === "signal") {
    return fmt.t(`BNA.Event.${definition.type}.Phrase`, { name: asString(node.data.name).trim() || fmt.t("BNA.Phrase.Unset") });
  }
  const tokens = asString(node.data.tokens);
  if (tokens) {
    return fmt.t(`BNA.Event.${definition.type}.Phrase.${pin}.Other`, { who: fmt.t(`BNA.Reach.Who.regionTokens.${tokens}`) });
  }
  const reach = asRecord(node.data.reach);
  const mode = asString(reach.mode, "self");
  const base = `BNA.Event.${definition.type}.Phrase.${pin}`;
  if ((mode !== "aura") && (mode !== "template") && (mode !== "region")) return fmt.t(`${base}.Self`);
  const disposition = (mode === "region") ? "any" : (DISPOSITION_KEYS[asString(reach.disposition)] ?? "any");
  return fmt.t(`${base}.Other`, { who: fmt.t(`BNA.Reach.Who.${mode}.${disposition}`) });
}

/** The condition as a clause, negated for the "no" branch; "" when it has no checks. */
export function describeCondition(node: BlueprintNode, expect: boolean, fmt: PhraseFormatter): string {
  const data = node.data as Partial<ConditionNodeData>;
  const texts = (data.checks ?? []).flatMap(check => {
    const definition = getCheck(check.type);
    return definition ? [definition.phrase(check.data, fmt)] : [];
  });
  const onlyThisItem = (node.data.thisItem === true) ? fmt.t("BNA.Check.thisItem.Phrase") : "";
  if (!texts.length && !onlyThisItem) return "";
  const anyOf = data.mode === "any";
  let joined = anyOf ? fmt.joinOr(texts) : fmt.joinAnd(texts);
  if (anyOf && (texts.length > 1) && (onlyThisItem || expect)) joined = `(${joined})`;
  // "Only this item" is required whatever the mode, so it leads, joined with "and".
  if (onlyThisItem) joined = texts.length ? fmt.joinAnd([onlyThisItem, joined]) : onlyThisItem;
  return expect ? joined : fmt.t("BNA.Phrase.Not", { text: joined });
}

export function describeResult(node: BlueprintNode, fmt: PhraseFormatter): string {
  const definition = getResult(node.type);
  if (!definition) return node.type;
  const text = definition.phrase(node.data, fmt);
  const notes = describeCommon(asRecord(node.data.common), definition.supportsOptional, fmt);
  return notes.length ? `${text} (${notes.join(", ")})` : text;
}

function describeCommon(common: Record<string, unknown>, supportsOptional: boolean, fmt: PhraseFormatter): string[] {
  const notes: string[] = [];
  if (supportsOptional && (common.optional === true)) {
    notes.push(fmt.t("BNA.Phrase.Optional"));
    const costType = asString(asRecord(common.cost).type, "none");
    if (costType !== "none") notes.push(fmt.t("BNA.Phrase.Cost", { cost: fmt.choice(costType, { static: STATIC.costType }) }));
  }
  const limit = asString(common.limit, "none");
  if (limit !== "none") notes.push(fmt.t(`BNA.Phrase.Limit.${limit}`));
  return notes;
}

/** One sentence per distinct (event, outcome, conditions) route, in graph order. */
export function describeBlueprint(graph: BlueprintGraph, fmt: PhraseFormatter): string[] {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const groups = new Map<string, { event: string; guards: string; results: string[] }>();
  const continuations = enumeratePaths(graph, "results");
  const guardText = (guards: readonly Guard[]) => fmt.joinAnd(guards.flatMap(guard => {
    const node = nodes.get(guard.nodeId);
    const text = node ? describeCondition(node, guard.expect, fmt) : "";
    return text ? [text] : [];
  }));

  /** A result's phrase followed by "; and then …" for each route leaving its outputs. */
  const withContinuation = (result: BlueprintNode, trail: ReadonlySet<string>): string => {
    let text = describeResult(result, fmt);
    if (trail.has(result.id)) return text;
    const next = new Set(trail).add(result.id);
    const routes = new Map<string, { pin: string; guards: string; results: string[] }>();
    for (const path of continuations) {
      const target = nodes.get(path.resultNodeId);
      if ((path.eventNodeId !== result.id) || !target) continue;
      const key = [path.eventPin, ...path.guards.map(guard => `${guard.nodeId}:${guard.expect ? 1 : 0}`)].join("|");
      let route = routes.get(key);
      if (!route) {
        route = { pin: path.eventPin, guards: guardText(path.guards), results: [] };
        routes.set(key, route);
      }
      route.results.push(withContinuation(target, next));
    }
    for (const { pin, guards, results } of routes.values()) {
      const then = fmt.joinAnd(results);
      text += (pin === "then")
        ? (guards ? fmt.t("BNA.Phrase.ThenIf", { guards, then }) : fmt.t("BNA.Phrase.Then", { then }))
        : (guards ? fmt.t(`BNA.Phrase.OutcomeIf.${pin}`, { guards, then }) : fmt.t(`BNA.Phrase.Outcome.${pin}`, { then }));
    }
    return text;
  };

  for (const path of enumeratePaths(graph)) {
    const event = nodes.get(path.eventNodeId);
    const result = nodes.get(path.resultNodeId);
    if (!event || !result) continue;
    const key = [path.eventNodeId, path.eventPin, ...path.guards.map(guard => `${guard.nodeId}:${guard.expect ? 1 : 0}`)].join("|");
    let group = groups.get(key);
    if (!group) {
      group = { event: describeEvent(event, path.eventPin, fmt), guards: guardText(path.guards), results: [] };
      groups.set(key, group);
    }
    group.results.push(withContinuation(result, new Set()));
  }

  return [...groups.values()].map(({ event, guards, results }) => {
    const then = fmt.joinAnd(results);
    const sentence = guards
      ? fmt.t("BNA.Phrase.SentenceIf", { event, guards, then })
      : fmt.t("BNA.Phrase.Sentence", { event, then });
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  });
}
