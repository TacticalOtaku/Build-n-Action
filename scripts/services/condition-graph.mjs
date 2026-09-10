import {GRAPH_TYPES as TYPES, BINARY_TYPES, CONTEXT_PREDICATES, inputPorts, outputPorts, inputPort, outputPort} from './graph-ports.mjs';
const MAX_NODES = 256, MAX_EDGES = 1024;

/** Convert existing conjunctive filters without changing their meaning. */
export function createConditionGraph(filterIds) {
  const filters = [...new Set(filterIds)];
  const nodes = filters.map((filter, i) => ({id: `condition-${i + 1}`, type: "condition", filter, x: 40, y: i * 150 + 30}));
  const edges = [];
  if (filters.length) {
    nodes.push({id: "all", type: "and", x: 350, y: Math.max(30, (filters.length - 1) * 75 + 30)});
    edges.push(...nodes.filter(n => n.type === "condition").map(n => ({from: n.id, to: "all"})), {from: "all", to: "result"});
  }
  nodes.push({id: "result", type: "result", x: filters.length ? 660 : 300, y: Math.max(30, (filters.length - 1) * 75 + 30)});
  return {version: 1, enabled: true, nodes, edges};
}

/** Pure structural validation, including an explicit configured-field contract. */
export function validateConditionGraph(graph, {knownFilters, configuredFilters} = {}) {
  const issues = [];
  const error = (code, nodeId) => issues.push({code, nodeId, severity: "error"});
  const done = () => ({valid: !issues.some(i => i.severity === "error"), issues});
  if (!graph || graph.version !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) { error("Malformed"); return done(); }
  if (graph.nodes.length > MAX_NODES || graph.edges.length > MAX_EDGES) { error("TooLarge"); return done(); }
  const nodes = new Map(), conditionIds = new Set();
  const known = knownFilters === undefined ? null : new Set(knownFilters);
  const configured = configuredFilters === undefined ? null : new Set(configuredFilters);
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(node.id) || !TYPES.has(node.type)) { error("Malformed"); continue; }
    if (nodes.has(node.id)) error("DuplicateNode", node.id);
    nodes.set(node.id, node);
    if (node.type === "context" && !CONTEXT_PREDICATES.includes(node.predicate)) error("UnknownFilter", node.id);
    if (node.type === "condition") {
      if (typeof node.filter !== "string" || !node.filter || (known && !known.has(node.filter))) error("UnknownFilter", node.id);
      if (configured && !configured.has(node.filter)) error("MissingParameters", node.id);
      if (conditionIds.has(node.filter)) error("DuplicateFilter", node.id);
      conditionIds.add(node.filter);
    }
  }
  if (configured) for (const id of configured) if (!conditionIds.has(id)) error("OmittedFilter");
  const results = [...nodes.values()].filter(n => n.type === "result");
  if (results.length !== 1) error("ResultCount");
  const inputs = new Map([...nodes.keys()].map(id => [id, []]));
  const outputs = new Map([...nodes.keys()].map(id => [id, []]));
  const edgeIds = new Set();
  for (const edge of graph.edges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string" || !nodes.has(edge.from) || !nodes.has(edge.to)) { error("DanglingEdge"); continue; }
    const key = `${edge.from}/${outputPort(edge)}/${edge.to}/${inputPort(edge)}`;
    if (edgeIds.has(key)) error("DuplicateEdge", edge.to);
    edgeIds.add(key);
    inputs.get(edge.to).push(edge.from); outputs.get(edge.from).push(edge.to);
    if (!inputPorts(nodes.get(edge.to)).includes(inputPort(edge)) || !outputPorts(nodes.get(edge.from)).includes(outputPort(edge))) error("PortDirection", edge.to);
  }
  for (const node of nodes.values()) {
    const count = inputs.get(node.id).length;
    if (["not", "branch"].includes(node.type) && count !== 1) error("SingleInput", node.id);
    if (BINARY_TYPES.has(node.type) && (count !== 2 || ['a','b'].some(port => graph.edges.filter(e => e?.to === node.id && inputPort(e) === port).length !== 1))) error('BinaryInputs', node.id);
    if (["and", "or"].includes(node.type) && count < 1) error("MissingInput", node.id);
    if (node.type === "result" && count !== 1 && !(nodes.size === 1 && count === 0)) error("SingleInput", node.id);
  }
  // Kahn's algorithm handles imported cycles without recursive stack overflow.
  const degrees = new Map([...inputs].map(([id, incoming]) => [id, incoming.length]));
  const queue = [...degrees].filter(([, degree]) => degree === 0).map(([id]) => id);
  let count = 0;
  while (queue.length) {
    const id = queue.pop(); count++;
    for (const next of outputs.get(id)) { degrees.set(next, degrees.get(next) - 1); if (!degrees.get(next)) queue.push(next); }
  }
  if (count !== nodes.size) for (const [id, degree] of degrees) if (degree > 0) error("Cycle", id);
  if (results.length === 1) {
    const reached = new Set(), stack = [results[0].id];
    while (stack.length) { const id = stack.pop(); if (reached.has(id)) continue; reached.add(id); stack.push(...inputs.get(id)); }
    for (const id of nodes.keys()) if (!reached.has(id)) error("Disconnected", id);
  }
  return done();
}

/** Tri-state evaluation; only strict booleans are accepted from condition callbacks. */
export function evaluateConditionGraph(graph, evaluateCondition, options = {}) {
  const report = validateConditionGraph(graph, options);
  if (!report.valid) return {result: null, trace: [], issues: report.issues};
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const inputs = new Map(graph.nodes.map(n => [n.id, []]));
  for (const edge of graph.edges) inputs.get(edge.to).push(edge);
  const values = new Map(), trace = [];
  const read = edge => { const value = visit(edge.from); return outputPort(edge) === 'false' && value !== null ? !value : value; };
  const visit = id => {
    if (values.has(id)) return values.get(id);
    const node = nodes.get(id), incoming = inputs.get(id);
    let value = null, reason;
    if (["condition", "context"].includes(node.type)) {
      try {
        const evaluated = evaluateCondition(node);
        if (evaluated === true || evaluated === false) value = evaluated;
        else if (evaluated?.then) { evaluated.catch?.(() => {}); reason = "AsyncUnsupported"; }
      } catch { reason = "EvaluationError"; }
    } else if (node.type === "result") value = incoming.length ? read(incoming[0]) : true;
    else if (node.type === "branch") value = read(incoming[0]);
    else if (node.type === "not") { const child = read(incoming[0]); value = child === null ? null : !child; }
    else if (node.type === 'xor') { const a = read(incoming[0]), b = read(incoming[1]); value = a === null || b === null ? null : a !== b; }
    else {
      const isAnd = ['and','nand'].includes(node.type); value = isAnd;
      let unknown = false;
      for (const child of incoming) {
        const next = read(child);
        if (next === null) unknown = true;
        else if (next !== isAnd) { value = next; unknown = false; break; }
      }
      if (unknown) value = null;
      if (['nand','nor'].includes(node.type) && value !== null) value = !value;
    }
    values.set(id, value);
    trace.push({nodeId: id, result: value, status: value === null ? "unknown" : value ? "pass" : "fail", ...(reason ? {reason} : {})});
    return value;
  };
  const result = visit(graph.nodes.find(n => n.type === "result").id);
  for (const node of graph.nodes) if (!values.has(node.id)) trace.push({nodeId: node.id, result: null, status: "skipped"});
  return {result, trace, issues: report.issues};
}
