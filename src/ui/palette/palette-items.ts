import { CONDITION_NODE_TYPE, type EventType, type NodeKind } from "../../core/registry/constants";
import { EVENTS, RESULTS } from "../../core/registry/index";

export interface PaletteItem {
  key: string;
  kind: NodeKind;
  type: string;
  /** i18n key of the group heading. */
  groupKey: string;
  labelKey: string;
  summaryKey: string;
  icon: string;
  /** Events a result can follow; null for events and conditions. */
  compatibleEvents: readonly EventType[] | null;
}

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  ...EVENTS.map((event): PaletteItem => ({
    key: `event:${event.type}`,
    kind: "event",
    type: event.type,
    groupKey: `BNA.Category.Event.${event.phase}`,
    labelKey: `BNA.Event.${event.type}.Label`,
    summaryKey: `BNA.Event.${event.type}.Summary`,
    icon: event.icon,
    compatibleEvents: null
  })),
  {
    key: "condition",
    kind: "condition",
    type: CONDITION_NODE_TYPE,
    groupKey: "BNA.Kind.condition",
    labelKey: "BNA.Palette.condition.Label",
    summaryKey: "BNA.Palette.condition.Summary",
    icon: "split",
    compatibleEvents: null
  },
  ...RESULTS.map((result): PaletteItem => ({
    key: `result:${result.type}`,
    kind: "result",
    type: result.type,
    groupKey: `BNA.Category.Result.${result.category}`,
    labelKey: `BNA.Result.${result.type}.Label`,
    summaryKey: `BNA.Result.${result.type}.Summary`,
    icon: result.icon,
    compatibleEvents: result.compatibleEvents
  }))
];

export interface PaletteContext {
  /** Kind of the node a new node would be wired from, or null when adding freely. */
  from: NodeKind | null;
  /** Events a result added here would run under (`resultEvents`). */
  upstream: readonly EventType[];
}

function allowed(item: PaletteItem, context: PaletteContext): boolean {
  if (!context.from) return true;
  if (item.kind === "event") return false;
  if ((item.kind === "result") && context.upstream.length) {
    return context.upstream.some(event => item.compatibleEvents?.includes(event));
  }
  return true;
}

function normalize(text: string): string {
  return text.toLocaleLowerCase().replaceAll("ё", "е").trim();
}

function isSubsequence(query: string, text: string): boolean {
  let index = 0;
  for (const char of text) if (char === query[index]) index++;
  return index === query.length;
}

function score(query: string, label: string, summary: string): number {
  if (label.startsWith(query)) return 4;
  if (label.includes(query)) return 3;
  if (summary.includes(query)) return 2;
  return isSubsequence(query, label) ? 1 : 0;
}

/** Items allowed in the context, ranked by how well they match the query (stable within a rank). */
export function filterPaletteItems(
  items: readonly PaletteItem[],
  query: string,
  context: PaletteContext,
  t: (key: string) => string
): PaletteItem[] {
  const visible = items.filter(item => allowed(item, context));
  const needle = normalize(query);
  if (!needle) return visible;
  return visible
    .map(item => ({ item, rank: score(needle, normalize(t(item.labelKey)), normalize(t(item.summaryKey))) }))
    .filter(entry => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map(entry => entry.item);
}
