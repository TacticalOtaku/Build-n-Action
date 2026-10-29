import type { SimulationOption, SimulatorHost } from "../host";

export interface Subjects {
  actors: readonly SimulationOption[];
  targets: readonly SimulationOption[];
}

/**
 * The Test tab's subject lists as an external store: read from the host once per revision, so a render does not
 * walk the world's actors and tokens again. A host without revisions is read once.
 */
export function subjectStore(simulator: SimulatorHost): {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Subjects;
} {
  let cached: { revision: number; subjects: Subjects } | null = null;
  return {
    subscribe: listener => simulator.subscribe?.(listener) ?? (() => undefined),
    getSnapshot: () => {
      const revision = simulator.revision?.() ?? 0;
      if (cached?.revision !== revision) cached = { revision, subjects: { actors: simulator.actors(), targets: simulator.targets() } };
      return cached.subjects;
    }
  };
}
