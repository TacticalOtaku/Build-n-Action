import { validateBlueprintSource } from "../blueprint/validate";
import type { LegacyCarrier } from "../legacy/adapter";
import { repairMigratedBlueprint } from "../legacy/repair";
import { asRecord } from "../registry/data";
import {
  flagChanges, MODULE_SCOPE, readBlueprints, storedEntries, storedId, upsertBlueprint, type RepositoryIssue
} from "./repository";

export interface MigrationPlan {
  /** Bonuses converted into stored blueprints. */
  converted: number;
  /** Bonuses the adapter could not convert; they stay as v1 bonuses. */
  failed: number;
  /** Earlier migrated blueprints whose stale checks were removed (see legacy/repair). */
  repaired: number;
  issues: RepositoryIssue[];
  /** `document.update` changes, or null when there is nothing to do. */
  changes: Record<string, unknown> | null;
}

interface FlagState {
  blueprints: unknown[];
  bonuses: unknown[];
  legacyBackup: Record<string, unknown>;
}

/** Stored blueprints with migration mistakes undone, using each blueprint's v1 original from the backup. */
function repairStored(flags: Record<string, unknown>): { blueprints: unknown[]; repaired: number } {
  const backup = asRecord(flags.legacyBackup);
  let repaired = 0;
  const blueprints = storedEntries(flags.blueprints).map(entry => {
    const original = backup[storedId(entry)];
    const result = original ? validateBlueprintSource(entry) : null;
    const fixed = result?.ok ? repairMigratedBlueprint(result.value, original) : null;
    if (!fixed) return entry;
    repaired++;
    return fixed;
  });
  return { blueprints, repaired };
}

/**
 * Plan the migration of one document's flags: convert v1 bonuses into stored blueprints and back up the originals,
 * and repair blueprints an earlier migration converted wrongly.
 */
export function planMigration(scope: unknown, carrier: LegacyCarrier): MigrationPlan {
  const flags = asRecord(scope);
  const repair = repairStored(flags);
  if (!storedEntries(flags.bonuses).length) {
    return {
      converted: 0, failed: 0, repaired: repair.repaired, issues: [],
      changes: repair.repaired ? flagChanges({ blueprints: repair.blueprints }) : null
    };
  }

  const storedIds = new Set(storedEntries(flags.blueprints).map(storedId));
  const { blueprints, issues } = readBlueprints(flags, carrier);
  let state: FlagState = {
    blueprints: repair.blueprints,
    bonuses: storedEntries(flags.bonuses),
    legacyBackup: { ...asRecord(flags.legacyBackup) }
  };
  let converted = 0;
  for (const blueprint of blueprints) {
    if (storedIds.has(blueprint.id)) continue;
    const update = upsertBlueprint(state, blueprint);
    state = { blueprints: update.blueprints, bonuses: update.bonuses ?? state.bonuses, legacyBackup: update.legacyBackup ?? state.legacyBackup };
    converted++;
  }

  // A bonus whose id a stored blueprint already uses was saved before; keep its original in the backup.
  const shadowed = state.bonuses.filter(entry => storedIds.has(storedId(entry)));
  if (shadowed.length) {
    state = {
      ...state,
      bonuses: state.bonuses.filter(entry => !storedIds.has(storedId(entry))),
      legacyBackup: { ...state.legacyBackup, ...Object.fromEntries(shadowed.map(entry => [storedId(entry), entry])) }
    };
  }

  const changed = (converted > 0) || (shadowed.length > 0) || (repair.repaired > 0);
  return {
    converted,
    failed: state.bonuses.length,
    repaired: repair.repaired,
    issues,
    changes: changed ? flagChanges({ blueprints: state.blueprints, bonuses: state.bonuses, legacyBackup: state.legacyBackup }) : null
  };
}

/** The flag path of the kept v1 originals to delete, or null when there are none. */
export function backupPath(scope: unknown): string | null {
  const backup = asRecord(asRecord(scope).legacyBackup);
  return Object.keys(backup).length ? `flags.${MODULE_SCOPE}.legacyBackup` : null;
}
