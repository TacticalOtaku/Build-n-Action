import { backupPath, planMigration, type MigrationPlan } from "../core/storage/migration";
import { MODULE_SCOPE } from "../core/storage/repository";
import { listOf, read } from "../runtime/read";
import { carrierKind, deletion, isDocument } from "./documents";
import { log } from "../core/log";

export interface MigrationEntry {
  uuid: string;
  label: string;
  documentName: string;
  converted: number;
  failed: number;
  /** Blueprints an earlier migration converted wrongly, now repaired. */
  repaired: number;
  warnings: number;
  error: string | null;
}

export interface MigrationReport {
  /** Documents that carry v1 bonuses (before the run) or that the run touched. */
  documents: number;
  converted: number;
  failed: number;
  repaired: number;
  errors: number;
  entries: MigrationEntry[];
}

export interface MigrationOptions {
  /** Compendium collections to include (Actor and Item packs). */
  packs?: readonly string[];
  /** Only documents this accepts are scanned or changed; everything by default. */
  include?: (document: FoundryDocument) => boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface PackChoice {
  id: string;
  label: string;
  documentName: string;
  locked: boolean;
}

const PACK_TYPES = ["Actor", "Item"];

function withEmbedded(document: FoundryDocument): FoundryDocument[] {
  const items = listOf(read(document, "items")).filter(isDocument);
  return [
    document,
    ...items.flatMap(item => [item, ...listOf(read(item, "effects")).filter(isDocument)]),
    ...listOf(read(document, "effects")).filter(isDocument)
  ];
}

function worldDocuments(): FoundryDocument[] {
  return [
    ...listOf(game.actors).filter(isDocument).flatMap(withEmbedded),
    ...listOf(game.items).filter(isDocument).flatMap(withEmbedded),
    ...listOf(game.scenes).flatMap(scene => [...listOf(read(scene, "regions")), ...listOf(read(scene, "templates"))]).filter(isDocument)
  ];
}

export function migrationPacks(): PackChoice[] {
  return listOf(game.packs)
    .map(pack => pack as CompendiumLike)
    .filter(pack => PACK_TYPES.includes(pack.documentName))
    .map(pack => ({ id: pack.collection, label: pack.metadata.label, documentName: pack.documentName, locked: pack.locked }));
}

/** Run `task` over the world's documents and the chosen packs' documents; locked packs are unlocked when `unlock`. */
async function overDocuments<T>(options: MigrationOptions, unlock: boolean, task: (documents: FoundryDocument[]) => Promise<T>): Promise<T> {
  const relock: CompendiumLike[] = [];
  try {
    const documents = worldDocuments();
    for (const id of options.packs ?? []) {
      const pack = game.packs.get(id);
      if (!pack) continue;
      if (unlock && pack.locked) {
        await pack.configure({ locked: false });
        relock.push(pack);
      }
      documents.push(...(await pack.getDocuments()).filter(isDocument).flatMap(withEmbedded));
    }
    return await task(options.include ? documents.filter(options.include) : documents);
  } finally {
    for (const pack of relock) await pack.configure({ locked: true });
  }
}

function plan(document: FoundryDocument) {
  const carrier = carrierKind(document);
  return carrier ? planMigration(read(document, `flags.${MODULE_SCOPE}`), carrier) : null;
}

function entryFor(document: FoundryDocument, plan: MigrationPlan, error: string | null): MigrationEntry {
  return {
    uuid: document.uuid, label: document.name, documentName: document.documentName,
    converted: error ? 0 : plan.converted, failed: plan.failed, repaired: error ? 0 : plan.repaired, warnings: plan.issues.length, error
  };
}

function summarize(entries: MigrationEntry[]): MigrationReport {
  return {
    documents: entries.length,
    converted: entries.reduce((sum, entry) => sum + entry.converted, 0),
    failed: entries.reduce((sum, entry) => sum + entry.failed, 0),
    repaired: entries.reduce((sum, entry) => sum + entry.repaired, 0),
    errors: entries.filter(entry => entry.error).length,
    entries
  };
}

/** A dry run: which documents carry v1 bonuses and what would convert. Changes nothing. */
export async function scanMigration(options: MigrationOptions = {}): Promise<MigrationReport> {
  return overDocuments(options, false, documents => Promise.resolve(summarize(documents.flatMap(document => {
    const result = plan(document);
    return (result && (result.converted || result.failed || result.repaired)) ? [entryFor(document, result, null)] : [];
  }))));
}

/** Convert every v1 bonus in the world and the chosen packs; each document is updated on its own. */
export async function runMigration(options: MigrationOptions = {}): Promise<MigrationReport> {
  return overDocuments(options, true, async documents => {
    const pending = documents.flatMap(document => {
      const result = plan(document);
      return (result?.changes || result?.failed) ? [{ document, result }] : [];
    });
    const entries: MigrationEntry[] = [];
    for (const [index, { document, result }] of pending.entries()) {
      let error: string | null = null;
      if (result.changes) {
        try {
          await document.update(result.changes);
        } catch (caught) {
          error = (caught instanceof Error) ? caught.message : String(caught);
          log.error(`could not migrate ${document.uuid}`, caught);
        }
      }
      entries.push(entryFor(document, result, error));
      options.onProgress?.(index + 1, pending.length);
    }
    return summarize(entries);
  });
}

/** Delete the kept v1 originals everywhere; returns how many documents had some. */
export async function deleteBackups(options: MigrationOptions = {}): Promise<number> {
  return overDocuments(options, true, async documents => {
    let count = 0;
    for (const document of documents) {
      const path = backupPath(read(document, `flags.${MODULE_SCOPE}`));
      if (!path) continue;
      try {
        await document.update({ [path]: deletion() });
        count++;
      } catch (error) {
        log.error(`could not delete the backup of ${document.uuid}`, error);
      }
    }
    return count;
  });
}
