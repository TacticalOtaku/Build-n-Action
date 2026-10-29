import { useSyncExternalStore } from "react";
import type { BlueprintSource } from "../../core/blueprint/types";
import { useHost } from "../services";

const NONE: readonly BlueprintSource[] = [];
const NO_SUBSCRIPTION = () => () => {};

/** The host library's entries, re-rendering when they change; empty without a library. */
export function useLibrary(): readonly BlueprintSource[] {
  const { library } = useHost();
  return useSyncExternalStore(library?.subscribe ?? NO_SUBSCRIPTION, () => library?.entries() ?? NONE);
}
