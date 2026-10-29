import { duplicateBlueprint } from "../core/blueprint/factory";
import type { BlueprintSource } from "../core/blueprint/types";
import { validateBlueprintSource } from "../core/blueprint/validate";
import {
  exportBlueprints, importBlueprints, readLibrary, withLibraryEntry, withoutLibraryEntry, type ImportResult
} from "../core/storage/library";
import { MODULE_SCOPE } from "../core/storage/repository";
import { read } from "../runtime/read";
import type { LibraryHost } from "../ui/host";
import { saveBlueprint } from "./api";

const SETTING = "library";
const listeners = new Set<() => void>();
// Foundry 14 builds a new value on every read of a world setting that was never saved, so the entries are kept
// until the setting changes rather than compared by the value read.
let cache: BlueprintSource[] | null = null;
const NOTHING: BlueprintSource[] = [];

export function registerLibrary(): void {
  game.settings.register(MODULE_SCOPE, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: { blueprints: [] },
    onChange: () => {
      cache = null;
      listeners.forEach(listener => listener());
    }
  });
}

/** The library's valid entries; the same array until the setting changes. */
export function libraryEntries(): BlueprintSource[] {
  if (cache) return cache;
  let raw: unknown;
  try {
    raw = game.settings.get(MODULE_SCOPE, SETTING);
  } catch {
    // Not registered yet: read it again next time.
    return NOTHING;
  }
  cache = readLibrary(read(raw, "blueprints"));
  return cache;
}

async function store(entries: readonly BlueprintSource[]): Promise<void> {
  if (!game.user.isGM) throw new Error("Build-n-Action | only the GM can change the blueprint library");
  await game.settings.set(MODULE_SCOPE, SETTING, { blueprints: entries });
}

function download(blueprints: readonly BlueprintSource[]): void {
  const single = (blueprints.length === 1) ? blueprints[0] : undefined;
  const name = single ? `blueprint-${(single.name || single.id).replace(/[^\p{L}\p{N}-]+/gu, "-").toLowerCase()}` : "blueprint-library";
  foundry.utils.saveDataToFile(exportBlueprints(blueprints), "application/json", `${name}.json`);
}

async function importInto(text: string): Promise<ImportResult> {
  const result = importBlueprints(text);
  if (result.error) {
    ui.notifications.warn(game.i18n.localize("BNA.Library.importFailed"));
    return result;
  }
  await store(result.blueprints.reduce<BlueprintSource[]>(withLibraryEntry, [...libraryEntries()]));
  ui.notifications.info(game.i18n.format("BNA.Library.imported", { count: result.blueprints.length, rejected: result.rejected }));
  return result;
}

/** The library for the editor; one instance is shared by every editor window. */
let host: LibraryHost | null = null;

export function libraryHost(): LibraryHost {
  host ??= {
    entries: libraryEntries,
    canEdit: () => game.user.isGM,
    add: blueprint => store(withLibraryEntry(libraryEntries(), blueprint)),
    remove: id => store(withoutLibraryEntry(libraryEntries(), id)),
    import: importInto,
    download,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  return host;
}

/** Add a copy of a library entry (by id or as a blueprint) to a document. */
export async function applyLibraryEntry(entry: string | BlueprintSource, document: FoundryDocument): Promise<BlueprintSource> {
  const source = (typeof entry === "string") ? libraryEntries().find(candidate => candidate.id === entry) : entry;
  if (!source) throw new Error(`Build-n-Action | no library entry "${String(entry)}"`);
  return saveBlueprint(document, duplicateBlueprint(source, source.name));
}

export function createLibraryApi() {
  const library = libraryHost();
  return {
    list: () => [...libraryEntries()],
    add: async (blueprint: unknown) => {
      const result = validateBlueprintSource(blueprint);
      if (!result.ok) throw new Error("Build-n-Action | the blueprint is not valid");
      await library.add(result.value);
    },
    remove: (id: string) => library.remove(id),
    apply: applyLibraryEntry,
    export: (ids?: readonly string[]) => exportBlueprints(ids ? libraryEntries().filter(entry => ids.includes(entry.id)) : libraryEntries()),
    import: (text: string) => importInto(text)
  };
}
