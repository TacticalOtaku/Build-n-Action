/** How a node fared in a test run. */
export type NodeRunStatus = "passed" | "failed" | "skipped";

/** What a test run highlights on the canvas; produced by the simulator (Plan 6) or a playground fixture. */
export interface CanvasTrace {
  readonly nodes: Readonly<Record<string, NodeRunStatus>>;
  readonly edges: ReadonlySet<string>;
}
