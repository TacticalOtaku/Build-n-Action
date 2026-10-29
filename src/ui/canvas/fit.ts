import type { FitViewOptions } from "@xyflow/react";

const TOOLBAR_ROOM = 72;
const SIDE_ROOM = 48;
const STAMP_GAP = 24;
/** Height the graph keeps at the least; below it the stage is too short (or still opening) for fixed room. */
const MIN_GRAPH = 120;

/**
 * How to fit the graph on the stage: keep the toolbar's strip at the top and the title block's strip
 * at the bottom free, measured on the stage. A short stage (a window still opening) gets proportional room.
 */
export function fitOptions(stage: HTMLElement | null, extra: Partial<FitViewOptions> = {}): FitViewOptions {
  const height = stage?.clientHeight ?? 0;
  const stamp = stage?.querySelector<HTMLElement>(".bna-stamp")?.offsetHeight ?? 0;
  const bottom = stamp + STAMP_GAP;
  const padding = (height < TOOLBAR_ROOM + bottom + MIN_GRAPH)
    ? { top: "10%", right: "6%", bottom: "30%", left: "6%" } as const
    : { top: `${TOOLBAR_ROOM}px`, right: `${SIDE_ROOM}px`, bottom: `${bottom}px`, left: `${SIDE_ROOM}px` } as const;
  return { padding, maxZoom: 1, minZoom: 0.7, ...extra };
}
