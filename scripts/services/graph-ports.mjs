export const GRAPH_TYPES = new Set(['condition', 'context', 'and', 'or', 'not', 'result', 'branch', 'xor', 'nand', 'nor']);
export const BINARY_TYPES = new Set(['xor', 'nand', 'nor']);
export const CONTEXT_PREDICATES = ['inCombat', 'hasTarget', 'hasItem'];
export const outputPort = edge => edge.fromPort ?? 'out';
export const inputPort = edge => edge.toPort ?? 'in';
export function inputPorts(node) {
  if (['condition', 'context'].includes(node.type)) return [];
  return BINARY_TYPES.has(node.type) ? ['a', 'b'] : ['in'];
}
export function outputPorts(node) { return node.type === 'result' ? [] : node.type === 'branch' ? ['true', 'false'] : ['out']; }
export function portY(node, port) { return ['a','true'].includes(port) ? 100 : ['b','false'].includes(port) ? 128 : 114; }

/** Presence checks use the supplied roll context, never stale global user targets. */
export function evaluateContextCondition(node, subjects = {}, {combatActive} = {}) {
  if (node.predicate === 'hasTarget') return !!subjects.target?.actor;
  if (node.predicate === 'hasItem') return !!subjects.item;
  if (node.predicate === 'inCombat') return typeof combatActive === 'boolean' ? combatActive : null;
  return null;
}
