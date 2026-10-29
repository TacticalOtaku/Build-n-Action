import { createBlueprint, duplicateBlueprint } from "../core/blueprint/factory";
import { randomId } from "../core/blueprint/ids";
import type { BlueprintSource } from "../core/blueprint/types";
import { validateBlueprintSource } from "../core/blueprint/validate";
import { compileBlueprint, type CompiledBlueprint } from "../core/engine/compile";
import type { EventType, PinId } from "../core/registry/constants";
import { asRecord } from "../core/registry/data";
import {
  blueprintUuid, deleteBlueprint, flagChanges, MODULE_SCOPE, parseBlueprintUuid, upsertBlueprint
} from "../core/storage/repository";
import { read } from "../runtime/read";
import type { SimulationResult } from "../ui/host";
import { documentBlueprints, documentFromUuid, isDocument } from "./documents";
import { openEditor } from "./editor/app";
import { simulate } from "./editor/host";
import { createLibraryApi } from "./library";
import { deleteBackups, migrationPacks, runMigration, scanMigration } from "./migration";
import { MigrationApp } from "./migration-app";
import { recentRolls } from "./roll-state";
import { log } from "../core/log";

const INTEGRATIONS = {
  "midi-qol": { label: "Midi QOL", minimum: "14.0.12" },
  dae: { label: "DAE", minimum: "14.0.14" }
} as const;

export interface IntegrationState {
  active: boolean;
  compatible: boolean;
  minimum: string;
  version: string | null;
}

export function getIntegrationStatus(): Record<string, IntegrationState> {
  return Object.fromEntries(Object.entries(INTEGRATIONS).map(([id, support]) => {
    const module = game.modules.get(id);
    const version = module?.version ?? null;
    const compatible = !module?.active || !version || !foundry.utils.isNewerVersion(support.minimum, version);
    return [id, { active: module?.active === true, compatible, minimum: support.minimum, version }];
  }));
}

/** Warn about active integrations older than supported; neither is required. */
export function validateIntegrations(): void {
  for (const [id, state] of Object.entries(getIntegrationStatus())) {
    if (!state.active || state.compatible) continue;
    const label = INTEGRATIONS[id as keyof typeof INTEGRATIONS].label;
    log.warn(`${label} ${state.version} is older than the supported ${state.minimum}.`);
  }
}

export interface FoundBlueprint {
  document: FoundryDocument;
  blueprint: BlueprintSource;
}

function find(document: FoundryDocument, id: string): FoundBlueprint | null {
  const blueprint = documentBlueprints(document).blueprints.find(entry => entry.id === id);
  return blueprint ? { document, blueprint } : null;
}

/** Resolve `<parent>.Blueprint.<id>` or a v1 `<parent>.ContextualBonus.<id>` synchronously. */
export function blueprintFromUuidSync(uuid: string): FoundBlueprint | null {
  const parsed = parseBlueprintUuid(uuid);
  const document = parsed ? documentFromUuid(parsed.parentUuid) : null;
  return (parsed && document) ? find(document, parsed.id) : null;
}

export async function blueprintFromUuid(uuid: string): Promise<FoundBlueprint | null> {
  const parsed = parseBlueprintUuid(uuid);
  if (!parsed) return null;
  const document = await fromUuid(parsed.parentUuid);
  return isDocument(document) ? find(document, parsed.id) : null;
}

/** Validate and store a blueprint on a document; a converted v1 bonus is retired to the backup. */
export async function saveBlueprint(document: FoundryDocument, blueprint: unknown): Promise<BlueprintSource> {
  const result = validateBlueprintSource(blueprint);
  if (!result.ok) {
    const problems = result.issues.map(issue => `${issue.path || "(root)"}: ${issue.code}`).join(", ");
    throw new Error(`Build-n-Action | the blueprint is not valid (${problems})`);
  }
  await document.update(flagChanges(upsertBlueprint(read(document, `flags.${MODULE_SCOPE}`), result.value)));
  return result.value;
}

export async function removeBlueprint(document: FoundryDocument, id: string): Promise<boolean> {
  const found = find(document, id);
  if (!found) return false;
  await document.update(flagChanges(deleteBlueprint(read(document, `flags.${MODULE_SCOPE}`), found.blueprint)));
  return true;
}

/** Turn a blueprint on or off (also what v1 hotbar macros call). */
export async function toggleBlueprint(uuid: string): Promise<boolean | null> {
  const found = await blueprintFromUuid(uuid);
  if (!found) {
    ui.notifications.warn(game.i18n.localize("BNA.Runtime.NotFound"));
    return null;
  }
  const enabled = !found.blueprint.enabled;
  await saveBlueprint(found.document, { ...found.blueprint, enabled });
  ui.notifications.info(game.i18n.format(enabled ? "BNA.Runtime.Enabled" : "BNA.Runtime.Disabled", { name: found.blueprint.name }));
  return enabled;
}

function validated(blueprint: unknown): BlueprintSource {
  const result = validateBlueprintSource(blueprint);
  if (!result.ok) throw new Error(`Build-n-Action | the blueprint is not valid (${result.issues.map(issue => issue.code).join(", ")})`);
  return result.value;
}

/** Store a new blueprint on a document, from optional partial data; it gets a fresh id. */
export async function createStoredBlueprint(document: FoundryDocument, data: unknown = {}): Promise<BlueprintSource> {
  return saveBlueprint(document, { ...createBlueprint(), ...asRecord(data), id: randomId() });
}

/** Copy a stored blueprint next to the original. */
export async function duplicateStoredBlueprint(uuid: string): Promise<BlueprintSource | null> {
  const found = await blueprintFromUuid(uuid);
  if (!found) return null;
  const name = game.i18n.format("BNA.UI.Rail.copyName", { name: found.blueprint.name || game.i18n.localize("BNA.UI.Rail.untitled") });
  return saveBlueprint(found.document, duplicateBlueprint(found.blueprint, name));
}

export interface SimulateContext {
  /** Where the blueprint is (or would be) stored. */
  document: FoundryDocument;
  actorUuid: string;
  event: EventType;
  itemUuid?: string | null;
  activityId?: string | null;
  targetUuid?: string | null;
  pins?: readonly PinId[];
  signal?: string | null;
  abilityId?: string | null;
  skillId?: string | null;
  /** Assumed outcome of demanded saves; failure by default. */
  saveOutcome?: "succeeded" | "failed";
  /** "My" counter values for the run, by "<scope>:<name>"; the actor's own values otherwise. */
  counters?: Readonly<Record<string, number>>;
}

/** The Test panel's run, for macros: what the blueprint would do for this roller, item, target and outcome. */
export function simulateBlueprint(blueprint: unknown, context: SimulateContext): SimulationResult | null {
  return simulate(context.document, validated(blueprint), {
    actorUuid: context.actorUuid,
    itemUuid: context.itemUuid ?? null,
    activityId: context.activityId ?? null,
    targetUuid: context.targetUuid ?? null,
    event: context.event,
    pins: context.pins ?? ["out"],
    signal: context.signal ?? null,
    abilityId: context.abilityId ?? null,
    skillId: context.skillId ?? null,
    saveOutcome: context.saveOutcome ?? "failed",
    counters: context.counters ?? {}
  });
}

export function createApi() {
  return {
    blueprints: {
      get: (document: FoundryDocument) => documentBlueprints(document).blueprints,
      issues: (document: FoundryDocument) => documentBlueprints(document).issues,
      fromUuid: blueprintFromUuid,
      fromUuidSync: blueprintFromUuidSync,
      save: saveBlueprint,
      delete: removeBlueprint,
      toggle: toggleBlueprint,
      uuid: (document: FoundryDocument, id: string) => blueprintUuid(document.uuid, id),
      create: createStoredBlueprint,
      duplicate: duplicateStoredBlueprint,
      compile: (blueprint: unknown): CompiledBlueprint => compileBlueprint(validated(blueprint)),
      simulate: simulateBlueprint
    },
    openEditor,
    library: createLibraryApi(),
    migration: {
      packs: migrationPacks,
      scan: scanMigration,
      run: runMigration,
      deleteBackups,
      open: () => new MigrationApp().render({ force: true })
    },
    hotbarToggle: toggleBlueprint,
    fromUuid: blueprintFromUuid,
    fromUuidSync: blueprintFromUuidSync,
    getIntegrationStatus,
    debug: { recentRolls }
  };
}
