import { MODULE_SCOPE } from "../core/storage/repository";
import { deleteBackups, migrationPacks, runMigration, scanMigration, type MigrationReport } from "./migration";
import { log } from "../core/log";

type Step = "choose" | "report" | "running" | "done";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const node = element("button", primary ? "bna-migration__primary" : "", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/** Foundry's own name for a document type ("Item" → "Предмет"), or the raw name. */
function documentType(documentName: string): string {
  const key = `DOCUMENT.${documentName}`;
  return game.i18n.has(key) ? game.i18n.localize(key) : documentName;
}

export class MigrationApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "bna-migration",
    classes: ["bna-migration-window"],
    window: { title: "BNA.Migration.title", icon: "fa-solid fa-diagram-project", resizable: true },
    position: { width: 620, height: 640 }
  };

  #step: Step = "choose";
  #packs = new Set<string>();
  #report: MigrationReport | null = null;
  #progress: [done: number, total: number] = [0, 0];
  #note = "";
  #busy = false;

  async _renderHTML(): Promise<HTMLElement> {
    const root = element("div", "bna-migration bna-surface");
    const t = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

    if (this.#step === "choose") {
      root.append(element("p", "", t("BNA.Migration.intro")));
      const packs = migrationPacks();
      if (packs.length) {
        const fieldset = element("fieldset");
        fieldset.append(element("legend", "", t("BNA.Migration.packs")));
        for (const pack of packs) {
          const label = element("label", "bna-migration__pack");
          const box = element("input");
          box.type = "checkbox";
          box.checked = this.#packs.has(pack.id);
          box.addEventListener("change", () => {
            if (box.checked) this.#packs.add(pack.id);
            else this.#packs.delete(pack.id);
          });
          label.append(box, document.createTextNode(pack.label));
          if (pack.locked) label.append(element("span", "bna-migration__muted", t("BNA.Migration.locked")));
          fieldset.append(label);
        }
        root.append(fieldset);
      }
      root.append(element("div", "bna-migration__actions"));
      root.lastElementChild?.append(button(t("BNA.Migration.scan"), () => void this.#scan(), true));
    }

    if (this.#report && (this.#step === "report" || this.#step === "done")) {
      const report = this.#report;
      const summaryKey = (this.#step === "done") ? "BNA.Migration.doneSummary" : "BNA.Migration.scanSummary";
      root.append(element("p", "bna-migration__summary", t(summaryKey, {
        documents: report.documents, converted: report.converted, repaired: report.repaired, failed: report.failed, errors: report.errors
      })));
      if (!report.entries.length) root.append(element("p", "bna-migration__muted", t("BNA.Migration.nothing")));
      const list = element("ul", "bna-migration__list");
      for (const entry of report.entries) {
        const item = element("li", entry.error ? "is-error" : "");
        const open = element("button", "bna-migration__link", entry.label);
        open.type = "button";
        open.addEventListener("click", () => {
          void fromUuid(entry.uuid).then(found => {
            const sheet = (found as { sheet?: { render(options: Record<string, unknown>): unknown } } | null)?.sheet;
            sheet?.render({ force: true });
          });
        });
        item.append(open, element("span", "bna-migration__muted", entry.error
          ? t("BNA.Migration.entryError", { error: entry.error })
          : t("BNA.Migration.entry", { type: documentType(entry.documentName), converted: entry.converted, repaired: entry.repaired, failed: entry.failed })));
        list.append(item);
      }
      root.append(list);
      const actions = element("div", "bna-migration__actions");
      if (this.#step === "report") {
        actions.append(button(t("BNA.Migration.back"), () => this.#go("choose")));
        if (report.converted || report.repaired) actions.append(button(t("BNA.Migration.run"), () => void this.#run(), true));
      }
      actions.append(button(t("BNA.Migration.deleteBackups"), () => void this.#deleteBackups()));
      root.append(actions);
    }

    if (this.#step === "running") {
      const [done, total] = this.#progress;
      const bar = element("progress");
      bar.max = Math.max(total, 1);
      bar.value = done;
      root.append(element("p", "", t("BNA.Migration.running", { done, total })), bar);
    }

    if (this.#note) root.append(element("p", "bna-migration__note", this.#note));
    root.querySelectorAll("button").forEach(node => {
      node.disabled = this.#busy;
    });
    return root;
  }

  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  #go(step: Step): void {
    this.#step = step;
    this.#note = "";
    void this.render();
  }

  async #scan(): Promise<void> {
    this.#busy = true;
    void this.render();
    try {
      this.#report = await scanMigration({ packs: [...this.#packs] });
      this.#step = "report";
    } finally {
      this.#busy = false;
      void this.render();
    }
  }

  async #run(): Promise<void> {
    this.#step = "running";
    this.#progress = [0, this.#report?.documents ?? 0];
    void this.render();
    try {
      this.#report = await runMigration({
        packs: [...this.#packs],
        onProgress: (done, total) => {
          this.#progress = [done, total];
          void this.render();
        }
      });
      this.#step = "done";
    } catch (error) {
      // Only a pack that cannot be opened gets here; each document already fails on its own.
      log.error("the migration stopped", error);
      this.#step = "report";
      this.#note = game.i18n.format("BNA.Migration.entryError", { error: (error instanceof Error) ? error.message : String(error) });
    }
    void this.render();
  }

  async #deleteBackups(): Promise<void> {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "BNA.Migration.deleteBackups" },
      content: `<p>${game.i18n.localize("BNA.Migration.deleteBackupsConfirm")}</p>`
    });
    if (!confirmed) return;
    this.#busy = true;
    void this.render();
    try {
      const count = await deleteBackups({ packs: [...this.#packs] });
      this.#note = game.i18n.format("BNA.Migration.backupsDeleted", { count });
    } finally {
      this.#busy = false;
      void this.render();
    }
  }
}

/** "Migrate the world" in the module settings, for the GM only. */
export function registerMigrationMenu(): void {
  game.settings.registerMenu(MODULE_SCOPE, "migration", {
    name: "BNA.Setting.migration.name",
    label: "BNA.Setting.migration.label",
    hint: "BNA.Setting.migration.hint",
    icon: "fa-solid fa-diagram-project",
    type: MigrationApp,
    restricted: true
  });
}
