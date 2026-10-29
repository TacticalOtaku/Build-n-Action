import { carrierKind } from "../documents";
import { SETTINGS, setting } from "../settings";
import type { MountedEditor } from "./mount";
import { log } from "../../core/log";

const open = new Map<string, BlueprintEditorApp>();

/** GMs always; other users on documents they own, while "Let players edit blueprints" is on. */
export function canEdit(document: FoundryDocument): boolean {
  if (!carrierKind(document)) return false;
  if (game.user.isGM) return true;
  return setting(SETTINGS.allowPlayers) && document.isOwner;
}

export class BlueprintEditorApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["bna-editor-window"],
    window: { icon: "fa-solid fa-diagram-project", resizable: true },
    position: { width: 1280, height: 780 }
  };

  readonly carrier: FoundryDocument;
  #blueprintId: string | null;
  #mounted: MountedEditor | null = null;

  constructor(carrier: FoundryDocument, blueprintId: string | null) {
    super({
      id: `bna-editor-${carrier.uuid.replace(/[^A-Za-z0-9-]+/g, "-")}`,
      window: { title: game.i18n.format("BNA.Editor.title", { name: carrier.name }) }
    });
    this.carrier = carrier;
    this.#blueprintId = blueprintId;
  }

  /** The editor draws itself with React; the window only provides the frame. */
  async _renderHTML(): Promise<null> {
    return null;
  }

  _replaceHTML(): void {}

  async _onFirstRender(): Promise<void> {
    const content = this.element.querySelector<HTMLElement>(".window-content");
    if (!content) return;
    try {
      const { mountEditor } = await import("./mount");
      this.#mounted = await mountEditor(content, this.carrier, { blueprintId: this.#blueprintId, close: this.#close });
    } catch (error) {
      log.error("the blueprint editor could not load", error);
      ui.notifications.error(game.i18n.localize("BNA.Editor.loadFailed"));
      this.#close();
    }
  }

  _onClose(): void {
    this.#mounted?.unmount();
    this.#mounted = null;
    open.delete(this.carrier.uuid);
  }

  select(blueprintId: string): void {
    this.#blueprintId = blueprintId;
    this.#mounted?.select(blueprintId);
  }

  readonly #close = (): void => {
    this.close().catch(error => log.warn("could not close the editor", error));
  };
}

/** Open (or bring forward) the editor for a document; null when the user may not edit it. */
export async function openEditor(document: FoundryDocument, { blueprintId = null }: { blueprintId?: string | null } = {}): Promise<BlueprintEditorApp | null> {
  if (!canEdit(document)) {
    ui.notifications.warn(game.i18n.localize("BNA.Editor.noPermission"));
    return null;
  }
  const existing = open.get(document.uuid);
  if (existing) {
    if (blueprintId) existing.select(blueprintId);
    existing.bringToFront();
    return existing;
  }
  const app = new BlueprintEditorApp(document, blueprintId);
  open.set(document.uuid, app);
  await app.render({ force: true });
  return app;
}
