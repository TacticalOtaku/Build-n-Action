import {MODULE} from "../constants.mjs";
import fields from "../fields/_module.mjs";
import {getCollection} from "../services/bonus-repository.mjs";
import {upsertStoredBonus} from "../services/bonus-storage.mjs";
import {createConditionGraph, validateConditionGraph, evaluateConditionGraph} from "../services/condition-graph.mjs";
import {BlueprintHistory, connectNodes, removeNode, fitGraph, graphPoint, freeNodePosition, connectionPath, NODE_WIDTH, NODE_HEIGHT} from "../services/blueprint-state.mjs";
import {evaluateTrialCondition} from "../services/blueprint-trial.mjs";
import {getConditionHelp} from "../services/condition-help.mjs";
import {GRAPH_TYPES, CONTEXT_PREDICATES, inputPorts, outputPorts, inputPort, outputPort, portY, evaluateContextCondition} from '../services/graph-ports.mjs';
import KeysDialog from "./keys-dialog.mjs";
import {ElementalEffects} from '../services/elemental-effects.mjs';

const t = key => game.i18n.localize(`BUILD_N_ACTION.Blueprint.${key}`);
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const icon = type => ({condition: "filter", context: 'crosshairs', branch: 'code-branch', xor: 'not-equal', nand: 'ban', nor: 'ban', and: "code-branch", or: "shuffle", not: "ban", result: "bolt"}[type] ?? "circle-question");
const configured = bonus => Object.keys(bonus.filters).filter(id => fields[id]?.storage(bonus));
const json = value => JSON.stringify(value);

/** Detached graph draft: all document writes happen at the explicit Save boundary. */
export default class ConditionBlueprint extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "blueprint"], tag: "form",
    window: {icon: "fa-solid fa-diagram-project", resizable: true},
    form: {handler: () => {}, submitOnChange: false, closeOnSubmit: false},
    position: {width: 1240, height: 820},
    actions: {keysDialog: this.onKeys, deleteFilter: this.onDeleteFilter}
  };
  static PARTS = {editor: {template: `modules/${MODULE.ID}/templates/condition-blueprint.hbs`}};

  constructor({bonus, ...options}) {
    super({...options, id: `bna-blueprint-${bonus.uuid.replaceAll(".", "-")}`});
    this.owner = bonus.parent;
    this.bonusId = bonus.id;
    this.BonusClass = bonus.constructor;
    this.baseline = json(bonus.toObject());
    this.draft = new this.BonusClass(bonus.toObject(), {parent: this.owner});
    const stored = bonus.conditionGraph;
    const readable = stored?.version === 1 && Array.isArray(stored.nodes) && stored.nodes.length <= 256 && stored.nodes.every(n => n && typeof n.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(n.id) && GRAPH_TYPES.has(n.type)) && Array.isArray(stored.edges) && stored.edges.length <= 1024 && stored.edges.every(e => e && typeof e.from === "string" && typeof e.to === "string");
    this.graph = structuredClone(readable
      ? stored : createConditionGraph(configured(bonus)));
    this.graph.enabled = true;
    this.graph.nodes.forEach((node, index) => { node.x = Number.isFinite(node.x) ? node.x : 40; node.y = Number.isFinite(node.y) ? node.y : 30 + index * 140; });
    this.unsupported = !!stored && !readable;
    this.history = new BlueprintHistory(this.snapshot());
    this.saved = stored?.enabled ? json(this.snapshot()) : null;
    this.view = {x: 45, y: 60, scale: 1};
    this.selected = this.graph.nodes.find(n => n.type === "result")?.id;
    this.trialContext = {actor: bonus.actor?.id ?? "", item: bonus.item?.id ?? "", activity: "", target: game.user.targets?.first?.()?.id ?? ""};
  }

  get title() { return `${t("Title")}: ${this.draft.name}`; }
  get dirty() { return json(this.snapshot()) !== this.saved; }
  snapshot() { return {graph: this.graph, filters: this.draft.toObject().filters}; }
  get editable() { return !!this.owner.isOwner && !this.saving; }
  async _prepareContext() {
    return {name: this.draft.name, gates: ["and", "or", "not", 'branch', 'xor', 'nand', 'nor'].map(type => ({type, label: t(type), hint: t(`${type}Hint`)}))};
  }

  _onRender(...args) {
    super._onRender(...args);
    this.effects?.destroy();
    this.effects = null;
    this.listeners?.abort();
    this.listeners = new AbortController();
    const options = {signal: this.listeners.signal};
    this.element.addEventListener("submit", event => event.preventDefault(), options);
    this.element.addEventListener("click", event => {
      const button = event.target.closest("[data-bp-action]");
      if (button) { event.preventDefault(); this.action(button.dataset.bpAction, button).catch(err => this.showError(err)); }
    }, options);
    this.element.addEventListener("change", event => {
      if (event.target.closest("[data-bp-inspector]")) {
        event.stopPropagation();
        this.readParameters();
      }
      const context = event.target.dataset.bpContext;
      if (context) {
        this.trialContext[context] = event.target.value;
        if (context === "actor") { this.trialContext.item = ""; this.trialContext.activity = ""; }
        if (context === "item") this.trialContext.activity = "";
        this.clearTrial(); this.renderGraph(); this.renderDiagnostics(); this.renderTrialContext();
      }
    }, options);
    this.element.querySelector("[data-bp-search]").addEventListener("input", () => this.renderCatalog(), options);
    this.element.addEventListener("keydown", event => this.onKey(event), options);
    const canvas = this.element.querySelector("[data-bp-canvas]");
    canvas.addEventListener("pointerdown", event => this.onPointerDown(event), options);
    canvas.addEventListener("wheel", event => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1, {x: event.clientX - rect.left, y: event.clientY - rect.top});
    }, {...options, passive: false});
    this.renderCatalog(); this.renderGraph(); this.renderInspector(); this.renderDiagnostics(); this.renderTrialContext();
    this.effects = new ElementalEffects(this.element);
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.autoFit ? this.fit() : this.applyView());
    this.resizeObserver.observe(canvas);
    if (!this.fitted) { this.fit(); this.fitted = true; }
  }

  readParameters() {
    if (!this.editable) return;
    const node = this.graph.nodes.find(n => n.id === this.selected);
    if (node?.type !== "condition") return;
    try {
      const form = new foundry.applications.ux.FormDataExtended(this.element);
      const changes = foundry.utils.expandObject(form.object).filters;
      if (!changes || !Object.hasOwn(changes, node.filter)) return;
      this.draft.updateSource({filters: changes});
      this.parameterError = null;
      this.commit();
      // Rebuild dependent field choices after validation without losing graph viewport.
      this.renderInspector();
    } catch (err) {
      this.parameterError = {nodeId: node.id, message: String(err.message ?? err)};
      this.renderDiagnostics();
    }
  }

  commit() {
    this.history.push(this.snapshot()); this.clearTrial();
    this.renderGraph(); this.renderDiagnostics(); this.renderCatalog();
  }

  restore(snapshot) {
    this.connecting = null;
    this.graph = snapshot.graph;
    this.draft = new this.BonusClass({...this.draft.toObject(), filters: snapshot.filters}, {parent: this.owner});
    this.parameterError = null; this.clearTrial();
    this.renderGraph(); this.renderInspector(); this.renderDiagnostics(); this.renderCatalog();
  }

  label(node) {
    if (node.type === 'context') return t(node.predicate);
    if (node.type !== "condition") return t(node.type);
    return Object.hasOwn(this.draft.filters, node.filter) ? this.draft.schema.getField(`filters.${node.filter}`).label : node.filter;
  }

  renderCatalog() {
    const search = this.element.querySelector("[data-bp-search]").value.toLocaleLowerCase();
    const entries = Object.keys(this.draft.filters).map(id => ({id, label: this.draft.schema.getField(`filters.${id}`).label})).sort((a, b) => a.label.localeCompare(b.label));
    this.element.querySelector("[data-bp-catalog]").innerHTML = entries.filter(entry => `${entry.label} ${entry.id}`.toLocaleLowerCase().includes(search)).map(entry => {
      const present = this.graph.nodes.some(node => node.filter === entry.id);
      return `<button type="button" class="bna-catalog-entry" data-bp-action="add" data-type="condition" data-filter="${escape(entry.id)}" title="${escape(getConditionHelp(entry.id).description)}"><i class="fa-solid fa-${present ? "check" : "plus"}" aria-hidden="true"></i><span>${escape(entry.label)}</span></button>`;
    }).join("") || `<p class="hint">${escape(t("SearchEmpty"))}</p>`;
    this.element.querySelector('[data-bp-catalog]').insertAdjacentHTML('afterbegin', CONTEXT_PREDICATES.filter(id => `${t(id)} ${id}`.toLocaleLowerCase().includes(search)).map(id => `<button type="button" class="bna-catalog-entry" data-bp-action="add" data-type="context" data-predicate="${id}" title="${escape(t(`${id}Hint`))}"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i><span>${escape(t(id))}</span></button>`).join(''));
  }

  renderPorts(node, direction) {
    const ports = direction === 'in' ? inputPorts(node) : outputPorts(node);
    return ports.map(port => {
      const label = ['true','false'].includes(port) ? t(port === 'true' ? 'Yes' : 'No') : ['a','b'].includes(port) ? port.toUpperCase() : t(direction === 'in' ? 'Input' : 'Output');
      const active = this.connecting?.id === node.id && this.connecting?.port === port;
      return `<button type="button" class="bna-port bna-port-${direction} ${active ? 'connecting' : ''}" style="top:${portY(node, port) - 9}px" data-bp-action="${direction === 'in' ? 'portIn' : 'portOut'}" data-id="${escape(node.id)}" data-port="${port}" aria-label="${escape(t(direction === 'in' ? 'Input' : 'Output'))}: ${escape(this.label(node))} · ${escape(label)}"><span>${escape(label)}</span></button>`;
    }).join('');
  }

  renderGraph() {
    const element = [...(this.draft.bonuses?.damageType ?? [])][0] ?? "";
    const traces = new Map((this.trial?.trace ?? []).map(item => [item.nodeId, item]));
    this.element.querySelector("[data-bp-nodes]").innerHTML = this.graph.nodes.map(node => {
      const trace = traces.get(node.id);
      const status = trace?.status ?? "";
      const health=this.draft.filters.healthPercentages;
      const effect=node.type==='result' ? element : node.type==='condition' && node.filter==='healthPercentages' && [0,1].includes(health?.type) ? (health.type===0 ? 'health-low' : 'health-high') : '';
      return `<article class="bna-node ${this.selected === node.id ? "selected" : ""}" data-node-id="${escape(node.id)}" data-type="${escape(node.type)}" data-element="${escape(effect)}" data-health="${Number(health?.value ?? 50)}" data-trace="${escape(status)}" style="transform:translate(${Number(node.x) || 0}px,${Number(node.y) || 0}px)" tabindex="0" aria-label="${escape(this.label(node))}">
        ${this.renderPorts(node, 'in')}
        <div class="bna-node-heading"><i class="fa-solid fa-${icon(node.type)}" aria-hidden="true"></i><span>${escape(t(node.type === "condition" ? "Condition" : "Logic"))}</span>${trace ? `<span class="bna-node-trace">${escape(t(status[0]?.toUpperCase() + status.slice(1)))}</span>` : ""}</div>
        <strong title="${escape(this.label(node))}">${escape(this.label(node))}</strong><small title="${escape(node.type === 'context' ? t(`${node.predicate}Hint`) : '')}">${escape(node.type === "result" ? this.draft.bonuses?.bonus || t("ResultHint") : node.type === "condition" ? this.conditionSummary(node.filter) : t(`${node.type === 'context' ? node.predicate : node.type}Hint`))}</small>
        ${this.renderPorts(node, 'out')}
      </article>`;
    }).join("");
    this.drawEdges(); this.applyView(); this.effects?.refresh();
  }

  conditionSummary(id) {
    if (!configured(this.draft).includes(id)) return t("Parameters");
    const value = this.draft.toObject().filters[id];
    return (Array.isArray(value) ? value.map(v => typeof v === "object" ? Object.values(v).join(" ") : v).join(" · ") : typeof value === "object" ? Object.values(value).map(v => Array.isArray(v) ? v.join(", ") : v).join(" · ") : String(value)).slice(0, 90);
  }

  drawEdges() {
    const nodes = new Map(this.graph.nodes.map(node => [node.id, node]));
    this.element.querySelector("[data-bp-edges]").innerHTML = this.graph.edges.map(edge => {
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) return "";
      const path = connectionPath(nodes.get(edge.from), nodes.get(edge.to), edge);
      return `<path class="bna-edge ${this.selected === edge.from || this.selected === edge.to ? "selected" : ""}" d="${path}" />`;
    }).join("");
  }

  renderInspector() {
    const container = this.element.querySelector("[data-bp-inspector]");
    const node = this.graph.nodes.find(n => n.id === this.selected);
    if (!node) { container.innerHTML = `<h3>${escape(t("Inspector"))}</h3><p class="hint">${escape(t("SelectNode"))}</p>`; return; }
    const help = node.type === "condition" && Object.hasOwn(this.draft.filters, node.filter) ? getConditionHelp(node.filter) : {description: t(node.type === "result" ? "ResultHint" : node.type === "condition" ? "FilterError" : `${node.type === 'context' ? node.predicate : node.type}Hint`)};
    let parameters = "";
    try { if (node.type === "condition") parameters = fields[node.filter]?.render(this.draft) ?? ""; }
    catch (err) { parameters = `<p class="bna-error">${escape(t("FilterError"))}: ${escape(err.message)}</p>`; }
    const links = this.graph.edges.map((edge, index) => ({edge, index})).filter(({edge}) => edge.from === node.id || edge.to === node.id);
    container.innerHTML = `<div class="bna-inspector-title"><i class="fa-solid fa-${icon(node.type)}" aria-hidden="true"></i><div><span>${escape(t("Inspector"))}</span><h3>${escape(this.label(node))}</h3></div></div>
      <p>${escape(help.description)}</p>${help.example ? `<div class="bna-help-example"><strong>${escape(t("Example"))}</strong><p>${escape(help.example)}</p></div><p class="bna-help-context"><strong>${escape(t("Context"))}</strong> ${escape(help.context)}</p>` : ""}
      ${node.type === "condition" ? `<div class="bna-blueprint-parameters">${parameters}</div><p class="hint">${escape(t("SharedFilterHint"))}</p>${fields[node.filter]?.repeatable ? `<button type="button" data-bp-action="repeat">${escape(t("AddRepeat"))}</button>` : ""}` : ""}
      <h4>${escape(t("Connections"))}</h4><div class="bna-connections">${links.map(({edge, index}) => `<div><span>${escape(this.connectionLabel(edge, node))}</span><button type="button" data-bp-action="disconnect" data-index="${index}" title="${escape(t("Disconnect"))}" aria-label="${escape(t("Disconnect"))}: ${escape(this.connectionLabel(edge, node))}"><i class="fa-solid fa-link-slash" aria-hidden="true"></i></button></div>`).join("") || `<p class="hint">${escape(t("NoConnections"))}</p>`}</div>
      ${node.type !== "result" ? `<button type="button" class="bna-remove-node" data-bp-action="remove"><i class="fa-solid fa-trash" aria-hidden="true"></i> ${escape(t("Remove"))}</button>` : ""}`;
    if (!this.editable) container.querySelectorAll("input,select,textarea,button").forEach(input => input.disabled = true);
  }

  connectionLabel(edge, node) {
    const other = this.graph.nodes.find(n => n.id === (edge.from === node.id ? edge.to : edge.from));
    const portLabel = port => ({true:t('Yes'), false:t('No'), in:t('Input'), out:t('Output')}[port] ?? port.toUpperCase());
    return `${other ? this.label(other) : '?'} · ${portLabel(outputPort(edge))} → ${portLabel(inputPort(edge))}`;
  }

  validation() {
    const report = validateConditionGraph(this.graph, {knownFilters: Object.keys(this.draft.filters), configuredFilters: configured(this.draft)});
    if (this.unsupported) report.issues.push({code: "UnsupportedGraph", severity: "error"});
    if (this.parameterError) report.issues.push({code: "FilterError", severity: "error", ...this.parameterError});
    // Repeated comparisons can be structurally present yet contain blank operands.
    for (const node of this.graph.nodes) {
      if (node.filter === "arbitraryComparisons" && this.draft.filters.arbitraryComparisons.some(v => !v.one?.trim() || !v.other?.trim())) report.issues.push({nodeId: node.id, code: "FilterError", severity: "error"});
    }
    report.valid = !report.issues.some(i => i.severity === "error");
    return report;
  }

  renderDiagnostics() {
    const report = this.validation();
    this.element.querySelector("[data-bp-diagnostics]").innerHTML = report.issues.map(issue => {
      const node = this.graph.nodes.find(n => n.id === issue.nodeId);
      const key = `BUILD_N_ACTION.Blueprint.Issues.${issue.code}`;
      const message = game.i18n.has?.(key) ? game.i18n.localize(key) : t(issue.code) !== `BUILD_N_ACTION.Blueprint.${issue.code}` ? t(issue.code) : issue.code;
      return `<button type="button" class="bna-diagnostic ${issue.severity}" data-bp-action="focus" data-id="${escape(issue.nodeId ?? "")}"><i class="fa-solid fa-${issue.severity === "error" ? "circle-exclamation" : "triangle-exclamation"}" aria-hidden="true"></i><span>${node ? `${escape(this.label(node))}: ` : ""}${escape(message)}${issue.message ? ` — ${escape(issue.message)}` : ""}</span></button>`;
    }).join("") || `<p class="bna-valid"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${escape(t("Valid"))}</p>`;
    this.element.querySelector("[data-bp-issue-count]").textContent = report.issues.length || "";
    this.element.querySelector("[data-bp-validity]").textContent = report.valid ? "✓" : report.issues.length;
    this.element.querySelector('[data-bp-action="save"]').disabled = !report.valid || !this.editable || this.saving;
    this.element.querySelector('[data-bp-action="undo"]').disabled = !this.history.canUndo;
    this.element.querySelector('[data-bp-action="redo"]').disabled = !this.history.canRedo;
    this.element.querySelector(".bna-blueprint-workspace").inert = !!this.saving;
    this.element.querySelector("[data-bp-status]").textContent = this.dirty ? t("Unsaved") : t("Saved");
    const invalid = new Set(report.issues.filter(i => i.severity === "error").map(i => i.nodeId));
    this.element.querySelectorAll("[data-node-id]").forEach(node => node.classList.toggle("invalid", invalid.has(node.dataset.nodeId)));
  }

  async action(action, button) {
    const editableActions = new Set(["add", "repeat", "remove", "disconnect", "portIn", "portOut", "undo", "redo", "save"]);
    if (editableActions.has(action) && !this.editable) throw Error(t("PermissionDenied"));
    if (action === "save") return this.save();
    if (action === "fit") return this.fit();
    if (action === "zoomIn" || action === "zoomOut") return this.zoom(action === "zoomIn" ? 1.2 : 1 / 1.2);
    if (action === "undo" || action === "redo") return this.restore(this.history[action]());
    if (action === "validate") { this.renderDiagnostics(); this.element.querySelector(".bna-blueprint-diagnostics").open = true; return; }
    if (action === "trial") return this.runTrial();
    if (action === "focus") return this.select(button.dataset.id, true);
    if (action === "portOut") { this.connecting = this.connecting?.id === button.dataset.id && this.connecting?.port === button.dataset.port ? null : {id:button.dataset.id,port:button.dataset.port}; this.renderGraph(); return; }
    if (action === "portIn") {
      if (this.connecting && connectNodes(this.graph, this.connecting.id, button.dataset.id, this.connecting.port, button.dataset.port)) { this.connecting = null; this.commit(); this.renderInspector(); }
      return;
    }
    if (action === "add") {
      if (button.dataset.type === "condition") {
        const existing = this.graph.nodes.find(n => n.filter === button.dataset.filter);
        if (existing) return this.select(existing.id, true);
      }
      const canvas = this.element.querySelector("[data-bp-canvas]");
      const center = graphPoint({x: canvas.clientWidth / 2, y: canvas.clientHeight / 2}, this.view);
      const point = freeNodePosition(this.graph.nodes, {x: center.x - NODE_WIDTH / 2, y: center.y - NODE_HEIGHT / 2});
      const node = {id: foundry.utils.randomID(), type: button.dataset.type, x: Math.round(point.x), y: Math.round(point.y)};
      if (node.type === 'context') node.predicate = button.dataset.predicate;
      if (node.type === "condition") {
        node.filter = button.dataset.filter;
        if (fields[node.filter].repeatable && !this.draft.filters[node.filter].length) this.draft.updateSource({filters: {[node.filter]: [{}]}});
      }
      this.graph.nodes.push(node); this.selected = node.id; this.fit();
    }
    if (action === "remove") {
      const node = this.graph.nodes.find(n => n.id === this.selected);
      if (node && removeNode(this.graph, node.id)) {
        if (node.filter) {
          const source = this.draft.toObject(); delete source.filters[node.filter];
          this.draft = new this.BonusClass(source, {parent: this.owner});
        }
        this.selected = null;
      }
    }
    if (action === "disconnect") this.graph.edges.splice(Number(button.dataset.index), 1);
    if (action === "repeat") {
      const node = this.graph.nodes.find(n => n.id === this.selected);
      const values = this.draft.toObject().filters[node.filter]; values.push({});
      this.draft.updateSource({filters: {[node.filter]: values}});
    }
    this.parameterError = null; this.commit(); this.renderInspector();
  }

  select(id, center = false) {
    this.selected = id; this.renderGraph(); this.renderInspector(); this.renderDiagnostics();
    const node = this.graph.nodes.find(n => n.id === id);
    if (center && node) {
      const canvas = this.element.querySelector("[data-bp-canvas]");
      this.view.x = canvas.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * this.view.scale;
      this.view.y = canvas.clientHeight / 2 - (node.y + NODE_HEIGHT / 2) * this.view.scale;
      this.applyView();
    }
  }

  onPointerDown(event) {
    if (event.target.closest("button")) return;
    if (![0, 1].includes(event.button)) return;
    const canvas = this.element.querySelector("[data-bp-canvas]");
    const target = event.target.closest("[data-node-id]");
    const node = event.button === 0 && target ? this.graph.nodes.find(n => n.id === target.dataset.nodeId) : null;
    if (node) { this.selected = node.id; this.renderInspector(); canvas.querySelectorAll("[data-node-id]").forEach(el => el.classList.toggle("selected", el.dataset.nodeId === node.id)); }
    if (node && !this.editable) return;
    event.preventDefault(); canvas.focus();
    this.autoFit = false;
    const start = {x: event.clientX, y: event.clientY, nx: node?.x ?? this.view.x, ny: node?.y ?? this.view.y};
    canvas.setPointerCapture(event.pointerId);
    let moved = false;
    const move = current => {
      const dx = current.clientX - start.x, dy = current.clientY - start.y;
      moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      if (node) {
        node.x = Math.round(start.nx + dx / this.view.scale); node.y = Math.round(start.ny + dy / this.view.scale);
        target.style.transform = `translate(${node.x}px,${node.y}px)`; this.drawEdges();
      } else { this.view.x = start.nx + dx; this.view.y = start.ny + dy; this.applyView(); }
    };
    const end = () => {
      canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", end); canvas.removeEventListener("pointercancel", end);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (node && moved) this.commit(); else if (node) { this.renderGraph(); this.renderDiagnostics(); }
    };
    canvas.addEventListener("pointermove", move, {signal: this.listeners.signal});
    canvas.addEventListener("pointerup", end, {signal: this.listeners.signal});
    canvas.addEventListener("pointercancel", end, {signal: this.listeners.signal});
  }

  onKey(event) {
    if (event.target.closest("input,select,textarea,[contenteditable=true]")) return;
    if (event.target.closest('button') && ['Enter',' '].includes(event.key)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (this.editable) this.restore(this.history[event.shiftKey ? "redo" : "undo"]()); }
    if (event.key === "Escape") { this.connecting = null; this.renderGraph(); }
    const focused = event.target.closest("[data-node-id]");
    if (focused && ["Enter", " "].includes(event.key)) { event.preventDefault(); this.select(focused.dataset.nodeId); }
    if (event.key === "Delete" && this.selected && this.editable) { event.preventDefault(); this.action("remove", {}).catch(err => this.showError(err)); }
    if (focused && event.key.startsWith("Arrow") && this.editable) {
      event.preventDefault(); const node = this.graph.nodes.find(n => n.id === focused.dataset.nodeId);
      const step = event.shiftKey ? 40 : 10;
      node.x += ({ArrowLeft: -step, ArrowRight: step}[event.key] ?? 0); node.y += ({ArrowUp: -step, ArrowDown: step}[event.key] ?? 0);
      this.commit(); this.element.querySelector(`[data-node-id="${node.id}"]`)?.focus();
    }
  }

  applyView() {
    const world = this.element.querySelector("[data-bp-world]");
    if (!world) return;
    world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.scale})`;
    this.element.querySelector("[data-bp-zoom]").textContent = `${Math.round(this.view.scale * 100)}%`;
  }
  fit() { const canvas = this.element.querySelector("[data-bp-canvas]"); this.autoFit = true; this.view = fitGraph(this.graph, canvas.clientWidth, canvas.clientHeight); this.applyView(); }
  zoom(factor, pivot) {
    this.autoFit = false;
    const canvas = this.element.querySelector("[data-bp-canvas]");
    pivot ??= {x: canvas.clientWidth / 2, y: canvas.clientHeight / 2};
    const point = graphPoint(pivot, this.view);
    this.view.scale = Math.max(.15, Math.min(2.5, this.view.scale * factor));
    this.view.x = pivot.x - point.x * this.view.scale; this.view.y = pivot.y - point.y * this.view.scale; this.applyView();
  }

  renderTrialContext() {
    const values = collection => Array.from(collection?.values?.() ?? collection ?? []);
    const actors = values(game.actors).filter(actor => actor.isOwner || game.user.isGM);
    const actor = actors.find(entry => entry.id === this.trialContext.actor);
    const items = values(actor?.items);
    const item = items.find(entry => entry.id === this.trialContext.item);
    const activities = values(item?.system?.activities);
    const targets = (globalThis.canvas?.tokens?.placeables ?? []).filter(token => token.isVisible && token.actor);
    for (const [key, entries] of Object.entries({actor: actors, item: items, activity: activities, target: targets})) {
      const select = this.element.querySelector(`[data-bp-context="${key}"]`);
      if (!entries.some(entry => entry.id === this.trialContext[key])) this.trialContext[key] = "";
      select.innerHTML = `<option value="">${escape(t("None"))}</option>` + entries.map(entry => `<option value="${escape(entry.id)}" ${entry.id === this.trialContext[key] ? "selected" : ""}>${escape(entry.name)}</option>`).join("");
    }
  }

  runTrial() {
    if (!this.validation().valid) { this.renderDiagnostics(); return; }
    const actor = game.actors.get(this.trialContext.actor);
    const item = actor?.items.get(this.trialContext.item);
    const activity = item?.system.activities.get(this.trialContext.activity);
    const target = globalThis.canvas?.tokens?.get(this.trialContext.target) ?? null;
    const registry = game.modules.get(MODULE.ID).api.filters;
    const reasons = new Map();
    this.trial = evaluateConditionGraph(this.graph, node => {
      if (node.type === 'context') return evaluateContextCondition(node, {actor, item, activity, target}, {combatActive: !!game.combat?.started});
      const evaluation = evaluateTrialCondition(node.filter, this.draft, registry, {actor, item, activity, target});
      if (evaluation.reason) reasons.set(node.id, evaluation.reason);
      return evaluation.result;
    });
    const result = this.element.querySelector("[data-bp-trial-result]");
    result.innerHTML = `<strong>${escape(t(this.trial.result === true ? "Pass" : this.trial.result === false ? "Fail" : "Unknown"))}</strong>` + this.trial.trace.map(trace => {
      const node = this.graph.nodes.find(n => n.id === trace.nodeId);
      return `<button type="button" class="bna-trial-row" data-bp-action="focus" data-id="${escape(trace.nodeId)}"><span>${escape(node ? this.label(node) : trace.nodeId)}</span><span>${escape(t(trace.status[0].toUpperCase() + trace.status.slice(1)))}${reasons.has(trace.nodeId) ? ` — ${escape(t(reasons.get(trace.nodeId)))}` : ""}</span></button>`;
    }).join("");
    this.renderGraph(); this.renderDiagnostics();
  }
  clearTrial() { this.trial = null; const result = this.element?.querySelector("[data-bp-trial-result]"); if (result) result.replaceChildren(); }

  async save() {
    if (this.saving) return;
    if (!this.editable) throw Error(t("PermissionDenied"));
    if (!this.validation().valid) { this.renderDiagnostics(); return; }
    const current = getCollection(this.owner).get(this.bonusId);
    if (!current || json(current.toObject()) !== this.baseline) throw Error(t("Conflict"));
    this.saving = true; this.renderDiagnostics();
    try {
      const data = this.draft.toObject(); data.conditionGraph = structuredClone(this.graph);
      await upsertStoredBonus(this.owner, this.bonusId, data);
      this.draft = new this.BonusClass(data, {parent: this.owner});
      this.baseline = json(this.draft.toObject()); this.saved = json(this.snapshot());
      const sheet = foundry.applications.instances.get(`build-n-action-bonus-${current.uuid.replaceAll(".", "-")}`);
      if (sheet) { sheet._filters = new Set(configured(this.draft)); sheet.render({force: true}); }
    } finally { this.saving = false; this.renderDiagnostics(); }
  }
  showError(err) { ui.notifications.error(`${t("SaveError")}: ${err.message ?? err}`); }

  static async onKeys(event, button) {
    if (!this.editable) return;
    const field = fields[button.dataset.id];
    const property = button.dataset.property;
    const values = foundry.utils.getProperty(this.draft, property);
    const list = field.choices().map(entry => ({...entry, include: values.has(entry.value), exclude: values.has(`!${entry.value}`)}));
    await KeysDialog.prompt({filterId: button.dataset.id, values: list, canExclude: field.canExclude, ok: {
      label: "BUILD_N_ACTION.KeysDialogApplySelection", icon: "fa-solid fa-check",
      callback: (_event, submit) => {
        const selected = Array.from(submit.form.querySelectorAll(".table .select select")).flatMap(select => select.value === "include" ? [select.dataset.value] : select.value === "exclude" ? [`!${select.dataset.value}`] : []);
        this.draft.updateSource(foundry.utils.expandObject({[property]: selected})); this.commit(); this.renderInspector();
      }
    }});
  }
  static onDeleteFilter(event, button) {
    if (!this.editable) return;
    const node = this.graph.nodes.find(n => n.id === this.selected);
    if (fields[node?.filter]?.repeatable && button.dataset.idx !== undefined) {
      const values = this.draft.toObject().filters[node.filter]; values.splice(Number(button.dataset.idx), 1);
      this.draft.updateSource({filters: {[node.filter]: values}}); this.commit(); this.renderInspector();
    } else this.action("remove", button).catch(err => this.showError(err));
  }

  async close(options = {}) {
    if (this.saving) return this;
    if (this.dirty && !options.force) {
      const discard = await foundry.applications.api.DialogV2.confirm({window: {title: t("Title")}, content: `<p>${escape(t("CloseConfirm"))}</p>`});
      if (!discard) return this;
    }
    this.effects?.destroy(); this.listeners?.abort(); this.resizeObserver?.disconnect();
    return super.close(options);
  }
}
