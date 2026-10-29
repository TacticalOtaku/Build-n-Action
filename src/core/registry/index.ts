import { CHECKS, CONDITION_NODE_FIELDS } from "./checks";
import { CONDITION_NODE_TYPE, type NodeKind } from "./constants";
import { EVENTS } from "./events";
import { COMMON_RESULT_FIELDS, RESULTS, ROLL_RESULT_TYPES } from "./results";
import type { CheckDefinition, EventDefinition, ResultDefinition } from "./types";

const EVENT_MAP = new Map<string, EventDefinition>(EVENTS.map(definition => [definition.type, definition]));
const CHECK_MAP = new Map<string, CheckDefinition>(CHECKS.map(definition => [definition.type, definition]));
const RESULT_MAP = new Map<string, ResultDefinition>(RESULTS.map(definition => [definition.type, definition]));

export function getEvent(type: string): EventDefinition | undefined {
  return EVENT_MAP.get(type);
}

export function getCheck(type: string): CheckDefinition | undefined {
  return CHECK_MAP.get(type);
}

export function getResult(type: string): ResultDefinition | undefined {
  return RESULT_MAP.get(type);
}

/** Whether a node of this kind and type can exist. */
export function hasDefinition(kind: NodeKind, type: string): boolean {
  switch (kind) {
    case "event": return EVENT_MAP.has(type);
    case "condition": return type === CONDITION_NODE_TYPE;
    case "result": return RESULT_MAP.has(type);
  }
}

export { CHECKS, COMMON_RESULT_FIELDS, CONDITION_NODE_FIELDS, EVENTS, RESULTS, ROLL_RESULT_TYPES };
