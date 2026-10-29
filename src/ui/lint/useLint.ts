import { useDeferredValue, useMemo } from "react";
import type { BlueprintSource } from "../../core/blueprint/types";
import { lintBlueprint, type LintIssue } from "../../core/engine/lint";
import { useHost } from "../services";
import { log } from "../../core/log";

/** Lint findings for the blueprint, recomputed after typing settles (the deferred value). */
export function useLint(blueprint: BlueprintSource): LintIssue[] {
  const host = useHost();
  const deferred = useDeferredValue(blueprint);
  return useMemo(() => {
    try {
      return lintBlueprint(deferred, host.lintEnv?.(deferred) ?? {});
    } catch (error) {
      log.warn("the linter failed on this blueprint", error);
      return [];
    }
  }, [deferred, host]);
}
