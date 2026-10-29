import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { BnaFlowEdge } from "./flow-mapping";

export const ARROW_MARKER_ID = "bna-arrow";

/** Arrowhead shared by every wire; rendered once next to the canvas. */
export function ArrowMarker() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          className="bna-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 1 L9 5 L0 9 z" />
        </marker>
      </defs>
    </svg>
  );
}

/** An orthogonal drafting line; during a test run the taken wires carry a travelling pulse. */
export function DraftEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data
}: EdgeProps<BnaFlowEdge>) {
  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 6, offset: 18
  });
  const status = data?.status ?? null;
  return (
    <g className="bna-edge" data-pin={data?.pin} data-status={status ?? undefined}>
      <BaseEdge id={id} path={path} markerEnd={`url(#${ARROW_MARKER_ID})`} />
      {(status === "taken") ? (
        <circle r="3.5" className="bna-edge__pulse">
          <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
        </circle>
      ) : null}
    </g>
  );
}
