import {
  Background, BackgroundVariant, MiniMap, ReactFlow, useReactFlow,
  type Connection, type EdgeChange, type EdgeTypes, type FinalConnectionState, type IsValidConnection,
  type NodeChange, type NodeTypes
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import type { Position } from "../../core/blueprint/types";
import { canConnect } from "../../core/graph/connections";
import type { PinId } from "../../core/registry/constants";
import { useT } from "../services";
import type { EditorAction, EditorState } from "../state/editor-state";
import type { ThemeName } from "../theme/theme";
import { ArrowMarker, DraftEdge } from "./DraftEdge";
import { fitOptions } from "./fit";
import { toFlowEdges, toFlowNodes, type BnaFlowEdge, type BnaFlowNode, type Size } from "./flow-mapping";
import { nodeTitle } from "./node-title";
import { ConditionNode } from "./nodes/ConditionNode";
import { EventNode } from "./nodes/EventNode";
import { ResultNode } from "./nodes/ResultNode";
import type { NodeLint } from "../lint/lint-view";
import type { CanvasTrace } from "./trace";

const NODE_TYPES: NodeTypes = { event: EventNode, condition: ConditionNode, result: ResultNode };
const EDGE_TYPES: EdgeTypes = { draft: DraftEdge };

/** Snap spacing; matches the dot grid so cards line up like a drafting sheet. */
export const GRID = 18;

export interface PaletteRequest {
  /** Where a new node goes, in canvas coordinates. */
  flow: Position;
  /** Where the palette opens, relative to the stage. */
  screen: Position;
  /** Stage size, to keep the palette inside it. */
  bounds: Size;
  /** The output a new node is wired from, if the palette was opened by dropping a wire. */
  from: { source: string; sourcePin: PinId } | null;
}

export interface BlueprintCanvasProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  trace: CanvasTrace | null;
  lints: Readonly<Record<string, NodeLint>>;
  theme: ThemeName;
  sizes: Readonly<Record<string, Size>>;
  onSizes(updates: Record<string, Size>): void;
  onRequestPalette(request: PaletteRequest): void;
  stageRef: RefObject<HTMLElement | null>;
}

export function BlueprintCanvas({ state, dispatch, trace, lints, theme, sizes, onSizes, onRequestPalette, stageRef }: BlueprintCanvasProps) {
  const t = useT();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(() => new Set());
  const { blueprint, selection } = state;
  const ariaLabelConfig = useMemo(() => ({
    "node.a11yDescription.default": t("BNA.UI.Canvas.nodeHelp"),
    "node.a11yDescription.keyboardDisabled": t("BNA.UI.Canvas.nodeHelp"),
    "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }: { direction: string; x: number; y: number }) =>
      t("BNA.UI.Canvas.moved", { direction: t(`BNA.UI.Canvas.direction.${direction}`), x: Math.round(x), y: Math.round(y) }),
    "edge.a11yDescription.default": t("BNA.UI.Canvas.edgeHelp"),
    "minimap.ariaLabel": t("BNA.UI.Canvas.minimap"),
    "handle.ariaLabel": t("BNA.UI.Canvas.pin")
  }), [t]);

  // The window can still be opening when React Flow first fits the graph. Refit while the stage settles,
  // until the user pans or zooms themselves.
  const userMoved = useRef(false);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let last = { width: stage.clientWidth, height: stage.clientHeight };
    const observer = new ResizeObserver(() => {
      const size = { width: stage.clientWidth, height: stage.clientHeight };
      const changed = (Math.abs(size.width - last.width) > 40) || (Math.abs(size.height - last.height) > 40);
      last = size;
      if (changed && !userMoved.current) void fitView(fitOptions(stage));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fitView, stageRef]);

  const nodes = useMemo(() => toFlowNodes(blueprint, selection, sizes, trace, lints), [blueprint, selection, sizes, trace, lints]);
  const edges = useMemo(() => {
    const byId = new Map(blueprint.nodes.map(node => [node.id, node]));
    const name = (id: string) => {
      const node = byId.get(id);
      return node ? nodeTitle(node, t) : id;
    };
    return toFlowEdges(blueprint, selectedEdges, trace, edge => t("BNA.UI.Canvas.wire", {
      from: name(edge.source), pin: t(`BNA.Pin.${edge.sourcePin}.Label`), to: name(edge.target)
    }));
  }, [blueprint, selectedEdges, trace, t]);

  const openPalette = useCallback((clientX: number, clientY: number, from: PaletteRequest["from"]) => {
    const rect = stageRef.current?.getBoundingClientRect();
    onRequestPalette({
      flow: screenToFlowPosition({ x: clientX, y: clientY }),
      screen: { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) },
      bounds: { width: rect?.width ?? 800, height: rect?.height ?? 600 },
      from
    });
  }, [onRequestPalette, screenToFlowPosition, stageRef]);

  const onNodesChange = useCallback((changes: NodeChange<BnaFlowNode>[]) => {
    const sizeUpdates: Record<string, Size> = {};
    const removed: string[] = [];
    let nextSelection: Set<string> | null = null;
    for (const change of changes) {
      switch (change.type) {
        case "position":
          if (change.position) {
            dispatch({ type: "moveNode", id: change.id, position: change.position, dragging: change.dragging ?? false });
          }
          break;
        case "dimensions":
          if (change.dimensions) sizeUpdates[change.id] = change.dimensions;
          break;
        case "remove":
          removed.push(change.id);
          break;
        case "select":
          nextSelection ??= new Set(selection);
          if (change.selected) nextSelection.add(change.id);
          else nextSelection.delete(change.id);
          break;
        default:
          break;
      }
    }
    if (Object.keys(sizeUpdates).length) onSizes(sizeUpdates);
    if (nextSelection) dispatch({ type: "select", ids: [...nextSelection] });
    if (removed.length) dispatch({ type: "removeNodes", ids: removed });
  }, [dispatch, onSizes, selection]);

  const onEdgesChange = useCallback((changes: EdgeChange<BnaFlowEdge>[]) => {
    const removed: string[] = [];
    const selected = new Map<string, boolean>();
    for (const change of changes) {
      if (change.type === "remove") removed.push(change.id);
      else if (change.type === "select") selected.set(change.id, change.selected);
    }
    if (selected.size) {
      setSelectedEdges(previous => {
        const next = new Set(previous);
        for (const [id, isSelected] of selected) {
          if (isSelected) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }
    if (removed.length) dispatch({ type: "removeEdges", ids: removed });
  }, [dispatch]);

  const isValidConnection = useCallback<IsValidConnection<BnaFlowEdge>>(connection => {
    if (!connection.sourceHandle) return false;
    return canConnect(blueprint, { source: connection.source, sourcePin: connection.sourceHandle, target: connection.target }).ok;
  }, [blueprint]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.sourceHandle) return;
    dispatch({ type: "connect", source: connection.source, sourcePin: connection.sourceHandle, target: connection.target });
  }, [dispatch]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connection: FinalConnectionState) => {
    const handle = connection.fromHandle;
    if (connection.isValid || !connection.fromNode || !handle?.id || (handle.type !== "source")) return;
    const point = ("changedTouches" in event) ? event.changedTouches[0] : event;
    if (!point) return;
    openPalette(point.clientX, point.clientY, { source: connection.fromNode.id, sourcePin: handle.id as PinId });
  }, [openPalette]);

  const onPaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent) => {
    event.preventDefault();
    openPalette(event.clientX, event.clientY, null);
  }, [openPalette]);

  return (
    <>
      <ArrowMarker />
      <ReactFlow<BnaFlowNode, BnaFlowEdge>
        className="bna-canvas"
        aria-label={t("BNA.UI.Canvas.label")}
        ariaLabelConfig={ariaLabelConfig}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onPaneContextMenu={onPaneContextMenu}
        colorMode={theme}
        snapToGrid
        snapGrid={[GRID, GRID]}
        minZoom={0.3}
        maxZoom={1.75}
        fitView
        fitViewOptions={fitOptions(null)}
        onMoveStart={event => {
          if (event) userMoved.current = true;
        }}
        deleteKeyCode={["Delete", "Backspace"]}
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.2} color="var(--bna-grid)" />
        <MiniMap pannable zoomable position="bottom-left" nodeClassName={node => `bna-mini--${node.type ?? "event"}`} />
      </ReactFlow>
    </>
  );
}
