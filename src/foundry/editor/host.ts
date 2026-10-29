import type { BlueprintSource } from "../../core/blueprint/types";
import { runThrough } from "../../core/engine/interpreter";
import { blueprintSignals } from "../../core/engine/lint";
import { TRIGGER_EVENTS } from "../../core/registry/constants";
import { asRecord, asString } from "../../core/registry/data";
import { buildRollFacts, type RollDetailsInput } from "../../runtime/facts";
import { rollDataPaths } from "../../runtime/paths";
import { listOf, read } from "../../runtime/read";
import type { EditorHost, SimulationItem, SimulationNote, SimulationOption, SimulationRequest, SimulationResult } from "../../ui/host";
import { entryFor, traitTrees } from "../collect";
import { carrierItem, documentBlueprints, documentFromUuid, isDocument, originRollData, ownerActor } from "../documents";
import { counterRows, countersHost, counterStore } from "../counters";
import { createEffectsHost } from "../effects";
import { makeRoller } from "../evaluate";
import { libraryHost } from "../library";
import { CLIENT_SETTINGS, clientSetting, setClientSetting } from "../settings";
import { createTransferHost } from "../transfer";
import { log } from "../../core/log";

/** Roll-data roots that come from the roll itself, so the carrier's data cannot confirm them. */
const ROLL_ROOTS = ["target.", "item.", "activity."];

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

/** Run the edited blueprint as if stored on the carrier, for the chosen roller, item, target and outcome. */
export function simulate(carrier: FoundryDocument, blueprint: BlueprintSource, request: SimulationRequest): SimulationResult | null {
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
  const trigger = { event: request.event, pins: request.pins, ...(request.signal ? { signal: request.signal } : {}) };
  const notes: SimulationNote[] = [];
  if (suppressed) notes.push("suppressed");
  if (!roller.token) notes.push("noToken");
  if (TRIGGER_EVENTS.includes(request.event)) notes.push("trigger");
  const run = runThrough(entry.compiled, trigger, facts, entry.env, { outcome: request.saveOutcome });
  if (run.assumedChoice) notes.push("chosen");
  return { run, notes };
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

  return {
    library: libraryHost(),
    transfer: createTransferHost(carrier),
    effects: createEffectsHost(carrier),
    counters: countersHost(carrier),
    lintEnv: blueprint => {
      const others = neighbours(carrier).flatMap(document => documentBlueprints(document).blueprints).filter(entry => entry.id !== blueprint.id);
      const { sent, received } = blueprintSignals([...others, blueprint]);
      return {
        validateFormula: formula => {
          try {
            return Roll.validate(formula);
          } catch {
            return false;
          }
        },
        hasPath: path => ROLL_ROOTS.some(root => path.startsWith(root)) || path.startsWith("counters.") || rollPaths().known.has(path),
        signalsSent: sent,
        signalsReceived: received,
        itemCarrier: carrierItem(carrier) !== null,
        counterNames: new Set(Object.keys(counterStore(ownerActor(carrier)).defs)),
        regionCarrier: carrier.documentName === "Region"
      };
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
      run: (blueprint, request) => simulate(carrier, blueprint, request),
      counterValues: (actorUuid, blueprint) => counterRows(documentFromUuid(actorUuid), blueprint)
    },

    formula: {
      paths: () => rollPaths().paths,
      preview: formula => previewFormula(formula, originRollData(carrier, true))
    },

    preferences: {
      coachSeen: () => clientSetting(CLIENT_SETTINGS.coachSeen) === true,
      markCoachSeen: () => {
        setClientSetting(CLIENT_SETTINGS.coachSeen, true).catch(error => log.warn("could not remember the guide", error));
      }
    }
  };
}
