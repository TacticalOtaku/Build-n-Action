import { $ as documentBlueprints, A as replaceData, At as asRecord, B as createRider, C as pendingRoll, D as sourceLabel, E as loadTraitTrees, F as addRider, G as SETTINGS, H as canEdit, I as riderClock, L as useRiders, M as scaledFormula, Mt as asStrings, N as simplifyNumber, O as registerAuraPreviews, Ot as asBoolean, P as resolveModifiers, Q as carrierKind, R as countRest, S as resolveRollTarget, St as getResult, U as openEditor, X as setting, Z as actorToken, _ as guardedAsync, at as listOf, b as recordUsages, c as registerMigrationMenu, d as activationFor, et as documentFromUuid, f as activationOf, g as guarded, h as evaluateEvent, i as createApi, j as resolveForeign, jt as asString, k as modifyFormulaParts, kt as asNumber, lt as MODULE_SCOPE, m as announceApplied, n as foundryTranslator, nt as originRollData, ot as read, p as allowIntents, q as registerSettings, r as createPhraseFormatter, rt as rollDataOf, s as validateIntegrations, st as stringList, t as foundryChoices, tt as isDocument, u as registerLibrary, v as makeRoller, vt as randomId, w as registerPending, x as rememberActivation, y as midiActivation, z as recordUsage } from "./chunks/choices-JhATeK3R.mjs";
//#region src/runtime/choices.ts
function sortIntents(intents) {
	const sorted = {
		immediate: [],
		choices: [],
		reminders: []
	};
	const order = /* @__PURE__ */ new Map();
	const choices = /* @__PURE__ */ new Map();
	for (const intent of intents) {
		if (intent.type === "reminder") {
			sorted.reminders.push(intent);
			continue;
		}
		if (!intent.common.optional) {
			sorted.immediate.push(intent);
			continue;
		}
		if (!order.has(intent.entry)) order.set(intent.entry, order.size);
		const key = `${order.get(intent.entry)}:${intent.common.choiceGroup}`;
		let choice = choices.get(key);
		if (!choice) {
			choice = {
				key,
				intents: [],
				cost: readCost({})
			};
			choices.set(key, choice);
			sorted.choices.push(choice);
		}
		choice.intents.push(intent);
		const cost = readCost(intent.common.cost);
		if (choice.cost.type === "none" && cost.type !== "none") choice.cost = cost;
	}
	return sorted;
}
var PAYABLE = [
	"uses",
	"quantity",
	"slots",
	"health",
	"hitdice",
	"currency",
	"inspiration",
	"effect"
];
function readCost(value) {
	const cost = asRecord(value);
	const type = asString(cost.type, "none");
	return {
		type: PAYABLE.includes(type) ? type : "none",
		subtype: asString(cost.subtype),
		min: asString(cost.min),
		max: asString(cost.max),
		step: asNumber(cost.step) ?? 1,
		scales: asBoolean(cost.scales),
		formula: asString(cost.formula)
	};
}
/** Evaluate min and max (v1 ConsumptionModel#prepareDerivedData). */
function resolveCost(cost, evaluate) {
	const number = (formula) => formula.trim() ? evaluate(formula) : null;
	let min = number(cost.min) ?? 1;
	let max = number(cost.max);
	if (max !== null && min > max) [min, max] = [max, min];
	return {
		...cost,
		min,
		max
	};
}
function slotsFrom(state, min) {
	return state.slots.filter((slot) => slot.value && slot.max && slot.level && slot.level >= min);
}
function hitDiceAvailable(cost, state) {
	if (!state.hitDice) return 0;
	return ["smallest", "largest"].includes(cost.subtype) ? state.hitDice.value : state.hitDice.bySize[cost.subtype] ?? 0;
}
function valid(cost, state) {
	const invalidScale = cost.scales && (cost.max ?? Infinity) < cost.min;
	switch (cost.type) {
		case "uses": return !invalidScale && !!state.uses?.limited && cost.min > 0;
		case "quantity": return !invalidScale && state.quantity !== null && cost.min > 0;
		case "effect": return true;
		case "health":
		case "slots": return !invalidScale && cost.min > 0;
		case "currency": return !invalidScale && state.currencies.includes(cost.subtype) && cost.min > 0;
		case "inspiration": return true;
		case "hitdice": return !invalidScale && [
			"smallest",
			"largest",
			...state.hitDieTypes
		].includes(cost.subtype) && cost.min > 0;
		default: return false;
	}
}
/** Whether the choice can be offered: nothing to pay, or the minimum can be paid by an owner. */
function costAvailable(cost, state) {
	if (cost.type === "none") return true;
	if (!valid(cost, state) || !state.owner) return false;
	const hp = state.hp;
	switch (cost.type) {
		case "uses": return (state.uses?.value ?? 0) >= cost.min;
		case "quantity": return (state.quantity ?? 0) >= cost.min;
		case "effect": return state.effect;
		case "slots": return slotsFrom(state, cost.min).length > 0;
		case "health": return !!hp && hp.value + hp.temp >= cost.min;
		case "currency": return (state.currency?.[cost.subtype] ?? 0) >= cost.min;
		case "inspiration": return state.actorType === "character" && state.inspiration === true;
		case "hitdice": return state.actorType === "character" && hitDiceAvailable(cost, state) >= cost.min;
		default: return false;
	}
}
/** Whether the player picks how much to pay (v1 OptionalSelector#doesBonusScale). */
function costScales(cost, state) {
	if (!cost.scales || !valid(cost, state)) return false;
	if (["effect", "inspiration"].includes(cost.type)) return false;
	if (["health", "currency"].includes(cost.type)) return cost.step > 0;
	return true;
}
/** The lowest spell slot at or above `min`, preferring pact slots on a tie (v1). */
function lowestSlot(state, min) {
	const slots = slotsFrom(state, min);
	if (!slots.length) return null;
	const level = Math.min(...slots.map((slot) => slot.level));
	const lowest = slots.filter((slot) => slot.level === level);
	return lowest.find((slot) => !slot.key.startsWith("spell")) ?? lowest[0] ?? null;
}
function stepped(from, to, step, available, min) {
	const options = [];
	for (let amount = from; amount <= to; amount += step) options.push({
		value: String(amount),
		amount,
		scale: Math.floor((amount - min) / step),
		available
	});
	return options;
}
/** New `spent` values after spending `amount` hit dice of a size, or the smallest/largest first (v1 buildHitDiceUpdates). */
function hitDiceSpend(classes, subtype, amount) {
	const bySize = ["smallest", "largest"].includes(subtype);
	let eligible = classes.filter((cls) => bySize || cls.denomination === subtype);
	if (bySize) eligible = [...eligible].sort((left, right) => {
		const order = left.denomination.localeCompare(right.denomination, "en", { numeric: true });
		return subtype === "largest" ? -order : order;
	});
	const updates = [];
	let remaining = Math.trunc(amount);
	for (const cls of eligible) {
		const available = (remaining > 0 ? cls.levels : 0) - cls.spent;
		const delta = remaining > 0 ? Math.min(remaining, available) : Math.max(remaining, available);
		if (!delta) continue;
		updates.push({
			id: cls.id,
			spent: cls.spent + delta
		});
		remaining -= delta;
		if (!remaining) break;
	}
	return updates;
}
/** The amounts (or slots) the player may pay; a non-scaling cost has one option at the minimum. */
function costOptions(cost, state) {
	const min = cost.min;
	const max = cost.max ?? Infinity;
	const uses = state.uses;
	const hp = state.hp;
	const hpAvailable = hp ? Math.max(0, hp.value) + Math.max(0, hp.temp) : 0;
	const available = (() => {
		switch (cost.type) {
			case "uses": return uses ? `${uses.value}/${uses.max}` : "";
			case "quantity": return String(state.quantity ?? 0);
			case "health": return hp ? `${hpAvailable}/${Math.max(0, hp.max) + Math.max(0, hp.tempmax)}` : "";
			case "currency": return String(state.currency?.[cost.subtype] ?? 0);
			case "hitdice": return state.hitDice ? ["smallest", "largest"].includes(cost.subtype) ? `${state.hitDice.value}/${state.hitDice.max}` : String(hitDiceAvailable(cost, state)) : "";
			default: return "";
		}
	})();
	if (!costScales(cost, state)) {
		if (cost.type === "slots") {
			const slot = lowestSlot(state, min);
			return slot ? [{
				value: slot.key,
				amount: 1,
				scale: 0,
				available: `${slot.value}/${slot.max}`
			}] : [];
		}
		const amount = ["effect", "inspiration"].includes(cost.type) ? 1 : min;
		return [{
			value: String(amount),
			amount,
			scale: 0,
			available
		}];
	}
	switch (cost.type) {
		case "uses":
		case "quantity": {
			const have = cost.type === "uses" ? uses?.value ?? 0 : state.quantity ?? 0;
			return stepped(Math.max(1, min), Math.min(have, max), 1, available, min);
		}
		case "slots": return slotsFrom(state, min).sort((a, b) => a.level - b.level || a.key.localeCompare(b.key)).map((slot) => ({
			value: slot.key,
			amount: 1,
			scale: Math.min(slot.level - min, max - 1),
			available: `${slot.value}/${slot.max}`
		}));
		case "health": {
			const capacity = hp ? Math.max(0, hp.max) + Math.max(0, hp.tempmax) : 0;
			if (hpAvailable < min) return [];
			return stepped(min || 1, Math.min(hpAvailable, cost.max ?? capacity), cost.step, available, min);
		}
		case "currency": {
			const have = state.currency?.[cost.subtype] ?? 0;
			if (have < min) return [];
			return stepped(min || 1, Math.min(have, max), cost.step, available, min);
		}
		case "hitdice": return stepped(min, Math.min(max, hitDiceAvailable(cost, state)), 1, available, min);
		default: return [];
	}
}
//#endregion
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
//#region src/foundry/consume.ts
function number$1(value) {
	return asNumber(value) ?? 0;
}
function slotsOf(actor) {
	return Object.entries(asRecord(read(actor, "system.spells"))).flatMap(([key, slot]) => {
		const level = asNumber(read(slot, "level"));
		const value = asNumber(read(slot, "value"));
		const max = asNumber(read(slot, "max"));
		return level === null || value === null || max === null ? [] : [{
			key,
			level,
			value,
			max
		}];
	});
}
function numbersIn(value) {
	return Object.fromEntries(Object.entries(asRecord(value)).map(([key, entry]) => [key, number$1(entry)]));
}
function effectExists(effect) {
	const effects = read(effect.parent, "effects");
	const has = read(effects, "has");
	return typeof has === "function" && has.call(effects, effect.id) === true;
}
/** A character's classes with their hit dice (dnd5e 5.x fields). */
function classHitDice(actor) {
	return listOf(read(actor, "system.attributes.hd.classes")).filter(isDocument).map((cls) => ({
		id: cls.id,
		denomination: asString(read(cls, "system.hd.denomination")),
		levels: number$1(read(cls, "system.levels")),
		spent: number$1(read(cls, "system.hd.spent"))
	}));
}
/** What the roller and the blueprint's carrier can pay right now. */
function costState(type, actor, info) {
	const carrier = info.document;
	const item = carrier.documentName === "Item" ? carrier : null;
	const payer = [
		"uses",
		"quantity",
		"effect"
	].includes(type) ? carrier : actor;
	const hp = read(actor, "system.attributes.hp");
	const hd = read(actor, "system.attributes.hd");
	return {
		owner: payer.isOwner === true,
		actorType: asString(read(actor, "type")),
		uses: item ? {
			value: number$1(read(item, "system.uses.value")),
			max: number$1(read(item, "system.uses.max")),
			limited: read(item, "hasLimitedUses") === true
		} : null,
		quantity: item && typeof read(item, "system.quantity") === "number" ? number$1(read(item, "system.quantity")) : null,
		effect: carrier.documentName === "ActiveEffect" && effectExists(carrier),
		slots: slotsOf(actor),
		hp: hp ? {
			value: number$1(read(hp, "value")),
			temp: number$1(read(hp, "temp")),
			max: number$1(read(hp, "max")),
			tempmax: number$1(read(hp, "tempmax"))
		} : null,
		currency: numbersIn(read(actor, "system.currency")),
		hitDice: hd ? {
			value: number$1(read(hd, "value")),
			max: number$1(read(hd, "max")),
			bySize: numbersIn(read(hd, "bySize"))
		} : null,
		inspiration: read(actor, "system.attributes.inspiration") === true,
		currencies: Object.keys(asRecord(CONFIG.DND5E.currencies)),
		hitDieTypes: stringList(CONFIG.DND5E.hitDieTypes)
	};
}
async function call$2(target, method, ...args) {
	const fn = read(target, method);
	if (typeof fn !== "function") throw new Error(`Build-n-Action | ${method} is not available`);
	return fn.apply(target, args);
}
async function confirmDelete(document) {
	return !!await call$2(document, "deleteDialog");
}
/** Pay a choice's cost; false when the player cancelled a confirmation. */
async function payCost(cost, option, actor, info) {
	const carrier = info.document;
	switch (cost.type) {
		case "none": return true;
		case "uses": {
			const spent = number$1(read(carrier, "system.uses.spent")) + option.amount;
			if (spent >= number$1(read(carrier, "system.uses.max")) && read(carrier, "system.uses.autoDestroy") === true) return confirmDelete(carrier);
			await carrier.update({ "system.uses.spent": spent });
			return true;
		}
		case "quantity":
			await carrier.update({ "system.quantity": number$1(read(carrier, "system.quantity")) - option.amount });
			return true;
		case "slots":
			await actor.update({ [`system.spells.${option.value}.value`]: number$1(read(actor, `system.spells.${option.value}.value`)) - 1 });
			return true;
		case "health":
			await call$2(actor, "applyDamage", option.amount);
			return true;
		case "effect": return confirmDelete(carrier);
		case "inspiration":
			await actor.update({ "system.attributes.inspiration": false });
			return true;
		case "currency":
			await actor.update({ [`system.currency.${cost.subtype}`]: number$1(read(actor, `system.currency.${cost.subtype}`)) - option.amount });
			return true;
		case "hitdice":
			await call$2(actor, "updateEmbeddedDocuments", "Item", hitDiceSpend(classHitDice(actor), cost.subtype, option.amount).map((entry) => ({
				_id: entry.id,
				"system.hd.spent": entry.spent
			})));
			return true;
		default: return false;
	}
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
function headerControl(document, count) {
	return {
		action: "bnaOpenEditor",
		icon: ICON,
		label: count ? game.i18n.format("BNA.Header.labelCount", { count }) : game.i18n.localize("BNA.Header.label"),
		onClick: () => open(document)
	};
}
function addTitleButton(application, document) {
	const element = read(application, "element");
	if (!(element instanceof HTMLElement)) return;
	const header = element.querySelector(".window-header");
	if (!header || header.querySelector(".bna-header-button")) return;
	const label = game.i18n.localize("BNA.Header.label");
	const button = globalThis.document.createElement("button");
	button.type = "button";
	button.className = `header-control icon ${ICON} bna-header-button`;
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
		if (document) controls.unshift(headerControl(document, documentBlueprints(document).blueprints.length));
	});
	Hooks.on("renderApplicationV2", (application) => {
		if (!setting(SETTINGS.headerLabel)) return;
		const document = carrierOf(application);
		if (document) addTitleButton(application, document);
	});
}
//#endregion
//#region src/foundry/preroll.ts
function runRoll(event, config, dialog, message, roller) {
	const activation = activationOf(config, message);
	const evaluation = evaluateEvent(event, roller, ["out"], activation);
	if (!evaluation?.chain.intents.length) return;
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
	if (!sorted.choices.length && !sorted.reminders.length || !dialog || typeof dialog !== "object") return;
	const id = registerPending({
		ctx,
		sorted,
		tracker,
		applied: /* @__PURE__ */ new Set(),
		context: evaluation.context
	});
	const holder = dialog;
	const options = asRecord(holder.options);
	holder.options = options;
	options[MODULE_SCOPE] = { pending: id };
	if (sorted.choices.length) holder.configure = true;
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
//#region src/runtime/operations.ts
var OPERATION_KINDS = [
	"status",
	"copyEffect",
	"removeEffects",
	"resource",
	"rider"
];
var RESOURCES = [
	"uses",
	"slots",
	"hp",
	"tempHp",
	"hitDice",
	"currency"
];
function recipient(data, fallback, ctx) {
	return asString(data.who, fallback) === "target" ? ctx.target : ctx.self;
}
/** The change an applyEffect, removeEffect or resource result makes; null when there is nothing to do. */
function planOperation(type, data, ctx) {
	switch (type) {
		case "applyEffect": {
			const actor = recipient(data, "target", ctx);
			if (!actor) return null;
			if (asString(data.source, "status") === "itemEffect") {
				const effectId = asString(data.effectId);
				if (!effectId || !ctx.carrierItem) return null;
				return {
					kind: "copyEffect",
					actor,
					effect: `${ctx.carrierItem}.ActiveEffect.${effectId}`,
					origin: ctx.origin
				};
			}
			const status = asString(data.status);
			return status ? {
				kind: "status",
				actor,
				status,
				active: true
			} : null;
		}
		case "removeEffect": {
			const actor = recipient(data, "self", ctx);
			if (!actor) return null;
			if (asString(data.match, "status") === "name") {
				const name = asString(data.name).trim();
				return name ? {
					kind: "removeEffects",
					actor,
					name
				} : null;
			}
			const status = asString(data.status);
			return status ? {
				kind: "status",
				actor,
				status,
				active: false
			} : null;
		}
		case "resource": {
			const actor = recipient(data, "self", ctx);
			const resource = asString(data.resource, "uses");
			const amount = Math.trunc(ctx.amount);
			if (!actor || !RESOURCES.includes(resource) || !amount) return null;
			if (resource === "uses" && !ctx.carrierItem) return null;
			return {
				kind: "resource",
				actor,
				item: resource === "uses" ? ctx.carrierItem : null,
				resource,
				delta: asString(data.action, "spend") === "restore" ? amount : -amount,
				slot: asString(data.slotLevel),
				currency: asString(data.currency, "gp")
			};
		}
		default: return null;
	}
}
/** New `spent` after `delta` uses become available (negative spends). */
function usesSpent(spent, max, delta) {
	return Math.min(max, Math.max(0, spent - delta));
}
function slotValue(value, max, delta) {
	return Math.min(max, Math.max(0, value + delta));
}
/** The requested slot, or the lowest slot that can be spent (delta < 0) or refilled (delta > 0). */
function pickSlot(slots, wanted, delta) {
	if (wanted) return slots.some((slot) => slot.key === wanted) ? wanted : null;
	return slots.filter((slot) => slot.max > 0 && (delta < 0 ? slot.value > 0 : slot.value < slot.max)).sort((a, b) => a.level - b.level || a.key.localeCompare(b.key))[0]?.key ?? null;
}
/** Temporary hit points do not stack: restoring keeps the higher value; spending removes them. */
function tempHp(current, delta) {
	return delta > 0 ? Math.max(current, delta) : Math.max(0, current + delta);
}
function currencyValue(value, delta) {
	return Math.max(0, value + delta);
}
//#endregion
//#region src/foundry/operations.ts
function number(value) {
	return asNumber(value) ?? 0;
}
async function call$1(target, method, ...args) {
	const fn = read(target, method);
	if (typeof fn !== "function") throw new Error(`Build-n-Action | ${method} is not available`);
	return fn.apply(target, args);
}
async function documentAt(uuid) {
	if (!uuid) return null;
	const found = await fromUuid(uuid);
	return isDocument(found) ? found : null;
}
/** Whether this user may make the change without the GM. */
function canRunLocally(op) {
	if (!documentFromUuid(op.actor)?.isOwner) return false;
	if (op.kind === "resource" && op.item) return documentFromUuid(op.item)?.isOwner === true;
	return true;
}
async function applyResource(actor, op) {
	switch (op.resource) {
		case "uses": {
			const item = await documentAt(op.item ?? "");
			if (!item) return;
			await item.update({ "system.uses.spent": usesSpent(number(read(item, "system.uses.spent")), number(read(item, "system.uses.max")), op.delta) });
			return;
		}
		case "slots": {
			const slots = slotsOf(actor);
			const key = pickSlot(slots, op.slot, op.delta);
			const slot = slots.find((entry) => entry.key === key);
			if (!slot) return;
			await actor.update({ [`system.spells.${slot.key}.value`]: slotValue(slot.value, slot.max, op.delta) });
			return;
		}
		case "hp":
			await call$1(actor, "applyDamage", -op.delta);
			return;
		case "tempHp":
			await actor.update({ "system.attributes.hp.temp": tempHp(number(read(actor, "system.attributes.hp.temp")), op.delta) });
			return;
		case "hitDice": {
			const updates = hitDiceSpend(classHitDice(actor), op.delta < 0 ? "smallest" : "largest", -op.delta).map((entry) => ({
				_id: entry.id,
				"system.hd.spent": entry.spent
			}));
			if (updates.length) await call$1(actor, "updateEmbeddedDocuments", "Item", updates);
			return;
		}
		case "currency":
			await actor.update({ [`system.currency.${op.currency}`]: currencyValue(number(read(actor, `system.currency.${op.currency}`)), op.delta) });
			return;
	}
}
/** Make one change; throws when the documents are missing. */
async function executeOperation(op) {
	const actor = await documentAt(op.actor);
	if (!actor) throw new Error(`Build-n-Action | no actor ${op.actor}`);
	switch (op.kind) {
		case "status":
			await call$1(actor, "toggleStatusEffect", op.status, { active: op.active });
			return;
		case "copyEffect": {
			const effect = await documentAt(op.effect);
			if (!effect) throw new Error(`Build-n-Action | no effect ${op.effect}`);
			const data = asRecord(await call$1(effect, "toObject"));
			delete data._id;
			Object.assign(data, {
				origin: op.origin,
				transfer: false,
				disabled: false
			});
			await call$1(actor, "createEmbeddedDocuments", "ActiveEffect", [data]);
			return;
		}
		case "removeEffects": {
			const ids = listOf(read(actor, "effects")).filter(isDocument).filter((effect) => effect.name === op.name).map((effect) => effect.id);
			if (ids.length) await call$1(actor, "deleteEmbeddedDocuments", "ActiveEffect", ids);
			return;
		}
		case "resource":
			await applyResource(actor, op);
			return;
		case "rider":
			await addRider(actor, op.rider);
			return;
	}
}
//#endregion
//#region src/foundry/socket.ts
var CHANNEL = `module.${MODULE_SCOPE}`;
var TIMEOUT_MS = 15e3;
var waiting = /* @__PURE__ */ new Map();
function isOperation(value) {
	return OPERATION_KINDS.includes(asString(read(value, "kind"))) && typeof read(value, "actor") === "string";
}
async function onMessage(message) {
	const type = read(message, "type");
	const id = asString(read(message, "id"));
	if (type === "reply") {
		if (read(message, "recipient") !== game.user.id) return;
		waiting.get(id)?.({
			ok: read(message, "ok") === true,
			error: asString(read(message, "error")) || null
		});
		return;
	}
	if (type !== "operations" || !game.user.isGM || read(message, "gm") !== game.user.id) return;
	let error = null;
	for (const op of listOf(read(message, "operations")).filter(isOperation)) try {
		await executeOperation(op);
	} catch (failure) {
		error = failure instanceof Error ? failure.message : String(failure);
		console.warn("Build-n-Action | a requested change failed", op, failure);
	}
	game.socket.emit(CHANNEL, {
		type: "reply",
		id,
		recipient: read(message, "sender"),
		ok: error === null,
		error
	});
}
function registerSocket() {
	game.socket.on(CHANNEL, (message) => {
		onMessage(message);
	});
}
/** Make changes: locally where allowed, through the active GM otherwise. False when something was skipped. */
async function performOperations(operations) {
	const remote = [];
	let ok = true;
	for (const op of operations) {
		if (!canRunLocally(op)) {
			remote.push(op);
			continue;
		}
		try {
			await executeOperation(op);
		} catch (error) {
			ok = false;
			console.warn("Build-n-Action | a change failed", op, error);
		}
	}
	if (!remote.length) return ok;
	const gm = game.users.activeGM;
	if (!gm) {
		ui.notifications.warn(game.i18n.localize("BNA.Runtime.NoGM"));
		return false;
	}
	const id = randomId();
	const reply = new Promise((resolve) => {
		const timer = setTimeout(() => {
			waiting.delete(id);
			resolve(null);
		}, TIMEOUT_MS);
		waiting.set(id, (answer) => {
			clearTimeout(timer);
			waiting.delete(id);
			resolve(answer);
		});
	});
	game.socket.emit(CHANNEL, {
		type: "operations",
		id,
		sender: game.user.id,
		gm: gm.id,
		operations: remote
	});
	const answer = await reply;
	if (!answer?.ok) {
		console.warn("Build-n-Action | the GM could not make all changes", answer?.error ?? "no reply");
		ui.notifications.warn(game.i18n.localize("BNA.Runtime.RemoteFailed"));
		return false;
	}
	return ok;
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
/** Turn reaction results into operations (riders, effects, resources) and perform them. */
async function applyReactionIntents(intents, ctx, activation, options = {}) {
	const operations = [];
	const self = ctx.roller.actor;
	const target = ctx.roller.target?.actor ?? null;
	for (const intent of intents) {
		const info = ctx.sources.get(intent.entry);
		if (!info) continue;
		const data = options.data ?? originRollData(info.document);
		const origin = info.origin?.uuid ?? info.document.uuid;
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
			if (rider) operations.push({
				kind: "rider",
				actor: recipient.uuid,
				rider
			});
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
		if (op) operations.push(op);
	}
	if (operations.length) await performOperations(operations);
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
	await applyReactionIntents(sorted.immediate, ctx, input.activation);
	announceApplied(sorted.immediate, evaluation.context);
	recordUsages(sorted.immediate, roller.actor);
	if (!sorted.choices.length) return;
	await promptChoices({
		ctx,
		applied: /* @__PURE__ */ new Set(),
		apply: async (choice, info, scale) => {
			await applyReactionIntents(choice.intents, ctx, input.activation, {
				data: choiceData(info, ctx, scale),
				scale,
				costFormula: choice.cost.formula
			});
			announceApplied(choice.intents, evaluation.context);
		}
	}, sorted.choices, input.actor);
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
	registerHeaderControls();
	const module = game.modules.get(MODULE_SCOPE);
	if (module) module.api = api;
});
Hooks.once("ready", () => {
	registerAuraPreviews();
	registerSocket();
	validateIntegrations();
	registerPreRollHooks();
	registerChoicePanel();
	registerReactionHooks();
	loadTraitTrees().catch((error) => console.warn("Build-n-Action | could not load language and tool trees", error));
	Hooks.callAll(`${MODULE_SCOPE}.ready`, api);
});
//#endregion

//# sourceMappingURL=module.mjs.map