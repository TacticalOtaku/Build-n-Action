import { $ as resolveCost, A as traitTrees, At as rollDataOf, B as resetCounters, C as pendingRoll, Dt as isDocument, E as takeAfterRoll, Et as documentFromUuid, F as resolveForeign, G as sendTrigger, Gt as randomId, H as performOperations, I as scaledFormula, It as MODULE_SCOPE, J as costState, K as setSaveReceiver, L as simplifyNumber, M as registerAuraPreviews, Mt as listOf, N as modifyFormulaParts, Nt as read, O as loadTraitTrees, Ot as isSuppressed, P as replaceData, Pt as stringList, Q as costScales, R as resolveModifiers, S as resolveRollTarget, St as actorToken, T as rememberAfterRoll, Tt as documentBlueprints, U as registerSocket, V as resolveCounterIntents, W as sendSaveMessage, X as costAvailable, Xt as getResult, Y as payCost, Z as costOptions, _ as guardedAsync, an as counterDef, at as recordUsage, b as recordUsages, c as registerMigrationMenu, cn as counterValue, ct as buildRollFacts, d as activationFor, dn as asRecord, et as sortIntents, f as activationOf, fn as asString, ft as runWithSignals, g as guarded, gt as SETTINGS, h as evaluateEvent, i as createApi, it as countRest, j as withinAura, jt as touchesBlueprints, k as sourceLabel, kt as originRollData, ln as nextCounterValue, m as announceApplied, mt as openEditor, n as foundryTranslator, nt as riderClock, on as counterKey, ot as createRider, p as allowIntents, pn as asStrings, pt as canEdit, q as setTriggerReceiver, r as createPhraseFormatter, rt as useRiders, s as validateIntegrations, sn as counterName, st as matchDisposition, t as foundryChoices, tt as planOperation, u as registerLibrary, un as asNumber, v as makeRoller, vt as registerSettings, w as registerPending, wt as carrierKind, x as rememberActivation, xt as setting, y as midiActivation, z as counterStore } from "./chunks/choices-Cr14sVkw.mjs";
//#region src/runtime/roll-config.ts
function isEntry(roll) {
	return !!roll && typeof roll === "object";
}
function entries(config) {
	return (config.rolls ?? []).filter(isEntry);
}
/** Append an additive part to every roll. */
function appendRollPart(config, part) {
	for (const roll of entries(config)) (roll.parts ??= []).push(part);
}
/**
* Remove dnd5e 5.3 compatibility getters from senses in plain target roll data: reading them
* logs a deprecation when the roll dialog deep-clones its configuration.
*/
function removeLegacySenseAccessors(value, visited = /* @__PURE__ */ new WeakSet()) {
	if (!value || typeof value !== "object" || visited.has(value)) return;
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return;
	visited.add(value);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const ranges = descriptors.ranges;
	const isSenses = !!ranges && "value" in ranges;
	for (const [key, descriptor] of Object.entries(descriptors)) if ("value" in descriptor) removeLegacySenseAccessors(descriptor.value, visited);
	else if (isSenses && descriptor.configurable) delete value[key];
}
/** Make `@target` available to every roll (dnd5e merges its own roll data into these containers later). */
function injectTargetData(config, targetData) {
	removeLegacySenseAccessors(targetData);
	if (config.data && typeof config.data === "object") config.data.target = targetData;
	for (const roll of entries(config)) (roll.data ??= {}).target = targetData;
}
/** A stored number, or the fallback when absent or not a number (0 is kept). */
function numberOr(value, fallback) {
	const number = value === void 0 || value === null ? NaN : Number(value);
	return Number.isFinite(number) ? number : fallback;
}
/** Widen the critical range by `success` and the fumble range by `failure` on every roll. */
function adjustCriticalRanges(config, success, failure, allowFailureBelowOne) {
	for (const roll of entries(config)) {
		const options = roll.options ??= {};
		options.criticalSuccess = Math.max(1, numberOr(options.criticalSuccess, 20) - success);
		let fumble = numberOr(options.criticalFailure, 1) + failure;
		if (fumble < 1 && !allowFailureBelowOne) fumble = 1;
		options.criticalFailure = fumble;
	}
}
/** Lower a save's target by `targetBonus`; for death saves also widen the critical success range. */
function adjustSavingThrowRanges(config, targetBonus, criticalBonus, isDeath) {
	if (Number.isFinite(Number(config.target))) config.target = Number(config.target) - targetBonus;
	if (!isDeath) return;
	for (const roll of entries(config)) {
		const options = roll.options ??= {};
		const critical = Math.max(1, numberOr(options.criticalSuccess, 20) - criticalBonus);
		options.criticalSuccess = critical;
		if (Number.isFinite(Number(config.target))) config.target = Math.min(critical, Number(config.target));
	}
}
function joinFormula(current, addition) {
	if (!addition) return current;
	return current ? `${current} + ${addition}` : addition;
}
function typesOf(roll) {
	const types = roll.options?.types;
	return Array.isArray(types) ? types : [];
}
/**
* Add a damage bonus: untyped bonuses join the first roll, a single type joins a roll of that
* type, and anything else becomes its own roll carrying the bonus's types.
*/
function appendDamagePart(config, formula, types, rollData) {
	const rolls = entries(config);
	const first = rolls[0];
	let roll;
	if (!types.length) roll = first;
	else if (types.length === 1) roll = rolls.find((candidate) => typesOf(candidate).includes(types[0]));
	if (roll) {
		(roll.parts ??= []).push(formula);
		return;
	}
	const properties = first?.options?.properties;
	(config.rolls ??= []).push({
		data: rollData,
		parts: [formula],
		options: {
			properties: Array.isArray(properties) ? [...properties] : [],
			type: types[0],
			types: [...types]
		}
	});
}
/** Add extra critical dice and critical damage. */
function addCriticalBonus(config, dice, damage) {
	const critical = config.critical ??= {};
	critical.bonusDice = (critical.bonusDice ?? 0) + dice;
	critical.bonusDamage = joinFormula(critical.bonusDamage ?? "", damage);
}
/** Clamp extra critical dice at 0 and drop critical damage that is not a valid formula. */
function sanitizeCritical(config, validateFormula) {
	const critical = config.critical ??= {};
	critical.bonusDice = Math.max(0, critical.bonusDice ?? 0);
	if (critical.bonusDamage && !validateFormula(critical.bonusDamage)) critical.bonusDamage = "";
}
//#endregion
//#region src/foundry/apply.ts
/** Roll data of a blueprint whose origin is neither the roller nor the rolled item (v1 _replaceRollDataOfBonuses). */
function foreignData(intent, ctx) {
	const info = ctx.sources.get(intent.entry);
	const origin = info?.origin;
	if (!info || !origin) return null;
	if (origin.uuid === ctx.roller.actor.uuid || origin.uuid === ctx.roller.item?.uuid) return null;
	return originRollData(info.document);
}
function formulaOf(intent, key, ctx, options) {
	const formula = asString(intent.data[key]).trim();
	if (!formula) return "";
	if (options.data) return replaceData(formula, options.data);
	const data = foreignData(intent, ctx);
	return data ? resolveForeign(formula, data) : formula;
}
function numberOf(intent, key, ctx, options) {
	const formula = formulaOf(intent, key, ctx, options);
	return formula ? simplifyNumber(formula, options.data ?? ctx.roller.rollData) ?? 0 : 0;
}
function modifierKey(intent) {
	return `${intent.entry.documentUuid}|${intent.blueprintId}|${intent.nodeId}`;
}
/**
* Apply one diceModifiers result to roll parts from `start[rollIndex]` on and, when `critical` is set,
* to critical damage. A used "first die only" modifier is halted for the rest of the roll.
*/
function applyModifiers(config, intent, ctx, tracker, start, critical) {
	const key = modifierKey(intent);
	if (tracker.halted.has(key)) return;
	const info = ctx.sources.get(intent.entry);
	const originData = info ? originRollData(info.document, true) : {};
	const spec = resolveModifiers(intent.data, (formula) => simplifyNumber(formula, originData));
	if (!spec) return;
	if (!tracker.active.includes(intent)) tracker.active.push(intent);
	const halt = () => {
		tracker.halted.add(key);
		tracker.active = tracker.active.filter((entry) => entry !== intent);
	};
	const damage = critical && ctx.event === "damageRoll";
	for (const [index, roll] of (config.rolls ?? []).entries()) {
		const parts = roll.parts ??= [];
		const from = start[index] ?? 0;
		const slice = parts.slice(from);
		const stopped = modifyFormulaParts(slice, roll.data ?? ctx.roller.rollData, spec);
		parts.splice(from, slice.length, ...slice);
		if (stopped) return halt();
		const rollCritical = asRecord(roll.options?.critical);
		if (damage && typeof rollCritical.bonusDamage === "string" && rollCritical.bonusDamage) {
			const formula = [rollCritical.bonusDamage];
			const done = modifyFormulaParts(formula, originData, spec);
			rollCritical.bonusDamage = String(formula[0]);
			if (done) return halt();
		}
	}
	if (damage && config.critical?.bonusDamage) {
		const formula = [config.critical.bonusDamage];
		const done = modifyFormulaParts(formula, originData, spec);
		config.critical.bonusDamage = String(formula[0]);
		if (done) halt();
	}
}
/** Apply roll-changing results to a dnd5e process configuration. */
function applyRollIntents(config, intents, ctx, tracker, options = {}) {
	let success = 0;
	let failure = 0;
	let target = 0;
	let deathCritical = 0;
	const firstData = config.rolls?.[0]?.data ?? ctx.roller.rollData;
	for (const intent of intents) switch (intent.type) {
		case "rollBonus": {
			const formula = options.formula?.(intent) ?? formulaOf(intent, "formula", ctx, options);
			if (!formula) break;
			if (ctx.event === "damageRoll") appendDamagePart(config, formula, options.damageType ? [options.damageType] : asStrings(intent.data.damageTypes), options.data ?? firstData);
			else appendRollPart(config, formula);
			break;
		}
		case "critRange":
			success += numberOf(intent, "critical", ctx, options);
			failure += numberOf(intent, "fumble", ctx, options);
			break;
		case "critDamage":
			addCriticalBonus(config, numberOf(intent, "dice", ctx, options), formulaOf(intent, "damage", ctx, options));
			break;
		case "saveThresholds":
			target += numberOf(intent, "targetValue", ctx, options);
			deathCritical += numberOf(intent, "deathSaveCritical", ctx, options);
	}
	if (success || failure) adjustCriticalRanges(config, success, failure, setting(SETTINGS.fumbleBelowOne));
	if (target || deathCritical) adjustSavingThrowRanges(config, target, deathCritical, ctx.roller.details.isDeath === true);
	for (const intent of intents) if (intent.type === "diceModifiers") applyModifiers(config, intent, ctx, tracker, [], true);
	if (ctx.event === "damageRoll") sanitizeCritical(config, (formula) => Roll.validate(formula));
}
var saveDCs = /* @__PURE__ */ new WeakMap();
/**
* Add DC bonuses to a save activity for this use. The bonus is added to the DC the activity had
* before the previous bonus, so repeated uses without a data refresh do not stack.
*/
function applySaveDC(activity, intents, ctx) {
	const dc = read(activity, "save.dc");
	if (!dc || typeof dc !== "object") return;
	const record = dc;
	const total = intents.filter((intent) => intent.type === "dcBonus").reduce((sum, intent) => sum + numberOf(intent, "formula", ctx, {}), 0);
	const current = asNumber(record.value) ?? 0;
	const previous = saveDCs.get(record);
	const base = previous && previous.applied === current ? previous.original : current;
	if (!total && base === current) return;
	record.value = base + total;
	saveDCs.set(record, {
		original: base,
		applied: base + total
	});
}
//#endregion
//#region src/foundry/choice-panel.ts
var RESOURCE_LABELS = {
	uses: "DND5E.Uses",
	quantity: "DND5E.Quantity",
	health: "DND5E.HitPoints",
	hitdice: "DND5E.HitDice"
};
var provider = foundryChoices();
function element(tag, className = "", text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== void 0) node.textContent = text;
	return node;
}
function describe(intents, fmt) {
	return intents.map((intent) => getResult(intent.type)?.phrase(intent.data, fmt) ?? intent.type).filter(Boolean).join("; ");
}
function capitalize(text) {
	return text ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;
}
function optionLabel(cost, option, actor) {
	if (cost.type === "slots") {
		const level = asNumber(read(actor, `system.spells.${option.value}.level`)) ?? 0;
		const leveled = /^spell\d+$/.test(option.value);
		return game.i18n.format(leveled ? "DND5E.SpellLevelSpell" : `DND5E.SpellLevel${capitalize(option.value)}`, {
			level: leveled ? game.i18n.localize(`DND5E.SpellLevel${level}`) : level,
			n: option.available
		});
	}
	const resource = RESOURCE_LABELS[cost.type] ?? (cost.type === "currency" ? asString(read(CONFIG.DND5E.currencies, `${cost.subtype}.label`)) : "");
	return game.i18n.format("BNA.Panel.Option", {
		amount: option.amount,
		resource: game.i18n.localize(resource),
		available: option.available
	});
}
/** Roll data for a choice: the activity's when the blueprint is on the rolled item, else its origin's; plus @scaling. */
function choiceData(info, ctx, scale) {
	const { roller } = ctx;
	const data = info.kind !== "template" && !!roller.activity && !!info.origin && info.origin.uuid === roller.item?.uuid ? rollDataOf(roller.activity) : originRollData(info.document);
	data.scaling = new dnd5e.documents.Scaling(scale);
	return data;
}
function applyChoice(pending, choice, info, scale, damageType, app) {
	const config = read(app, "config");
	if (!config) return;
	const { ctx, tracker } = pending;
	const start = (config.rolls ?? []).map((roll) => (roll.parts ?? []).length);
	const criticalBefore = config.critical?.bonusDamage ?? "";
	const earlier = [...tracker.active];
	const data = choiceData(info, ctx, scale);
	applyRollIntents(config, choice.intents, ctx, tracker, {
		data,
		damageType,
		formula: (intent) => intent.type === "rollBonus" ? scaledFormula(asString(intent.data.formula), choice.cost.formula, data, scale) : void 0
	});
	const criticalChanged = (config.critical?.bonusDamage ?? "") !== criticalBefore;
	for (const intent of earlier) applyModifiers(config, intent, ctx, tracker, start, criticalChanged);
	const rebuild = read(app, "rebuild");
	if (typeof rebuild === "function") rebuild.call(app);
	announceApplied(choice.intents, pending.context);
	pending.chosen.push(...choice.intents);
}
async function onApply(host, choice, info, cost, section, controls) {
	if (host.applied.has(choice.key)) return;
	const { button } = controls;
	const actor = host.ctx.roller.actor;
	button.disabled = true;
	try {
		const state = costState(cost.type, actor, info);
		const options = costOptions(cost, state);
		const option = controls.amount ? options.find((entry) => entry.value === controls.amount?.value) : options[0];
		if (!option || !costAvailable(cost, state)) {
			ui.notifications.warn(game.i18n.localize("BNA.Panel.CannotPay"));
			button.disabled = false;
			return;
		}
		if (!await payCost(cost, option, actor, info)) {
			button.disabled = false;
			return;
		}
		await host.apply(choice, info, option.scale, controls.damageType?.value || void 0);
		for (const intent of choice.intents) {
			if (intent.common.limit === "none") continue;
			recordUsage(actor, intent.blueprintId, intent.nodeId).catch((error) => console.warn("Build-n-Action | could not record a limited use", error));
		}
		host.applied.add(choice.key);
		section.classList.add("is-applied");
		button.textContent = game.i18n.localize("BNA.Panel.Applied");
		for (const select of [controls.amount, controls.damageType]) if (select) select.disabled = true;
	} catch (error) {
		console.warn("Build-n-Action | could not apply a choice", error);
		button.disabled = false;
	}
}
function reminderNote(intent, host) {
	const info = host.ctx.sources.get(intent.entry);
	const note = element("aside", "bna-note");
	note.append(element("strong", "", info?.blueprint.name || game.i18n.localize("BNA.Panel.Reminder")), asString(intent.data.text));
	return note;
}
function choiceSection(choice, host, fmt) {
	const first = choice.intents[0];
	const info = first ? host.ctx.sources.get(first.entry) : void 0;
	if (!info) return null;
	const actor = host.ctx.roller.actor;
	const originData = originRollData(info.document, true);
	const cost = resolveCost(choice.cost, (formula) => simplifyNumber(formula, originData));
	const state = costState(cost.type, actor, info);
	const options = costOptions(cost, state);
	if (!costAvailable(cost, state) || !options.length) return null;
	const applied = host.applied.has(choice.key);
	const section = element("section", applied ? "bna-choice is-applied" : "bna-choice");
	section.dataset.key = choice.key;
	const head = element("div", "bna-choice__head");
	head.append(element("span", "bna-choice__name", info.blueprint.name || sourceLabel(info)), element("span", "bna-choice__from", sourceLabel(info)));
	const description = element("div", "bna-choice__description");
	section.append(head, element("p", "bna-choice__what", describe(choice.intents, fmt)), description);
	if (info.blueprint.description) foundry.applications.ux.TextEditor.implementation.enrichHTML(info.blueprint.description, {
		rollData: originData,
		relativeTo: info.origin
	}).then((html) => {
		description.innerHTML = html;
	}).catch(() => void 0);
	const row = element("div", "bna-choice__controls");
	const controls = {
		button: element("button", "bna-choice__apply"),
		amount: null,
		damageType: null
	};
	if (costScales(cost, state)) {
		controls.amount = element("select", "bna-choice__amount");
		controls.amount.setAttribute("aria-label", game.i18n.localize("BNA.Panel.Amount"));
		for (const option of options) controls.amount.append(new Option(optionLabel(cost, option, actor), option.value));
		row.append(controls.amount);
	}
	const typed = host.ctx.event === "damageRoll" ? choice.intents.find((intent) => intent.type === "rollBonus" && asStrings(intent.data.damageTypes).length > 1) : void 0;
	if (typed) {
		controls.damageType = element("select", "bna-choice__type");
		controls.damageType.setAttribute("aria-label", game.i18n.localize("BNA.Panel.DamageType"));
		const labels = provider.choices("damageAndHealingTypes");
		for (const type of asStrings(typed.data.damageTypes)) controls.damageType.append(new Option(labels.find((label) => label.value === type)?.label ?? type, type));
		row.append(controls.damageType);
	}
	controls.button.type = "button";
	controls.button.disabled = applied;
	for (const select of [controls.amount, controls.damageType]) if (select) select.disabled = applied;
	controls.button.textContent = game.i18n.localize(applied ? "BNA.Panel.Applied" : cost.type === "none" ? "BNA.Panel.Apply" : "BNA.Panel.Spend");
	controls.button.addEventListener("click", () => {
		onApply(host, choice, info, cost, section, controls);
	});
	row.append(controls.button);
	section.append(row);
	return section;
}
/** The "Build-n-Action" fieldset with reminders and choices; null when there is nothing to offer. */
function renderChoices(host, sorted) {
	const fmt = createPhraseFormatter(foundryTranslator, provider);
	const panel = element("fieldset", "bna-surface bna-panel");
	panel.append(element("legend", "", "Build-n-Action"));
	for (const reminder of sorted.reminders) panel.append(reminderNote(reminder, host));
	for (const choice of sorted.choices) {
		const section = choiceSection(choice, host, fmt);
		if (section) panel.append(section);
	}
	return panel.children.length > 1 ? panel : null;
}
function renderPanel(app) {
	const pending = pendingRoll(read(app, `options.${MODULE_SCOPE}.pending`));
	const root = read(app, "element");
	if (!pending || !(root instanceof HTMLElement) || root.querySelector(".bna-panel")) return;
	const panel = renderChoices({
		ctx: pending.ctx,
		applied: pending.applied,
		apply: (choice, info, scale, damageType) => applyChoice(pending, choice, info, scale, damageType, app)
	}, pending.sorted);
	if (!panel) return;
	const anchor = root.querySelector("fieldset[data-application-part=\"configuration\"]");
	if (anchor) anchor.after(panel);
	else (root.querySelector(".window-content") ?? root).append(panel);
}
function registerChoicePanel() {
	Hooks.on("renderRollConfigurationDialog", (app) => guarded("roll dialog", () => renderPanel(app)));
}
//#endregion
//#region src/foundry/header.ts
var ICON = "fa-solid fa-diagram-project";
/** Colours the icon while a blueprint on the document works, as v1 marked documents with bonuses. */
var ACTIVE_MARKER = "bna-active-marker";
/** The documents that carry blueprints and get the control (group actors excluded, as in v1). */
function carrierOf(application) {
	const document = read(application, "document");
	if (!isDocument(document) || !carrierKind(document)) return null;
	if (document.documentName === "Actor" && read(document, "type") === "group") return null;
	return canEdit(document) ? document : null;
}
function open(document) {
	openEditor(document).catch((error) => console.error("Build-n-Action | could not open the editor", error));
}
/** The document's blueprints, and whether one of them works now (enabled, on a carrier that is not switched off). */
function blueprintState(document) {
	const { blueprints } = documentBlueprints(document);
	return {
		count: blueprints.length,
		active: !isSuppressed(document) && blueprints.some((blueprint) => blueprint.enabled)
	};
}
function headerControl(document, count, active) {
	return {
		action: "bnaOpenEditor",
		icon: active ? `${ICON} ${ACTIVE_MARKER}` : ICON,
		label: count ? game.i18n.format("BNA.Header.labelCount", { count }) : game.i18n.localize("BNA.Header.label"),
		onClick: () => open(document)
	};
}
function addTitleButton(application, document) {
	const element = read(application, "element");
	if (!(element instanceof HTMLElement)) return;
	const header = element.querySelector(".window-header");
	if (!header) return;
	const existing = header.querySelector(".bna-header-button");
	if (existing) {
		existing.classList.toggle(ACTIVE_MARKER, blueprintState(document).active);
		return;
	}
	const label = game.i18n.localize("BNA.Header.label");
	const button = globalThis.document.createElement("button");
	button.type = "button";
	button.className = `header-control icon ${ICON} bna-header-button`;
	button.classList.toggle(ACTIVE_MARKER, blueprintState(document).active);
	button.dataset.tooltip = label;
	button.setAttribute("aria-label", label);
	button.addEventListener("click", (event) => {
		event.preventDefault();
		open(document);
	});
	const toggle = header.querySelector("[data-action='toggleControls']");
	if (toggle) toggle.before(button);
	else header.append(button);
}
function registerHeaderControls() {
	Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
		const document = carrierOf(application);
		if (!document) return;
		const { count, active } = blueprintState(document);
		controls.unshift(headerControl(document, count, active));
	});
	Hooks.on("renderApplicationV2", (application) => {
		if (!setting(SETTINGS.headerLabel)) return;
		const document = carrierOf(application);
		if (document) addTitleButton(application, document);
	});
}
//#endregion
//#region src/runtime/continuations.ts
/**
* Applied results whose "And then" output leads somewhere, each with the key that lets its continuation
* run exactly once: the run (activation or evaluation), the target, the blueprint and the node.
*/
function continuationStarts(intents, run, target) {
	return intents.filter((intent) => intent.common.then && intent.entry.compiled.continuationsOf(intent.nodeId).length > 0).map((intent) => ({
		intent,
		key: `${run}|${target ?? "-"}|${intent.blueprintId}|${intent.nodeId}`
	}));
}
/** Whether applying this result starts more of the chain later: its "And then", or the save it demands. */
function startsLater(intent) {
	return intent.common.then || intent.type === "demandSave";
}
//#endregion
//#region src/runtime/counters.ts
/** The change a "Change counter" result makes, with its final value; `store` is the recipient's counters. */
function planCounter(data, ctx, store) {
	const name = counterName(asString(data.name));
	const actor = asString(data.who, "self") === "target" ? ctx.target : ctx.self;
	if (!name || !actor) return null;
	const scope = asString(data.scope) === "blueprint" ? "blueprint" : "actor";
	const def = counterDef(store, scope, name, ctx.blueprint);
	const current = counterValue(store, scope, name, ctx.blueprint);
	const value = nextCounterValue(current, asString(data.action, "add"), ctx.amount, def);
	return {
		kind: "counter",
		actor,
		key: counterKey(scope, name, ctx.blueprint.id),
		value
	};
}
//#endregion
//#region src/runtime/saves.ts
/** How long the GM waits for a player's save before rolling it. */
var SAVE_WAIT_MS = 3e4;
/** The player who rolls: an active non-GM owner, preferring the one whose character it is; null lets the GM roll. */
function pickSaveUser(users) {
	const owners = users.filter((user) => user.active && !user.isGM && user.owner);
	return (owners.find((user) => user.character) ?? owners[0])?.id ?? null;
}
/** Requests that wait for an answer by id, or resolve to null after a timeout. */
function createWaiter() {
	const pending = /* @__PURE__ */ new Map();
	return {
		wait: (id, ms) => new Promise((resolve) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				resolve(null);
			}, ms);
			pending.set(id, (value) => {
				clearTimeout(timer);
				pending.delete(id);
				resolve(value);
			});
		}),
		answer: (id, value) => {
			const settle = pending.get(id);
			if (!settle) return false;
			settle(value);
			return true;
		}
	};
}
/** One demanded save per run, blueprint, node and saver. */
function saveKey(run, blueprintId, nodeId, actorUuid) {
	return `${run}|${blueprintId}|${nodeId}|${actorUuid}`;
}
/** The DC formula of a demand-save result: its own, or the blueprint owner's spell DC. */
function saveDcFormula(data) {
	if (asString(data.dcMode) === "spell") return "@attributes.spell.dc";
	return asString(data.dc).trim() || "10";
}
function outcomePin(success) {
	return success ? "succeeded" : "failed";
}
//#endregion
//#region src/runtime/triggers.ts
function forward(previous, current) {
	const [roundBefore, turnBefore] = [previous.round ?? 0, previous.turn ?? -1];
	const [roundAfter, turnAfter] = [current.round ?? 0, current.turn ?? -1];
	return roundAfter > roundBefore || roundAfter === roundBefore && turnAfter > turnBefore;
}
/**
* The turn events of one combatTurnChange: the previous turn ends and the current one starts, only when combat
* moved forward. Turns skipped on the way do not fire; going back fires nothing.
*/
function turnTransitions(previous, current) {
	if (!current || !forward(previous ?? {
		round: 0,
		turn: null,
		combatantId: null
	}, current)) return [];
	const transitions = [];
	if (previous?.combatantId && (previous.round ?? 0) > 0) transitions.push({
		event: "turnEnd",
		combatantId: previous.combatantId,
		round: previous.round ?? 0,
		turn: previous.turn ?? 0
	});
	if (current.combatantId && (current.round ?? 0) > 0) transitions.push({
		event: "turnStart",
		combatantId: current.combatantId,
		round: current.round ?? 0,
		turn: current.turn ?? 0
	});
	return transitions;
}
/** The event for a dnd5e rest type ("short" or "long"). */
function restEvent(type) {
	if (type === "short") return "shortRest";
	if (type === "long") return "longRest";
	return null;
}
/** A gate that lets each key through once while it is remembered (`ttlMs`). */
function createOnce(ttlMs) {
	const seen = /* @__PURE__ */ new Map();
	return (key, now = Date.now()) => {
		for (const [known, at] of seen) if (now - at > ttlMs) seen.delete(known);
		if (seen.has(key)) return false;
		seen.set(key, now);
		return true;
	};
}
var REGION_EVENTS = /* @__PURE__ */ new Set(["regionEnter", "regionExit"]);
/** Whether a region's blueprints need the module's region behavior to hear tokens entering or leaving. */
function needsRegionBehavior(blueprints) {
	return blueprints.some((blueprint) => blueprint.nodes.some((node) => node.kind === "event" && REGION_EVENTS.has(node.type)));
}
//#endregion
//#region src/foundry/chat.ts
/** Owners and GMs, who see a reminder from a blueprint that has no roll dialog to show it in. */
function reminderRecipients(actor) {
	return [...game.users].filter((user) => user.isGM || (actor.testUserPermission?.(user, "OWNER") ?? false)).map((user) => user.id);
}
/** Whisper reminders to the roller's owners and the GMs; triggers and continuations have no roll dialog to show them in. */
async function whisperReminders(reminders, ctx) {
	for (const intent of reminders) {
		const text = asString(intent.data.text).trim();
		if (!text) continue;
		const name = ctx.sources.get(intent.entry)?.blueprint.name ?? "";
		await ChatMessage.implementation.create({
			content: `<p><strong>${foundry.utils.escapeHTML(name)}</strong></p><p>${foundry.utils.escapeHTML(text)}</p>`,
			whisper: reminderRecipients(ctx.roller.actor),
			speaker: ChatMessage.implementation.getSpeaker({ actor: ctx.roller.actor })
		});
	}
}
//#endregion
//#region src/foundry/saves.ts
/** The asking client outwaits the GM: two player waits (the prompt, then the roll dialog) and the GM's own roll. */
var ASKER_WAIT_MS = 2 * SAVE_WAIT_MS + 2e4;
var results = createWaiter();
var answers = createWaiter();
var prompts = /* @__PURE__ */ new Map();
/** On the GM: requests whose player pressed "Roll" and is in the roll dialog. */
var rolling = /* @__PURE__ */ new Set();
/** On the player: requests being rolled here. */
var rollingHere = /* @__PURE__ */ new Set();
var warnedNoGM$1 = false;
function isActiveGM$1() {
	return game.users.activeGM?.id === game.user.id;
}
function outcomeOf(rolls, by) {
	const roll = listOf(rolls)[0];
	const total = asNumber(read(roll, "total"));
	if (!roll || total === null) return null;
	return {
		success: read(roll, "isSuccess") === true,
		total,
		by
	};
}
async function rollSave(actor, request, configure) {
	const roll = read(actor, "rollSavingThrow");
	if (typeof roll !== "function") return null;
	return outcomeOf(await roll.call(actor, {
		ability: request.ability,
		target: request.dc,
		advantage: request.advantage === "advantage",
		disadvantage: request.advantage === "disadvantage"
	}, { configure }, {}), configure ? "player" : "gm");
}
/** On the GM: ask the owning player and wait, else roll without a dialog. */
async function coordinate(request) {
	const actor = documentFromUuid(request.actorUuid);
	if (!actor) return null;
	const player = pickSaveUser([...game.users].map((user) => ({
		id: user.id,
		isGM: user.isGM,
		active: user.active,
		owner: actor.testUserPermission?.(user, "OWNER") ?? false,
		character: user.character?.uuid === actor.uuid
	})));
	if (player) {
		const id = randomId();
		sendSaveMessage({
			type: "saveAsk",
			id,
			user: player,
			request
		});
		let answer = await answers.wait(id, SAVE_WAIT_MS);
		if (answer === null && rolling.has(id)) answer = await answers.wait(id, SAVE_WAIT_MS);
		rolling.delete(id);
		if (answer && answer !== "declined") return answer;
		sendSaveMessage({
			type: "saveCancel",
			id,
			user: player
		});
	}
	return rollSave(actor, request, false);
}
/** Ask for a demanded save from any client; null when it could not be rolled (no GM, no actor, a cancelled roll). */
async function requestSave(request) {
	if (isActiveGM$1()) return coordinate(request);
	const gm = game.users.activeGM;
	if (!gm) {
		if (!warnedNoGM$1) console.warn("Build-n-Action | no GM is connected, so demanded saving throws are not rolled.");
		warnedNoGM$1 = true;
		return null;
	}
	const id = randomId();
	sendSaveMessage({
		type: "saveRequest",
		id,
		gm: gm.id,
		sender: game.user.id,
		request
	});
	return await results.wait(id, ASKER_WAIT_MS) ?? null;
}
/** On the player: a prompt naming the save and who demands it, then the normal dnd5e dialog. */
async function promptPlayer(id, request) {
	const actor = documentFromUuid(request.actorUuid);
	if (!actor) return;
	const ability = asString(read(CONFIG.DND5E.abilities, `${request.ability}.label`)) || request.ability;
	const text = game.i18n.format("BNA.Save.Prompt", {
		ability,
		dc: request.dc,
		source: request.source,
		owner: request.owner
	});
	const action = await foundry.applications.api.DialogV2.wait({
		window: {
			title: game.i18n.format("BNA.Save.Title", { name: actor.name }),
			icon: "fa-solid fa-shield-halved"
		},
		content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
		buttons: [{
			action: "roll",
			label: game.i18n.localize("BNA.Save.Roll"),
			default: true
		}],
		rejectClose: false,
		render: (_event, dialog) => {
			prompts.set(id, () => {
				const close = read(dialog, "close");
				if (typeof close === "function") close.call(dialog);
			});
		}
	});
	prompts.delete(id);
	let outcome = null;
	if (action === "roll") {
		sendSaveMessage({
			type: "saveRolling",
			id
		});
		rollingHere.add(id);
		outcome = await rollSave(actor, request, true);
		rollingHere.delete(id);
	}
	sendSaveMessage({
		type: "saveAnswer",
		id,
		outcome: outcome ?? "declined"
	});
}
function isRequest(value) {
	return typeof read(value, "actorUuid") === "string" && typeof read(value, "ability") === "string" && typeof read(value, "dc") === "number";
}
function asOutcome(value) {
	return value && typeof value === "object" && typeof read(value, "total") === "number" ? value : null;
}
function receive(message) {
	const type = read(message, "type");
	const id = asString(read(message, "id"));
	const request = read(message, "request");
	if (type === "saveRequest" && isActiveGM$1() && read(message, "gm") === game.user.id && isRequest(request)) coordinate(request).then((outcome) => sendSaveMessage({
		type: "saveResult",
		id,
		recipient: read(message, "sender"),
		outcome
	}));
	else if (type === "saveResult" && read(message, "recipient") === game.user.id) results.answer(id, asOutcome(read(message, "outcome")));
	else if (type === "saveAsk" && read(message, "user") === game.user.id && isRequest(request)) promptPlayer(id, request);
	else if (type === "saveRolling" && isActiveGM$1()) rolling.add(id);
	else if (type === "saveAnswer" && isActiveGM$1()) answers.answer(id, asOutcome(read(message, "outcome")) ?? "declined");
	else if (type === "saveCancel" && read(message, "user") === game.user.id && (prompts.has(id) || rollingHere.has(id))) {
		prompts.get(id)?.();
		prompts.delete(id);
		ui.notifications.info(game.i18n.localize("BNA.Save.TakenByGM"));
	}
}
function registerSaves() {
	setSaveReceiver(receive);
}
//#endregion
//#region src/foundry/reactions.ts
/** Formula fields of roll results that a rider carries; resolved when the rider is made. */
var RIDER_FORMULAS = [
	"formula",
	"damage",
	"dice",
	"critical",
	"fumble",
	"targetValue",
	"deathSaveCritical"
];
function riderData(intent, data, options) {
	const effect = asRecord(intent.data.effect);
	const fields = { ...asRecord(effect.data) };
	for (const key of RIDER_FORMULAS) {
		const value = asString(fields[key]).trim();
		if (value) fields[key] = resolveForeign(value, data);
	}
	if (asString(effect.type) === "rollBonus" && options.scale) fields.formula = scaledFormula(asString(asRecord(effect.data).formula), options.costFormula ?? "", data, options.scale);
	return {
		...intent.data,
		effect: {
			type: asString(effect.type),
			data: fields
		}
	};
}
/** Turn reaction results into operations (riders, effects, resources) and perform them; returns the intents that applied. */
async function applyReactionIntents(intents, ctx, activation, options = {}) {
	const operations = [];
	const applied = [];
	const self = ctx.roller.actor;
	const target = ctx.roller.target?.actor ?? null;
	for (const intent of intents) {
		const info = ctx.sources.get(intent.entry);
		if (!info) continue;
		const data = options.data ?? originRollData(info.document);
		const origin = info.origin?.uuid ?? info.document.uuid;
		if (intent.type === "demandSave") {
			applied.push(intent);
			continue;
		}
		if (intent.type === "counter") {
			const toTarget = asString(intent.data.who, "self") === "target";
			const me = info.owner ?? self;
			const amountFormula = asString(intent.data.amount).trim() || "1";
			const op = planCounter(intent.data, {
				self: me.uuid,
				target: target?.uuid ?? null,
				blueprint: info.blueprint,
				amount: simplifyNumber(resolveForeign(amountFormula, data), data) ?? 0
			}, counterStore(toTarget ? target : me));
			if (op) {
				operations.push(op);
				applied.push(intent);
			}
			continue;
		}
		if (intent.type === "rider") {
			if (asString(intent.data.scope) !== "nextRoll" && !activation) continue;
			const recipient = asString(intent.data.scope) === "nextRoll" && asString(intent.data.who, "self") === "target" ? target : self;
			if (!recipient) continue;
			const rider = createRider(riderData(intent, data, options), {
				id: randomId(),
				activation,
				clock: riderClock(recipient),
				source: {
					name: info.blueprint.name,
					origin,
					blueprintId: intent.blueprintId,
					nodeId: intent.nodeId
				}
			});
			if (rider) {
				operations.push({
					kind: "rider",
					actor: recipient.uuid,
					rider
				});
				applied.push(intent);
			}
			continue;
		}
		const amountFormula = asString(intent.data.amount).trim() || "1";
		const amount = intent.type === "resource" ? simplifyNumber(resolveForeign(amountFormula, data), data) ?? 0 : 0;
		const op = planOperation(intent.type, intent.data, {
			self: self.uuid,
			target: target?.uuid ?? null,
			carrierItem: info.carrierItem?.uuid ?? null,
			origin,
			amount
		});
		if (op) {
			operations.push(op);
			applied.push(intent);
		}
	}
	if (!operations.length) return applied;
	return await performOperations(operations) ? applied : applied.filter((intent) => intent.type === "demandSave");
}
/** A result's continuation runs once per application (ten-minute memory). */
var continued = createOnce(6e5);
/**
* Follow "And then" from results that were really applied: evaluate each continuation with the original
* facts, apply it at once (there is no roll dialog to ask in), whisper its reminders, and go on from what
* it applied, up to MAX_SIGNAL_DEPTH levels.
*/
async function runContinuations(applied, depth = 0) {
	if (depth >= 8) return;
	const { ctx, context, activation } = applied;
	const entries = [...ctx.sources.keys()];
	for (const intent of applied.intents) if (intent.type === "demandSave") guardedAsync("demanded save", () => runDemandedSave(intent, applied, depth));
	for (const { intent, key } of continuationStarts(applied.intents, applied.run, ctx.roller.target?.document.uuid ?? null)) {
		if (!continued(key)) continue;
		const chain = runWithSignals(entries, {
			event: "afterResult",
			pins: ["then"],
			from: intent.nodeId
		}, context.facts, { starters: [intent.entry] });
		const sorted = sortIntents(allowIntents(resolveCounterIntents(chain.intents, ctx.sources, ctx.roller), context));
		const done = await applyReactionIntents([...sorted.immediate, ...sorted.choices.flatMap((choice) => choice.intents)], ctx, activation);
		await whisperReminders(sorted.reminders, ctx);
		announceApplied([...done, ...sorted.reminders], context);
		recordUsages(done, ctx.roller.actor);
		await runContinuations({
			...applied,
			intents: [
				...done,
				...sorted.reminders,
				...chain.sent
			]
		}, depth + 1);
	}
}
/** A demanded save's key memory: one save per run, blueprint, node and saver (ten minutes). */
var demanded = createOnce(6e5);
/** Who a demand-save result asks: the target, me, or the creatures in my aura (by disposition). */
function saversFor(intent, ctx, data) {
	const who = asString(intent.data.who, "target");
	const me = ctx.roller.token;
	if (who === "self") return me ? [me] : [];
	if (who !== "aura") return ctx.roller.target ? [ctx.roller.target] : [];
	if (!me || !canvas.ready) return [];
	const range = simplifyNumber(resolveForeign(asString(intent.data.range).trim() || "10", data), data) ?? 0;
	const pad = !canvas.grid.isGridless || setting(SETTINGS.padAuraRadius);
	const wanted = asString(intent.data.disposition, "-1");
	const mine = asNumber(read(me.document, "disposition"));
	return canvas.tokens.placeables.filter((token) => {
		if (!token.actor) return false;
		if (token === me) return intent.data.includeSelf === true;
		return matchDisposition(wanted, mine, asNumber(read(token.document, "disposition"))) && withinAura(me, token, range, [], pad);
	});
}
/** Roll one demanded save per saver, then continue down its "Succeeded" or "Failed" branch with the saver as the target. */
async function runDemandedSave(intent, applied, depth) {
	const { ctx, context } = applied;
	const info = ctx.sources.get(intent.entry);
	if (!info) return;
	const data = originRollData(info.document);
	const dc = simplifyNumber(resolveForeign(saveDcFormula(intent.data), data), data);
	if (dc === null) return;
	const entries = [...ctx.sources.keys()];
	await Promise.all(saversFor(intent, ctx, data).map(async (saver) => {
		const actor = saver.actor;
		if (!actor || !demanded(saveKey(applied.run, intent.blueprintId, intent.nodeId, actor.uuid))) return;
		const outcome = await requestSave({
			actorUuid: actor.uuid,
			ability: asString(intent.data.ability, "con"),
			dc,
			advantage: asString(intent.data.advantage, "normal"),
			source: info.blueprint.name,
			owner: info.owner?.name ?? ctx.roller.actor.name
		});
		if (!outcome || !intent.entry.compiled.continuationsOf(intent.nodeId).length) return;
		const roller = {
			...ctx.roller,
			target: saver
		};
		const facts = buildRollFacts({
			event: context.event,
			actor: roller.actor,
			token: roller.token?.document ?? null,
			item: roller.item,
			activity: roller.activity,
			target: {
				actor,
				document: saver.document
			},
			details: roller.details
		}, traitTrees());
		const saveCtx = {
			...ctx,
			roller
		};
		const saveContext = {
			...context,
			target: actor,
			facts
		};
		const pin = outcomePin(outcome.success);
		const chain = runWithSignals(entries, {
			event: "demandedSave",
			pins: [pin],
			from: intent.nodeId
		}, facts, { starters: [intent.entry] });
		const sorted = sortIntents(allowIntents(resolveCounterIntents(chain.intents, saveCtx.sources, saveCtx.roller), saveContext));
		const done = await applyReactionIntents([...sorted.immediate, ...sorted.choices.flatMap((choice) => choice.intents)], saveCtx, applied.activation);
		await whisperReminders(sorted.reminders, saveCtx);
		announceApplied([...done, ...sorted.reminders], saveContext);
		recordUsages(done, roller.actor);
		await runContinuations({
			...applied,
			intents: [
				...done,
				...sorted.reminders,
				...chain.sent
			],
			ctx: saveCtx,
			context: saveContext
		}, depth + 1);
	}));
}
async function promptChoices(host, choices, actor) {
	const panel = renderChoices(host, {
		choices,
		reminders: []
	});
	if (!panel) return;
	await foundry.applications.api.DialogV2.wait({
		window: {
			title: game.i18n.format("BNA.Reaction.Title", { name: actor.name }),
			icon: "fa-solid fa-diagram-project"
		},
		position: { width: 420 },
		content: "<div class=\"bna-reaction\"></div>",
		buttons: [{
			action: "done",
			label: game.i18n.localize("BNA.Reaction.Done"),
			default: true
		}],
		rejectClose: false,
		render: (_event, dialog) => {
			const element = asRecord(dialog).element;
			if (element instanceof HTMLElement) element.querySelector(".bna-reaction")?.append(panel);
		}
	});
}
/** Run blueprints reacting to an outcome: immediate results now, optional ones through a prompt. */
async function runReaction(input) {
	if (!input.pins.length) return;
	const roller = makeRoller(input.actor, input.item, input.activity, input.target, { ...input.details ?? {} });
	const evaluation = evaluateEvent(input.event, roller, input.pins, input.activation);
	if (!evaluation?.chain.intents.length) return;
	const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
	const ctx = {
		event: input.event,
		roller,
		sources: evaluation.collected.sources
	};
	const run = input.activation ?? evaluation.id;
	const done = await applyReactionIntents(sorted.immediate, ctx, input.activation);
	announceApplied(done, evaluation.context);
	recordUsages(done, roller.actor);
	await runContinuations({
		intents: [...done, ...evaluation.chain.sent],
		ctx,
		context: evaluation.context,
		activation: input.activation,
		run
	});
	if (!sorted.choices.length) return;
	await promptChoices({
		ctx,
		applied: /* @__PURE__ */ new Set(),
		apply: async (choice, info, scale) => {
			const done = await applyReactionIntents(choice.intents, ctx, input.activation, {
				data: choiceData(info, ctx, scale),
				scale,
				costFormula: choice.cost.formula
			});
			announceApplied(done, evaluation.context);
			await runContinuations({
				intents: done,
				ctx,
				context: evaluation.context,
				activation: input.activation,
				run
			});
		}
	}, sorted.choices, input.actor);
}
//#endregion
//#region src/foundry/preroll.ts
function runRoll(event, config, dialog, message, roller) {
	const activation = activationOf(config, message);
	const evaluation = evaluateEvent(event, roller, ["out"], activation);
	if (!evaluation || !evaluation.chain.intents.length && !evaluation.chain.sent.length) return;
	const process = config;
	if (roller.target?.actor) injectTargetData(process, rollDataOf(roller.target.actor));
	const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
	const ctx = {
		event,
		roller,
		sources: evaluation.collected.sources
	};
	const tracker = {
		active: [],
		halted: /* @__PURE__ */ new Set()
	};
	applyRollIntents(process, sorted.immediate, ctx, tracker);
	announceApplied(sorted.immediate, evaluation.context);
	recordUsages(sorted.immediate, roller.actor);
	const riders = [...new Set(sorted.immediate.flatMap((intent) => ctx.sources.get(intent.entry)?.rider?.id ?? []))];
	if (riders.length) useRiders(roller.actor, riders).catch((error) => console.warn("Build-n-Action | could not use up riders", error));
	let pending = null;
	if ((sorted.choices.length || sorted.reminders.length) && dialog && typeof dialog === "object") {
		pending = {
			ctx,
			sorted,
			tracker,
			applied: /* @__PURE__ */ new Set(),
			chosen: [],
			context: evaluation.context
		};
		const id = registerPending(pending);
		const holder = dialog;
		const options = asRecord(holder.options);
		holder.options = options;
		options[MODULE_SCOPE] = { pending: id };
		if (sorted.choices.length) holder.configure = true;
	}
	rememberAfterRoll(config, {
		applied: {
			ctx,
			context: evaluation.context,
			activation,
			run: activation ?? evaluation.id
		},
		intents: [
			...sorted.immediate,
			...sorted.reminders,
			...evaluation.chain.sent
		],
		pending
	});
}
/** The roll goes ahead (dialog submitted or skipped): continue from what it applied. A cancelled dialog gives no rolls. */
function postRollConfiguration(rolls, config) {
	const after = takeAfterRoll(config);
	if (!after || !listOf(rolls).length) return;
	const intents = [...after.intents, ...after.pending?.chosen ?? []];
	if (!intents.some(startsLater)) return;
	guardedAsync("continuation", () => runContinuations({
		...after.applied,
		intents
	}));
}
function itemOf(activity) {
	const item = read(activity, "item");
	return isDocument(item) ? item : null;
}
function actorOf(document) {
	const actor = read(document, "actor");
	return isDocument(actor) ? actor : null;
}
function subjectActor(config) {
	const subject = read(config, "subject");
	return isDocument(subject) && subject.documentName === "Actor" ? subject : null;
}
function activityRoll(event, config, dialog, message) {
	const activity = read(config, "subject");
	const item = itemOf(activity);
	const actor = actorOf(item);
	if (!item || !actor) return;
	if (event === "attackRoll") rememberActivation(asString(read(activity, "uuid")), activationOf(config, message));
	const target = resolveRollTarget(config, event === "damageRoll");
	runRoll(event, config, dialog, message, makeRoller(actor, item, activity, target, { attackMode: asString(read(config, "attackMode")) || null }));
}
function preRollAttack(config, dialog, message) {
	guarded("attack", () => activityRoll("attackRoll", config, dialog, message));
}
function preRollDamage(config, dialog, message) {
	guarded("damage", () => activityRoll("damageRoll", config, dialog, message));
}
function preRollSavingThrow(config, dialog, message) {
	guarded("saving throw", () => {
		const actor = subjectActor(config);
		if (!actor) return;
		const hookNames = stringList(read(config, "hookNames"));
		runRoll("savingThrow", config, dialog, message, makeRoller(actor, null, null, resolveRollTarget(config, false), {
			saveAbility: asString(read(config, "ability")) || null,
			isConcentration: read(config, "isConcentration") === true || hookNames.includes("concentration"),
			isDeath: hookNames.includes("deathSave")
		}));
	});
}
function preRollAbilityCheck(config, dialog, message) {
	guarded("ability check", () => {
		const actor = subjectActor(config);
		if (!actor) return;
		const item = read(config, "item");
		runRoll("abilityCheck", config, dialog, message, makeRoller(actor, isDocument(item) ? item : null, null, resolveRollTarget(config, false), {
			abilityId: asString(read(config, "ability")) || null,
			skillId: asString(read(config, "skill")) || null,
			toolId: asString(read(config, "tool")) || null
		}));
	});
}
function preRollHitDie(config, dialog, message) {
	guarded("hit die", () => {
		const actor = subjectActor(config);
		if (!actor) return;
		runRoll("hitDie", config, dialog, message, makeRoller(actor, null, null, resolveRollTarget(config, false), {}));
	});
}
function postActivityConsumption(activity, usageConfig) {
	guarded("save DC", () => {
		if (read(activity, "type") !== "save") return;
		const item = itemOf(activity);
		const actor = actorOf(item);
		if (!item || !actor) return;
		const roller = makeRoller(actor, item, activity, resolveRollTarget(usageConfig, false), {}, true);
		const evaluation = evaluateEvent("saveDC", roller);
		const intents = evaluation ? allowIntents(evaluation.chain.intents, evaluation.context) : [];
		applySaveDC(activity, intents, {
			event: "saveDC",
			roller,
			sources: evaluation?.collected.sources ?? /* @__PURE__ */ new Map()
		});
		if (evaluation) announceApplied(intents, evaluation.context);
		recordUsages(intents, actor);
		if (evaluation) guardedAsync("continuation", () => runContinuations({
			intents: [...intents, ...evaluation.chain.sent],
			ctx: {
				event: "saveDC",
				roller,
				sources: evaluation.collected.sources
			},
			context: evaluation.context,
			activation: null,
			run: evaluation.id
		}));
	});
}
function usesTemplateReach(blueprint) {
	return blueprint.nodes.some((node) => node.kind === "event" && asString(asRecord(node.data.reach).mode) === "template");
}
/** Copy the item's template-reach blueprints (and the placer's disposition) onto the new template. */
function preCreateActivityTemplate(activity, templateData) {
	guarded("template", () => {
		const item = itemOf(activity);
		const actor = actorOf(item);
		if (!item || !actor || !templateData || typeof templateData !== "object") return;
		const blueprints = documentBlueprints(item).blueprints.filter(usesTemplateReach);
		if (!blueprints.length) return;
		const getActiveTokens = read(actor, "getActiveTokens");
		const token = read(actor, "isToken") === true ? read(actor, "token") : typeof getActiveTokens === "function" ? listOf(getActiveTokens.call(actor, false, true))[0] : null;
		const disposition = asNumber(read(token, "disposition")) ?? asNumber(read(actor, "prototypeToken.disposition"));
		const data = templateData;
		const flags = asRecord(data.flags);
		data.flags = flags;
		flags[MODULE_SCOPE] = {
			...asRecord(flags[MODULE_SCOPE]),
			blueprints: structuredClone(blueprints),
			templateDisposition: disposition
		};
	});
}
function registerPreRollHooks() {
	Hooks.on("dnd5e.preRollAttack", preRollAttack);
	Hooks.on("dnd5e.preRollDamage", preRollDamage);
	Hooks.on("dnd5e.preRollSavingThrow", preRollSavingThrow);
	Hooks.on("dnd5e.preRollAbilityCheck", preRollAbilityCheck);
	Hooks.on("dnd5e.preRollHitDie", preRollHitDie);
	Hooks.on("dnd5e.postRollConfiguration", postRollConfiguration);
	Hooks.on("dnd5e.postActivityConsumption", postActivityConsumption);
	Hooks.on("dnd5e.preCreateActivityTemplate", preCreateActivityTemplate);
	Hooks.on("dnd5e.restCompleted", (actor, result) => {
		countRest(actor, result).catch((error) => console.warn("Build-n-Action | could not count a rest", error));
	});
}
//#endregion
//#region src/runtime/outcomes.ts
/** Pins of an attack against one target: a critical always hits, a fumble always misses. */
function attackPins(result) {
	if (result.isFumble) return ["miss", "fumble"];
	if (result.isCritical) return ["hit", "crit"];
	if (result.total === null || result.targetAc === null) return [];
	return result.total >= result.targetAc ? ["hit"] : ["miss"];
}
/** Pins when Midi QOL has decided whether the attack hit this target. */
function midiAttackPins(hit, isCritical, isFumble) {
	const pins = [hit ? "hit" : "miss"];
	if (hit && isCritical) pins.push("crit");
	if (isFumble) pins.push("fumble");
	return pins;
}
function savePins(success) {
	return [success ? "succeeded" : "failed"];
}
/** `dealt` for positive damage; `dropped` as well when the target ends at 0 HP. */
function damagePins(hpDamage, newHp) {
	if (!(hpDamage > 0)) return [];
	return newHp !== null && newHp <= 0 ? ["dealt", "dropped"] : ["dealt"];
}
/** `success` or `failure` for a check with a DC; nothing when the DC is unknown. */
function checkPins(total, dc) {
	if (total === null || dc === null) return [];
	return [total >= dc ? "success" : "failure"];
}
//#endregion
//#region src/foundry/reaction-hooks.ts
var MEMORY_MS = 6e5;
var handled = /* @__PURE__ */ new Map();
/** True the first time a reaction key is seen (within ten minutes). */
function firstTime(key) {
	const now = Date.now();
	for (const [seen, time] of handled) if (now - time > MEMORY_MS) handled.delete(seen);
	if (handled.has(key)) return false;
	handled.set(key, now);
	return true;
}
function call(target, method, ...args) {
	const fn = read(target, method);
	return typeof fn === "function" ? fn.apply(target, args) : void 0;
}
/** A token placeable from a placeable, a token document or a token UUID. */
function tokenOf(value) {
	if (!value) return null;
	if (typeof value === "string") return read(documentFromUuid(value), "object") ?? null;
	if (read(value, "document") && read(value, "center")) return value;
	return read(value, "object") ?? null;
}
function tokens(value) {
	return listOf(value).map(tokenOf).filter((token) => !!token);
}
function attackerOfActivity(activity) {
	const item = read(activity, "item");
	const actor = read(item, "actor");
	return isDocument(item) && isDocument(actor) ? {
		actor,
		item,
		activity
	} : null;
}
function attackerOfWorkflow(workflow) {
	const actor = read(workflow, "actor");
	const item = read(workflow, "item");
	if (!isDocument(actor)) return null;
	return {
		actor,
		item: isDocument(item) ? item : null,
		activity: read(workflow, "activity") ?? null
	};
}
/** Whether Midi QOL decides hits itself (its "Auto check hits" setting); otherwise totals are compared with AC here. */
function midiChecksHits() {
	const settings = call(read(globalThis, "MidiQOL"), "configSettings");
	return asString(read(settings, "autoCheckHit"), "none") !== "none";
}
function targetAc(target) {
	return call(read(target.actor, "statuses"), "has", "coverTotal") === true ? null : asNumber(read(target.actor, "system.attributes.ac.value"));
}
async function midiAttack(workflow) {
	const attacker = attackerOfWorkflow(workflow);
	if (!attacker) return;
	const activation = midiActivation(workflow);
	const isCritical = read(workflow, "isCritical") === true;
	const isFumble = read(workflow, "isFumble") === true;
	const hits = /* @__PURE__ */ new Set([...tokens(read(workflow, "hitTargets")), ...tokens(read(workflow, "hitTargetsEC"))]);
	const targets = tokens(read(workflow, "targets"));
	if (!targets.length) {
		if (!firstTime(`afterAttack|${activation}|-`)) return;
		await runReaction({
			...attacker,
			event: "afterAttack",
			pins: attackPins({
				total: null,
				targetAc: null,
				isCritical,
				isFumble
			}),
			target: null,
			activation
		});
		return;
	}
	const checked = midiChecksHits();
	const total = asNumber(read(workflow, "attackTotal")) ?? asNumber(read(workflow, "attackRoll.total"));
	for (const target of targets) {
		if (!firstTime(`afterAttack|${activation}|${target.document.uuid}`)) continue;
		const pins = checked ? midiAttackPins(hits.has(target), isCritical, isFumble) : attackPins({
			total,
			targetAc: targetAc(target),
			isCritical,
			isFumble
		});
		await runReaction({
			...attacker,
			event: "afterAttack",
			pins,
			target,
			activation
		});
	}
}
async function midiSaves(workflow) {
	const attacker = attackerOfWorkflow(workflow);
	if (!attacker) return;
	const activation = midiActivation(workflow);
	const saved = new Set(tokens(read(workflow, "saves")));
	const failed = tokens(read(workflow, "failedSaves"));
	for (const target of /* @__PURE__ */ new Set([...saved, ...failed])) {
		if (!firstTime(`afterTargetSave|${activation}|${target.document.uuid}`)) continue;
		await runReaction({
			...attacker,
			event: "afterTargetSave",
			pins: savePins(saved.has(target)),
			target,
			activation
		});
	}
}
async function midiDamage(workflow) {
	const attacker = attackerOfWorkflow(workflow);
	if (!attacker) return;
	const activation = midiActivation(workflow);
	for (const entry of listOf(read(workflow, "damageList"))) {
		const actorUuid = asString(read(entry, "actorUuid"));
		const actor = documentFromUuid(actorUuid);
		const target = tokenOf(asString(read(entry, "targetUuid"))) ?? (actor ? actorToken(actor) : null);
		if (!firstTime(`afterDamage|${activation}|${target?.document.uuid ?? actorUuid}`)) continue;
		const pins = damagePins(asNumber(read(entry, "hpDamage")) ?? 0, asNumber(read(entry, "newHP")));
		await runReaction({
			...attacker,
			event: "afterDamage",
			pins,
			target,
			activation
		});
	}
}
async function dndAttack(rolls, data) {
	const activity = read(data, "subject");
	const attacker = attackerOfActivity(activity);
	const roll = listOf(rolls)[0];
	if (!attacker || !roll) return;
	const total = asNumber(read(roll, "total"));
	const isCritical = read(roll, "isCritical") === true;
	const isFumble = read(roll, "isFumble") === true;
	const activation = activationFor(asString(read(activity, "uuid")));
	const targets = [...game.user.targets];
	if (!targets.length) {
		await runReaction({
			...attacker,
			event: "afterAttack",
			pins: attackPins({
				total,
				targetAc: null,
				isCritical,
				isFumble
			}),
			target: null,
			activation
		});
		return;
	}
	for (const target of targets) await runReaction({
		...attacker,
		event: "afterAttack",
		pins: attackPins({
			total,
			targetAc: targetAc(target),
			isCritical,
			isFumble
		}),
		target,
		activation
	});
}
function speakerToken(message) {
	const scene = game.scenes.get(asString(read(message, "speaker.scene")));
	const token = tokenOf(call(read(scene, "tokens"), "get", asString(read(message, "speaker.token"))));
	if (token) return token;
	const actor = call(message, "getAssociatedActor");
	return isDocument(actor) ? actorToken(actor) : null;
}
async function dndSave(message) {
	if (asString(read(message, "flags.dnd5e.roll.type")) !== "save") return;
	const originId = asString(read(message, "flags.dnd5e.originatingMessage"));
	const origin = originId ? game.messages.get(originId) : null;
	const activity = call(origin, "getAssociatedActivity");
	if (read(activity, "type") !== "save") return;
	const attacker = attackerOfActivity(activity);
	if (!attacker) return;
	const author = read(origin, "author");
	if ((read(author, "active") === true ? asString(read(author, "id")) : game.users.activeGM?.id ?? "") !== game.user.id) return;
	const roll = listOf(read(message, "rolls"))[0];
	const total = asNumber(read(roll, "total"));
	const dc = asNumber(read(roll, "options.target"));
	if (total === null || dc === null) return;
	if (!firstTime(`afterTargetSave|${asString(read(message, "id"))}`)) return;
	await runReaction({
		...attacker,
		event: "afterTargetSave",
		pins: savePins(total >= dc),
		target: speakerToken(message),
		activation: `message:${originId}`
	});
}
async function dndDamage(actor, amount, options) {
	const damageMessage = read(options, "originatingMessage");
	const attacker = attackerOfActivity(call(damageMessage, "getAssociatedActivity"));
	if (!attacker || !isDocument(actor)) return;
	const messageId = asString(read(damageMessage, "id"));
	if (!firstTime(`afterDamage|${messageId}|${actor.uuid}`)) return;
	const origin = asString(read(damageMessage, "flags.dnd5e.originatingMessage")) || messageId;
	const pins = damagePins(asNumber(amount) ?? 0, asNumber(read(actor, "system.attributes.hp.value")));
	await runReaction({
		...attacker,
		event: "afterDamage",
		pins,
		target: actorToken(actor),
		activation: `message:${origin}`
	});
}
async function dndCheck(rolls, data) {
	const actor = read(data, "subject");
	const roll = listOf(rolls)[0];
	if (!isDocument(actor) || !roll) return;
	const pins = checkPins(asNumber(read(roll, "total")), asNumber(read(roll, "options.target")));
	if (!pins.length) return;
	await runReaction({
		event: "afterCheck",
		pins,
		actor,
		item: null,
		activity: null,
		target: null,
		activation: null,
		details: {
			abilityId: asString(read(data, "ability")) || null,
			skillId: asString(read(data, "skill")) || null,
			toolId: asString(read(data, "tool")) || null
		}
	});
}
/** Listen for roll outcomes: Midi's workflow when Midi is active, plain dnd5e otherwise; checks always from dnd5e. */
function registerReactionHooks() {
	if (game.modules.get("midi-qol")?.active === true) {
		Hooks.on("midi-qol.AttackRollComplete", (workflow) => guardedAsync("after attack", () => midiAttack(workflow)));
		Hooks.on("midi-qol.postCheckSaves", (workflow) => guardedAsync("after save", () => midiSaves(workflow)));
		Hooks.on("midi-qol.RollComplete", (workflow) => guardedAsync("after damage", () => midiDamage(workflow)));
	} else {
		Hooks.on("dnd5e.rollAttackV2", (rolls, data) => {
			guardedAsync("after attack", () => dndAttack(rolls, data));
		});
		Hooks.on("createChatMessage", (message) => {
			guardedAsync("after save", () => dndSave(message));
		});
		Hooks.on("dnd5e.applyDamage", (actor, amount, options) => {
			guardedAsync("after damage", () => dndDamage(actor, amount, options));
		});
	}
	for (const hook of [
		"dnd5e.rollAbilityCheck",
		"dnd5e.rollSkill",
		"dnd5e.rollToolCheck"
	]) Hooks.on(hook, (rolls, data) => {
		guardedAsync("after check", () => dndCheck(rolls, data));
	});
}
//#endregion
//#region src/foundry/triggers.ts
/** Turns, regions and rests: a trigger is remembered for ten minutes. */
var once = createOnce(6e5);
var warnedNoGM = false;
function isActiveGM() {
	return game.users.activeGM?.id === game.user.id;
}
/** Run the blueprints a trigger starts. Only the active GM does; others ignore it (see requestTrigger). */
async function runTrigger(input) {
	if (!isActiveGM() || !once(input.key)) return;
	if (input.event === "shortRest" || input.event === "longRest" || input.event === "turnStart") await resetCounters(input.actor, input.event);
	const roller = {
		...makeRoller(input.actor, null, null, null, {}),
		token: input.token ?? actorToken(input.actor)
	};
	const evaluation = evaluateEvent(input.event, roller, ["out"], null, input.only ? { only: input.only } : {});
	if (!evaluation?.chain.intents.length) return;
	const sorted = sortIntents(allowIntents(evaluation.chain.intents, evaluation.context));
	const intents = [...sorted.immediate, ...sorted.choices.flatMap((choice) => choice.intents)];
	const ctx = {
		event: input.event,
		roller,
		sources: evaluation.collected.sources
	};
	const done = await applyReactionIntents(intents, ctx, null);
	await whisperReminders(sorted.reminders, ctx);
	announceApplied([...done, ...sorted.reminders], evaluation.context);
	recordUsages(done, roller.actor);
	await runContinuations({
		intents: [
			...done,
			...sorted.reminders,
			...evaluation.chain.sent
		],
		ctx,
		context: evaluation.context,
		activation: null,
		run: evaluation.id
	});
}
/** Start a trigger from any client: here when this is the active GM, otherwise through the GM. */
function requestTrigger(input) {
	if (isActiveGM()) {
		guardedAsync("trigger", () => runTrigger({
			...input,
			token: null
		}));
		return;
	}
	const gm = game.users.activeGM;
	if (!gm) {
		if (!warnedNoGM) console.warn("Build-n-Action | no GM is connected, so turn, region and rest events do not run.");
		warnedNoGM = true;
		return;
	}
	sendTrigger(gm.id, input.event, input.actor.uuid, input.key);
}
function turnState(value) {
	const number = (key) => {
		const found = read(value, key);
		return typeof found === "number" ? found : null;
	};
	return {
		round: number("round"),
		turn: number("turn"),
		combatantId: asString(read(value, "combatantId")) || null
	};
}
async function onTurnChange(combat, previous, current) {
	if (!isActiveGM()) return;
	const combatId = asString(read(combat, "id"));
	for (const transition of turnTransitions(previous ? turnState(previous) : null, current ? turnState(current) : null)) {
		const combatant = listOf(read(combat, "combatants")).find((entry) => read(entry, "id") === transition.combatantId);
		const actor = read(combatant, "actor");
		if (!isDocument(actor)) continue;
		const token = read(combatant, "token.object") ?? null;
		await runTrigger({
			event: transition.event,
			actor,
			token,
			key: `${combatId}|${transition.event}|${transition.round}|${transition.turn}|${transition.combatantId}`
		});
	}
}
function registerTriggerHooks() {
	setTriggerReceiver(receiveTrigger);
	Hooks.on("combatTurnChange", (combat, previous, current) => {
		guardedAsync("turn", () => onTurnChange(combat, previous, current));
	});
	Hooks.on("dnd5e.restCompleted", (actor, _result, config) => {
		const event = restEvent(read(config, "type"));
		if (!event || !isDocument(actor)) return;
		requestTrigger({
			event,
			actor,
			key: `${actor.uuid}|${event}|${Date.now()}`
		});
	});
}
/** A trigger the GM received from another client. */
async function receiveTrigger(event, actorUuid, key) {
	const actor = documentFromUuid(actorUuid);
	if (actor) await runTrigger({
		event,
		actor,
		token: null,
		key
	});
}
//#endregion
//#region src/foundry/region-behavior.ts
var REGION_BEHAVIOR_TYPE = `${MODULE_SCOPE}.blueprints`;
async function onToken(event, trigger) {
	const token = event.data.token;
	const actor = read(token, "actor");
	if (!token || !isDocument(actor)) return;
	await runTrigger({
		event: trigger,
		actor,
		token: read(token, "object") ?? null,
		only: this.region,
		key: `${this.region.uuid}|${token.uuid}|${trigger}|${event.data.movement?.id ?? Date.now()}`
	});
}
/**
* Hears tokens entering and leaving its region and runs the region's blueprints on the active GM.
* Region events reach every client; runTrigger acts only on the active GM.
*/
var BlueprintsRegionBehavior = class extends foundry.data.regionBehaviors.RegionBehaviorType {
	static defineSchema() {
		return { events: foundry.data.regionBehaviors.RegionBehaviorType._createEventsField() };
	}
	static events = {
		tokenEnter(event) {
			return guardedAsync("region enter", () => onToken.call(this, event, "regionEnter"));
		},
		tokenExit(event) {
			return guardedAsync("region exit", () => onToken.call(this, event, "regionExit"));
		}
	};
};
/** Register the behavior type (init). */
function registerRegionBehavior() {
	CONFIG.RegionBehavior.dataModels[REGION_BEHAVIOR_TYPE] = BlueprintsRegionBehavior;
	CONFIG.RegionBehavior.typeLabels[REGION_BEHAVIOR_TYPE] = "BNA.RegionBehavior.label";
	CONFIG.RegionBehavior.typeIcons[REGION_BEHAVIOR_TYPE] = "fa-solid fa-diagram-project";
	CONFIG.RegionBehavior.typeHints[REGION_BEHAVIOR_TYPE] = "BNA.RegionBehavior.hint";
}
/** Add the behavior while the region's blueprints start on entering or leaving it, and remove it otherwise. */
async function syncRegionBehavior(region) {
	const wanted = needsRegionBehavior(documentBlueprints(region).blueprints);
	const behaviors = [...read(region, "behaviors") ?? []].filter((behavior) => read(behavior, "type") === REGION_BEHAVIOR_TYPE);
	if (wanted && !behaviors.length) await region.createEmbeddedDocuments?.("RegionBehavior", [{
		type: REGION_BEHAVIOR_TYPE,
		name: game.i18n.localize("BNA.RegionBehavior.label")
	}]);
	else if (!wanted && behaviors.length) await region.deleteEmbeddedDocuments?.("RegionBehavior", behaviors.map((behavior) => behavior.id));
}
/** Keep regions' behaviors in step with their blueprints (active GM). */
function registerRegionBehaviorSync() {
	const sync = (region) => {
		if (!isDocument(region) || game.users.activeGM?.id !== game.user.id) return;
		guardedAsync("region behavior", () => syncRegionBehavior(region));
	};
	Hooks.on("createRegion", (region) => sync(region));
	Hooks.on("updateRegion", (region, changes) => {
		if (touchesBlueprints(changes)) sync(region);
	});
}
//#endregion
//#region src/module.ts
var api = createApi();
Object.assign(globalThis, {
	BuildNAction: api,
	buildNAction: api
});
Hooks.once("init", () => {
	registerSettings();
	registerLibrary();
	registerMigrationMenu();
	registerRegionBehavior();
	registerHeaderControls();
	const module = game.modules.get(MODULE_SCOPE);
	if (module) module.api = api;
});
Hooks.once("ready", () => {
	registerAuraPreviews();
	registerSocket();
	registerSaves();
	validateIntegrations();
	registerPreRollHooks();
	registerChoicePanel();
	registerReactionHooks();
	registerTriggerHooks();
	registerRegionBehaviorSync();
	loadTraitTrees().catch((error) => console.warn("Build-n-Action | could not load language and tool trees", error));
	Hooks.callAll(`${MODULE_SCOPE}.ready`, api);
});
//#endregion
