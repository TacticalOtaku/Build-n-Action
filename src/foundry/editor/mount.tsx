import geologicaCss from "@fontsource-variable/geologica/full.css?inline";
import monoCss from "@fontsource-variable/jetbrains-mono/index.css?inline";
import { StrictMode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { createBlueprint } from "../../core/blueprint/factory";
import type { BlueprintSource } from "../../core/blueprint/types";
import { read } from "../../runtime/read";
import { Editor } from "../../ui/Editor";
import { FX_LEVELS, nextFxLevel, type FxLevel } from "../../ui/fx/level";
import { ServicesProvider, createEditorServices } from "../../ui/services";
import baseCss from "../../ui/theme/base.css?inline";
import editorCss from "../../ui/theme/editor.css?inline";
import tokensCss from "../../ui/theme/tokens.css?inline";
import type { ThemeName } from "../../ui/theme/theme";
import { removeBlueprint, saveBlueprint } from "../api";
import { foundryChoices, foundryTranslator } from "../choices";
import { carrierItem, documentBlueprints, touchesBlueprints } from "../documents";
import { effectStatus } from "../effects";
import { CLIENT_SETTINGS, clientSetting, resolveEditorTheme, setClientSetting } from "../settings";
import { createFoundryHost } from "./host";
import { log } from "../../core/log";

const FONT_STYLE_ID = "bna-editor-fonts";
const HOST_CSS = ":host { display: block; height: 100%; } .bna-editor-root { height: 100%; }";

export interface MountOptions {
  blueprintId: string | null;
  close(): void;
}

export interface MountedEditor {
  unmount(): void;
  /** Open another blueprint of the same document. */
  select(blueprintId: string): void;
}

/** A tiny store: which blueprint to open, and a counter that remounts the editor on each request. */
function selectionStore(initial: string | null) {
  let state = { id: initial, request: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (id: string) => {
      state = { id, request: state.request + 1 };
      listeners.forEach(listener => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

type Selection = ReturnType<typeof selectionStore>;

/** @font-face rules are ignored inside shadow roots, so the fonts are declared once on the page. */
function injectFonts(): void {
  if (globalThis.document.getElementById(FONT_STYLE_ID)) return;
  const style = globalThis.document.createElement("style");
  style.id = FONT_STYLE_ID;
  style.textContent = `${geologicaCss}\n${monoCss}`;
  globalThis.document.head.append(style);
}

function storedTheme(): ThemeName {
  const applications = read(game.settings.get("core", "uiConfig"), "colorScheme.applications");
  return resolveEditorTheme(clientSetting(CLIENT_SETTINGS.editorTheme), applications, window.matchMedia("(prefers-color-scheme: light)").matches);
}

function storedFx(): FxLevel {
  const value = clientSetting(CLIENT_SETTINGS.editorEffects);
  return FX_LEVELS.includes(value as FxLevel) ? value as FxLevel : "full";
}

function remember(key: (typeof CLIENT_SETTINGS)[keyof typeof CLIENT_SETTINGS], value: unknown): void {
  setClientSetting(key, value).catch(error => log.warn("could not store an editor preference", error));
}

function upsert(list: readonly BlueprintSource[], blueprint: BlueprintSource): BlueprintSource[] {
  return list.some(entry => entry.id === blueprint.id)
    ? list.map(entry => ((entry.id === blueprint.id) ? blueprint : entry))
    : [...list, blueprint];
}

function FoundryEditor({ carrier, selection, close }: { carrier: FoundryDocument; selection: Selection; close(): void }) {
  const [blueprints, setBlueprints] = useState<readonly BlueprintSource[]>(() => documentBlueprints(carrier).blueprints);
  const [theme, setTheme] = useState<ThemeName>(storedTheme);
  // Foundry's colour scheme can change while the editor is open; "auto" follows it.
  useEffect(() => {
    const changed = Hooks.on("clientSettingChanged", (key: unknown) => {
      if (key === "core.uiConfig") setTheme(storedTheme());
    });
    return () => Hooks.off("clientSettingChanged", changed);
  }, []);
  const [fxLevel, setFxLevel] = useState<FxLevel>(storedFx);
  const isEffect = carrier.documentName === "ActiveEffect";
  const [effect, setEffect] = useState(() => (isEffect ? effectStatus(carrier) : undefined));
  const requested = useSyncExternalStore(selection.subscribe, selection.get);
  const services = useMemo(
    () => createEditorServices(foundryTranslator, foundryChoices(carrier), createFoundryHost(carrier)),
    [carrier]
  );

  useEffect(() => {
    const name = carrier.documentName;
    const updated = Hooks.on(`update${name}`, (document: unknown, changes: unknown) => {
      if (document !== carrier) return;
      if (touchesBlueprints(changes)) setBlueprints(documentBlueprints(carrier).blueprints);
      if (isEffect) setEffect(effectStatus(carrier));
    });
    const deleted = Hooks.on(`delete${name}`, (document: unknown) => {
      if (document === carrier) close();
    });
    // An effect on an item is suppressed or not with the item's equipped state.
    const owner = isEffect ? carrier.parent : null;
    const ownerUpdated = (owner?.documentName === "Item")
      ? Hooks.on("updateItem", (document: unknown) => {
        if (document === owner) setEffect(effectStatus(carrier));
      })
      : null;
    return () => {
      Hooks.off(`update${name}`, updated);
      Hooks.off(`delete${name}`, deleted);
      if (ownerUpdated !== null) Hooks.off("updateItem", ownerUpdated);
    };
  }, [carrier, close, isEffect]);

  const failed = useCallback((error: unknown) => {
    log.error("a blueprint could not be saved", error);
    ui.notifications.error(game.i18n.localize("BNA.Editor.saveFailed"));
  }, []);

  const onSave = useCallback((blueprint: BlueprintSource) => {
    setBlueprints(list => upsert(list, blueprint));
    saveBlueprint(carrier, blueprint).catch(failed);
  }, [carrier, failed]);

  const onCreate = useCallback((source?: BlueprintSource) => {
    const blueprint = source ?? createBlueprint();
    setBlueprints(list => [...list, blueprint]);
    saveBlueprint(carrier, blueprint).catch(failed);
    return blueprint;
  }, [carrier, failed]);

  const onDelete = useCallback((id: string) => {
    setBlueprints(list => list.filter(entry => entry.id !== id));
    removeBlueprint(carrier, id).catch(failed);
  }, [carrier, failed]);

  return (
    <ServicesProvider services={services}>
      <Editor
        key={requested.request}
        initialActiveId={requested.id}
        document={{ label: carrier.name, blueprints, effect, itemCarrier: carrierItem(carrier) !== null }}
        theme={theme}
        onToggleTheme={() => {
          const next = (theme === "dark") ? "light" : "dark";
          setTheme(next);
          remember(CLIENT_SETTINGS.editorTheme, next);
        }}
        fxLevel={fxLevel}
        onCycleFx={() => {
          const next = nextFxLevel(fxLevel);
          setFxLevel(next);
          remember(CLIENT_SETTINGS.editorEffects, next);
        }}
        onSave={onSave}
        onCreate={onCreate}
        onDelete={onDelete}
      />
    </ServicesProvider>
  );
}

export async function mountEditor(container: HTMLElement, carrier: FoundryDocument, options: MountOptions): Promise<MountedEditor> {
  injectFonts();
  const host = globalThis.document.createElement("div");
  host.className = "bna-editor-host";
  // Foundry's KeyboardManager ignores key presses while the focused element carries this attribute; inside a shadow
  // root the focused element is the host, so typing and canvas shortcuts never trigger game key bindings.
  host.dataset.keyboardFocus = "";
  container.replaceChildren(host);

  const shadow = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync([HOST_CSS, baseCss, tokensCss, editorCss].join("\n"));
  shadow.adoptedStyleSheets = [sheet];
  const mountPoint = globalThis.document.createElement("div");
  mountPoint.className = "bna-editor-root";
  shadow.append(mountPoint);

  const selection = selectionStore(options.blueprintId);
  const root = createRoot(mountPoint);
  // Render the first frame synchronously, so openEditor resolves with the editor already on screen.
  flushSync(() => {
    root.render(
      <StrictMode>
        <FoundryEditor carrier={carrier} selection={selection} close={options.close} />
      </StrictMode>
    );
  });
  return {
    unmount: () => root.unmount(),
    select: id => selection.set(id)
  };
}
