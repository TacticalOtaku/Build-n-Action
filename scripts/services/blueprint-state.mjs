import {BINARY_TYPES, inputPorts, outputPorts, inputPort, outputPort, portY} from './graph-ports.mjs';
const copy = value => structuredClone(value);
export const NODE_WIDTH = 218;
export const NODE_HEIGHT = 148;

/** Find a nearby free slot, including clearance for connection ports. */
export function freeNodePosition(nodes, preferred) {
  const available = point => nodes.every(node => Math.abs(node.x - point.x) >= NODE_WIDTH + 24 || Math.abs(node.y - point.y) >= NODE_HEIGHT + 24);
  if (available(preferred)) return {...preferred};
  for (let radius = 1; radius <= nodes.length + 1; radius++) {
    for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      if (Math.abs(x) !== radius && Math.abs(y) !== radius) continue;
      const point = {x: preferred.x + x * (NODE_WIDTH + 48), y: preferred.y + y * (NODE_HEIGHT + 40)};
      if (available(point)) return point;
    }
  }
}

/** Bounded, detached history includes filter parameters as well as graph topology. */
export class BlueprintHistory {
  constructor(initial) { this.entries = [copy(initial)]; this.index = 0; }
  get current() { return copy(this.entries[this.index]); }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  push(value) {
    if (JSON.stringify(value) === JSON.stringify(this.entries[this.index])) return;
    this.entries.splice(this.index + 1);
    this.entries.push(copy(value));
    if (this.entries.length > 60) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  undo() { if (this.canUndo) this.index--; return this.current; }
  redo() { if (this.canRedo) this.index++; return this.current; }
}

/** Reject invalid port directions and cycles before changing the graph. */
export function connectNodes(graph, from, to, fromPort = 'out', toPort = 'in') {
  const source = graph.nodes.find(n => n.id === from);
  const target = graph.nodes.find(n => n.id === to);
  if (!source || !target || from === to || !outputPorts(source).includes(fromPort) || !inputPorts(target).includes(toPort)) return false;
  if (graph.edges.some(e => e.from === from && e.to === to && outputPort(e) === fromPort && inputPort(e) === toPort)) return false;
  const visit = [to], seen = new Set();
  while (visit.length) {
    const id = visit.pop();
    if (id === from) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.edges) if (edge.from === id) visit.push(edge.to);
  }
  if (["not", "result", "branch"].includes(target.type) || BINARY_TYPES.has(target.type)) graph.edges = graph.edges.filter(e => e.to !== to || inputPort(e) !== toPort);
  graph.edges.push({from, to, ...(fromPort !== 'out' ? {fromPort} : {}), ...(toPort !== 'in' ? {toPort} : {})});
  return true;
}

export function removeNode(graph, id) {
  const node = graph.nodes.find(n => n.id === id);
  if (!node || node.type === "result") return false;
  graph.nodes = graph.nodes.filter(n => n.id !== id);
  graph.edges = graph.edges.filter(e => e.from !== id && e.to !== id);
  return true;
}

export function fitGraph(graph, width, height) {
  if (!graph.nodes.length || width <= 0 || height <= 0) return {x: 40, y: 40, scale: 1};
  const minX = Math.min(...graph.nodes.map(n => n.x || 0));
  const minY = Math.min(...graph.nodes.map(n => n.y || 0));
  const w = Math.max(...graph.nodes.map(n => n.x || 0)) - minX + NODE_WIDTH;
  const h = Math.max(...graph.nodes.map(n => n.y || 0)) - minY + NODE_HEIGHT;
  const scale = Math.max(.15, Math.min(1, (width - 72) / w, (height - 72) / h));
  return {x: (width - w * scale) / 2 - minX * scale, y: (height - h * scale) / 2 - minY * scale, scale};
}

export function graphPoint(point, view) {
  return {x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale};
}

export function connectionPath(from, to, edge = {}) {
  const x1 = from.x + NODE_WIDTH, y1 = from.y + portY(from, outputPort(edge));
  const x2 = to.x, y2 = to.y + portY(to, inputPort(edge));
  const bend = Math.max(64, Math.abs(x2 - x1) * .5);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}
