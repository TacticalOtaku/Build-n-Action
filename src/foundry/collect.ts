import type { BlueprintSource } from "../core/blueprint/types";
import { compileBlueprint } from "../core/engine/compile";
import type { BlueprintEnv, ChainEntry } from "../core/engine/interpreter";
import type { EventType } from "../core/registry/constants";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import type { RollDetailsInput, TraitTrees } from "../runtime/facts";
import { reachOutcome, regionTokensOutcome, type SourceContext, type SourceKind } from "../runtime/reach";
import { callList, listOf, read, stringList } from "../runtime/read";
import type { TraitTree } from "../runtime/traits";
import { riderBlueprint, type Rider } from "../runtime/riders";
import { substituteCounters } from "../core/counters/counters";
import {
  actorToken, carrierItem, documentBlueprints, documentFromUuid, isDocument, isSuppressed, originRollData, ownerActor, rollDataOrigin
} from "./documents";
import { activeRiders } from "./riders";
import { counterLookups } from "./counters";
import { evaluateNumber, replaceData, simplifyNumber } from "./formulas";
import { previewAura } from "./aura-preview";
import { auraShape, templateContains, tokenCenters, withinAura, type Point } from "./geometry";
import { SETTINGS, setting } from "./settings";
import { isLimitAvailable } from "./usage";
import { log } from "../core/log";

/** Who is rolling what. */
export interface Roller {
  actor: FoundryDocument;
  item: FoundryDocument | null;
  activity: unknown;
  token: TokenPlaceable | null;
  target: TokenPlaceable | null;
  details: RollDetailsInput;
  /** The activity's, item's or actor's roll data with @target, for comparisons and totals. */
  rollData: Record<string, unknown>;
}

/** Where one blueprint taking part in the roll came from. */
export interface SourceInfo {
  document: FoundryDocument;
  kind: SourceKind;
  blueprint: BlueprintSource;
  owner: FoundryDocument | null;
  origin: FoundryDocument | null;
  carrierItem: FoundryDocument | null;
  /** Set when the blueprint is a rider stored on the roller. */
  rider?: Rider;
}

export interface CollectOptions {
  /** Region events: only this document's blueprints take part (no auras, templates or riders). */
  only?: FoundryDocument;
}

export interface Collected {
  entries: ChainEntry[];
  sources: Map<ChainEntry, SourceInfo>;
}

interface Candidate {
  document: FoundryDocument;
  kind: SourceKind;
  /** For token auras: the token document the aura is centred on. */
  sourceToken: FoundryDocument | null;
}

let trees: TraitTrees = {};

/** Load dnd5e's language, tool and weapon trees once the system is ready. */
export async function loadTraitTrees(): Promise<void> {
  const [languages, tool, weapon] = await Promise.all(
    ["languages", "tool", "weapon"].map(category => dnd5e.documents.Trait.choices(category))
  );
  trees = { languages: asRecord(languages) as TraitTree, tool: asRecord(tool) as TraitTree, weapon: asRecord(weapon) as TraitTree };
}

export function traitTrees(): TraitTrees {
  return trees;
}

function activeEffects(document: unknown): FoundryDocument[] {
  return callList(document, "allApplicableEffects").filter(isDocument).filter(effect => read(effect, "active") === true);
}

function actorDocuments(actor: FoundryDocument): FoundryDocument[] {
  return [actor, ...listOf(read(actor, "items")).filter(isDocument), ...listOf(read(actor, "appliedEffects")).filter(isDocument)];
}

function candidates(roller: Roller): Candidate[] {
  const list: Candidate[] = [];
  const self = (document: FoundryDocument) => list.push({ document, kind: "self", sourceToken: null });
  if (roller.item) activeEffects(roller.item).forEach(self);
  actorDocuments(roller.actor).forEach(self);

  const token = roller.token;
  const scene = token?.document.parent;
  if (!token || !scene) return list;

  const actors = new Set<string>([roller.actor.uuid]);
  for (const other of listOf(read(scene, "tokens")).filter(isDocument)) {
    const actor = read(other, "actor");
    if ((other === token.document) || (read(other, "hidden") === true) || !isDocument(actor)) continue;
    if ((read(actor, "type") === "group") || actors.has(actor.uuid)) continue;
    actors.add(actor.uuid);
    for (const document of actorDocuments(actor)) list.push({ document, kind: "token", sourceToken: other });
  }

  let centers: Point[] | null = null;
  for (const template of listOf(read(scene, "templates")).filter(isDocument)) {
    const placeable = read(template, "object") as TemplatePlaceable | null;
    if ((read(template, "hidden") === true) || !placeable) continue;
    centers ??= tokenCenters(token);
    if (centers.some(point => templateContains(placeable, point))) list.push({ document: template, kind: "template", sourceToken: null });
  }

  for (const region of listOf(read(token.document, "regions")).filter(isDocument)) {
    list.push({ document: region, kind: "region", sourceToken: null });
  }
  return list;
}

function sourceContext(candidate: Candidate, info: SourceInfo, roller: Roller, auras: Map<string, boolean>): SourceContext {
  const owner = info.owner;
  let sourceDisposition: number | null = null;
  if (candidate.kind === "token") sourceDisposition = asNumber(read(candidate.sourceToken, "disposition"));
  if (candidate.kind === "template") sourceDisposition = asNumber(read(candidate.document, `flags.${MODULE_SCOPE}.templateDisposition`));
  let rangeData: Record<string, unknown> | null = null;
  return {
    kind: candidate.kind,
    sourceDisposition,
    rollerDisposition: asNumber(read(roller.token?.document, "disposition")) ?? asNumber(read(roller.actor, "prototypeToken.disposition")),
    own: !!owner && (owner.uuid === roller.actor.uuid),
    sourceStatuses: stringList(read(owner, "statuses")),
    sourceImmunities: stringList(read(owner, "system.traits.ci.value")),
    evaluateRange: formula => simplifyNumber(formula, rangeData ??= originRollData(info.document, true)),
    withinRange: (range, require) => {
      const source = read(candidate.sourceToken, "object") as TokenPlaceable | null;
      if (!source || !roller.token) return false;
      const key = `${candidate.sourceToken?.uuid}|${range}|${require.join(",")}`;
      let inside = auras.get(key);
      if (inside === undefined) {
        const pad = !canvas.grid.isGridless || setting(SETTINGS.padAuraRadius);
        inside = withinAura(source, roller.token, range, require, pad);
        auras.set(key, inside);
        if (setting(SETTINGS.showAuraRanges) && (range !== -1)) {
          const shape = auraShape(source, range, require, pad);
          if (shape) previewAura(key, shape, inside);
        }
      }
      return inside;
    }
  };
}

/**
 * Whether a script on this document may run on this client: no other player can edit it. A player's script would
 * otherwise run with the GM's rights whenever the GM evaluates it (their turn start, an aura on an NPC's roll).
 */
export function trustedScriptCarrier(document: FoundryDocument): boolean {
  return ![...game.users].some(user => !user.isGM && (user.id !== game.user.id) && (document.testUserPermission?.(user, "OWNER") === true));
}

function runScript(script: string, roller: Roller, blueprint: BlueprintSource, document: FoundryDocument): boolean | null | "untrusted" {
  if (setting(SETTINGS.disableScripts)) return null;
  if (!trustedScriptCarrier(document)) return "untrusted";
  const check = new Function("actor", "item", "token", "bonus", "activity", "details", script) as (...args: unknown[]) => unknown;
  return check.call(check, roller.actor, roller.item, roller.token, blueprint, roller.activity, roller.details) === true;
}

function addEntry(
  collected: Collected,
  info: SourceInfo,
  candidate: Candidate,
  roller: Roller,
  auras: Map<string, boolean>,
  overrides: Readonly<Record<string, number>> = {}
): void {
  const { blueprint } = info;
  const context = sourceContext(candidate, info, roller, auras);
  const counters = counterLookups(info.owner ?? roller.actor, roller.target?.actor ?? null, blueprint, overrides);
  const withCounters = (text: string) => substituteCounters(text, counters.self, counters.target);
  const env: BlueprintEnv = {
    evaluateNumber: formula => evaluateNumber(withCounters(formula), roller.rollData),
    replaceData: text => replaceData(withCounters(text), roller.rollData),
    counter: counters.value,
    runScript: script => {
      try {
        return runScript(script, roller, blueprint, info.document);
      } catch (error) {
        log.error(`script check in "${blueprint.name}" failed`, error);
        throw error;
      }
    },
    carrierItemUuid: info.carrierItem?.uuid ?? null,
    reach: node => {
      const data = asRecord(node.data);
      return (typeof data.tokens === "string")
        ? regionTokensOutcome(data.tokens, context.rollerDisposition)
        : reachOutcome(data.reach, context);
    },
    limitAvailable: (blueprintId, nodeId, limit) => isLimitAvailable(roller.actor, blueprintId, nodeId, limit)
  };
  const entry: ChainEntry = { compiled: compileBlueprint(blueprint), env, documentUuid: info.document.uuid, actorUuid: info.owner?.uuid ?? null };
  collected.entries.push(entry);
  collected.sources.set(entry, info);
}

/** Every blueprint that may take part in this roll (and the roller's matching riders), with environments. */
export function collect(roller: Roller, event: EventType, activation: string | null = null, options: CollectOptions = {}): Collected {
  const collected: Collected = { entries: [], sources: new Map() };
  const templates = new Set<string>();
  const auras = new Map<string, boolean>();

  const list: Candidate[] = options.only ? [{ document: options.only, kind: "region", sourceToken: null }] : candidates(roller);
  for (const candidate of list) {
    const { document } = candidate;
    if (isSuppressed(document)) continue;
    for (const blueprint of documentBlueprints(document).blueprints) {
      if (!blueprint.enabled) continue;
      const compiled = compileBlueprint(blueprint);
      if (!compiled.pathsFor(event).length && !compiled.pathsFor("signal").length) continue;
      const item = carrierItem(document);
      if (candidate.kind === "template") {
        const key = `${item?.uuid ?? document.uuid}|${blueprint.id}`;
        if (templates.has(key)) continue;
        templates.add(key);
      }
      addEntry(collected, {
        document, kind: candidate.kind, blueprint, owner: ownerActor(document), origin: rollDataOrigin(document), carrierItem: item
      }, candidate, roller, auras);
    }
  }

  for (const rider of options.only ? [] : activeRiders(roller.actor, event, activation)) {
    const origin = rider.source.origin ? documentFromUuid(rider.source.origin) : null;
    const document = origin ?? roller.actor;
    addEntry(collected, {
      document, kind: "self", blueprint: riderBlueprint(rider, event), owner: roller.actor,
      origin: origin ? rollDataOrigin(origin) : roller.actor, carrierItem: null, rider
    }, { document, kind: "self", sourceToken: null }, roller, auras);
  }
  return collected;
}

/** Name of a blueprint's carrier for the roll dialog, e.g. "Longsword". */
export function sourceLabel(info: SourceInfo): string {
  return asString(read(info.carrierItem ?? info.document, "name")) || info.document.documentName;
}

/**
 * One blueprint as if stored on `document`, for the editor's Test panel. The collector's gates are reported, not
 * applied: a suppressed carrier still runs, and `suppressed` says it would be skipped in play.
 */
export function entryFor(
  document: FoundryDocument,
  blueprint: BlueprintSource,
  roller: Roller,
  overrides: Readonly<Record<string, number>> = {}
): { entry: ChainEntry; suppressed: boolean } {
  const owner = ownerActor(document);
  let kind: SourceKind = "self";
  if (document.documentName === "MeasuredTemplate") kind = "template";
  else if (document.documentName === "Region") kind = "region";
  else if (owner && (owner.uuid !== roller.actor.uuid)) kind = "token";
  const sourceToken = ((kind === "token") && owner) ? (actorToken(owner)?.document ?? null) : null;
  const collected: Collected = { entries: [], sources: new Map() };
  addEntry(collected, {
    document, kind, blueprint, owner, origin: rollDataOrigin(document), carrierItem: carrierItem(document)
  }, { document, kind, sourceToken }, roller, new Map(), overrides);
  const entry = collected.entries[0];
  if (!entry) throw new Error("Build-n-Action | could not prepare the blueprint for a test");
  return { entry, suppressed: isSuppressed(document) };
}
