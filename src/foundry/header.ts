import { read } from "../runtime/read";
import { carrierKind, documentBlueprints, isDocument, isSuppressed } from "./documents";
import { canEdit, openEditor } from "./editor/app";
import { SETTINGS, setting } from "./settings";
import { log } from "../core/log";

const ICON = "fa-solid fa-diagram-project";
/** Colours the icon while a blueprint on the document works, as v1 marked documents with bonuses. */
const ACTIVE_MARKER = "bna-active-marker";

export interface HeaderControl {
  action: string;
  icon: string;
  label: string;
  onClick(): void;
}

/** The documents that carry blueprints and get the control (group actors excluded, as in v1). */
function carrierOf(application: unknown): FoundryDocument | null {
  const document = read(application, "document");
  if (!isDocument(document) || !carrierKind(document)) return null;
  if ((document.documentName === "Actor") && (read(document, "type") === "group")) return null;
  return canEdit(document) ? document : null;
}

function open(document: FoundryDocument): void {
  openEditor(document).catch(error => log.error("could not open the editor", error));
}

/** The document's blueprints, and whether one of them works now (enabled, on a carrier that is not switched off). */
function blueprintState(document: FoundryDocument): { count: number; active: boolean } {
  const { blueprints } = documentBlueprints(document);
  return { count: blueprints.length, active: !isSuppressed(document) && blueprints.some(blueprint => blueprint.enabled) };
}

export function headerControl(document: FoundryDocument, count: number, active: boolean): HeaderControl {
  return {
    action: "bnaOpenEditor",
    icon: active ? `${ICON} ${ACTIVE_MARKER}` : ICON,
    label: count ? game.i18n.format("BNA.Header.labelCount", { count }) : game.i18n.localize("BNA.Header.label"),
    onClick: () => open(document)
  };
}

function addTitleButton(application: unknown, document: FoundryDocument): void {
  const element = read(application, "element");
  if (!(element instanceof HTMLElement)) return;
  const header = element.querySelector(".window-header");
  if (!header) return;
  const existing = header.querySelector(".bna-header-button");
  if (existing) {
    existing.classList.toggle(ACTIVE_MARKER, blueprintState(document).active);
    return;
  }
  const label = game.i18n.localize("BNA.Header.label");
  const button = globalThis.document.createElement("button");
  button.type = "button";
  button.className = `header-control icon ${ICON} bna-header-button`;
  button.classList.toggle(ACTIVE_MARKER, blueprintState(document).active);
  button.dataset.tooltip = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", event => {
    event.preventDefault();
    open(document);
  });
  const toggle = header.querySelector("[data-action='toggleControls']");
  if (toggle) toggle.before(button);
  else header.append(button);
}

export function registerHeaderControls(): void {
  Hooks.on("getHeaderControlsApplicationV2", (application: unknown, controls: HeaderControl[]) => {
    const document = carrierOf(application);
    if (!document) return;
    const { count, active } = blueprintState(document);
    controls.unshift(headerControl(document, count, active));
  });
  Hooks.on("renderApplicationV2", (application: unknown) => {
    if (!setting(SETTINGS.headerLabel)) return;
    const document = carrierOf(application);
    if (document) addTitleButton(application, document);
  });
}
