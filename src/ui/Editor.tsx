import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { AnimatePresence, MotionConfig } from "motion/react";
import {
  useCallback, useEffect, useMemo, useReducer, useRef, useState,
  type Dispatch, type DragEvent, type KeyboardEvent, type PointerEvent, type RefObject
} from "react";
import { createNode, duplicateBlueprint } from "../core/blueprint/factory";
import type { BlueprintSource } from "../core/blueprint/types";
import { BlueprintCanvas, GRID, type PaletteRequest } from "./canvas/BlueprintCanvas";
import { fitOptions } from "./canvas/fit";
import type { Size } from "./canvas/flow-mapping";
import { autoLayout } from "./canvas/layout";
import type { CanvasTrace } from "./canvas/trace";
import { BlueprintList } from "./chrome/BlueprintList";
import { CoachMarks, type CoachAnchor } from "./chrome/CoachMarks";
import { TemplatePicker, type PickerTab } from "./chrome/TemplatePicker";
import { TitleBlock } from "./chrome/TitleBlock";
import { Toolbar } from "./chrome/Toolbar";
import { FxLevelContext, type FxLevel } from "./fx/level";
import { Icon } from "./icons";
import { Inspector } from "./inspector/Inspector";
import { Drawer, type DrawerTab } from "./drawer/Drawer";
import { IssuesPanel } from "./drawer/IssuesPanel";
import { SimulatorPanel } from "./drawer/SimulatorPanel";
import { lintCounts, nodeLints } from "./lint/lint-view";
import { useLint } from "./lint/useLint";
import { CommandPalette } from "./palette/CommandPalette";
import type { PaletteItem } from "./palette/palette-items";
import type { EffectStatus } from "./host";
import { useHost, useT } from "./services";
import { createEditorState, editorReducer, type EditorAction } from "./state/editor-state";
import { defaultDragData, readDroppedBlueprint } from "./transfer";
import { ThemeContext, type ThemeName } from "./theme/theme";
import { log } from "../core/log";

export interface EditorDocument {
  /** Shown in the title block as the carrier, e.g. "Longsword “Aria”". */
  label: string;
  blueprints: readonly BlueprintSource[];
  /** Present when the carrier is an Active Effect. */
  effect?: EffectStatus;
  /** Whether the blueprints live on an item (or an effect of one), so "only this item" means something. */
  itemCarrier?: boolean;
}

export interface EditorProps {
  document: EditorDocument;
  theme: ThemeName;
  onToggleTheme(): void;
  fxLevel: FxLevel;
  onCycleFx(): void;
  onSave(blueprint: BlueprintSource): void;
  /** Store a new blueprint (the given copy, or a fresh one) and return it so the editor can open it. */
  onCreate(source?: BlueprintSource): BlueprintSource;
  onDelete(id: string): void;
  /** The blueprint to open first; the first one when absent or unknown. */
  initialActiveId?: string | null;
}

/** What the list needs from the open editor. */
interface ActiveHandle {
  blueprint(): BlueprintSource;
  dispatch: Dispatch<EditorAction>;
  /** Forget unsaved edits: the blueprint is being deleted. */
  discard(): void;
}

const AUTOSAVE_DELAY = 400;
/** Roughly how long the drawer's spring takes to settle. */
const DRAWER_SETTLE = 350;
const EDITABLE = "input, textarea, select, [contenteditable='true']";

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function Editor(props: EditorProps) {
  return (
    <ThemeContext value={props.theme}>
      <FxLevelContext value={props.fxLevel}>
        <MotionConfig reducedMotion="user">
          <ReactFlowProvider>
            <EditorBody {...props} />
          </ReactFlowProvider>
        </MotionConfig>
      </FxLevelContext>
    </ThemeContext>
  );
}

function EditorBody(props: EditorProps) {
  const t = useT();
  const { document, onCreate } = props;
  const [activeId, setActiveId] = useState<string | null>(() => {
    const wanted = props.initialActiveId;
    return (wanted && document.blueprints.some(blueprint => blueprint.id === wanted)) ? wanted : (document.blueprints[0]?.id ?? null);
  });
  const active = document.blueprints.find(blueprint => blueprint.id === activeId) ?? null;
  const create = () => setActiveId(onCreate().id);
  const { preferences, simulator, library, transfer, effects } = useHost();
  const [picker, setPicker] = useState<PickerTab | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const [coach, setCoach] = useState(() => !!preferences && !preferences.coachSeen());
  const finishCoach = useCallback(() => {
    preferences?.markCoachSeen();
    setCoach(false);
  }, [preferences]);
  const anchors: CoachAnchor[] = ["canvas", "inspector", "stamp", ...(simulator ? ["test" as const] : [])];
  const startTour = useCallback(() => setCoach(true), []);
  const handleRef = useRef<ActiveHandle | null>(null);

  const current = (id: string) => (((id === active?.id) && handleRef.current)
    ? handleRef.current.blueprint()
    : document.blueprints.find(blueprint => blueprint.id === id));

  const duplicate = (id: string) => {
    const source = current(id);
    if (!source) return;
    const copy = onCreate(duplicateBlueprint(source, t("BNA.UI.Rail.copyName", { name: source.name || t("BNA.UI.Rail.untitled") })));
    setActiveId(copy.id);
  };

  const toggle = (id: string) => {
    const source = current(id);
    if (!source) return;
    if ((id === active?.id) && handleRef.current) handleRef.current.dispatch({ type: "setEnabled", enabled: !source.enabled });
    else props.onSave({ ...source, enabled: !source.enabled });
  };

  const remove = (id: string) => {
    if (id === active?.id) {
      handleRef.current?.discard();
      const index = document.blueprints.findIndex(blueprint => blueprint.id === id);
      const next = document.blueprints[index + 1] ?? document.blueprints[index - 1] ?? null;
      setActiveId(next?.id ?? null);
    }
    props.onDelete(id);
  };

  const moveToEffect = (id: string) => {
    const source = current(id);
    if (!source || !effects) return;
    effects.moveToEffect(source)
      .then(() => remove(id))
      .catch(error => log.warn("could not move the blueprint to an effect", error));
  };

  const adopt = (blueprint: BlueprintSource) => {
    const copy = onCreate(blueprint);
    setActiveId(copy.id);
  };

  const pick = (blueprint: BlueprintSource) => {
    setPicker(null);
    adopt(blueprint);
  };

  const saveToLibrary = (id: string) => {
    const source = current(id);
    if (source) library?.add(source).catch(error => log.warn("could not save to the library", error));
  };

  const dragRow = (id: string, event: DragEvent<HTMLElement>) => {
    const source = current(id);
    if (!source) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(transfer ? transfer.dragData(source) : defaultDragData(source)));
    event.dataTransfer.effectAllowed = "copy";
  };

  const dropData = (data: unknown) => {
    const resolve = transfer ? transfer.resolveDrop(data) : Promise.resolve(readDroppedBlueprint(data));
    resolve
      .then(dropped => {
        if (dropped && !document.blueprints.some(blueprint => blueprint.id === dropped.id)) adopt(duplicateBlueprint(dropped, dropped.name));
      })
      .catch(error => log.warn("could not read the dropped blueprint", error));
  };

  return (
    <div ref={appRef} className="bna-app" data-theme={props.theme}>
      <BlueprintList
        blueprints={document.blueprints}
        activeId={active?.id ?? null}
        onSelect={setActiveId}
        onCreate={create}
        onDuplicate={duplicate}
        onToggle={toggle}
        onDelete={remove}
        onOpenPicker={setPicker}
        hasLibrary={!!library}
        onSaveToLibrary={library?.canEdit() ? saveToLibrary : undefined}
        onDragRow={dragRow}
        onDropData={dropData}
        onMoveToEffect={effects ? moveToEffect : undefined}
      />
      {active ? (
        <ActiveEditor key={active.id} initial={active} handleRef={handleRef} onTour={startTour} {...props} />
      ) : (
        <>
          <div className="bna-center">
            <main className="bna-stage">
              <div className="bna-inspector__empty">
                <h2>{t("BNA.UI.Stage.emptyTitle")}</h2>
                <p>{t("BNA.UI.Stage.emptyBody")}</p>
                <p>
                  <button type="button" className="bna-button" onClick={create}>
                    <Icon name="plus" />
                    {t("BNA.UI.Rail.create")}
                  </button>
                  {" "}
                  <button type="button" className="bna-button" onClick={() => setPicker("presets")}>
                    <Icon name="layers" />
                    {t("BNA.UI.Rail.templates")}
                  </button>
                </p>
              </div>
            </main>
          </div>
          <aside className="bna-inspector" aria-label={t("BNA.UI.Inspector.label")} />
        </>
      )}
      {(active && coach) ? <CoachMarks root={appRef} anchors={anchors} onDone={finishCoach} /> : null}
      <AnimatePresence>
        {picker ? <TemplatePicker key="picker" initialTab={picker} onPick={pick} onClose={() => setPicker(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function ActiveEditor({
  initial, handleRef, onTour, document, theme, onToggleTheme, fxLevel, onCycleFx, onSave
}: EditorProps & { initial: BlueprintSource; handleRef: RefObject<ActiveHandle | null>; onTour(): void }) {
  const t = useT();
  const [state, dispatch] = useReducer(editorReducer, initial, createEditorState);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [palette, setPalette] = useState<PaletteRequest | null>(null);
  const [saved, setSaved] = useState(initial);
  const stageRef = useRef<HTMLElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const { blueprint } = state;
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const { simulator } = useHost();
  const [simTrace, setSimTrace] = useState<CanvasTrace | null>(null);
  const trace = (drawer === "test") ? simTrace : null;
  const toggleTest = useCallback(() => setDrawer(open => ((open === "test") ? null : "test")), []);
  const issues = useLint(blueprint);
  const lints = useMemo(() => nodeLints(issues, t), [issues, t]);
  const counts = useMemo(() => lintCounts(issues), [issues]);

  // Let the list act on this editor: read its latest blueprint, dispatch to it, or discard it.
  const discarded = useRef(false);
  const latest = useRef(blueprint);
  useEffect(() => {
    latest.current = blueprint;
    handleRef.current = {
      blueprint: () => latest.current,
      dispatch,
      discard: () => {
        discarded.current = true;
      }
    };
    return () => {
      handleRef.current = null;
    };
  });

  // Autosave shortly after the last change.
  useEffect(() => {
    if (discarded.current || (blueprint === saved)) return;
    const timer = window.setTimeout(() => {
      onSave(blueprint);
      setSaved(blueprint);
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [blueprint, saved, onSave]);

  // Save pending edits immediately when this editor closes (e.g. switching blueprints).
  const flush = useRef<() => void>(() => {});
  useEffect(() => {
    flush.current = () => {
      if (!discarded.current && (blueprint !== saved)) onSave(blueprint);
    };
  });
  useEffect(() => {
    const pending = flush;
    return () => pending.current();
  }, []);

  const onSizes = useCallback((updates: Record<string, Size>) => setSizes(previous => ({ ...previous, ...updates })), []);
  const closePalette = useCallback(() => setPalette(null), []);

  const openPaletteAtCenter = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPalette({
      flow: screenToFlowPosition({ x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }),
      screen: { x: (rect.width / 2) - 180, y: rect.height / 4 },
      bounds: { width: rect.width, height: rect.height },
      from: null
    });
  }, [screenToFlowPosition]);

  const pick = useCallback((item: PaletteItem) => {
    if (!palette) return;
    const node = createNode(item.kind, item.type, { x: snap(palette.flow.x), y: snap(palette.flow.y) });
    dispatch({ type: "addNode", node, connectFrom: palette.from ?? undefined });
    setPalette(null);
  }, [palette]);

  const tidy = useCallback(async () => {
    const positions = await autoLayout(blueprint, sizes);
    dispatch({ type: "layout", positions });
    window.requestAnimationFrame(() => {
      void fitView(fitOptions(stageRef.current, { duration: 300 }));
    });
  }, [blueprint, sizes, fitView]);

  // The drawer takes height from the canvas; refit once it has finished sliding in or out.
  const drawerOpen = drawer !== null;
  const drawerToggled = useRef(false);
  useEffect(() => {
    if (!drawerToggled.current) {
      drawerToggled.current = true;
      return;
    }
    const timer = window.setTimeout(() => void fitView(fitOptions(stageRef.current, { duration: 300 })), DRAWER_SETTLE);
    return () => window.clearTimeout(timer);
  }, [drawerOpen, fitView]);

  const focusNode = useCallback((id: string) => {
    dispatch({ type: "select", ids: [id] });
    void fitView(fitOptions(stageRef.current, { nodes: [{ id }], duration: 300 }));
  }, [fitView]);

  const onStageKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest(EDITABLE)) return;
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && (key === "z") && !event.shiftKey) {
      event.preventDefault();
      dispatch({ type: "undo" });
    } else if (modifier && ((key === "y") || ((key === "z") && event.shiftKey))) {
      event.preventDefault();
      dispatch({ type: "redo" });
    } else if (modifier && (key === "d")) {
      event.preventDefault();
      if (state.selection.length) dispatch({ type: "duplicateNodes", ids: state.selection, offset: { x: GRID * 2, y: GRID * 2 } });
    } else if ((event.key === " ") && !palette) {
      event.preventDefault();
      openPaletteAtCenter();
    }
  };

  const onStagePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest(`${EDITABLE}, button`)) stageRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <div className="bna-center">
        <main ref={stageRef} className="bna-stage" data-coach="canvas" tabIndex={-1} onKeyDown={onStageKeyDown} onPointerDown={onStagePointerDown}>
          <BlueprintCanvas
            state={state}
            dispatch={dispatch}
            trace={trace}
            lints={lints}
            theme={theme}
            sizes={sizes}
            onSizes={onSizes}
            onRequestPalette={setPalette}
            stageRef={stageRef}
          />
          <Toolbar
            onAdd={openPaletteAtCenter}
            onLayout={() => void tidy()}
            onFit={() => void fitView(fitOptions(stageRef.current, { duration: 300 }))}
            onUndo={() => dispatch({ type: "undo" })}
            onRedo={() => dispatch({ type: "redo" })}
            canUndo={state.past.length > 0}
            canRedo={state.future.length > 0}
            testing={drawer === "test"}
            onToggleTest={simulator ? toggleTest : undefined}
            theme={theme}
            onToggleTheme={onToggleTheme}
            fxLevel={fxLevel}
            onCycleFx={onCycleFx}
            onTour={onTour}
          />
          <TitleBlock
            blueprint={blueprint}
            carrier={document.label}
            saving={blueprint !== saved}
            lint={counts}
            effect={document.effect}
            onShowIssues={() => setDrawer("issues")}
            dispatch={dispatch}
          />
          <AnimatePresence>
            {palette ? (
              <CommandPalette key="palette" request={palette} blueprint={blueprint} onPick={pick} onClose={closePalette} />
            ) : null}
          </AnimatePresence>
        </main>
        <AnimatePresence initial={false}>
          {drawer ? (
            <Drawer
              key="drawer"
              tab={drawer}
              onTab={setDrawer}
              onClose={() => setDrawer(null)}
              issueCount={issues.length}
              test={simulator ? <SimulatorPanel blueprint={blueprint} simulator={simulator} onTrace={setSimTrace} onFocus={focusNode} /> : undefined}
              issues={<IssuesPanel blueprint={blueprint} issues={issues} onFocus={focusNode} />}
            />
          ) : null}
        </AnimatePresence>
      </div>
      <Inspector blueprint={blueprint} selection={state.selection} dispatch={dispatch} itemCarrier={document.itemCarrier === true} />
    </>
  );
}
