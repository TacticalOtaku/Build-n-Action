import type { BlueprintSource } from "../../core/blueprint/types";
import { effectReference, isEffectUuid, type EffectReference } from "../../core/facts/types";
import { log } from "../../core/log";
import { asRecord, asString } from "../../core/registry/data";
import { blueprintUuid } from "../../core/storage/repository";
import {
  BLUEPRINT_DRAG, createEditorHost, parseBlueprintDrop, runSimulation, type SimulationPrepared
} from "../../runtime/editor-host";
import { buildRollFacts, type RollDetailsInput } from "../../runtime/facts";
import { rollDataPaths } from "../../runtime/paths";
import { callList, listOf, read } from "../../runtime/read";
import type { EditorHost, SimulationItem, SimulationOption, SimulationRequest, SimulationResult } from "../../ui/host";
import { entryFor, traitTrees } from "../collect";
import { counterRows, countersHost, counterStore } from "../counters";
import {
  blueprintFromUuid, carrierItem, documentBlueprints, documentFromUuid, isDocument, originRollData, ownerActor
} from "../documents";
import { createEffectsHost } from "../effects";
import { libraryHost } from "../library";
import { makeRoller } from "../play";
import { CLIENT_SETTINGS, clientSetting, setClientSetting } from "../settings";

function byLabel(a: SimulationOption, b: SimulationOption): number {
  return a.label.localeCompare(b.label, game.i18n.lang);
}

function activityOf(item: FoundryDocument | null, id: string | null): unknown {
  if (!item || !id) return null;
  return listOf(read(item, "system.activities")).find(activity => read(activity, "id") === id) ?? null;
}

/** Documents whose blueprints can hear this carrier's signals: the owner, its items and effects, and the carrier. */
function neighbours(carrier: FoundryDocument): FoundryDocument[] {
  const owner = ownerActor(carrier);
  const list = owner
    ? [owner, ...listOf(read(owner, "items")).filter(isDocument), ...listOf(read(owner, "appliedEffects")).filter(isDocument), carrier]
    : [carrier];
  return [...new Map(list.map(document => [document.uuid, document])).values()];
}

export function previewFormula(formula: string, data: Record<string, unknown>): string | null {
  try {
    if (!Roll.validate(formula)) return null;
    const replaced = Roll.replaceFormulaData(formula, data, { missing: "0", warn: false });
    return dnd5e.dice.simplifyRollFormula(replaced, { preserveFlavor: true }) || replaced;
  } catch {
    return null;
  }
}

function accessibleEffect(document: unknown): EffectReference | null {
  if (!isDocument(document) || document.documentName !== "ActiveEffect") return null;
  if (!game.user.isGM && !document.isOwner && document.testUserPermission?.(game.user, "OBSERVER") !== true) return null;
  return effectReference(document);
}

function effectChoicesFor(carrier: unknown): EffectReference[] {
  const parent = read(carrier, "parent");
  const references = new Map<string, EffectReference>();
  for (const owner of [carrier, parent]) {
    for (const effect of [owner, ...listOf(read(owner, "effects")), ...callList(owner, "allApplicableEffects")]) {
      const ref = accessibleEffect(effect);
      if (ref) references.set(ref.uuid, ref);
    }
  }
  return [...references.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveEffectReference(uuid: string): Promise<EffectReference | null> {
  if (!isEffectUuid(uuid)) return null;
  try {
    return accessibleEffect(await fromUuid(uuid));
  } catch {
    return null;
  }
}

function prepareSimulation(carrier: FoundryDocument, blueprint: BlueprintSource, request: SimulationRequest): SimulationPrepared | null {
  const actor = documentFromUuid(request.actorUuid);
  if (!actor) return null;
  const item = request.itemUuid ? documentFromUuid(request.itemUuid) : null;
  const activity = activityOf(item, request.activityId);
  const targetDocument = request.targetUuid ? documentFromUuid(request.targetUuid) : null;
  const target = (read(targetDocument, "object") as TokenPlaceable | null | undefined) ?? null;
  const details: RollDetailsInput = (request.event === "savingThrow")
    ? { saveAbility: request.abilityId }
    : { abilityId: request.abilityId, skillId: request.skillId };
  const roller = makeRoller(actor, item, activity, target, details, true);
  const { entry, suppressed } = entryFor(carrier, blueprint, roller, request.counters);
  const facts = buildRollFacts({
    event: request.event,
    actor,
    token: roller.token?.document ?? null,
    item,
    activity,
    target: target ? { actor: target.actor, document: target.document } : null,
    details: roller.details
  }, traitTrees());
  return { entry, facts, suppressed, hasToken: Boolean(roller.token) };
}

/** Run the edited blueprint as if stored on the carrier, for the chosen roller, item, target and outcome. */
export function simulate(carrier: FoundryDocument, blueprint: BlueprintSource, request: SimulationRequest): SimulationResult | null {
  return runSimulation(prepareSimulation(carrier, blueprint, request), request);
}

/** Token fields that change the Test tab's subject lists. */
const SUBJECT_FIELDS = ["name", "hidden", "actorId", "actorLink", "delta"];

export function createFoundryHost(carrier: FoundryDocument): EditorHost {
  let subjectsRevision = 0;
  let paths: string[] | null = null;
  let known: Set<string> | null = null;
  const rollPaths = () => {
    paths ??= rollDataPaths(originRollData(carrier, true));
    known ??= new Set(paths.map(path => path.slice(1)));
    return { paths, known };
  };

  return createEditorHost({
    library: libraryHost(),
    effects: createEffectsHost(carrier),
    counters: countersHost(carrier),
    lint: {
      neighbourBlueprints: id => neighbours(carrier).flatMap(doc => documentBlueprints(doc).blueprints).filter(entry => entry.id !== id),
      validateFormula: formula => {
        try {
          return Roll.validate(formula);
        } catch {
          return false;
        }
      },
      hasKnownPath: path => rollPaths().known.has(path),
      itemCarrier: carrierItem(carrier) !== null,
      regionCarrier: carrier.documentName === "Region",
      counterNames: () => new Set(Object.keys(counterStore(ownerActor(carrier)).defs))
    },
    formula: {
      paths: () => rollPaths().paths,
      preview: formula => previewFormula(formula, originRollData(carrier, true))
    },
    effectSelection: {
      choices: () => effectChoicesFor(carrier),
      resolve: resolveEffectReference
    },
    transfer: {
      dragData: blueprint => ({ type: BLUEPRINT_DRAG, uuid: blueprintUuid(carrier.uuid, blueprint.id) }),
      resolveDrop: async data => {
        const drop = parseBlueprintDrop(data);
        if (!drop) return null;
        if (drop.kind === "data") return drop.blueprint;
        const found = await blueprintFromUuid(drop.uuid);
        return (found && (found.document !== carrier)) ? found.blueprint : null;
      }
    },
    simulator: {
      actors: () => {
        const allowed = (actor: FoundryDocument) => (read(actor, "type") !== "group") && (game.user.isGM || actor.isOwner);
        const scene = (canvas.ready ? canvas.tokens.placeables : [])
          .filter(token => !!token.actor && allowed(token.actor) && (game.user.isGM || !token.document.hidden))
          .map(token => ({ value: token.actor?.uuid ?? "", label: token.document.name, group: game.i18n.localize("BNA.UI.Sim.onScene") }))
          .sort(byLabel);
        const onScene = new Set(scene.map(option => option.value));
        const others = listOf(game.actors).filter(isDocument).filter(allowed)
          .filter(actor => !onScene.has(actor.uuid))
          .map(actor => ({ value: actor.uuid, label: actor.name, group: game.i18n.localize("BNA.UI.Sim.otherActors") }))
          .sort(byLabel);
        return [...new Map(scene.map(option => [option.value, option])).values(), ...others];
      },
      subscribe: listener => {
        // One tick later: during deleteToken the placeable is still on the canvas.
        const changed = () => setTimeout(() => {
          subjectsRevision++;
          listener();
        }, 0);
        // Token moves do not change the lists; names, visibility and actors do.
        const relevant = (changes: unknown) => SUBJECT_FIELDS.some(key => key in asRecord(changes));
        const renamed = (_document: unknown, changes: unknown) => {
          if ("name" in asRecord(changes)) changed();
        };
        const hooks = [
          ["createToken", Hooks.on("createToken", changed)],
          ["deleteToken", Hooks.on("deleteToken", changed)],
          ["updateToken", Hooks.on("updateToken", (_token: unknown, changes: unknown) => { if (relevant(changes)) changed(); })],
          ["createActor", Hooks.on("createActor", changed)],
          ["deleteActor", Hooks.on("deleteActor", changed)],
          ["updateActor", Hooks.on("updateActor", renamed)],
          ["canvasReady", Hooks.on("canvasReady", changed)]
        ] as const;
        return () => {
          for (const [name, id] of hooks) Hooks.off(name, id);
        };
      },
      revision: () => subjectsRevision,
      items: actorUuid => {
        const carried = carrierItem(carrier)?.uuid;
        return listOf(read(documentFromUuid(actorUuid), "items")).filter(isDocument).flatMap((item): SimulationItem[] => {
          const activities = listOf(read(item, "system.activities"))
            .map(activity => ({ value: asString(read(activity, "id")), label: asString(read(activity, "name")) || asString(read(activity, "type")) }))
            .filter(activity => activity.value);
          return (activities.length || (item.uuid === carried)) ? [{ uuid: item.uuid, name: item.name, activities }] : [];
        }).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
      },
      targets: () => (canvas.ready ? canvas.tokens.placeables : [])
        .filter(token => game.user.isGM || !token.document.hidden)
        .map(token => ({ value: token.document.uuid, label: token.document.name }))
        .sort(byLabel),
      defaults: () => {
        const controlled = canvas.ready ? (canvas.tokens.controlled[0]?.actor ?? null) : null;
        const actor = controlled ?? ownerActor(carrier) ?? game.user.character;
        const item = carrierItem(carrier);
        const target = listOf(game.user.targets)[0] as TokenPlaceable | undefined;
        return {
          actorUuid: actor?.uuid ?? null,
          itemUuid: (item && actor && (item.parent?.uuid === actor.uuid)) ? item.uuid : null,
          targetUuid: target?.document.uuid ?? null
        };
      },
      prepare: (blueprint, request) => prepareSimulation(carrier, blueprint, request),
      counterValues: (actorUuid, blueprint) => counterRows(documentFromUuid(actorUuid), blueprint)
    },
    preferences: {
      coachSeen: () => clientSetting(CLIENT_SETTINGS.coachSeen) === true,
      markCoachSeen: () => {
        setClientSetting(CLIENT_SETTINGS.coachSeen, true).catch(error => log.warn("could not remember the guide", error));
      }
    }
  });
}
