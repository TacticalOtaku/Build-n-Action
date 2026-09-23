//#region src/core/registry/constants.ts
var EVENT_TYPES = [
	"attackRoll",
	"damageRoll",
	"saveDC",
	"savingThrow",
	"abilityCheck",
	"hitDie",
	"afterAttack",
	"afterTargetSave",
	"afterDamage",
	"afterCheck",
	"signal"
];
/** Events fired once a roll is resolved; they expose outcome pins. */
var REACTION_EVENTS = [
	"afterAttack",
	"afterTargetSave",
	"afterDamage",
	"afterCheck"
];
/** Events whose context always carries the item (and activity) being used. */
var ITEM_EVENTS = [
	"attackRoll",
	"damageRoll",
	"saveDC",
	"afterAttack",
	"afterTargetSave",
	"afterDamage"
];
var NODE_KINDS = [
	"event",
	"condition",
	"result"
];
/** The single node type of kind "condition"; its checks live in its data. */
var CONDITION_NODE_TYPE = "condition";
//#endregion
//#region src/core/registry/choices.ts
function choices(group, values) {
	return values.map((value) => ({
		value,
		label: `BNA.Choice.${group}.${value}`
	}));
}
/** Choice lists owned by the module. Labels are i18n keys `BNA.Choice.<group>.<value>`. */
var STATIC = {
	reachMode: choices("reachMode", [
		"self",
		"aura",
		"template",
		"region"
	]),
	disposition: [
		{
			value: "2",
			label: "BNA.Choice.disposition.any"
		},
		{
			value: "1",
			label: "BNA.Choice.disposition.ally"
		},
		{
			value: "-1",
			label: "BNA.Choice.disposition.enemy"
		}
	],
	conditionMode: choices("conditionMode", ["all", "any"]),
	threshold: choices("threshold", ["atMost", "atLeast"]),
	componentMatch: choices("componentMatch", ["any", "all"]),
	modifierMode: choices("modifierMode", ["add", "multiply"]),
	who: choices("who", ["self", "target"]),
	riderScope: choices("riderScope", ["sameActivation", "nextRoll"]),
	riderRoll: choices("riderRoll", [
		"attackRoll",
		"damageRoll",
		"savingThrow",
		"abilityCheck"
	]),
	durationUnit: choices("durationUnit", [
		"uses",
		"rounds",
		"turns",
		"untilRest"
	]),
	effectSource: choices("effectSource", ["status", "itemEffect"]),
	removeMatch: choices("removeMatch", ["status", "name"]),
	resourceAction: choices("resourceAction", ["spend", "restore"]),
	resourceType: choices("resourceType", [
		"uses",
		"slots",
		"hp",
		"tempHp",
		"hitDice",
		"currency"
	]),
	signalScope: choices("signalScope", ["actor", "document"]),
	costType: choices("costType", [
		"none",
		"uses",
		"quantity",
		"slots",
		"health",
		"hitdice",
		"currency",
		"inspiration",
		"effect"
	]),
	hitDieSize: choices("hitDieSize", [
		"smallest",
		"largest",
		"d6",
		"d8",
		"d10",
		"d12"
	]),
	limit: choices("limit", [
		"none",
		"turn",
		"round",
		"shortRest",
		"longRest"
	]),
	comparisonOperator: choices("comparisonOperator", [
		"EQ",
		"LT",
		"GT",
		"LE",
		"GE"
	])
};
//#endregion
//#region src/core/registry/data.ts
function asString(value, fallback = "") {
	return typeof value === "string" ? value : fallback;
}
function asStrings(value) {
	return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
function asNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function asBoolean(value) {
	return value === true;
}
function asRecord(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
//#endregion
//#region src/core/registry/checks.ts
var ALL = EVENT_TYPES;
var ITEM = [...ITEM_EVENTS, "signal"];
var NO_HIT_DIE = EVENT_TYPES.filter((type) => type !== "hitDie");
/** Fields of the condition node itself (its checks are stored alongside). */
var CONDITION_NODE_FIELDS = [{
	key: "mode",
	kind: "select",
	label: "BNA.Field.conditionMode.label",
	hint: "BNA.Field.conditionMode.hint",
	default: "all",
	choices: { static: STATIC.conditionMode }
}];
function anyOf(source, exclusion) {
	return {
		key: "values",
		kind: "multiselect",
		label: "BNA.Field.anyOf.label",
		hint: exclusion ? "BNA.Field.anyOf.hintExclusion" : "BNA.Field.anyOf.hint",
		default: [],
		choices: { source },
		exclusion
	};
}
var TAGS = {
	key: "values",
	kind: "tags",
	label: "BNA.Field.tags.label",
	hint: "BNA.Field.tags.hint",
	default: []
};
/** A check that passes when a runtime value is one of the selected choices. */
function listCheck(type, category, icon, source, relevantTo, exclusion = true) {
	const spec = { source };
	return {
		type,
		category,
		icon,
		relevantTo,
		fields: [anyOf(source, exclusion)],
		phrase: (data, fmt) => fmt.t(`BNA.Check.${type}.Phrase`, { values: fmt.choices(asStrings(data.values), spec) })
	};
}
/** A check that passes when a free-form slug (identifier, marker, class) is one of the entered tags. */
function tagCheck(type, category, icon, relevantTo) {
	return {
		type,
		category,
		icon,
		relevantTo,
		fields: [TAGS],
		phrase: (data, fmt) => {
			const values = asStrings(data.values);
			return fmt.t(`BNA.Check.${type}.Phrase`, { values: values.length ? fmt.joinOr(values) : fmt.t("BNA.Phrase.Any") });
		}
	};
}
function field(check, key) {
	return {
		label: `BNA.Check.${check}.Field.${key}`,
		hint: `BNA.Check.${check}.Field.${key}Hint`
	};
}
var attackModes = {
	type: "attackModes",
	category: "item",
	icon: "move-diagonal",
	relevantTo: [
		"damageRoll",
		"afterDamage",
		"signal"
	],
	fields: [
		{
			key: "value",
			kind: "multiselect",
			...field("attackModes", "value"),
			default: [],
			choices: { source: "attackTypes" }
		},
		{
			key: "classification",
			kind: "multiselect",
			...field("attackModes", "classification"),
			default: [],
			choices: { source: "attackClassifications" }
		},
		{
			key: "mode",
			kind: "multiselect",
			...field("attackModes", "mode"),
			default: [],
			choices: { source: "attackModes" }
		}
	],
	phrase: (data, fmt) => {
		const parts = [];
		const add = (key, source) => {
			const values = asStrings(data[key]);
			if (values.length) parts.push(fmt.choices(values, { source }));
		};
		add("value", "attackTypes");
		add("classification", "attackClassifications");
		add("mode", "attackModes");
		return fmt.t("BNA.Check.attackModes.Phrase", { values: parts.length ? fmt.joinAnd(parts) : fmt.t("BNA.Phrase.Any") });
	}
};
var featureTypes = {
	type: "featureTypes",
	category: "item",
	icon: "star",
	relevantTo: ITEM,
	fields: [{
		key: "type",
		kind: "select",
		...field("featureTypes", "type"),
		default: "",
		choices: { source: "featureTypes" }
	}, {
		key: "subtype",
		kind: "text",
		...field("featureTypes", "subtype"),
		default: ""
	}],
	phrase: (data, fmt) => {
		const type = fmt.choice(asString(data.type), { source: "featureTypes" }) || fmt.t("BNA.Phrase.Any");
		const subtype = asString(data.subtype);
		return subtype ? fmt.t("BNA.Check.featureTypes.PhraseSubtype", {
			type,
			subtype
		}) : fmt.t("BNA.Check.featureTypes.Phrase", { type });
	}
};
var thisItem = {
	type: "thisItem",
	category: "item",
	icon: "pin",
	relevantTo: ITEM,
	fields: [],
	phrase: (_data, fmt) => fmt.t("BNA.Check.thisItem.Phrase")
};
var spellComponents = {
	type: "spellComponents",
	category: "spell",
	icon: "hand",
	relevantTo: ITEM,
	fields: [{
		key: "types",
		kind: "multiselect",
		...field("spellComponents", "types"),
		default: [],
		choices: { source: "spellComponents" }
	}, {
		key: "match",
		kind: "select",
		...field("spellComponents", "match"),
		default: "any",
		choices: { static: STATIC.componentMatch }
	}],
	phrase: (data, fmt) => {
		const labels = asStrings(data.types).map((value) => fmt.choice(value, { source: "spellComponents" }));
		if (!labels.length) return fmt.t("BNA.Check.spellComponents.Phrase.any", { values: fmt.t("BNA.Phrase.Any") });
		return asString(data.match) === "all" ? fmt.t("BNA.Check.spellComponents.Phrase.all", { values: fmt.joinAnd(labels) }) : fmt.t("BNA.Check.spellComponents.Phrase.any", { values: fmt.joinOr(labels) });
	}
};
var healthPercentages = {
	type: "healthPercentages",
	category: "self",
	icon: "heart",
	relevantTo: ALL,
	fields: [{
		key: "value",
		kind: "number",
		...field("healthPercentages", "value"),
		default: null,
		min: 0,
		max: 100,
		step: 1
	}, {
		key: "type",
		kind: "select",
		label: "BNA.Check.healthPercentages.Field.type",
		default: "atMost",
		choices: { static: STATIC.threshold }
	}],
	phrase: (data, fmt) => {
		const value = asNumber(data.value);
		if (value === null) return fmt.t("BNA.Check.healthPercentages.PhraseAny");
		const type = asString(data.type) === "atLeast" ? "atLeast" : "atMost";
		return fmt.t(`BNA.Check.healthPercentages.Phrase.${type}`, { value });
	}
};
var remainingSpellSlots = {
	type: "remainingSpellSlots",
	category: "self",
	icon: "battery",
	relevantTo: ALL,
	fields: [
		{
			key: "min",
			kind: "number",
			...field("remainingSpellSlots", "min"),
			default: null,
			min: 0,
			step: 1
		},
		{
			key: "max",
			kind: "number",
			...field("remainingSpellSlots", "max"),
			default: null,
			min: 0,
			step: 1
		},
		{
			key: "size",
			kind: "toggle",
			...field("remainingSpellSlots", "size"),
			default: false
		}
	],
	phrase: (data, fmt) => {
		const min = asNumber(data.min);
		const max = asNumber(data.max);
		let text;
		if (min !== null && max !== null) text = fmt.t("BNA.Check.remainingSpellSlots.Phrase.range", {
			min,
			max
		});
		else if (min !== null) text = fmt.t("BNA.Check.remainingSpellSlots.Phrase.min", { min });
		else if (max !== null) text = fmt.t("BNA.Check.remainingSpellSlots.Phrase.max", { max });
		else return fmt.t("BNA.Check.remainingSpellSlots.PhraseAny");
		return asBoolean(data.size) ? `${text} ${fmt.t("BNA.Check.remainingSpellSlots.PhraseSize")}` : text;
	}
};
var tokenSizes = {
	type: "tokenSizes",
	category: "target",
	icon: "maximize",
	relevantTo: NO_HIT_DIE,
	fields: [
		{
			key: "size",
			kind: "number",
			...field("tokenSizes", "size"),
			default: null,
			min: .5,
			step: .5
		},
		{
			key: "type",
			kind: "select",
			label: "BNA.Check.tokenSizes.Field.type",
			default: "atLeast",
			choices: { static: STATIC.threshold }
		},
		{
			key: "self",
			kind: "toggle",
			...field("tokenSizes", "self"),
			default: false
		}
	],
	phrase: (data, fmt) => {
		const size = asNumber(data.size);
		if (size === null) return fmt.t("BNA.Check.tokenSizes.PhraseAny");
		const type = asString(data.type) === "atMost" ? "atMost" : "atLeast";
		const text = fmt.t(`BNA.Check.tokenSizes.Phrase.${type}`, { size });
		return asBoolean(data.self) ? `${text} ${fmt.t("BNA.Check.tokenSizes.PhraseSelf")}` : text;
	}
};
var OPERATOR_SYMBOLS$1 = {
	EQ: "=",
	LT: "<",
	GT: ">",
	LE: "≤",
	GE: "≥"
};
var arbitraryComparisons = {
	type: "arbitraryComparisons",
	category: "advanced",
	icon: "equal",
	relevantTo: ALL,
	fields: [{
		key: "comparisons",
		kind: "comparisons",
		...field("arbitraryComparisons", "comparisons"),
		default: []
	}],
	phrase: (data, fmt) => {
		const rules = Array.isArray(data.comparisons) ? data.comparisons.map(asRecord) : [];
		if (!rules.length) return fmt.t("BNA.Check.arbitraryComparisons.PhraseAny");
		const texts = rules.map((rule) => {
			const operator = OPERATOR_SYMBOLS$1[asString(rule.operator)] ?? "=";
			return `${asString(rule.one)} ${operator} ${asString(rule.other)}`;
		});
		return fmt.t("BNA.Check.arbitraryComparisons.Phrase", { values: fmt.joinAnd(texts) });
	}
};
var customScripts = {
	type: "customScripts",
	category: "advanced",
	icon: "code",
	relevantTo: ALL,
	fields: [{
		key: "script",
		kind: "script",
		...field("customScripts", "script"),
		default: ""
	}],
	phrase: (_data, fmt) => fmt.t("BNA.Check.customScripts.Phrase")
};
var CHECKS = [
	listCheck("itemTypes", "item", "package", "itemTypes", ITEM, false),
	tagCheck("identifiers", "item", "fingerprint", ITEM),
	listCheck("baseWeapons", "item", "sword", "weaponTypes", ITEM),
	listCheck("weaponProperties", "item", "list-checks", "weaponProperties", ITEM),
	attackModes,
	featureTypes,
	listCheck("damageTypes", "item", "flame", "damageAndHealingTypes", ITEM),
	listCheck("abilities", "item", "dumbbell", "abilities", [
		...ITEM_EVENTS,
		"abilityCheck",
		"afterCheck",
		"signal"
	]),
	thisItem,
	listCheck("spellLevels", "spell", "layers", "spellLevels", ITEM, false),
	listCheck("spellSchools", "spell", "book-open", "spellSchools", ITEM),
	spellComponents,
	listCheck("preparationModes", "spell", "book-marked", "spellMethods", ITEM, false),
	tagCheck("sourceClasses", "spell", "graduation-cap", ITEM),
	listCheck("actorCreatureTypes", "self", "paw-print", "creatureTypes", ALL),
	listCheck("actorCreatureSizes", "self", "ruler", "actorSizes", ALL, false),
	listCheck("actorLanguages", "self", "languages", "languages", ALL),
	listCheck("baseArmors", "self", "shirt", "armorTypes", ALL),
	listCheck("statusEffects", "self", "activity", "statusEffects", ALL),
	healthPercentages,
	remainingSpellSlots,
	listCheck("proficiencyLevels", "self", "award", "proficiencyLevels", [
		"attackRoll",
		"savingThrow",
		"abilityCheck",
		"afterAttack",
		"afterCheck",
		"signal"
	], false),
	tagCheck("markers", "self", "tag", ALL),
	listCheck("creatureTypes", "target", "paw-print", "creatureTypes", NO_HIT_DIE),
	listCheck("targetArmors", "target", "shield-half", "armorTypes", NO_HIT_DIE),
	listCheck("targetEffects", "target", "activity", "statusEffects", NO_HIT_DIE),
	tokenSizes,
	tagCheck("targetMarkers", "target", "tags", NO_HIT_DIE),
	listCheck("saveAbilities", "roll", "shield-check", "abilities", [
		"saveDC",
		"afterTargetSave",
		"signal"
	]),
	listCheck("throwTypes", "roll", "shield", "throwTypes", ["savingThrow", "signal"], false),
	listCheck("skillIds", "roll", "graduation-cap", "skills", [
		"abilityCheck",
		"afterCheck",
		"signal"
	]),
	listCheck("baseTools", "roll", "wrench", "tools", [
		"abilityCheck",
		"afterCheck",
		"signal"
	]),
	arbitraryComparisons,
	customScripts
];
//#endregion
//#region src/core/registry/events.ts
/** "Whose roll": the roller only, or creatures reached by my aura, template, or this region. */
var REACH_FIELD = {
	key: "reach",
	kind: "group",
	label: "BNA.Field.reach.label",
	hint: "BNA.Field.reach.hint",
	fields: [
		{
			key: "mode",
			kind: "select",
			label: "BNA.Field.reachMode.label",
			hint: "BNA.Field.reachMode.hint",
			default: "self",
			choices: { static: STATIC.reachMode }
		},
		{
			key: "range",
			kind: "formula",
			label: "BNA.Field.reachRange.label",
			hint: "BNA.Field.reachRange.hint",
			default: "10",
			visibleWhen: {
				key: "mode",
				in: ["aura"]
			}
		},
		{
			key: "disposition",
			kind: "select",
			label: "BNA.Field.reachDisposition.label",
			hint: "BNA.Field.reachDisposition.hint",
			default: "1",
			choices: { static: STATIC.disposition },
			visibleWhen: {
				key: "mode",
				in: ["aura", "template"]
			}
		},
		{
			key: "includeSelf",
			kind: "toggle",
			label: "BNA.Field.reachIncludeSelf.label",
			hint: "BNA.Field.reachIncludeSelf.hint",
			default: true,
			visibleWhen: {
				key: "mode",
				in: ["aura", "template"]
			}
		},
		{
			key: "blockers",
			kind: "multiselect",
			label: "BNA.Field.reachBlockers.label",
			hint: "BNA.Field.reachBlockers.hint",
			default: [],
			choices: { source: "statusEffects" },
			visibleWhen: {
				key: "mode",
				in: ["aura"]
			}
		},
		{
			key: "require",
			kind: "group",
			label: "BNA.Field.reachRequire.label",
			hint: "BNA.Field.reachRequire.hint",
			visibleWhen: {
				key: "mode",
				in: ["aura"]
			},
			fields: [
				{
					key: "sight",
					kind: "toggle",
					label: "BNA.Field.requireSight.label",
					default: false
				},
				{
					key: "move",
					kind: "toggle",
					label: "BNA.Field.requireMove.label",
					default: false
				},
				{
					key: "sound",
					kind: "toggle",
					label: "BNA.Field.requireSound.label",
					default: false
				},
				{
					key: "light",
					kind: "toggle",
					label: "BNA.Field.requireLight.label",
					default: false
				}
			]
		}
	]
};
var SIGNAL_NAME = {
	key: "name",
	kind: "text",
	label: "BNA.Field.signalName.label",
	hint: "BNA.Field.signalName.hint",
	default: ""
};
function pre(type, icon) {
	return {
		kind: "event",
		type,
		phase: "pre",
		icon,
		pins: ["out"],
		fields: [REACH_FIELD]
	};
}
function post(type, icon, pins) {
	return {
		kind: "event",
		type,
		phase: "post",
		icon,
		pins,
		fields: [REACH_FIELD]
	};
}
var EVENTS = [
	pre("attackRoll", "crosshair"),
	pre("damageRoll", "swords"),
	pre("saveDC", "shield-alert"),
	pre("savingThrow", "shield"),
	pre("abilityCheck", "brain"),
	pre("hitDie", "heart-pulse"),
	post("afterAttack", "target", [
		"hit",
		"miss",
		"crit",
		"fumble"
	]),
	post("afterTargetSave", "shield-x", ["failed", "succeeded"]),
	post("afterDamage", "skull", ["dealt", "dropped"]),
	post("afterCheck", "check-check", ["success", "failure"]),
	{
		kind: "event",
		type: "signal",
		phase: "signal",
		icon: "radio",
		pins: ["out"],
		fields: [SIGNAL_NAME]
	}
];
//#endregion
//#region src/core/registry/results.ts
var DIALOG_ROLLS = [
	"attackRoll",
	"damageRoll",
	"savingThrow",
	"abilityCheck",
	"hitDie",
	"signal"
];
var REACTIONS = [...REACTION_EVENTS, "signal"];
var DAMAGE_TYPES = { source: "damageAndHealingTypes" };
var WHO = { static: STATIC.who };
/** Result types that change a roll; a rider can carry any of them to a later roll. */
var ROLL_RESULT_TYPES = [
	"rollBonus",
	"diceModifiers",
	"critRange",
	"critDamage",
	"saveThresholds",
	"reminder"
];
function formula(key, label, hint, initial = "") {
	return {
		key,
		kind: "formula",
		label,
		hint,
		default: initial
	};
}
function whoField(result, initial) {
	return {
		key: "who",
		kind: "select",
		label: `BNA.Result.${result}.Field.who`,
		default: initial,
		choices: WHO
	};
}
var COUNTED_COSTS = [
	"uses",
	"quantity",
	"slots",
	"health",
	"hitdice",
	"currency"
];
var COMMON_RESULT_FIELDS = [
	{
		key: "optional",
		kind: "toggle",
		label: "BNA.Field.optional.label",
		hint: "BNA.Field.optional.hint",
		default: false
	},
	{
		key: "choiceGroup",
		kind: "text",
		label: "BNA.Field.choiceGroup.label",
		hint: "BNA.Field.choiceGroup.hint",
		default: "",
		visibleWhen: {
			key: "optional",
			in: [true]
		}
	},
	{
		key: "cost",
		kind: "group",
		label: "BNA.Field.cost.label",
		hint: "BNA.Field.cost.hint",
		visibleWhen: {
			key: "optional",
			in: [true]
		},
		fields: [
			{
				key: "type",
				kind: "select",
				label: "BNA.Field.costType.label",
				hint: "BNA.Field.costType.hint",
				default: "none",
				choices: { static: STATIC.costType }
			},
			{
				key: "subtype",
				kind: "select",
				label: "BNA.Field.costCurrency.label",
				default: "",
				choices: { source: "currencies" },
				visibleWhen: {
					key: "type",
					in: ["currency"]
				}
			},
			{
				key: "subtype",
				kind: "select",
				label: "BNA.Field.costHitDie.label",
				default: "",
				choices: { static: STATIC.hitDieSize },
				visibleWhen: {
					key: "type",
					in: ["hitdice"]
				}
			},
			{
				...formula("min", "BNA.Field.costMin.label", "BNA.Field.costMin.hint", "1"),
				visibleWhen: {
					key: "type",
					in: COUNTED_COSTS
				}
			},
			{
				...formula("max", "BNA.Field.costMax.label", "BNA.Field.costMax.hint"),
				visibleWhen: {
					key: "type",
					in: COUNTED_COSTS
				}
			},
			{
				key: "step",
				kind: "number",
				label: "BNA.Field.costStep.label",
				hint: "BNA.Field.costStep.hint",
				default: 1,
				min: 1,
				step: 1,
				visibleWhen: {
					key: "type",
					in: COUNTED_COSTS
				}
			},
			{
				key: "scales",
				kind: "toggle",
				label: "BNA.Field.costScales.label",
				hint: "BNA.Field.costScales.hint",
				default: false,
				visibleWhen: {
					key: "type",
					in: COUNTED_COSTS
				}
			},
			{
				...formula("formula", "BNA.Field.costFormula.label", "BNA.Field.costFormula.hint"),
				visibleWhen: {
					key: "scales",
					in: [true]
				}
			}
		]
	},
	{
		key: "limit",
		kind: "select",
		label: "BNA.Field.limit.label",
		hint: "BNA.Field.limit.hint",
		default: "none",
		choices: { static: STATIC.limit }
	}
];
var rollBonus = {
	kind: "result",
	type: "rollBonus",
	category: "roll",
	icon: "plus",
	supportsOptional: true,
	compatibleEvents: DIALOG_ROLLS,
	fields: [formula("formula", "BNA.Result.rollBonus.Field.formula", "BNA.Result.rollBonus.Field.formulaHint"), {
		key: "damageTypes",
		kind: "multiselect",
		label: "BNA.Result.rollBonus.Field.damageTypes",
		hint: "BNA.Result.rollBonus.Field.damageTypesHint",
		default: [],
		choices: DAMAGE_TYPES,
		onlyFor: ["damageRoll"]
	}],
	flavor: (data) => asStrings(data.damageTypes).filter((type) => !type.startsWith("!")),
	phrase: (data, fmt) => {
		const value = fmt.signed(asString(data.formula));
		const types = asStrings(data.damageTypes);
		return types.length ? fmt.t("BNA.Result.rollBonus.PhraseTyped", {
			formula: value,
			types: fmt.choices(types, DAMAGE_TYPES)
		}) : fmt.t("BNA.Result.rollBonus.Phrase", { formula: value });
	}
};
var dcBonus = {
	kind: "result",
	type: "dcBonus",
	category: "roll",
	icon: "gauge",
	supportsOptional: false,
	compatibleEvents: ["saveDC", "signal"],
	fields: [formula("formula", "BNA.Result.dcBonus.Field.formula", "BNA.Result.dcBonus.Field.formulaHint")],
	flavor: () => [],
	phrase: (data, fmt) => fmt.t("BNA.Result.dcBonus.Phrase", { formula: fmt.signed(asString(data.formula)) })
};
var D = "BNA.Result.diceModifiers.Field";
var ENABLED = {
	key: "enabled",
	in: [true]
};
function whenEnabled(spec) {
	return {
		...spec,
		visibleWhen: ENABLED
	};
}
function toggle(key, label) {
	return {
		key,
		kind: "toggle",
		label,
		default: false
	};
}
function modifierGroup(key, fields) {
	return {
		key,
		kind: "group",
		label: `${D}.${key}`,
		hint: `${D}.${key}Hint`,
		fields: [toggle("enabled", `${D}.enabled`), ...fields.map(whenEnabled)]
	};
}
var MODE_FIELD = {
	key: "mode",
	kind: "select",
	label: `${D}.mode`,
	default: "add",
	choices: { static: STATIC.modifierMode }
};
var MODIFIER_KEYS = [
	"amount",
	"size",
	"reroll",
	"explode",
	"minimum",
	"maximum"
];
var diceModifiers = {
	kind: "result",
	type: "diceModifiers",
	category: "roll",
	icon: "dices",
	supportsOptional: true,
	compatibleEvents: [
		"damageRoll",
		"hitDie",
		"signal"
	],
	fields: [
		modifierGroup("amount", [MODE_FIELD, formula("value", `${D}.value`)]),
		modifierGroup("size", [MODE_FIELD, formula("value", `${D}.value`)]),
		modifierGroup("reroll", [
			formula("value", `${D}.threshold`),
			toggle("invert", `${D}.invert`),
			toggle("recursive", `${D}.recursive`),
			formula("limit", `${D}.limit`)
		]),
		modifierGroup("explode", [
			formula("value", `${D}.threshold`),
			toggle("once", `${D}.once`),
			formula("limit", `${D}.limit`)
		]),
		modifierGroup("minimum", [formula("value", `${D}.minimumValue`), toggle("maximize", `${D}.maximize`)]),
		modifierGroup("maximum", [formula("value", `${D}.maximumValue`), toggle("zero", `${D}.zero`)]),
		{
			key: "firstOnly",
			kind: "toggle",
			label: `${D}.firstOnly`,
			hint: `${D}.firstOnlyHint`,
			default: false
		}
	],
	flavor: () => [],
	phrase: (data, fmt) => {
		const parts = [];
		for (const key of MODIFIER_KEYS) {
			const modifier = asRecord(data[key]);
			if (!asBoolean(modifier.enabled)) continue;
			if (key === "minimum" && asBoolean(modifier.maximize)) {
				parts.push(fmt.t("BNA.Result.diceModifiers.Short.maximize"));
				continue;
			}
			const mode = asString(modifier.mode) === "multiply" ? "×" : "+";
			parts.push(fmt.t(`BNA.Result.diceModifiers.Short.${key}`, {
				value: asString(modifier.value),
				mode
			}));
		}
		return parts.length ? fmt.t("BNA.Result.diceModifiers.Phrase", { list: fmt.joinAnd(parts) }) : fmt.t("BNA.Result.diceModifiers.PhraseEmpty");
	}
};
/** Phrase for results made of independent signed adjustments (crit range, save thresholds, …). */
function adjustments(fmt, prefix, entries) {
	return entries.flatMap(([value, key, signed]) => {
		if (!value.trim()) return [];
		return [fmt.t(`${prefix}.${key}`, { value: signed ? fmt.signed(value) : value })];
	});
}
var critRange = {
	kind: "result",
	type: "critRange",
	category: "roll",
	icon: "sparkle",
	supportsOptional: true,
	compatibleEvents: ["attackRoll", "signal"],
	fields: [formula("critical", "BNA.Result.critRange.Field.critical", "BNA.Result.critRange.Field.criticalHint"), formula("fumble", "BNA.Result.critRange.Field.fumble", "BNA.Result.critRange.Field.fumbleHint")],
	flavor: () => [],
	phrase: (data, fmt) => {
		const parts = adjustments(fmt, "BNA.Result.critRange", [[
			asString(data.critical),
			"PhraseCritical",
			true
		], [
			asString(data.fumble),
			"PhraseFumble",
			true
		]]);
		return parts.length ? fmt.joinAnd(parts) : fmt.t("BNA.Result.critRange.PhraseEmpty");
	}
};
var critDamage = {
	kind: "result",
	type: "critDamage",
	category: "roll",
	icon: "sparkles",
	supportsOptional: true,
	compatibleEvents: ["damageRoll", "signal"],
	fields: [formula("dice", "BNA.Result.critDamage.Field.dice", "BNA.Result.critDamage.Field.diceHint"), formula("damage", "BNA.Result.critDamage.Field.damage", "BNA.Result.critDamage.Field.damageHint")],
	flavor: () => [],
	phrase: (data, fmt) => {
		const parts = adjustments(fmt, "BNA.Result.critDamage", [[
			asString(data.dice),
			"PhraseDice",
			false
		], [
			asString(data.damage),
			"PhraseDamage",
			true
		]]);
		return parts.length ? fmt.t("BNA.Result.critDamage.Phrase", { list: fmt.joinAnd(parts) }) : fmt.t("BNA.Result.critDamage.PhraseEmpty");
	}
};
var saveThresholds = {
	kind: "result",
	type: "saveThresholds",
	category: "roll",
	icon: "sliders-horizontal",
	supportsOptional: true,
	compatibleEvents: ["savingThrow", "signal"],
	fields: [formula("targetValue", "BNA.Result.saveThresholds.Field.targetValue", "BNA.Result.saveThresholds.Field.targetValueHint"), formula("deathSaveCritical", "BNA.Result.saveThresholds.Field.deathSaveCritical", "BNA.Result.saveThresholds.Field.deathSaveCriticalHint")],
	flavor: () => [],
	phrase: (data, fmt) => {
		const parts = adjustments(fmt, "BNA.Result.saveThresholds", [[
			asString(data.targetValue),
			"PhraseTarget",
			true
		], [
			asString(data.deathSaveCritical),
			"PhraseDeath",
			true
		]]);
		return parts.length ? fmt.joinAnd(parts) : fmt.t("BNA.Result.saveThresholds.PhraseEmpty");
	}
};
var REMINDER_PREVIEW = 48;
var RESULTS = [
	rollBonus,
	dcBonus,
	diceModifiers,
	critRange,
	critDamage,
	saveThresholds,
	{
		kind: "result",
		type: "reminder",
		category: "roll",
		icon: "sticky-note",
		supportsOptional: false,
		compatibleEvents: DIALOG_ROLLS,
		fields: [{
			key: "text",
			kind: "text",
			multiline: true,
			label: "BNA.Result.reminder.Field.text",
			hint: "BNA.Result.reminder.Field.textHint",
			default: ""
		}],
		flavor: () => [],
		phrase: (data, fmt) => {
			const text = asString(data.text).trim();
			const preview = text.length > REMINDER_PREVIEW ? `${text.slice(0, 47)}…` : text;
			return fmt.t("BNA.Result.reminder.Phrase", { text: preview || fmt.t("BNA.Phrase.Unset") });
		}
	},
	{
		kind: "result",
		type: "rider",
		category: "reaction",
		icon: "forward",
		supportsOptional: true,
		compatibleEvents: REACTIONS,
		fields: [
			{
				key: "effect",
				kind: "embeddedResult",
				label: "BNA.Result.rider.Field.effect",
				hint: "BNA.Result.rider.Field.effectHint",
				allowed: ROLL_RESULT_TYPES
			},
			{
				key: "scope",
				kind: "select",
				label: "BNA.Result.rider.Field.scope",
				hint: "BNA.Result.rider.Field.scopeHint",
				default: "sameActivation",
				choices: { static: STATIC.riderScope }
			},
			{
				key: "roll",
				kind: "select",
				label: "BNA.Result.rider.Field.roll",
				default: "attackRoll",
				choices: { static: STATIC.riderRoll },
				visibleWhen: {
					key: "scope",
					in: ["nextRoll"]
				}
			},
			{
				...whoField("rider", "self"),
				visibleWhen: {
					key: "scope",
					in: ["nextRoll"]
				}
			},
			{
				key: "duration",
				kind: "group",
				label: "BNA.Result.rider.Field.duration",
				hint: "BNA.Result.rider.Field.durationHint",
				fields: [{
					key: "unit",
					kind: "select",
					label: "BNA.Result.rider.Field.unit",
					default: "uses",
					choices: { static: STATIC.durationUnit }
				}, {
					key: "value",
					kind: "number",
					label: "BNA.Result.rider.Field.value",
					default: 1,
					min: 1,
					step: 1,
					visibleWhen: {
						key: "unit",
						in: [
							"uses",
							"rounds",
							"turns"
						]
					}
				}]
			}
		],
		flavor: (data) => {
			const effect = asRecord(data.effect);
			return resultByType(asString(effect.type))?.flavor(asRecord(effect.data)) ?? [];
		},
		phrase: (data, fmt) => {
			const effect = asRecord(data.effect);
			const inner = resultByType(asString(effect.type));
			const text = inner ? inner.phrase(asRecord(effect.data), fmt) : fmt.t("BNA.Result.rider.PhraseNoEffect");
			const base = asString(data.scope) === "nextRoll" ? fmt.t("BNA.Result.rider.Phrase.nextRoll", {
				effect: text,
				roll: fmt.choice(asString(data.roll), { static: STATIC.riderRoll }),
				who: fmt.choice(asString(data.who), WHO)
			}) : fmt.t("BNA.Result.rider.Phrase.sameActivation", { effect: text });
			const duration = asRecord(data.duration);
			const unit = asString(duration.unit, "uses");
			const value = asNumber(duration.value) ?? 1;
			if (unit === "uses" && value === 1) return base;
			return `${base}, ${unit === "untilRest" ? fmt.t("BNA.Result.rider.Duration.untilRest") : fmt.t(`BNA.Result.rider.Duration.${unit}`, { value })}`;
		}
	},
	{
		kind: "result",
		type: "applyEffect",
		category: "reaction",
		icon: "badge-plus",
		supportsOptional: true,
		compatibleEvents: REACTIONS,
		fields: [
			{
				key: "source",
				kind: "select",
				label: "BNA.Result.applyEffect.Field.source",
				hint: "BNA.Result.applyEffect.Field.sourceHint",
				default: "status",
				choices: { static: STATIC.effectSource }
			},
			{
				key: "status",
				kind: "select",
				label: "BNA.Result.applyEffect.Field.status",
				default: "",
				choices: { source: "statusEffects" },
				visibleWhen: {
					key: "source",
					in: ["status"]
				}
			},
			{
				key: "effectId",
				kind: "select",
				label: "BNA.Result.applyEffect.Field.effectId",
				hint: "BNA.Result.applyEffect.Field.effectIdHint",
				default: "",
				choices: { source: "documentEffects" },
				visibleWhen: {
					key: "source",
					in: ["itemEffect"]
				}
			},
			whoField("applyEffect", "target")
		],
		flavor: () => [],
		phrase: (data, fmt) => {
			const effect = asString(data.source) === "itemEffect" ? fmt.choice(asString(data.effectId), { source: "documentEffects" }) : fmt.choice(asString(data.status), { source: "statusEffects" });
			return fmt.t("BNA.Result.applyEffect.Phrase", {
				effect: effect || fmt.t("BNA.Phrase.Unset"),
				who: fmt.choice(asString(data.who), WHO)
			});
		}
	},
	{
		kind: "result",
		type: "removeEffect",
		category: "reaction",
		icon: "badge-minus",
		supportsOptional: true,
		compatibleEvents: REACTIONS,
		fields: [
			{
				key: "match",
				kind: "select",
				label: "BNA.Result.removeEffect.Field.match",
				default: "status",
				choices: { static: STATIC.removeMatch }
			},
			{
				key: "status",
				kind: "select",
				label: "BNA.Result.removeEffect.Field.status",
				default: "",
				choices: { source: "statusEffects" },
				visibleWhen: {
					key: "match",
					in: ["status"]
				}
			},
			{
				key: "name",
				kind: "text",
				label: "BNA.Result.removeEffect.Field.name",
				hint: "BNA.Result.removeEffect.Field.nameHint",
				default: "",
				visibleWhen: {
					key: "match",
					in: ["name"]
				}
			},
			whoField("removeEffect", "self")
		],
		flavor: () => [],
		phrase: (data, fmt) => {
			const effect = asString(data.match) === "name" ? asString(data.name).trim() : fmt.choice(asString(data.status), { source: "statusEffects" });
			return fmt.t("BNA.Result.removeEffect.Phrase", {
				effect: effect || fmt.t("BNA.Phrase.Unset"),
				who: fmt.choice(asString(data.who), WHO)
			});
		}
	},
	{
		kind: "result",
		type: "resource",
		category: "reaction",
		icon: "battery-charging",
		supportsOptional: true,
		compatibleEvents: REACTIONS,
		fields: [
			{
				key: "action",
				kind: "select",
				label: "BNA.Result.resource.Field.action",
				default: "spend",
				choices: { static: STATIC.resourceAction }
			},
			{
				key: "resource",
				kind: "select",
				label: "BNA.Result.resource.Field.resource",
				default: "uses",
				choices: { static: STATIC.resourceType }
			},
			{
				key: "slotLevel",
				kind: "select",
				label: "BNA.Result.resource.Field.slotLevel",
				default: "",
				choices: { source: "spellSlotLevels" },
				visibleWhen: {
					key: "resource",
					in: ["slots"]
				}
			},
			{
				key: "currency",
				kind: "select",
				label: "BNA.Result.resource.Field.currency",
				default: "gp",
				choices: { source: "currencies" },
				visibleWhen: {
					key: "resource",
					in: ["currency"]
				}
			},
			formula("amount", "BNA.Result.resource.Field.amount", "BNA.Result.resource.Field.amountHint", "1"),
			whoField("resource", "self")
		],
		flavor: () => [],
		phrase: (data, fmt) => {
			const kind = asString(data.resource, "uses");
			let label = fmt.choice(kind, { static: STATIC.resourceType });
			const level = fmt.choice(asString(data.slotLevel), { source: "spellSlotLevels" });
			if (kind === "slots" && level) label = fmt.t("BNA.Result.resource.SlotLevel", { level });
			if (kind === "currency") label = fmt.choice(asString(data.currency), { source: "currencies" }) || label;
			return fmt.t("BNA.Result.resource.Phrase", {
				action: fmt.choice(asString(data.action), { static: STATIC.resourceAction }),
				amount: asString(data.amount).trim() || "1",
				resource: label,
				who: fmt.choice(asString(data.who), WHO)
			});
		}
	},
	{
		kind: "result",
		type: "signal",
		category: "reaction",
		icon: "send",
		supportsOptional: true,
		compatibleEvents: [
			...DIALOG_ROLLS.filter((type) => type !== "signal"),
			"saveDC",
			...REACTIONS
		],
		fields: [{
			key: "name",
			kind: "text",
			label: "BNA.Result.signal.Field.name",
			hint: "BNA.Result.signal.Field.nameHint",
			default: ""
		}, {
			key: "scope",
			kind: "select",
			label: "BNA.Result.signal.Field.scope",
			hint: "BNA.Result.signal.Field.scopeHint",
			default: "actor",
			choices: { static: STATIC.signalScope }
		}],
		flavor: () => [],
		phrase: (data, fmt) => fmt.t("BNA.Result.signal.Phrase", { name: asString(data.name).trim() || fmt.t("BNA.Phrase.Unset") })
	}
];
var RESULT_MAP$1 = new Map(RESULTS.map((definition) => [definition.type, definition]));
/** Lookup used by the rider, which embeds another result; called only after module init. */
function resultByType(type) {
	return RESULT_MAP$1.get(type);
}
//#endregion
//#region src/core/registry/index.ts
var EVENT_MAP = new Map(EVENTS.map((definition) => [definition.type, definition]));
var CHECK_MAP = new Map(CHECKS.map((definition) => [definition.type, definition]));
var RESULT_MAP = new Map(RESULTS.map((definition) => [definition.type, definition]));
function getEvent(type) {
	return EVENT_MAP.get(type);
}
function getCheck(type) {
	return CHECK_MAP.get(type);
}
function getResult(type) {
	return RESULT_MAP.get(type);
}
/** Whether a node of this kind and type can exist. */
function hasDefinition(kind, type) {
	switch (kind) {
		case "event": return EVENT_MAP.has(type);
		case "condition": return type === CONDITION_NODE_TYPE;
		case "result": return RESULT_MAP.has(type);
	}
}
//#endregion
//#region src/core/graph/connections.ts
var CONDITION_PINS = ["yes", "no"];
function outputPins(kind, type) {
	switch (kind) {
		case "event": return getEvent(type)?.pins ?? [];
		case "condition": return type === "condition" ? CONDITION_PINS : [];
		case "result": return [];
	}
}
/** Whether adding source → target would close a loop, i.e. source is reachable from target. */
function wouldCreateCycle(edges, source, target) {
	const outgoing = /* @__PURE__ */ new Map();
	for (const edge of edges) {
		const list = outgoing.get(edge.source) ?? [];
		list.push(edge.target);
		outgoing.set(edge.source, list);
	}
	const seen = /* @__PURE__ */ new Set();
	const stack = [target];
	for (let current = stack.pop(); current !== void 0; current = stack.pop()) {
		if (current === source) return true;
		if (seen.has(current)) continue;
		seen.add(current);
		stack.push(...outgoing.get(current) ?? []);
	}
	return false;
}
function canConnect(graph, request) {
	const source = graph.nodes.find((node) => node.id === request.source);
	const target = graph.nodes.find((node) => node.id === request.target);
	if (!source || !target) return reject("missingNode");
	if (source.id === target.id) return reject("selfLoop");
	if (target.kind === "event") return reject("intoEvent");
	if (source.kind === "result") return reject("fromResult");
	if (!outputPins(source.kind, source.type).includes(request.sourcePin)) return reject("unknownPin");
	if (graph.edges.some((edge) => edge.source === source.id && edge.sourcePin === request.sourcePin && edge.target === target.id)) return reject("duplicate");
	if (wouldCreateCycle(graph.edges, source.id, target.id)) return reject("cycle");
	return { ok: true };
}
function reject(reason) {
	return {
		ok: false,
		reason
	};
}
//#endregion
//#region src/core/blueprint/ids.ts
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** A random alphanumeric id; 16 characters matches Foundry document ids. */
function randomId(length = 16) {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let id = "";
	for (const byte of bytes) id += ALPHABET.charAt(byte % 62);
	return id;
}
/** Whether a value has the shape of a Foundry document id (and thus a blueprint id). */
function isValidId(value) {
	return typeof value === "string" && /^[A-Za-z0-9]{16}$/.test(value);
}
//#endregion
//#region src/core/blueprint/validate.ts
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
* Structural validation of blueprint data from an untrusted source (imports, other modules,
* hand-edited flags). Field-level values inside node data are not validated here; the
* interpreter reads them defensively and the linter reports meaningless values.
*/
function validateBlueprintSource(input) {
	if (!isRecord(input)) return {
		ok: false,
		issues: [{
			path: "",
			code: "notObject"
		}]
	};
	const issues = [];
	const report = (path, code) => issues.push({
		path,
		code
	});
	if (!isValidId(input.id)) report("id", "invalidId");
	if (input.schemaVersion !== 2) report("schemaVersion", "schemaVersion");
	for (const key of [
		"name",
		"img",
		"description"
	]) if (typeof input[key] !== "string") report(key, "invalidField");
	if (typeof input.enabled !== "boolean") report("enabled", "invalidField");
	if (typeof input.sort !== "number" || !Number.isFinite(input.sort)) report("sort", "invalidField");
	if (!isRecord(input.flags)) report("flags", "invalidField");
	const nodes = /* @__PURE__ */ new Map();
	const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
	if (!Array.isArray(input.nodes)) report("nodes", "invalidField");
	rawNodes.forEach((node, index) => {
		const path = `nodes.${index}`;
		if (!isRecord(node) || typeof node.id !== "string" || !node.id) return report(path, "invalidField");
		if (nodes.has(node.id)) return report(`${path}.id`, "duplicateNodeId");
		if (!NODE_KINDS.includes(node.kind)) return report(`${path}.kind`, "unknownKind");
		const kind = node.kind;
		const type = typeof node.type === "string" ? node.type : "";
		if (!hasDefinition(kind, type)) report(`${path}.type`, "unknownType");
		const position = node.position;
		if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number") report(`${path}.position`, "invalidField");
		if (!isRecord(node.data)) report(`${path}.data`, "invalidField");
		nodes.set(node.id, {
			kind,
			type
		});
	});
	const edgeIds = /* @__PURE__ */ new Set();
	const accepted = [];
	const rawEdges = Array.isArray(input.edges) ? input.edges : [];
	if (!Array.isArray(input.edges)) report("edges", "invalidField");
	rawEdges.forEach((edge, index) => {
		const path = `edges.${index}`;
		if (!isRecord(edge) || typeof edge.id !== "string" || typeof edge.source !== "string" || typeof edge.target !== "string" || typeof edge.sourcePin !== "string") return report(path, "invalidField");
		if (edgeIds.has(edge.id)) return report(`${path}.id`, "duplicateEdgeId");
		edgeIds.add(edge.id);
		const source = nodes.get(edge.source);
		const target = nodes.get(edge.target);
		if (!source || !target) return report(path, "danglingEdge");
		if (source.kind === "result" || target.kind === "event" || edge.source === edge.target || edge.targetPin !== "in") return report(path, "invalidDirection");
		if (!outputPins(source.kind, source.type).includes(edge.sourcePin)) return report(`${path}.sourcePin`, "invalidPin");
		if (wouldCreateCycle(accepted, edge.source, edge.target)) return report(path, "cycle");
		accepted.push({
			source: edge.source,
			target: edge.target
		});
	});
	return issues.length ? {
		ok: false,
		issues
	} : {
		ok: true,
		value: input
	};
}
//#endregion
//#region src/core/registry/fields.ts
/** Initial data for a list of fields; nested groups become nested objects. */
function defaultsFor(fields) {
	const data = {};
	for (const field of fields) {
		if (field.key in data) continue;
		data[field.key] = defaultOf(field);
	}
	return data;
}
function defaultOf(field) {
	switch (field.kind) {
		case "group": return defaultsFor(field.fields);
		case "embeddedResult": return null;
		case "multiselect":
		case "tags": return [...field.default];
		case "comparisons": return field.default.map((comparison) => ({ ...comparison }));
		default: return field.default;
	}
}
/** Whether a field is shown, given the data object it lives in. */
function isFieldVisible(field, data) {
	const rule = field.visibleWhen;
	return !rule || rule.in.includes(data[rule.key]);
}
//#endregion
//#region src/core/blueprint/factory.ts
function createBlueprint(init = {}) {
	return {
		id: init.id ?? randomId(),
		schemaVersion: 2,
		name: init.name ?? "",
		img: init.img ?? "icons/svg/dice-target.svg",
		description: init.description ?? "",
		enabled: init.enabled ?? true,
		sort: init.sort ?? 0,
		nodes: init.nodes ?? [],
		edges: init.edges ?? [],
		flags: init.flags ?? {}
	};
}
function createNode(kind, type, position = {
	x: 0,
	y: 0
}) {
	return {
		id: randomId(8),
		kind,
		type,
		position: { ...position },
		data: initialData(kind, type)
	};
}
function initialData(kind, type) {
	switch (kind) {
		case "event": {
			const definition = getEvent(type);
			if (!definition) throw new Error(`Unknown event type "${type}"`);
			return defaultsFor(definition.fields);
		}
		case "condition":
			if (type !== "condition") throw new Error(`Unknown condition type "${type}"`);
			return {
				...defaultsFor(CONDITION_NODE_FIELDS),
				checks: []
			};
		case "result": {
			const definition = getResult(type);
			if (!definition) throw new Error(`Unknown result type "${type}"`);
			return {
				...defaultsFor(definition.fields),
				common: defaultsFor(COMMON_RESULT_FIELDS)
			};
		}
	}
}
function createCheck(type) {
	const definition = getCheck(type);
	if (!definition) throw new Error(`Unknown check type "${type}"`);
	return {
		id: randomId(8),
		type,
		data: defaultsFor(definition.fields)
	};
}
function createEdge(source, sourcePin, target) {
	return {
		id: randomId(8),
		source,
		sourcePin,
		target,
		targetPin: "in"
	};
}
/**
* A copy under a new id. Node, wire and check ids stay (they are unique within a blueprint); the module's own
* flags (the v1 legacy id, the migration mark) stay with the original.
*/
function duplicateBlueprint(source, name) {
	return createBlueprint({
		name,
		img: source.img,
		description: source.description,
		enabled: source.enabled,
		sort: source.sort + 1,
		nodes: structuredClone(source.nodes),
		edges: structuredClone(source.edges),
		flags: Object.fromEntries(Object.entries(structuredClone(source.flags)).filter(([scope]) => scope !== "build-n-action"))
	});
}
//#endregion
//#region src/core/legacy/adapter.ts
var LEGACY_VERSION = "1.0.6";
var EVENT_BY_TYPE = {
	attack: "attackRoll",
	damage: "damageRoll",
	save: "saveDC",
	throw: "savingThrow",
	test: "abilityCheck",
	hitdie: "hitDie"
};
/** Filters whose value is a plain list (numbers are turned into strings). */
var LIST_FILTERS = /* @__PURE__ */ new Set([
	"abilities",
	"actorCreatureSizes",
	"actorCreatureTypes",
	"actorLanguages",
	"baseArmors",
	"baseTools",
	"baseWeapons",
	"creatureTypes",
	"damageTypes",
	"itemTypes",
	"preparationModes",
	"proficiencyLevels",
	"saveAbilities",
	"skillIds",
	"spellLevels",
	"spellSchools",
	"statusEffects",
	"targetArmors",
	"targetEffects",
	"throwTypes",
	"weaponProperties"
]);
var OPERATORS = /* @__PURE__ */ new Set([
	"EQ",
	"LT",
	"GT",
	"LE",
	"GE"
]);
var COLUMN = 324;
var ROW = 198;
var GRID = 18;
function text$2(value) {
	return typeof value === "number" ? String(value) : asString(value);
}
function list(value) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => typeof entry === "string" || typeof entry === "number" ? [String(entry)] : []);
}
function stripHtml(html) {
	return html.replace(/<\/?(p|div|br|li|h\d)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
/** The data migrations v1's ContextualBonus.migrateData applied on load. */
function premigrate(raw) {
	const source = structuredClone(asRecord(raw));
	const bonuses = asRecord(source.bonuses);
	source.bonuses = bonuses;
	const minimum = asRecord(asRecord(bonuses.modifiers).minimum);
	if (!("maximize" in minimum) && minimum.value === "-1") {
		minimum.value = "";
		minimum.maximize = true;
	}
	if (bonuses.deathSaveTargetValue) bonuses.targetValue = bonuses.deathSaveTargetValue;
	const damageType = bonuses.damageType ?? source.damageType;
	if (typeof damageType === "string") bonuses.damageType = [damageType];
	const filters = asRecord(source.filters);
	source.filters = filters;
	if (Array.isArray(filters.arbitraryComparison) && filters.arbitraryComparison.length && !filters.arbitraryComparisons) filters.arbitraryComparisons = filters.arbitraryComparison;
	const aura = asRecord(source.aura);
	source.aura = aura;
	if (aura.isTemplate) aura.template = aura.isTemplate;
	return source;
}
function reachFor(auraRaw, carrier) {
	const reach = asRecord(defaultsFor([REACH_FIELD]).reach);
	if (carrier === "region") return {
		...reach,
		mode: "region"
	};
	const aura = asRecord(auraRaw);
	if (!asBoolean(aura.enabled) && carrier !== "template") return {
		...reach,
		mode: "self"
	};
	const require = asRecord(aura.require);
	const disposition = String(asNumber(aura.disposition) ?? 2);
	return {
		...reach,
		mode: asBoolean(aura.template) || carrier === "template" ? "template" : "aura",
		range: text$2(aura.range).trim() || "0",
		disposition: [
			"2",
			"1",
			"-1"
		].includes(disposition) ? disposition : "2",
		includeSelf: aura.self !== false,
		blockers: list(aura.blockers),
		require: {
			sight: asBoolean(require.sight),
			move: asBoolean(require.move),
			sound: asBoolean(require.sound),
			light: asBoolean(require.light)
		}
	};
}
function convertFilters(filtersRaw, warnings) {
	const checks = [];
	const add = (type, data) => checks.push({
		id: `c-${type}`,
		type,
		data
	});
	for (const [key, value] of Object.entries(asRecord(filtersRaw))) {
		if (LIST_FILTERS.has(key)) {
			const values = list(value);
			if (values.length) add(key, { values });
			continue;
		}
		const record = asRecord(value);
		switch (key) {
			case "identifiers":
			case "sourceClasses": {
				const values = list(record.values);
				if (values.length) add(key, { values });
				break;
			}
			case "markers": {
				const own = list(record.values);
				const target = list(record.target);
				if (own.length) add("markers", { values: own });
				if (target.length) add("targetMarkers", { values: target });
				break;
			}
			case "attackModes": {
				const data = {
					value: list(record.value),
					classification: list(record.classification),
					mode: list(record.mode)
				};
				if (data.value.length || data.classification.length || data.mode.length) add(key, data);
				break;
			}
			case "featureTypes": {
				const type = text$2(record.type);
				if (type) add(key, {
					type,
					subtype: text$2(record.subtype)
				});
				break;
			}
			case "healthPercentages": {
				const threshold = asNumber(record.value);
				if (threshold !== null) add(key, {
					value: threshold,
					type: Number(record.type) === 1 ? "atLeast" : "atMost"
				});
				break;
			}
			case "remainingSpellSlots": {
				const min = asNumber(record.min);
				const max = asNumber(record.max);
				if (min !== null || max !== null) add(key, {
					min,
					max,
					size: asBoolean(record.size)
				});
				break;
			}
			case "spellComponents": {
				const types = list(record.types);
				if (types.length) add(key, {
					types,
					match: text$2(record.match).toUpperCase() === "ALL" ? "all" : "any"
				});
				break;
			}
			case "tokenSizes": {
				const size = asNumber(record.size);
				if (size !== null && size > 0) add(key, {
					size,
					type: Number(record.type) === 1 ? "atMost" : "atLeast",
					self: asBoolean(record.self)
				});
				break;
			}
			case "arbitraryComparisons": {
				const rows = Array.isArray(value) ? value.map(asRecord).map((row) => ({
					one: text$2(row.one),
					operator: OPERATORS.has(text$2(row.operator)) ? text$2(row.operator) : "EQ",
					other: text$2(row.other)
				})) : [];
				if (rows.length) add(key, { comparisons: rows });
				break;
			}
			case "customScripts": {
				const script = text$2(value).trim();
				if (script) add(key, { script });
				break;
			}
			case "arbitraryComparison": break;
			default: warnings.push({
				code: "unknownFilter",
				values: { filter: key }
			});
		}
	}
	return checks;
}
function convertModifiers(raw) {
	const source = asRecord(raw);
	const part = (key) => asRecord(source[key]);
	const mode = (value) => Number(value) === 1 ? "multiply" : "add";
	const data = {
		amount: {
			enabled: asBoolean(part("amount").enabled),
			mode: mode(part("amount").mode),
			value: text$2(part("amount").value)
		},
		size: {
			enabled: asBoolean(part("size").enabled),
			mode: mode(part("size").mode),
			value: text$2(part("size").value)
		},
		reroll: {
			enabled: asBoolean(part("reroll").enabled),
			value: text$2(part("reroll").value),
			invert: asBoolean(part("reroll").invert),
			recursive: asBoolean(part("reroll").recursive),
			limit: text$2(part("reroll").limit)
		},
		explode: {
			enabled: asBoolean(part("explode").enabled),
			value: text$2(part("explode").value),
			once: asBoolean(part("explode").once),
			limit: text$2(part("explode").limit)
		},
		minimum: {
			enabled: asBoolean(part("minimum").enabled),
			value: text$2(part("minimum").value),
			maximize: asBoolean(part("minimum").maximize)
		},
		maximum: {
			enabled: asBoolean(part("maximum").enabled),
			value: text$2(part("maximum").value),
			zero: asBoolean(part("maximum").zero)
		},
		firstOnly: asBoolean(asRecord(source.config).first)
	};
	return [
		data.amount,
		data.size,
		data.reroll,
		data.explode,
		data.minimum,
		data.maximum
	].some((entry) => entry.enabled) ? data : null;
}
function plannedResults(type, bonuses) {
	const results = [];
	const field = (key) => text$2(bonuses[key]).trim();
	const bonus = field("bonus");
	if (bonus) {
		if (type === "save") results.push({
			type: "dcBonus",
			data: { formula: bonus }
		});
		else results.push({
			type: "rollBonus",
			data: {
				formula: bonus,
				damageTypes: type === "damage" ? list(bonuses.damageType) : []
			}
		});
	}
	if (type === "attack" && (field("criticalRange") || field("fumbleRange"))) results.push({
		type: "critRange",
		data: {
			critical: field("criticalRange"),
			fumble: field("fumbleRange")
		}
	});
	if (type === "damage" && (field("criticalBonusDice") || field("criticalBonusDamage"))) results.push({
		type: "critDamage",
		data: {
			dice: field("criticalBonusDice"),
			damage: field("criticalBonusDamage")
		}
	});
	if (type === "throw" && (field("targetValue") || field("deathSaveCritical"))) results.push({
		type: "saveThresholds",
		data: {
			targetValue: field("targetValue"),
			deathSaveCritical: field("deathSaveCritical")
		}
	});
	if (type === "damage" || type === "hitdie") {
		const modifiers = convertModifiers(bonuses.modifiers);
		if (modifiers) results.push({
			type: "diceModifiers",
			data: modifiers
		});
	}
	return results;
}
/** v1's isOptionable: which bonuses could be optional at all. */
function optionable(type, bonuses, results) {
	if (type === "damage" || type === "hitdie") return results.length > 0;
	if (type === "attack" || type === "throw" || type === "test") return !!text$2(bonuses.bonus).trim();
	return false;
}
function costFor(consumeRaw) {
	const base = asRecord(defaultsFor(COMMON_RESULT_FIELDS).cost);
	const consume = asRecord(consumeRaw);
	const type = text$2(consume.type);
	if (!asBoolean(consume.enabled) || !type) return base;
	const value = asRecord(consume.value);
	return {
		...base,
		type,
		subtype: text$2(consume.subtype),
		min: text$2(value.min).trim() || "1",
		max: text$2(value.max).trim(),
		step: asNumber(value.step) ?? 1,
		scales: asBoolean(consume.scales),
		formula: text$2(consume.formula).trim()
	};
}
function edge(source, pin, target) {
	return {
		id: `${source}-${pin}-${target}`,
		source,
		sourcePin: pin,
		target,
		targetPin: "in"
	};
}
/** Convert one v1.0.6 bonus into an equivalent blueprint (see the plan for the rules). */
function convertLegacyBonus(raw, carrier, options = {}) {
	const source = premigrate(raw);
	const legacyType = text$2(source.type);
	const eventType = EVENT_BY_TYPE[legacyType];
	if (!eventType) return {
		blueprint: null,
		warnings: [{
			code: "unknownType",
			values: { type: legacyType || "—" }
		}]
	};
	const warnings = [];
	const legacyId = text$2(source.id);
	let id = legacyId;
	if (!isValidId(id)) {
		warnings.push({ code: "invalidId" });
		id = options.fallbackId ?? randomId();
	}
	const checks = convertFilters(source.filters, warnings);
	if (asBoolean(source.exclusive)) checks.push({
		id: "c-thisItem",
		type: "thisItem",
		data: {}
	});
	const bonuses = asRecord(source.bonuses);
	let planned = plannedResults(legacyType, bonuses);
	const optional = asBoolean(source.optional) && optionable(legacyType, bonuses, planned);
	if (!planned.length && asBoolean(source.optional) && asBoolean(source.reminder) && legacyType !== "save") planned = [{
		type: "reminder",
		data: { text: stripHtml(text$2(source.description)) || text$2(source.name) }
	}];
	const cost = costFor(source.consume);
	const centre = Math.round((Math.max(planned.length, 1) - 1) * ROW / 2 / GRID) * GRID;
	const nodes = [];
	const edges = [];
	const event = createNode("event", eventType, {
		x: 0,
		y: centre
	});
	nodes.push({
		...event,
		id: "event",
		data: {
			...event.data,
			reach: reachFor(source.aura, carrier)
		}
	});
	let from = {
		id: "event",
		pin: "out"
	};
	if (checks.length) {
		const condition = createNode("condition", "condition", {
			x: COLUMN,
			y: centre
		});
		nodes.push({
			...condition,
			id: "condition",
			data: {
				mode: "all",
				checks
			}
		});
		edges.push(edge("event", "out", "condition"));
		from = {
			id: "condition",
			pin: "yes"
		};
	}
	const column = checks.length ? COLUMN * 2 : COLUMN;
	planned.forEach((result, index) => {
		const created = createNode("result", result.type, {
			x: column,
			y: index * ROW
		});
		const supportsOptional = getResult(result.type)?.supportsOptional ?? false;
		const common = {
			...asRecord(created.data.common),
			...optional && supportsOptional ? {
				optional: true,
				choiceGroup: id,
				cost
			} : {}
		};
		nodes.push({
			...created,
			id: result.type,
			data: {
				...created.data,
				...result.data,
				common
			}
		});
		edges.push(edge(from.id, from.pin, result.type));
	});
	const flags = asRecord(source.flags);
	return {
		blueprint: createBlueprint({
			id,
			name: text$2(source.name),
			img: text$2(source.img) || "icons/svg/dice-target.svg",
			description: text$2(source.description),
			enabled: source.enabled !== false,
			sort: asNumber(source.sort) ?? 0,
			nodes,
			edges,
			flags: {
				...flags,
				"build-n-action": {
					...asRecord(flags["build-n-action"]),
					migratedFrom: LEGACY_VERSION,
					...id === legacyId ? {} : { legacyId }
				}
			}
		}),
		warnings
	};
}
//#endregion
//#region src/core/storage/repository.ts
var MODULE_SCOPE = "build-n-action";
var BLUEPRINT_NAME = "Blueprint";
/** The embedded name v1.0.6 used in UUIDs; still resolved for old links, enrichers and macros. */
var LEGACY_NAME = "ContextualBonus";
var ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Stored lists may be arrays or id-keyed objects (v1 accepted both). */
function storedEntries(value) {
	if (Array.isArray(value)) return value.filter(Boolean);
	if (value && typeof value === "object") return Object.values(value).filter(Boolean);
	return [];
}
function storedId(entry) {
	return asString(asRecord(entry).id);
}
/** A 16-character id derived from text (FNV-1a), so a bonus without a valid id keeps one id across reads. */
function derivedId(seed) {
	let hash = 2166136261;
	let id = "";
	for (let round = 0; id.length < 16; round++) {
		for (const char of `${round}:${seed}`) {
			hash ^= char.codePointAt(0) ?? 0;
			hash = Math.imul(hash, 16777619) >>> 0;
		}
		id += ID_ALPHABET.charAt(hash % 62);
	}
	return id;
}
function byOrder(left, right) {
	return left.sort - right.sort || left.name.localeCompare(right.name);
}
/** The blueprints stored on a document: saved ones plus lazily converted v1 bonuses. */
function readBlueprints(scope, carrier) {
	const flags = asRecord(scope);
	const blueprints = [];
	const issues = [];
	const ids = /* @__PURE__ */ new Set();
	for (const raw of storedEntries(flags.blueprints)) {
		const result = validateBlueprintSource(raw);
		if (!result.ok) {
			issues.push({
				id: storedId(raw),
				code: "invalidBlueprint",
				values: { path: result.issues[0]?.path || "—" }
			});
			continue;
		}
		if (ids.has(result.value.id)) continue;
		ids.add(result.value.id);
		blueprints.push(result.value);
	}
	const seeds = /* @__PURE__ */ new Map();
	for (const raw of storedEntries(flags.bonuses)) {
		if (ids.has(storedId(raw))) continue;
		const seed = JSON.stringify(raw);
		const occurrence = seeds.get(seed) ?? 0;
		seeds.set(seed, occurrence + 1);
		const { blueprint, warnings } = convertLegacyBonus(raw, carrier, { fallbackId: derivedId(`${occurrence}:${seed}`) });
		const id = blueprint?.id ?? storedId(raw);
		for (const warning of warnings) issues.push({
			id,
			...warning
		});
		if (!blueprint || ids.has(blueprint.id)) continue;
		ids.add(blueprint.id);
		blueprints.push(blueprint);
	}
	return {
		blueprints: blueprints.sort(byOrder),
		issues
	};
}
/** Remove the v1 bonus a blueprint was converted from (if still stored) and back it up. */
function withoutLegacy(flags, blueprint) {
	const legacyId = asString(asRecord(blueprint.flags[MODULE_SCOPE]).legacyId, blueprint.id);
	const bonuses = storedEntries(flags.bonuses);
	const index = bonuses.findIndex((entry) => [blueprint.id, legacyId].includes(storedId(entry)));
	if (index < 0) return {};
	const original = bonuses[index];
	return {
		bonuses: bonuses.filter((_entry, position) => position !== index),
		legacyBackup: {
			...asRecord(flags.legacyBackup),
			[blueprint.id]: original
		}
	};
}
/** Save a blueprint: replace it by id or append it, and retire the v1 bonus it came from. */
function upsertBlueprint(scope, blueprint) {
	const flags = asRecord(scope);
	const stored = storedEntries(flags.blueprints);
	const index = stored.findIndex((entry) => storedId(entry) === blueprint.id);
	return {
		blueprints: index < 0 ? [...stored, blueprint] : stored.map((entry, position) => position === index ? blueprint : entry),
		...withoutLegacy(flags, blueprint)
	};
}
/** Delete a blueprint, including the v1 bonus it may still be stored as (kept in the backup). */
function deleteBlueprint(scope, blueprint) {
	const flags = asRecord(scope);
	return {
		blueprints: storedEntries(flags.blueprints).filter((entry) => storedId(entry) !== blueprint.id),
		...withoutLegacy(flags, blueprint)
	};
}
/** A flag update as `document.update` changes. */
function flagChanges(update) {
	return Object.fromEntries(Object.entries(update).map(([key, value]) => [`flags.${MODULE_SCOPE}.${key}`, value]));
}
function blueprintUuid(parentUuid, id) {
	return `${parentUuid}.${BLUEPRINT_NAME}.${id}`;
}
var UUID_PATTERN = new RegExp(`^(.+)\\.(?:${BLUEPRINT_NAME}|${LEGACY_NAME})\\.([A-Za-z0-9]{16})$`);
/** Split a blueprint UUID (new or v1 form) into its parent document UUID and blueprint id. */
function parseBlueprintUuid(uuid) {
	const match = UUID_PATTERN.exec(uuid);
	if (!match?.[1] || !match[2]) return null;
	return {
		parentUuid: match[1],
		id: match[2]
	};
}
//#endregion
//#region src/core/graph/paths.ts
/**
* Every route from an event to a result. Conditions reached through several wires yield one
* path per route (fan-in means OR); malformed wiring is skipped rather than reported, since the
* linter and validator own reporting.
*/
function enumeratePaths(graph) {
	const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
	const outgoing = /* @__PURE__ */ new Map();
	for (const edge of graph.edges) {
		const list = outgoing.get(edge.source) ?? [];
		list.push(edge);
		outgoing.set(edge.source, list);
	}
	const paths = [];
	const visit = (nodeId, start, guards, trail) => {
		const node = nodes.get(nodeId);
		if (!node || trail.has(nodeId)) return;
		if (node.kind === "result") {
			paths.push({
				...start,
				guards,
				resultNodeId: nodeId
			});
			return;
		}
		if (node.kind !== "condition") return;
		const nextTrail = new Set(trail).add(nodeId);
		for (const edge of outgoing.get(nodeId) ?? []) {
			if (edge.sourcePin !== "yes" && edge.sourcePin !== "no") continue;
			visit(edge.target, start, [...guards, {
				nodeId,
				expect: edge.sourcePin === "yes"
			}], nextTrail);
		}
	};
	for (const node of graph.nodes) {
		if (node.kind !== "event") continue;
		for (const edge of outgoing.get(node.id) ?? []) visit(edge.target, {
			eventNodeId: node.id,
			eventPin: edge.sourcePin
		}, [], /* @__PURE__ */ new Set());
	}
	return paths;
}
//#endregion
//#region src/core/engine/compile.ts
var cache$2 = /* @__PURE__ */ new WeakMap();
function compileBlueprint(source) {
	const cached = cache$2.get(source);
	if (cached) return cached;
	const nodes = new Map(source.nodes.map((node) => [node.id, node]));
	const edgeId = (from, pin, to) => {
		return source.edges.find((edge) => edge.source === from && edge.sourcePin === pin && edge.target === to)?.id ?? "";
	};
	const paths = [];
	for (const path of enumeratePaths(source)) {
		const event = nodes.get(path.eventNodeId);
		const result = nodes.get(path.resultNodeId);
		if (!event || !result) continue;
		const guards = [];
		const hops = [];
		let previous = event.id;
		let pin = path.eventPin;
		for (const guard of path.guards) {
			const node = nodes.get(guard.nodeId);
			if (!node) continue;
			hops.push(edgeId(previous, pin, node.id));
			guards.push({
				node,
				expect: guard.expect,
				mode: asString(node.data.mode) === "any" ? "any" : "all",
				checks: Array.isArray(node.data.checks) ? node.data.checks : []
			});
			previous = node.id;
			pin = guard.expect ? "yes" : "no";
		}
		hops.push(edgeId(previous, pin, result.id));
		paths.push({
			event,
			eventType: event.type,
			pin: path.eventPin,
			guards,
			result,
			hops
		});
	}
	const byEvent = /* @__PURE__ */ new Map();
	for (const path of paths) {
		const list = byEvent.get(path.eventType) ?? [];
		list.push(path);
		byEvent.set(path.eventType, list);
	}
	const compiled = {
		source,
		paths,
		pathsFor: (event) => byEvent.get(event) ?? []
	};
	cache$2.set(source, compiled);
	return compiled;
}
//#endregion
//#region src/runtime/read.ts
/** Read a dotted path, e.g. read(actor, "system.attributes.hp.pct"). */
function read(source, path) {
	let value = source;
	for (const key of path.split(".")) {
		if (value === null || value === void 0) return void 0;
		value = value[key];
	}
	return value;
}
/** Entries of an array, Set or other iterable object; [] for anything else (strings included). */
function listOf(value) {
	if (Array.isArray(value)) return value;
	if (value && typeof value === "object" && Symbol.iterator in value) return [...value];
	return [];
}
/** The strings in an array, Set or other iterable. */
function stringList(value) {
	return listOf(value).filter((entry) => typeof entry === "string");
}
/** Call a method that returns an iterable (e.g. allApplicableEffects) and list the result; [] when absent. */
function callList(source, method) {
	const fn = read(source, method);
	return typeof fn === "function" ? listOf(fn.call(source)) : [];
}
//#endregion
//#region src/foundry/documents.ts
var EMPTY = {
	blueprints: [],
	issues: []
};
var CARRIERS = {
	Actor: "actor",
	Item: "item",
	ActiveEffect: "effect",
	Region: "region",
	MeasuredTemplate: "template"
};
function isDocument(value) {
	return !!value && typeof value === "object" && typeof read(value, "documentName") === "string" && typeof read(value, "uuid") === "string";
}
/** Whether a value is a document of one of these types (not a type guard, so "false" narrows nothing). */
function isA(value, ...names) {
	return isDocument(value) && names.includes(value.documentName);
}
/** A world document by UUID, or null (never throws, never returns compendium index entries). */
function documentFromUuid(uuid) {
	if (!uuid) return null;
	try {
		const found = fromUuidSync(uuid);
		return isDocument(found) ? found : null;
	} catch {
		return null;
	}
}
function carrierKind(document) {
	return CARRIERS[document.documentName] ?? null;
}
var cache$1 = /* @__PURE__ */ new WeakMap();
/**
* Blueprints on a document: saved ones plus converted v1 bonuses. Foundry replaces flag arrays on
* update, so the read is redone only when either array changes and compiled plans stay cached.
*/
function documentBlueprints(document) {
	const carrier = carrierKind(document);
	const scope = read(document, `flags.${MODULE_SCOPE}`);
	if (!carrier || !scope) return EMPTY;
	const blueprints = read(scope, "blueprints");
	const bonuses = read(scope, "bonuses");
	const cached = cache$1.get(document);
	if (cached && cached.blueprints === blueprints && cached.bonuses === bonuses) return cached.result;
	const result = readBlueprints(scope, carrier);
	cache$1.set(document, {
		blueprints,
		bonuses,
		result
	});
	return result;
}
/** Whether a carrier currently does nothing (v1 ContextualBonus#isSuppressed). */
function isSuppressed(document) {
	switch (document.documentName) {
		case "ActiveEffect":
			if (read(document, "active") !== true) return true;
			if (read(document, "isAppliedEnchantment") === true) return false;
			return read(document, "modifiesActor") !== true;
		case "MeasuredTemplate": return read(document, "hidden") === true;
		case "Item": {
			const actor = document.parent;
			if (!actor) return false;
			if (read(actor, "type") === "vehicle") {
				const system = asRecord(read(document, "system"));
				return "crewed" in system && system.crewed !== true;
			}
			return read(document, "areEffectsSuppressed") === true;
		}
		default: return false;
	}
}
/** The item whose activity placed a template (its dnd5e origin flag holds the activity UUID). */
function templateOriginItem(template) {
	const origin = asString(read(template, "flags.dnd5e.origin"));
	if (!origin) return null;
	const item = documentFromUuid(origin.split(".").slice(0, -2).join("."));
	return isA(item, "Item") ? item : null;
}
function effectSource(effect) {
	let origin = documentFromUuid(asString(read(effect, "origin")));
	if (isA(origin, "ActiveEffect")) origin = origin?.parent ?? null;
	if (isA(origin, "Item", "Actor")) return origin;
	return isA(effect.parent, "Item", "Actor") ? effect.parent : null;
}
/** The actor a blueprint belongs to (for signals, "includes me" and blockers). */
function ownerActor(document) {
	switch (document.documentName) {
		case "Actor": return document;
		case "Item": return isA(document.parent, "Actor") ? document.parent : null;
		case "ActiveEffect": {
			const parent = document.parent;
			if (isA(parent, "Actor")) return parent;
			return isA(parent, "Item") && isA(parent?.parent, "Actor") ? parent?.parent ?? null : null;
		}
		case "MeasuredTemplate": {
			const item = templateOriginItem(document);
			return item && isA(item.parent, "Actor") ? item.parent : null;
		}
		default: return null;
	}
}
/** The document whose roll data a blueprint's formulas use (v1 ContextualBonus#origin). */
function rollDataOrigin(document) {
	switch (document.documentName) {
		case "Actor":
		case "Item": return document;
		case "ActiveEffect": return effectSource(document);
		case "MeasuredTemplate": return templateOriginItem(document);
		default: return null;
	}
}
/** The item a blueprint belongs to, for "this item only" and item costs. */
function carrierItem(document) {
	switch (document.documentName) {
		case "Item": return document;
		case "MeasuredTemplate": return templateOriginItem(document);
		case "ActiveEffect": {
			const source = effectSource(document);
			return isA(source, "Item") ? source : null;
		}
		default: return null;
	}
}
/** Roll data of an activity, item or actor (a fresh object each call). */
function rollDataOf(source, deterministic = false) {
	const getRollData = read(source, "getRollData");
	if (typeof getRollData !== "function") return {};
	return asRecord(getRollData.call(source, { deterministic }));
}
/** Roll data of a blueprint's origin; a template also carries the level its spell was cast at. */
function originRollData(document, deterministic = false) {
	const data = rollDataOf(rollDataOrigin(document), deterministic);
	const level = asNumber(read(document, "flags.dnd5e.spellLevel"));
	if (document.documentName === "MeasuredTemplate" && level !== null) data.item = {
		...asRecord(data.item),
		level
	};
	return data;
}
/** The token that represents an actor on the canvas (its own token, else its first active token). */
function actorToken(actor) {
	const own = read(actor, "token.object");
	if (own) return own;
	const getActiveTokens = read(actor, "getActiveTokens");
	if (typeof getActiveTokens !== "function") return null;
	return listOf(getActiveTokens.call(actor))[0] ?? null;
}
/** Whether a document update touched this module's flags (blueprints or v1 bonuses). */
function touchesBlueprints(changes) {
	const record = asRecord(changes);
	if (Object.keys(record).some((key) => key.startsWith(`flags.build-n-action`))) return true;
	const flags = asRecord(record.flags);
	return "build-n-action" in flags || `-=build-n-action` in flags;
}
//#endregion
//#region src/foundry/settings.ts
/** World setting keys, unchanged from v1.0.6 so saved values carry over. */
var SETTINGS = {
	disableScripts: "disableCustomScriptFilter",
	fumbleBelowOne: "allowFumbleNegation",
	padAuraRadius: "padAuraRadius",
	showAuraRanges: "showAuraRanges",
	allowPlayers: "allowPlayers",
	headerLabel: "headerLabel",
	showSheetTab: "showSheetTab"
};
/** Per-user settings the editor keeps; not shown in the settings window. */
var CLIENT_SETTINGS = {
	editorTheme: "editorTheme",
	editorEffects: "editorEffects",
	coachSeen: "coachSeen"
};
function register(key, name, initial, config = true, onChange) {
	game.settings.register(MODULE_SCOPE, key, {
		name: `BNA.Setting.${name}.name`,
		hint: `BNA.Setting.${name}.hint`,
		scope: "world",
		config,
		type: Boolean,
		default: initial,
		...onChange ? { onChange } : {}
	});
}
/** Re-render open document sheets so header controls follow the settings. */
function refreshSheets() {
	for (const application of foundry.applications.instances.values()) if (read(application, "document") && read(application, "rendered")) application.render();
}
function registerClient(key, type, initial) {
	game.settings.register(MODULE_SCOPE, key, {
		scope: "client",
		config: false,
		type,
		default: initial
	});
}
function registerSettings() {
	register(SETTINGS.allowPlayers, "allowPlayers", true, true, refreshSheets);
	register(SETTINGS.headerLabel, "headerLabel", false, true, refreshSheets);
	register(SETTINGS.disableScripts, "disableScripts", false);
	register(SETTINGS.fumbleBelowOne, "fumbleBelowOne", false);
	register(SETTINGS.padAuraRadius, "padAuraRadius", true);
	register(SETTINGS.showAuraRanges, "showAuraRanges", false);
	register(SETTINGS.showSheetTab, "showSheetTab", false, false);
	registerClient(CLIENT_SETTINGS.editorTheme, String, "auto");
	registerClient(CLIENT_SETTINGS.editorEffects, String, "full");
	registerClient(CLIENT_SETTINGS.coachSeen, Boolean, false);
}
function setting(key) {
	try {
		return game.settings.get(MODULE_SCOPE, key) === true;
	} catch {
		return false;
	}
}
function clientSetting(key) {
	try {
		return game.settings.get(MODULE_SCOPE, key);
	} catch {
		return;
	}
}
function setClientSetting(key, value) {
	return game.settings.set(MODULE_SCOPE, key, value);
}
/** The editor's theme: its own choice, else Foundry's application scheme, else the browser's. */
function resolveEditorTheme(stored, applications, prefersLight) {
	if (stored === "dark" || stored === "light") return stored;
	if (applications === "dark" || applications === "light") return applications;
	return prefersLight ? "light" : "dark";
}
//#endregion
//#region src/foundry/editor/app.ts
var open = /* @__PURE__ */ new Map();
/** GMs always; other users on documents they own, while "Let players edit blueprints" is on. */
function canEdit(document) {
	if (!carrierKind(document)) return false;
	if (game.user.isGM) return true;
	return setting(SETTINGS.allowPlayers) && document.isOwner;
}
var BlueprintEditorApp = class extends foundry.applications.api.ApplicationV2 {
	static DEFAULT_OPTIONS = {
		classes: ["bna-editor-window"],
		window: {
			icon: "fa-solid fa-diagram-project",
			resizable: true
		},
		position: {
			width: 1280,
			height: 780
		}
	};
	carrier;
	#blueprintId;
	#mounted = null;
	constructor(carrier, blueprintId) {
		super({
			id: `bna-editor-${carrier.uuid.replace(/[^A-Za-z0-9-]+/g, "-")}`,
			window: { title: game.i18n.format("BNA.Editor.title", { name: carrier.name }) }
		});
		this.carrier = carrier;
		this.#blueprintId = blueprintId;
	}
	/** The editor draws itself with React; the window only provides the frame. */
	async _renderHTML() {
		return null;
	}
	_replaceHTML() {}
	async _onFirstRender() {
		const content = this.element.querySelector(".window-content");
		if (!content) return;
		try {
			const { mountEditor } = await import("./editor-BPlSiB67.mjs");
			this.#mounted = await mountEditor(content, this.carrier, {
				blueprintId: this.#blueprintId,
				close: this.#close
			});
		} catch (error) {
			console.error("Build-n-Action | the blueprint editor could not load", error);
			ui.notifications.error(game.i18n.localize("BNA.Editor.loadFailed"));
			this.#close();
		}
	}
	_onClose() {
		this.#mounted?.unmount();
		this.#mounted = null;
		open.delete(this.carrier.uuid);
	}
	select(blueprintId) {
		this.#blueprintId = blueprintId;
		this.#mounted?.select(blueprintId);
	}
	#close = () => {
		this.close().catch((error) => console.warn("Build-n-Action | could not close the editor", error));
	};
};
/** Open (or bring forward) the editor for a document; null when the user may not edit it. */
async function openEditor(document, { blueprintId = null } = {}) {
	if (!canEdit(document)) {
		ui.notifications.warn(game.i18n.localize("BNA.Editor.noPermission"));
		return null;
	}
	const existing = open.get(document.uuid);
	if (existing) {
		if (blueprintId) existing.select(blueprintId);
		existing.bringToFront();
		return existing;
	}
	const app = new BlueprintEditorApp(document, blueprintId);
	open.set(document.uuid, app);
	await app.render({ force: true });
	return app;
}
//#endregion
//#region src/core/engine/reasons.ts
function reason(code, values) {
	return values ? {
		code,
		values
	} : { code };
}
function passed(code, values) {
	return {
		pass: true,
		reason: reason(code, values)
	};
}
function failed(code, values) {
	return {
		pass: false,
		reason: reason(code, values)
	};
}
//#endregion
//#region src/core/engine/inclusion.ts
/** Split stored values into included ones and `!`-prefixed exclusions (any number of `!`, as in v1). */
function splitSelection(values) {
	const included = [];
	const excluded = [];
	for (const value of values) {
		const match = /^(!*)(.+)$/.exec(value);
		if (!match?.[2]) continue;
		if (match[1]) excluded.push(match[2]);
		else included.push(match[2]);
	}
	return {
		included,
		excluded
	};
}
function hasIncluded(values) {
	return splitSelection(values).included.length > 0;
}
/** Pass when any included value is present and no excluded value is present. */
function matchValues(actual, selection) {
	const { included, excluded } = splitSelection(selection);
	if (!included.length && !excluded.length) return passed("empty");
	const shown = actual.length ? actual.join(", ") : "—";
	if (included.length && !included.some((value) => actual.includes(value))) return failed("notMatched", {
		actual: shown,
		expected: included.join(", ")
	});
	const hit = excluded.find((value) => actual.includes(value));
	if (hit) return failed("excluded", { actual: hit });
	return passed("matched", { actual: shown });
}
//#endregion
//#region src/core/engine/evaluators.ts
var OPERATOR_SYMBOLS = {
	EQ: "=",
	LT: "<",
	GT: ">",
	LE: "≤",
	GE: "≥"
};
function selection(data) {
	return asStrings(data.values);
}
/** A list check on a fact that may be absent: absent passes only when nothing is required. */
function listOrAbsent(actual, values, absent) {
	if (!values.length) return passed("empty");
	if (!actual) return hasIncluded(values) ? failed(absent) : passed(absent);
	return matchValues(actual, values);
}
/** A list check on a fact that must be present. */
function listRequired(actual, values, absent) {
	if (!values.length) return passed("empty");
	if (!actual) return failed(absent);
	return matchValues(actual, values);
}
/** Drop conditions the creature is immune to from a selection (v1 behaviour). */
function withoutImmune(values, immunities) {
	return values.filter((value) => !immunities.includes(value.replace(/^!+/, "")));
}
function compare(operator, left, right) {
	switch (operator) {
		case "LT": return left < right;
		case "GT": return left > right;
		case "LE": return left <= right;
		case "GE": return left >= right;
		default: return left === right;
	}
}
function compareText(operator, left, right) {
	if (operator === "LT" || operator === "LE") return right.includes(left);
	if (operator === "GT" || operator === "GE") return left.includes(right);
	return left === right;
}
var EVALUATORS = {
	itemTypes: (data, facts) => listRequired(facts.item ? [facts.item.type] : null, selection(data), "noItem"),
	identifiers: (data, facts) => listRequired(facts.item ? [facts.item.identifier] : null, selection(data), "noItem"),
	baseWeapons: (data, facts) => listOrAbsent(facts.item?.type === "weapon" ? facts.item.baseTypes : null, selection(data), "notWeapon"),
	weaponProperties: (data, facts) => listOrAbsent(facts.item?.type === "weapon" ? facts.item.properties : null, selection(data), "notWeapon"),
	attackModes: (data, facts) => {
		const lists = [
			[asStrings(data.value), facts.activity?.attackType ?? null],
			[asStrings(data.classification), facts.activity?.attackClassification ?? null],
			[asStrings(data.mode), facts.roll.attackMode]
		];
		if (lists.every(([values]) => !values.length)) return passed("empty");
		if (facts.activity?.type !== "attack") return passed("noActivity");
		for (const [values, actual] of lists) if (values.length && !values.includes(actual ?? "")) return failed("notMatched", {
			actual: actual ?? "—",
			expected: values.join(", ")
		});
		return passed("matched", { actual: lists.map(([, actual]) => actual ?? "—").join(", ") });
	},
	featureTypes: (data, facts) => {
		const type = asString(data.type);
		if (!type) return passed("empty");
		if (facts.item?.type !== "feat") return failed("notFeature", { actual: facts.item?.type ?? "—" });
		if (facts.item.featureType !== type) return failed("notMatched", {
			actual: facts.item.featureType ?? "—",
			expected: type
		});
		const subtype = asString(data.subtype);
		if (subtype && facts.item.featureSubtype !== subtype) return failed("notMatched", {
			actual: facts.item.featureSubtype ?? "—",
			expected: subtype
		});
		return passed("matched", { actual: [type, subtype].filter(Boolean).join(", ") });
	},
	damageTypes: (data, facts) => listRequired(facts.activity?.damageTypes ?? null, selection(data), "noActivity"),
	abilities: (data, facts) => {
		const values = selection(data);
		if (!values.length) return passed("empty");
		const ability = facts.roll.toolKeys.length ? facts.roll.abilityId : facts.activity ? facts.activity.ability : facts.roll.abilityId;
		return ability ? matchValues([ability], values) : failed("noValue");
	},
	thisItem: (_data, facts, env) => {
		if (!env.carrierItemUuid) return passed("empty");
		return facts.item?.uuid === env.carrierItemUuid ? passed("matched", { actual: facts.item.identifier }) : failed("otherItem");
	},
	spellLevels: (data, facts) => listRequired(facts.item?.spell ? [String(facts.item.spell.level)] : null, selection(data), "notSpell"),
	spellSchools: (data, facts) => listOrAbsent(facts.item?.spell ? [facts.item.spell.school] : null, selection(data), "notSpell"),
	spellComponents: (data, facts) => {
		const types = asStrings(data.types);
		if (!types.length) return passed("empty");
		if (!facts.item?.spell) return failed("notSpell");
		const properties = facts.item.properties;
		return (asString(data.match) === "all" ? types.every((type) => properties.includes(type)) : types.some((type) => properties.includes(type))) ? passed("matched", { actual: properties.join(", ") }) : failed("notMatched", {
			actual: properties.join(", ") || "—",
			expected: types.join(", ")
		});
	},
	preparationModes: (data, facts) => listRequired(facts.item?.spell ? [facts.item.spell.method] : null, selection(data), "notSpell"),
	sourceClasses: (data, facts) => {
		const values = selection(data);
		if (!values.length) return passed("empty");
		if (!facts.item?.spell) return passed("notSpell");
		return matchValues([facts.item.spell.sourceClass], values);
	},
	actorCreatureTypes: (data, facts) => matchValues(facts.actor.creatureTypes, selection(data)),
	actorCreatureSizes: (data, facts) => listRequired(facts.actor.size ? [facts.actor.size] : null, selection(data), "noValue"),
	actorLanguages: (data, facts) => matchValues(facts.actor.languages, selection(data)),
	baseArmors: (data, facts) => matchValues(facts.actor.armor, selection(data)),
	statusEffects: (data, facts) => matchValues(facts.actor.statuses, withoutImmune(selection(data), facts.actor.conditionImmunities)),
	healthPercentages: (data, facts) => {
		const value = asNumber(data.value);
		if (value === null) return passed("empty");
		const hp = facts.actor.hpPercent;
		if (hp === null) return failed("noValue");
		const atLeast = asString(data.type) === "atLeast";
		const ok = atLeast ? hp >= value : hp <= value;
		const values = {
			actual: `${Math.round(hp)}%`,
			expected: `${atLeast ? "≥" : "≤"} ${value}%`
		};
		return ok ? passed("matched", { actual: values.actual }) : failed("threshold", values);
	},
	remainingSpellSlots: (data, facts) => {
		const min = asNumber(data.min);
		const max = asNumber(data.max);
		if (min === null && max === null) return passed("empty");
		const bySize = asBoolean(data.size);
		const count = facts.actor.spellSlots.reduce((total, slot) => {
			if (!slot.level || !slot.value || !slot.max) return total;
			return total + Math.min(Math.max(slot.value, 0), slot.max) * (bySize ? slot.level : 1);
		}, 0);
		return count >= (min ?? 0) && count <= (max ?? Infinity) ? passed("matched", { actual: count }) : failed("threshold", {
			actual: count,
			expected: `${min ?? 0}–${max ?? "∞"}`
		});
	},
	proficiencyLevels: (data, facts) => listRequired(facts.roll.proficiency === null ? null : [String(facts.roll.proficiency)], selection(data), "noValue"),
	markers: (data, facts) => {
		const values = selection(data);
		if (!values.length) return passed("empty");
		return matchValues([...facts.item?.markers ?? [], ...facts.actor.markers], values);
	},
	creatureTypes: (data, facts) => listOrAbsent(facts.target?.creatureTypes ?? null, selection(data), "noTarget"),
	targetArmors: (data, facts) => listOrAbsent(facts.target?.armor ?? null, selection(data), "noTarget"),
	targetEffects: (data, facts) => {
		const target = facts.target;
		return listOrAbsent(target?.statuses ?? null, withoutImmune(selection(data), target?.conditionImmunities ?? []), "noTarget");
	},
	tokenSizes: (data, facts) => {
		const size = asNumber(data.size);
		if (size === null) return passed("empty");
		const targetSize = facts.target?.tokenSize ?? null;
		if (targetSize === null) return failed("noTarget");
		const self = asBoolean(data.self);
		const mine = facts.actor.tokenSize;
		if (self && mine === null) return failed("noValue");
		const atMost = asString(data.type) === "atMost";
		const bound = self ? atMost ? Math.min(mine ?? size, size) : Math.max(mine ?? size, size) : size;
		return (atMost ? targetSize <= bound : targetSize >= bound) ? passed("matched", { actual: targetSize }) : failed("threshold", {
			actual: targetSize,
			expected: `${atMost ? "≤" : "≥"} ${bound}`
		});
	},
	targetMarkers: (data, facts) => listRequired(facts.target?.markers ?? null, selection(data), "noTarget"),
	saveAbilities: (data, facts) => listRequired(facts.activity?.dcAbility ? [facts.activity.dcAbility] : null, selection(data), "noValue"),
	throwTypes: (data, facts) => {
		const actual = [
			facts.roll.saveAbility,
			facts.roll.isDeath ? "death" : null,
			facts.roll.isConcentration ? "concentration" : null
		].filter((value) => value !== null);
		return listRequired(actual.length ? actual : null, selection(data), "noValue");
	},
	skillIds: (data, facts) => listOrAbsent(facts.roll.skillId ? [facts.roll.skillId] : null, selection(data), "noValue"),
	baseTools: (data, facts) => listOrAbsent(facts.roll.toolKeys.length ? facts.roll.toolKeys : null, selection(data), "noValue"),
	arbitraryComparisons: (data, _facts, env) => {
		const rows = Array.isArray(data.comparisons) ? data.comparisons.map(asRecord) : [];
		if (!rows.length) return passed("empty");
		for (const row of rows) {
			const one = asString(row.one).trim();
			const other = asString(row.other).trim();
			const operator = asString(row.operator, "EQ");
			const shown = {
				left: one || "—",
				operator: OPERATOR_SYMBOLS[operator] ?? "=",
				right: other || "—"
			};
			if (!one || !other) return failed("comparisonFailed", shown);
			const left = env.evaluateNumber(one);
			const right = env.evaluateNumber(other);
			if (!(left !== null && right !== null ? compare(operator, left, right) : compareText(operator, env.replaceData(one), env.replaceData(other)))) return failed("comparisonFailed", shown);
		}
		return passed("matched", { actual: rows.length });
	},
	customScripts: (data, facts, env) => {
		const script = asString(data.script).trim();
		if (!script) return passed("empty");
		let result;
		try {
			result = env.runScript(script, facts);
		} catch {
			return failed("scriptError");
		}
		if (result === null) return passed("scriptDisabled");
		return result ? passed("matched", { actual: "true" }) : failed("scriptFalse");
	}
};
function evaluateCheck(type, data, facts, env) {
	const evaluator = EVALUATORS[type];
	return evaluator ? evaluator(data, facts, env) : failed("noValue");
}
//#endregion
//#region src/core/engine/interpreter.ts
var LIMITS = [
	"turn",
	"round",
	"shortRest",
	"longRest"
];
function readCommon(data, nodeId) {
	const common = asRecord(data.common);
	const limit = asString(common.limit, "none");
	return {
		optional: asBoolean(common.optional),
		choiceGroup: asString(common.choiceGroup).trim() || nodeId,
		cost: asRecord(common.cost),
		limit: LIMITS.includes(limit) ? limit : "none"
	};
}
function evaluateGuard(guard, facts, env, cache, nodes) {
	const cached = cache.get(guard.node.id);
	if (cached !== void 0) return cached;
	const checks = guard.checks.map((check) => ({
		checkId: check.id,
		type: check.type,
		outcome: evaluateCheck(check.type, check.data, facts, env)
	}));
	let value = true;
	if (checks.length) value = guard.mode === "any" ? checks.some((check) => check.outcome.pass) : checks.every((check) => check.outcome.pass);
	nodes[guard.node.id] = checks.length ? {
		status: value ? "passed" : "failed",
		checks
	} : {
		status: "passed",
		checks,
		reason: { code: "noChecks" }
	};
	cache.set(guard.node.id, value);
	return value;
}
/** Run one blueprint for a trigger: which results apply, and a trace of every node and wire. */
function runBlueprint(blueprint, trigger, facts, env) {
	const compiled = "paths" in blueprint ? blueprint : compileBlueprint(blueprint);
	const { source } = compiled;
	const run = {
		blueprintId: source.id,
		intents: [],
		nodes: Object.fromEntries(source.nodes.map((node) => [node.id, { status: "skipped" }])),
		edges: [],
		skipped: null
	};
	if (!source.enabled) {
		run.skipped = { code: "disabled" };
		return run;
	}
	const reaches = /* @__PURE__ */ new Map();
	const guards = /* @__PURE__ */ new Map();
	const edges = /* @__PURE__ */ new Set();
	const applied = /* @__PURE__ */ new Set();
	const take = (edge) => {
		if (edge) edges.add(edge);
	};
	for (const path of compiled.pathsFor(trigger.event)) {
		if (!trigger.pins.includes(path.pin)) continue;
		if (trigger.event === "signal" && asString(path.event.data.name).trim() !== (trigger.signal ?? "")) continue;
		let reach = reaches.get(path.event.id);
		if (!reach) {
			reach = env.reach(path.event);
			reaches.set(path.event.id, reach);
			run.nodes[path.event.id] = reach.pass ? { status: "passed" } : {
				status: "failed",
				reason: reach.reason
			};
		}
		if (!reach.pass) continue;
		take(path.hops[0]);
		let open = true;
		for (const [index, guard] of path.guards.entries()) {
			if (evaluateGuard(guard, facts, env, guards, run.nodes) !== guard.expect) {
				open = false;
				break;
			}
			take(path.hops[index + 1]);
		}
		if (!open || applied.has(path.result.id)) continue;
		const common = readCommon(path.result.data, path.result.id);
		if (common.limit !== "none" && !env.limitAvailable(source.id, path.result.id, common.limit)) {
			run.nodes[path.result.id] = {
				status: "failed",
				reason: { code: "limitUsed" }
			};
			continue;
		}
		applied.add(path.result.id);
		run.nodes[path.result.id] = { status: "passed" };
		run.intents.push({
			blueprintId: source.id,
			nodeId: path.result.id,
			type: path.result.type,
			data: path.result.data,
			common,
			eventNodeId: path.event.id
		});
	}
	run.edges = [...edges];
	return run;
}
/**
* Run a trigger across blueprints and then deliver the signals they send, wave by wave. A sender
* reaches blueprints on the same actor ("actor" scope) or on its own document ("document" scope).
*/
function runWithSignals(entries, trigger, facts, maxDepth = 8) {
	const result = {
		runs: [],
		intents: [],
		signals: [],
		truncated: false
	};
	const sent = /* @__PURE__ */ new Set();
	let wave = [{
		trigger,
		receivers: entries
	}];
	for (let depth = 0; wave.length; depth++) {
		const next = [];
		for (const step of wave) for (const entry of step.receivers) {
			const run = runBlueprint(entry.compiled, step.trigger, facts, entry.env);
			if (!(depth === 0 || Object.values(run.nodes).some((node) => node.status !== "skipped"))) continue;
			result.runs.push(run);
			for (const intent of run.intents) {
				if (intent.type !== "signal") {
					result.intents.push({
						...intent,
						entry
					});
					continue;
				}
				const name = asString(intent.data.name).trim();
				if (!name) continue;
				const key = `${intent.blueprintId}:${intent.nodeId}:${name}`;
				if (sent.has(key) || depth + 1 > maxDepth) {
					result.truncated = true;
					continue;
				}
				sent.add(key);
				result.signals.push({
					name,
					depth: depth + 1
				});
				const byDocument = asString(intent.data.scope, "actor") === "document";
				next.push({
					trigger: {
						event: "signal",
						pins: ["out"],
						signal: name
					},
					receivers: entries.filter((other) => byDocument ? other.documentUuid === entry.documentUuid : entry.actorUuid !== null && other.actorUuid === entry.actorUuid)
				});
			}
		}
		wave = next;
	}
	return result;
}
//#endregion
//#region src/core/engine/lint.ts
var LEVELS = {
	"orphan-node": "warning",
	"dead-event": "warning",
	"incompatible-result": "error",
	"irrelevant-check": "error",
	"invalid-formula": "error",
	"unknown-path": "warning",
	"contradiction": "warning",
	"signal-unmatched": "warning",
	"cost-without-optional": "error",
	"migrated": "info"
};
/** Checks whose values are one-of lists, so two in an all-of condition can contradict each other. */
var LIST_CHECKS = /* @__PURE__ */ new Set([
	"itemTypes",
	"identifiers",
	"baseWeapons",
	"damageTypes",
	"spellLevels",
	"spellSchools",
	"preparationModes",
	"actorCreatureTypes",
	"actorCreatureSizes",
	"creatureTypes",
	"skillIds",
	"saveAbilities"
]);
/** Roll-data paths (without "@") referenced by a formula. */
function formulaPaths(formula) {
	return [...formula.matchAll(/@([A-Za-z_][\w.]*)/g)].map((match) => match[1] ?? "").filter(Boolean);
}
function formulaFields(fields, data) {
	const formulas = [];
	const visit = (specs, values) => {
		for (const spec of specs) if (spec.kind === "formula") {
			const value = asString(values[spec.key]).trim();
			if (value) formulas.push(value);
		} else if (spec.kind === "group") visit(spec.fields, asRecord(values[spec.key]));
		else if (spec.kind === "embeddedResult") {
			const embedded = asRecord(values[spec.key]);
			const definition = getResult(asString(embedded.type));
			if (definition) visit(definition.fields, asRecord(embedded.data));
		}
	};
	visit(fields, data);
	return formulas;
}
function nodeFormulas(node) {
	if (node.kind === "event") return formulaFields(getEvent(node.type)?.fields ?? [], node.data);
	if (node.kind === "result") return [...formulaFields(getResult(node.type)?.fields ?? [], node.data), ...formulaFields(COMMON_RESULT_FIELDS, asRecord(node.data.common))];
	return (Array.isArray(node.data.checks) ? node.data.checks : []).flatMap((check) => formulaFields(getCheck(check.type)?.fields ?? [], check.data));
}
function lintBlueprint(blueprint, env = {}) {
	const issues = [];
	const report = (code, extra = {}) => {
		issues.push({
			code,
			level: LEVELS[code],
			...extra
		});
	};
	const compiled = compileBlueprint(blueprint);
	if (asRecord(blueprint.flags["build-n-action"]).migratedFrom) report("migrated");
	const incoming = new Set(blueprint.edges.map((edge) => edge.target));
	for (const node of blueprint.nodes) if (node.kind === "event") {
		if (!compiled.paths.some((path) => path.event.id === node.id)) report("dead-event", { nodeId: node.id });
	} else if (!incoming.has(node.id)) report("orphan-node", { nodeId: node.id });
	const seen = /* @__PURE__ */ new Set();
	const once = (key) => {
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	};
	for (const path of compiled.paths) {
		const eventType = path.eventType;
		const result = getResult(path.result.type);
		if (result && !result.compatibleEvents.includes(eventType) && once(`result:${path.result.id}`)) report("incompatible-result", {
			nodeId: path.result.id,
			values: { event: eventType }
		});
		for (const guard of path.guards) for (const check of guard.checks) {
			const definition = getCheck(check.type);
			if (definition && !definition.relevantTo.includes(eventType) && once(`check:${check.id}`)) report("irrelevant-check", {
				nodeId: guard.node.id,
				checkId: check.id,
				values: { event: eventType }
			});
		}
	}
	for (const node of blueprint.nodes) {
		if (node.kind !== "condition" || asString(node.data.mode) === "any") continue;
		const checks = Array.isArray(node.data.checks) ? node.data.checks : [];
		const firstByType = /* @__PURE__ */ new Map();
		for (const check of checks) {
			if (!LIST_CHECKS.has(check.type)) continue;
			const included = splitSelection(asStrings(check.data.values)).included;
			if (!included.length) continue;
			const earlier = firstByType.get(check.type);
			if (earlier && !earlier.some((value) => included.includes(value))) report("contradiction", {
				nodeId: node.id,
				checkId: check.id
			});
			else if (!earlier) firstByType.set(check.type, included);
		}
	}
	for (const node of blueprint.nodes) for (const formula of nodeFormulas(node)) {
		if (env.validateFormula && !env.validateFormula(formula)) report("invalid-formula", {
			nodeId: node.id,
			values: { formula }
		});
		if (env.hasPath) {
			for (const path of formulaPaths(formula)) if (!env.hasPath(path)) report("unknown-path", {
				nodeId: node.id,
				values: { path: `@${path}` }
			});
		}
	}
	if (env.signalsSent && env.signalsReceived) for (const node of blueprint.nodes) {
		const name = asString(node.data.name).trim();
		if (!name) continue;
		if (node.kind === "result" && node.type === "signal" && !env.signalsReceived.has(name)) report("signal-unmatched", {
			nodeId: node.id,
			values: { name }
		});
		if (node.kind === "event" && node.type === "signal" && !env.signalsSent.has(name)) report("signal-unmatched", {
			nodeId: node.id,
			values: { name }
		});
	}
	for (const node of blueprint.nodes) {
		if (node.kind !== "result") continue;
		const common = asRecord(node.data.common);
		if (asString(asRecord(common.cost).type, "none") !== "none" && common.optional !== true) report("cost-without-optional", { nodeId: node.id });
	}
	return issues;
}
/** Signal names the blueprints send (signal results) and receive (signal events), for LintEnv. */
function blueprintSignals(blueprints) {
	const sent = /* @__PURE__ */ new Set();
	const received = /* @__PURE__ */ new Set();
	for (const blueprint of blueprints) for (const node of blueprint.nodes) {
		if (node.type !== "signal") continue;
		const name = asString(node.data.name).trim();
		if (!name) continue;
		if (node.kind === "result") sent.add(name);
		else if (node.kind === "event") received.add(name);
	}
	return {
		sent,
		received
	};
}
//#endregion
//#region src/runtime/traits.ts
function childrenOf$1(node) {
	const children = read(node, "children");
	return children && typeof children === "object" ? children : null;
}
/** Keys from the root down to `key`, e.g. ["exotic", "primordial", "ignan"]; [] when absent. */
function traitPath(tree, key) {
	if (!tree) return [];
	for (const [nodeKey, node] of Object.entries(tree)) {
		if (nodeKey === key) return [nodeKey];
		const below = traitPath(childrenOf$1(node), key);
		if (below.length) return [nodeKey, ...below];
	}
	return [];
}
function allKeys(tree) {
	if (!tree) return [];
	return Object.entries(tree).flatMap(([key, node]) => [key, ...allKeys(childrenOf$1(node))]);
}
function subtree(tree, key) {
	if (!tree) return null;
	for (const [nodeKey, node] of Object.entries(tree)) {
		if (nodeKey === key) return childrenOf$1(node);
		const found = subtree(childrenOf$1(node), key);
		if (found) return found;
	}
	return null;
}
/** Every key below `key` in the tree. */
function traitDescendants(tree, key) {
	return allKeys(subtree(tree ?? null, key));
}
/**
* The keys a creature with these trait values counts as having: each value, the categories
* above it, and every member of a category it has chosen.
*/
function expandTraits(tree, values) {
	const keys = /* @__PURE__ */ new Set();
	for (const value of values) {
		keys.add(value);
		for (const key of traitPath(tree, value)) keys.add(key);
		for (const key of traitDescendants(tree, value)) keys.add(key);
	}
	return [...keys];
}
//#endregion
//#region src/runtime/facts.ts
var SCOPE = "build-n-action";
function text$1(value) {
	return asString(value) || null;
}
function splitTypes(value) {
	return value.split("/").map((part) => part.trim().toLowerCase()).filter(Boolean);
}
/** Creature types and subtypes, as v1's _splitRaces: subtypes split on "/", then the type or custom text. */
function creatureTypes(actor) {
	const type = read(actor, "system.details.type");
	if (!type || typeof type !== "object") return [];
	const types = new Set(splitTypes(asString(read(type, "subtype"))));
	const value = asString(read(type, "value"));
	if (value === "custom") splitTypes(asString(read(type, "custom"))).forEach((entry) => types.add(entry));
	else if (value) types.add(value);
	return [...types];
}
function wornArmor(actor) {
	const ac = read(actor, "system.attributes.ac");
	const types = /* @__PURE__ */ new Set();
	for (const worn of [read(ac, "equippedShield"), read(ac, "equippedArmor")]) {
		if (!worn) continue;
		for (const key of [read(worn, "system.type.baseItem"), read(worn, "system.type.value")]) if (typeof key === "string" && key) types.add(key);
	}
	if (read(ac, "calc") === "natural") types.add("natural");
	return [...types];
}
function ownMarkers(document) {
	return asStrings(read(document, `flags.${SCOPE}.markers`));
}
/** Markers stored on a document and on its active applicable effects. */
function markersOf(document) {
	const markers = new Set(ownMarkers(document));
	for (const effect of callList(document, "allApplicableEffects")) if (read(effect, "active") === true) ownMarkers(effect).forEach((marker) => markers.add(marker));
	return [...markers];
}
function footprint(tokenDocument) {
	const width = asNumber(read(tokenDocument, "width"));
	const height = asNumber(read(tokenDocument, "height"));
	if (width === null && height === null) return null;
	return Math.max(width ?? 0, height ?? 0);
}
function creature(actor, tokenDocument) {
	return {
		creatureTypes: creatureTypes(actor),
		size: text$1(read(actor, "system.traits.size")),
		armor: wornArmor(actor),
		statuses: stringList(read(actor, "statuses")),
		conditionImmunities: stringList(read(actor, "system.traits.ci.value")),
		markers: markersOf(actor),
		tokenSize: footprint(tokenDocument)
	};
}
function spellSlots(actor) {
	const spells = asRecord(read(actor, "system.spells"));
	return Object.values(spells).flatMap((slot) => {
		const level = asNumber(read(slot, "level"));
		const value = asNumber(read(slot, "value"));
		const max = asNumber(read(slot, "max"));
		return level === null || value === null || max === null ? [] : [{
			level,
			value,
			max
		}];
	});
}
function actorFacts(actor, tokenDocument, trees) {
	const hp = read(actor, "system.attributes.hp");
	return {
		uuid: asString(read(actor, "uuid")),
		...creature(actor, tokenDocument),
		languages: expandTraits(trees.languages, stringList(read(actor, "system.traits.languages.value"))),
		hpPercent: hp ? asNumber(read(hp, "pct")) : null,
		spellSlots: spellSlots(actor)
	};
}
/**
* The class a spell belongs to. dnd5e 5.3 deprecated SpellData#sourceClass: classIdentifier gives the
* same value, and the stored sourceItem ("class:wizard") is the fallback for plain data.
*/
function spellClass(item) {
	const identifier = asString(read(item, "system.classIdentifier"));
	if (identifier) return identifier;
	const [type, key] = asString(read(item, "system.sourceItem")).split(":");
	return type === "class" && key ? key : "";
}
function itemFacts(item, spellLevel) {
	const type = asString(read(item, "type"));
	const hasBase = type === "weapon" || type === "equipment" || type === "tool";
	return {
		uuid: asString(read(item, "uuid")),
		type,
		identifier: asString(read(item, "identifier")) || asString(read(item, "system.identifier")),
		baseTypes: hasBase ? [read(item, "system.type.value"), read(item, "system.type.baseItem")].filter((key) => typeof key === "string" && !!key) : [],
		properties: stringList(read(item, "system.properties")),
		featureType: type === "feat" ? text$1(read(item, "system.type.value")) : null,
		featureSubtype: type === "feat" ? text$1(read(item, "system.type.subtype")) : null,
		spell: type === "spell" ? {
			level: spellLevel ?? asNumber(read(item, "system.level")) ?? 0,
			school: asString(read(item, "system.school")),
			method: asString(read(item, "system.method")),
			sourceClass: spellClass(item)
		} : null,
		markers: markersOf(item)
	};
}
function dcAbility(activity) {
	const calculation = asString(read(activity, "save.dc.calculation"));
	if (!calculation) return null;
	return calculation === "spellcasting" ? text$1(read(activity, "spellcastingAbility")) : calculation;
}
function activityFacts(activity) {
	const type = asString(read(activity, "type"));
	let parts = [];
	if (type === "heal") parts = [read(activity, "healing")];
	else if ([
		"attack",
		"damage",
		"save"
	].includes(type)) parts = listOf(read(activity, "damage.parts"));
	const damageTypes = new Set(parts.flatMap((part) => stringList(read(part, "types"))));
	return {
		type,
		ability: text$1(read(activity, "ability")),
		attackType: type === "attack" ? text$1(read(activity, "attack.type.value")) : null,
		attackClassification: type === "attack" ? text$1(read(activity, "attack.type.classification")) : null,
		damageTypes: [...damageTypes],
		dcAbility: type === "save" ? dcAbility(activity) : null
	};
}
/** v1's proficiencyLevels: skill, ability check, death save, saving throw, item, tool — first that applies. */
function proficiency(input) {
	const { actor, item, details } = input;
	const multiplier = (path) => asNumber(read(actor, path)) || 0;
	if (details.skillId) return multiplier(`system.skills.${details.skillId}.prof.multiplier`);
	if (details.abilityId && !details.toolId) return multiplier(`system.abilities.${details.abilityId}.checkProf.multiplier`);
	if (details.isDeath) return read(actor, "flags.dnd5e.diamondSoul") ? 1 : 0;
	if (details.saveAbility) return multiplier(`system.abilities.${details.saveAbility}.saveProf.multiplier`);
	if (item) return asNumber(read(item, "system.prof.multiplier"));
	if (details.toolId) return multiplier(`system.tools.${details.toolId}.prof.multiplier`);
	return null;
}
function rollDetails(input, trees) {
	const { details } = input;
	const toolPath = details.toolId ? traitPath(trees.tool, details.toolId) : [];
	return {
		abilityId: details.abilityId ?? null,
		skillId: details.skillId ?? null,
		toolKeys: details.toolId ? toolPath.length ? toolPath : [details.toolId] : [],
		saveAbility: details.saveAbility ?? null,
		isDeath: details.isDeath === true,
		isConcentration: details.isConcentration === true,
		attackMode: details.attackMode ?? null,
		proficiency: proficiency(input)
	};
}
/** Everything the engine may ask about one roll, read from dnd5e documents. */
function buildRollFacts(input, trees) {
	const target = input.target;
	return {
		event: input.event,
		actor: actorFacts(input.actor, input.token, trees),
		item: input.item ? itemFacts(input.item, input.details.spellLevel) : null,
		activity: input.activity ? activityFacts(input.activity) : null,
		target: target?.actor ? creature(target.actor, target.document) : null,
		roll: rollDetails(input, trees)
	};
}
//#endregion
//#region src/runtime/paths.ts
/** More paths than any suggestion list needs; stops runaway roll data. */
var LIMIT$1 = 3e3;
/** `@` paths of every number, string or boolean in roll data, up to `maxDepth` levels, sorted. */
function rollDataPaths(data, maxDepth = 5) {
	const paths = [];
	const seen = /* @__PURE__ */ new WeakSet();
	const walk = (value, prefix, depth) => {
		if (paths.length >= LIMIT$1) return;
		if ([
			"number",
			"string",
			"boolean"
		].includes(typeof value)) {
			if (prefix) paths.push(`@${prefix}`);
			return;
		}
		if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value) || depth >= maxDepth) return;
		seen.add(value);
		for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
			if (!descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value === "function") continue;
			walk(descriptor.value, prefix ? `${prefix}.${key}` : key, depth + 1);
		}
	};
	walk(data, "", 0);
	return paths.sort();
}
//#endregion
//#region src/runtime/reach.ts
/** CONST.TOKEN_DISPOSITIONS values used by reach. */
var DISPOSITION = {
	HOSTILE: -1,
	NEUTRAL: 0,
	FRIENDLY: 1
};
function matchDisposition(wanted, source, roller) {
	if (wanted === "2") return true;
	if (source === null || roller === null) return false;
	if (wanted === "1") return source === roller;
	if (wanted === "-1") return source === DISPOSITION.FRIENDLY && roller === DISPOSITION.HOSTILE || source === DISPOSITION.HOSTILE && roller === DISPOSITION.FRIENDLY;
	return false;
}
/** Whether any blocking status is present, ignoring statuses the creature is immune to. */
function isBlocked(blockers, statuses, immunities) {
	return blockers.some((blocker) => !immunities.includes(blocker) && statuses.includes(blocker));
}
function outOfReach(actual) {
	return failed("outOfReach", { actual });
}
function requirements(value) {
	return Object.entries(asRecord(value)).filter(([, required]) => required === true).map(([key]) => key);
}
/** Decide whether an event node's "whose roll" setting includes the current roller. */
function reachOutcome(reachData, context) {
	const reach = asRecord(reachData);
	const mode = asString(reach.mode, "self");
	const includeSelf = reach.includeSelf !== false;
	const blocked = isBlocked(asStrings(reach.blockers), context.sourceStatuses, context.sourceImmunities);
	switch (context.kind) {
		case "self":
			if (mode === "self") return passed("matched", { actual: "self" });
			if (mode !== "aura") return outOfReach(mode);
			if (blocked) return outOfReach("blocked");
			return includeSelf ? passed("matched", { actual: "aura" }) : outOfReach("self");
		case "token": {
			if (mode !== "aura") return outOfReach(mode);
			if (blocked) return outOfReach("blocked");
			if (!matchDisposition(asString(reach.disposition, "2"), context.sourceDisposition, context.rollerDisposition)) return outOfReach("disposition");
			const range = context.evaluateRange(asString(reach.range));
			if (range === null || range !== -1 && range <= 0) return outOfReach("range");
			if (!context.withinRange(range, requirements(reach.require))) return outOfReach("range");
			return passed("matched", { actual: "aura" });
		}
		case "template":
			if (mode !== "template") return outOfReach(mode);
			if (blocked) return outOfReach("blocked");
			if (context.own) return includeSelf ? passed("matched", { actual: "template" }) : outOfReach("self");
			return matchDisposition(asString(reach.disposition, "2"), context.sourceDisposition, context.rollerDisposition) ? passed("matched", { actual: "template" }) : outOfReach("disposition");
		case "region": return mode === "region" || mode === "self" ? passed("matched", { actual: "region" }) : outOfReach(mode);
	}
}
//#endregion
//#region src/runtime/riders.ts
/** Rolls a next-roll rider may wait for. */
var RIDER_ROLLS = [
	"attackRoll",
	"damageRoll",
	"savingThrow",
	"abilityCheck"
];
var STALE_ACTIVATION_MS = 36e5;
/** A rider from a rider result's data; null when it carries no roll change. */
function createRider(data, ctx) {
	const effect = asRecord(data.effect);
	const type = asString(effect.type);
	if (!ROLL_RESULT_TYPES.includes(type) || !getResult(type)) return null;
	const scope = asString(data.scope) === "nextRoll" ? "nextRoll" : "sameActivation";
	const wanted = asString(data.roll);
	const duration = asRecord(data.duration);
	const unit = asString(duration.unit, "uses");
	const count = Math.max(1, Math.trunc(asNumber(duration.value) ?? 1));
	const { clock } = ctx;
	let uses = null;
	let until = null;
	if (unit === "untilRest") until = {
		kind: "rest",
		shortRests: clock.shortRests,
		longRests: clock.longRests
	};
	else if ((unit === "rounds" || unit === "turns") && clock.combatId) until = {
		kind: unit,
		count,
		combatId: clock.combatId,
		round: clock.round,
		turn: clock.turn,
		combatants: Math.max(1, clock.combatants)
	};
	else uses = unit === "uses" ? count : 1;
	return {
		id: ctx.id,
		created: clock.time,
		effect: {
			type,
			data: { ...asRecord(effect.data) }
		},
		scope,
		roll: scope === "nextRoll" ? RIDER_ROLLS.includes(wanted) ? wanted : "attackRoll" : null,
		activation: scope === "sameActivation" ? ctx.activation : null,
		uses,
		until,
		source: ctx.source
	};
}
function riderExpired(rider, now) {
	if (rider.uses !== null && rider.uses <= 0) return true;
	if (rider.scope === "sameActivation" && now.time - rider.created > STALE_ACTIVATION_MS) return true;
	const until = rider.until;
	if (!until) return false;
	if (until.kind === "rest") return now.shortRests > until.shortRests || now.longRests > until.longRests;
	if (now.combatId !== until.combatId) return true;
	const elapsed = (now.round - until.round) * Math.max(1, until.combatants) + (now.turn - until.turn);
	return until.kind === "rounds" ? elapsed >= until.count * until.combatants : elapsed >= until.count;
}
/** Whether a rider changes this roll: same activation (compatible rolls) or its next-roll kind. */
function riderApplies(rider, event, activation) {
	if (!getResult(rider.effect.type)?.compatibleEvents.includes(event)) return false;
	if (rider.scope === "sameActivation") return !!rider.activation && rider.activation === activation;
	return rider.roll === event;
}
/** The rider after one use; riders limited by time only are unchanged. */
function useRider(rider) {
	return rider.uses === null ? rider : {
		...rider,
		uses: rider.uses - 1
	};
}
/** A rider as a one-path blueprint for this roll, so collection and the interpreter handle it. */
function riderBlueprint(rider, event) {
	return createBlueprint({
		id: rider.id,
		name: rider.source.name,
		nodes: [{
			id: "event",
			kind: "event",
			type: event,
			position: {
				x: 0,
				y: 0
			},
			data: { reach: { mode: "self" } }
		}, {
			id: "effect",
			kind: "result",
			type: rider.effect.type,
			position: {
				x: 324,
				y: 0
			},
			data: {
				...rider.effect.data,
				common: {
					optional: false,
					choiceGroup: "",
					cost: { type: "none" },
					limit: "none"
				}
			}
		}],
		edges: [{
			id: "event-out-effect",
			source: "event",
			sourcePin: "out",
			target: "effect",
			targetPin: "in"
		}]
	});
}
function isRider(value) {
	const record = asRecord(value);
	return typeof record.id === "string" && typeof asRecord(record.effect).type === "string" && (record.scope === "sameActivation" || record.scope === "nextRoll");
}
/** Riders stored in `flags.build-n-action.riders`. */
function readRiders(value) {
	return Array.isArray(value) ? value.filter(isRider) : [];
}
//#endregion
//#region src/runtime/limits.ts
/** Whether a result limited to once per `limit` may apply again, given when it was last used. */
function limitAvailable(record, now, limit) {
	if (!record) return true;
	switch (limit) {
		case "turn": return !now.combatId || record.combatId !== now.combatId || record.round !== now.round || record.turn !== now.turn;
		case "round": return !now.combatId || record.combatId !== now.combatId || record.round !== now.round;
		case "shortRest": return now.shortRests > record.shortRests || now.longRests > record.longRests;
		case "longRest": return now.longRests > record.longRests;
	}
}
/** Key of a usage record in `flags.build-n-action.usage` (no dots, so Foundry keeps it flat). */
function usageKey(blueprintId, nodeId) {
	return `${blueprintId}_${nodeId}`;
}
//#endregion
//#region src/foundry/usage.ts
function rests(actor) {
	const stored = asRecord(read(actor, `flags.${MODULE_SCOPE}.rests`));
	return {
		short: asNumber(stored.short) ?? 0,
		long: asNumber(stored.long) ?? 0
	};
}
/** Now, for limits: the started combat's round and turn, and the actor's rest counters. */
function usageClock(actor) {
	const combat = game.combat;
	const started = !!combat && combat.started === true;
	const counted = rests(actor);
	return {
		combatId: started ? combat.id : null,
		round: started ? combat.round : 0,
		turn: started ? combat.turn ?? 0 : 0,
		shortRests: counted.short,
		longRests: counted.long
	};
}
function asClock(value) {
	const record = asRecord(value);
	if (!Object.keys(record).length) return null;
	return {
		combatId: typeof record.combatId === "string" ? record.combatId : null,
		round: asNumber(record.round) ?? 0,
		turn: asNumber(record.turn) ?? 0,
		shortRests: asNumber(record.shortRests) ?? 0,
		longRests: asNumber(record.longRests) ?? 0
	};
}
function isLimitAvailable(actor, blueprintId, nodeId, limit) {
	return limitAvailable(asClock(read(actor, `flags.${MODULE_SCOPE}.usage.${usageKey(blueprintId, nodeId)}`)), usageClock(actor), limit);
}
/** Remember that a limited result applied now. */
async function recordUsage(actor, blueprintId, nodeId) {
	await actor.setFlag(MODULE_SCOPE, `usage.${usageKey(blueprintId, nodeId)}`, usageClock(actor));
}
/** dnd5e.restCompleted: count short and long rests so rest limits reset. */
async function countRest(actor, result) {
	if (!actor || typeof actor !== "object" || !("setFlag" in actor)) return;
	const document = actor;
	const counted = rests(document);
	const long = read(result, "type") === "long";
	await document.setFlag(MODULE_SCOPE, "rests", {
		short: counted.short + (long ? 0 : 1),
		long: counted.long + (long ? 1 : 0)
	});
}
//#endregion
//#region src/foundry/riders.ts
/** Now, for an actor's riders: wall time, combat position and its rest counters. */
function riderClock(actor) {
	const combat = game.combat;
	return {
		...usageClock(actor),
		time: Date.now(),
		combatants: Math.max(1, listOf(combat?.turns).length)
	};
}
function storedRiders(actor) {
	return readRiders(read(actor, `flags.${MODULE_SCOPE}.riders`));
}
/**
* Uses spent on this client that the actor's flags do not show yet: rolls made right after each other
* must not reuse a rider whose update is still on its way.
*/
var pendingUses = /* @__PURE__ */ new Map();
function withPending(rider) {
	const spent = pendingUses.get(rider.id) ?? 0;
	return rider.uses === null || !spent ? rider : {
		...rider,
		uses: rider.uses - spent
	};
}
/** Riders on this actor that change this roll now. */
function activeRiders(actor, event, activation) {
	const now = riderClock(actor);
	return storedRiders(actor).map(withPending).filter((rider) => !riderExpired(rider, now) && riderApplies(rider, event, activation));
}
var queues = /* @__PURE__ */ new Map();
/** Run rider writes for one actor one after another, so a use and a new rider never overwrite each other. */
function queued(actor, write) {
	const next = (queues.get(actor.uuid) ?? Promise.resolve()).catch(() => void 0).then(write);
	queues.set(actor.uuid, next);
	return next.finally(() => {
		if (queues.get(actor.uuid) === next) queues.delete(actor.uuid);
	});
}
/** After a roll: use up the riders that changed it and drop expired ones. */
async function useRiders(actor, ids) {
	for (const id of ids) pendingUses.set(id, (pendingUses.get(id) ?? 0) + 1);
	try {
		await queued(actor, async () => {
			const now = riderClock(actor);
			const stored = storedRiders(actor);
			const next = stored.map((rider) => ids.includes(rider.id) ? useRider(rider) : rider).filter((rider) => !riderExpired(rider, now));
			if (!ids.length && next.length === stored.length) return;
			await actor.setFlag(MODULE_SCOPE, "riders", next);
		});
	} finally {
		for (const id of ids) {
			const left = (pendingUses.get(id) ?? 1) - 1;
			if (left > 0) pendingUses.set(id, left);
			else pendingUses.delete(id);
		}
	}
}
async function addRider(actor, rider) {
	await queued(actor, async () => {
		const now = riderClock(actor);
		await actor.setFlag(MODULE_SCOPE, "riders", [...storedRiders(actor).filter((entry) => !riderExpired(entry, now)), rider]);
	});
}
//#endregion
//#region src/runtime/dice.ts
function rounded(formula, evaluate) {
	const text = asString(formula).trim();
	if (!text) return null;
	const value = evaluate(text);
	return value === null || !Number.isFinite(value) ? null : Math.round(value);
}
function positive(formula, evaluate) {
	const value = rounded(formula, evaluate);
	return value !== null && value > 0 ? value : null;
}
/** Evaluate a diceModifiers result's values (as v1's ModifiersModel#prepareDerivedData); null when inactive. */
function resolveModifiers(data, evaluate) {
	const part = (key) => asRecord(data[key]);
	const enabled = (key) => asBoolean(part(key).enabled);
	const value = (key) => rounded(part(key).value, evaluate);
	const amount = value("amount");
	const size = value("size");
	const minimum = value("minimum");
	const maximum = value("maximum");
	const spec = {
		amount: enabled("amount") && amount !== null ? {
			multiply: asString(part("amount").mode) === "multiply",
			value: amount
		} : null,
		size: enabled("size") && size !== null ? {
			multiply: asString(part("size").mode) === "multiply",
			value: size
		} : null,
		reroll: enabled("reroll") ? {
			value: value("reroll"),
			invert: asBoolean(part("reroll").invert),
			recursive: asBoolean(part("reroll").recursive),
			limit: positive(part("reroll").limit, evaluate)
		} : null,
		explode: enabled("explode") ? {
			value: value("explode"),
			once: asBoolean(part("explode").once),
			limit: positive(part("explode").limit, evaluate)
		} : null,
		minimum: enabled("minimum") && (asBoolean(part("minimum").maximize) || minimum !== null && minimum !== 0) ? {
			value: minimum,
			maximize: asBoolean(part("minimum").maximize)
		} : null,
		maximum: enabled("maximum") && maximum !== null ? {
			value: maximum,
			zero: asBoolean(part("maximum").zero)
		} : null,
		firstOnly: asBoolean(data.firstOnly)
	};
	return spec.amount || spec.size || spec.reroll || spec.explode || spec.minimum || spec.maximum ? spec : null;
}
var EXISTING = {
	reroll: /rr?([0-9]+)?([<>=]+)?([0-9]+)?/i,
	explode: /xo?([0-9]+)?([<>=]+)?([0-9]+)?/i,
	minimum: /(?:min)([0-9]+)/i,
	maximum: /(?:max)([0-9]+)/i
};
function has(die, kind) {
	return die.modifiers.some((modifier) => EXISTING[kind].test(modifier));
}
function reroll(die, faces, rule) {
	if (has(die, "reroll")) return;
	const prefix = rule.recursive ? rule.limit ? `rr${rule.limit}` : "rr" : "r";
	const v = rule.value ?? 1;
	let modifier;
	if (rule.invert) {
		if (v > 0) modifier = v >= faces ? `${prefix}=${faces}` : `${prefix}>${v}`;
		else if (v === 0) modifier = `${prefix}=${faces}`;
		else modifier = faces + v <= 1 ? `${prefix}=1` : `${prefix}>${faces + v}`;
	} else if (v > 0) modifier = v === 1 ? `${prefix}=1` : `${prefix}<${Math.min(faces, v)}`;
	else if (v === 0) modifier = `${prefix}=1`;
	else modifier = faces + v <= 1 ? `${prefix}=1` : `${prefix}<${faces + v}`;
	if (faces > 1) die.modifiers.push(modifier);
}
function explode(die, faces, rule) {
	if (has(die, "explode")) return;
	const v = rule.value ?? 0;
	const limit = rule.limit;
	const prefix = rule.once || limit === 1 ? "xo" : limit ? `x${limit}` : "x";
	const atMax = /x\d+/.test(prefix) ? `${prefix}=${faces}` : prefix;
	let modifier;
	let valid;
	if (v === 0) {
		modifier = atMax;
		valid = faces > 1 || prefix === "xo";
	} else if (v > 0) {
		modifier = v >= faces ? atMax : `${prefix}>=${v}`;
		valid = v <= faces && (v === 1 && prefix === "xo" || v > 1);
	} else {
		const threshold = Math.max(1, faces + v);
		modifier = `${prefix}>=${threshold}`;
		valid = threshold > 1 || prefix === "xo";
	}
	if (valid || limit) die.modifiers.push(modifier);
}
function minimum(die, faces, rule) {
	if (has(die, "minimum")) return;
	const min = rule.value ?? 0;
	const modifier = rule.maximize ? `min${faces}` : `min${min > 0 ? Math.min(min, faces) : Math.max(1, faces + min)}`;
	if (modifier !== "min1") die.modifiers.push(modifier);
}
function maximum(die, faces, rule) {
	if (has(die, "maximum")) return;
	const v = rule.value;
	const floor = rule.zero ? 0 : 1;
	const max = v === 0 ? floor : v > 0 ? v : Math.max(floor, faces + v);
	if (max < faces) die.modifiers.push(`max${max}`);
}
/** Apply a modifier spec to one die, as v1's ModifiersModel#modifyDie. */
function modifyDie(die, spec) {
	if (spec.amount && Number.isInteger(die.number)) {
		const number = die.number;
		die.number = Math.max(0, spec.amount.multiply ? number * spec.amount.value : number + spec.amount.value);
	}
	if (spec.size && Number.isInteger(die.faces)) {
		const faces = die.faces;
		die.faces = Math.max(0, spec.size.multiply ? faces * spec.size.value : faces + spec.size.value);
	}
	if (!Number.isInteger(die.faces)) return;
	const faces = die.faces;
	if (spec.reroll) reroll(die, faces, spec.reroll);
	if (spec.explode) explode(die, faces, spec.explode);
	if (spec.minimum) minimum(die, faces, spec.minimum);
	if (spec.maximum) maximum(die, faces, spec.maximum);
}
//#endregion
//#region src/foundry/formulas.ts
/** A formula's total with roll data, or null when it is not a deterministic number (dice throw here, as in v1). */
function evaluateNumber(formula, data) {
	try {
		const total = Number(Roll.create(Roll.replaceFormulaData(formula, data)).evaluateSync().total);
		return Number.isFinite(total) ? total : null;
	} catch {
		return null;
	}
}
/** dnd5e's simplifyBonus as a number, or null when it fails; used where v1 used simplifyBonus. */
function simplifyNumber(formula, data) {
	try {
		const value = dnd5e.utils.simplifyBonus(formula, data);
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}
function replaceData(text, data) {
	return Roll.replaceFormulaData(text, data);
}
/** Resolve roll-data references against a blueprint's origin; missing values become 0 (v1). */
function resolveForeign(formula, data) {
	return Roll.replaceFormulaData(formula, data, { missing: 0 });
}
/**
* The formula of an optional bonus paid `scale` steps above its minimum (v1 _scaleOptionalBonus):
* the base formula plus the scaling formula multiplied by the scale.
*/
function scaledFormula(formula, scaleFormula, data, scale) {
	const base = scale ? scaleFormula || formula : formula;
	const roll = new CONFIG.Dice.DamageRoll(base, data);
	if (!scale) return roll.formula;
	const scaled = roll.alter(scale, 0, { multiplyNumeric: true }).formula;
	const resolved = Roll.replaceFormulaData(formula, data);
	return dnd5e.dice.simplifyRollFormula(`${resolved} + ${scaled}`, { preserveFlavor: true });
}
function isRoll(value) {
	return value instanceof Roll;
}
function applyToDie(die, spec) {
	if (isRoll(die._number) && die._number.isDeterministic) die._number = die._number.evaluateSync().total;
	if (isRoll(die._faces) && die._faces.isDeterministic) die._faces = die._faces.evaluateSync().total;
	const view = {
		number: typeof die._number === "number" ? die._number : null,
		faces: typeof die._faces === "number" ? die._faces : typeof die.faces === "number" ? die.faces : null,
		modifiers: die.modifiers
	};
	modifyDie(view, spec);
	if (typeof die._number === "number" && view.number !== null) die._number = view.number;
	if (typeof die._faces === "number" && view.faces !== null) die._faces = view.faces;
}
/**
* Serialize terms after their dice changed. Function and parenthetical terms serialize from a cached
* copy of their inner formula, so nested dice (dnd5e wraps hit dice in max(1, …)) are rebuilt first.
*/
function rebuildFormula(terms) {
	const { FunctionTerm, ParentheticalTerm } = foundry.dice.terms;
	for (const term of terms) if (term instanceof FunctionTerm) term.rolls.forEach((roll, index) => {
		term.terms[index] = rebuildFormula(roll.terms);
	});
	else if (term instanceof ParentheticalTerm && term.roll) term.term = rebuildFormula(term.roll.terms);
	return Roll.fromTerms(terms).formula;
}
/**
* Apply a modifier spec to every die in `parts` (mutated in place). Returns true when a
* "first die only" modifier has been used and must not apply again.
*/
function modifyFormulaParts(parts, data, spec) {
	for (let index = 0; index < parts.length; index++) {
		const roll = new CONFIG.Dice.DamageRoll(String(parts[index]), data);
		if (!roll.dice.length) continue;
		for (const die of roll.dice) {
			applyToDie(die, spec);
			if (spec.firstOnly) break;
		}
		parts[index] = rebuildFormula(roll.terms);
		if (spec.firstOnly) return true;
	}
	return false;
}
//#endregion
//#region src/foundry/aura-preview.ts
/** Cyanotype tokens (spec 7.1): "if" green when the roller is inside, "then" coral when outside. */
var AURA_COLORS = {
	inside: 7130030,
	outside: 15628899
};
var HOLD = 1800;
var FADE = 450;
var shown = /* @__PURE__ */ new Map();
function remove(key) {
	const entry = shown.get(key);
	if (!entry) return;
	clearTimeout(entry.timer);
	if (!entry.graphics.destroyed) entry.graphics.destroy();
	shown.delete(key);
}
function fade(key) {
	const entry = shown.get(key);
	if (!entry) return;
	CanvasAnimation.animate([{
		parent: entry.graphics,
		attribute: "alpha",
		to: 0
	}], {
		name: `bna-aura-${key}`,
		duration: FADE
	}).catch(() => void 0).finally(() => {
		if (shown.get(key) === entry) remove(key);
	});
}
/** Draw a checked aura for a moment: `key` identifies the aura, so a new check replaces the old drawing. */
function previewAura(key, shape, inside) {
	if (!canvas.ready) return;
	remove(key);
	const color = inside ? AURA_COLORS.inside : AURA_COLORS.outside;
	const graphics = new PIXI.Graphics();
	graphics.lineStyle({
		width: 2,
		color,
		alpha: .9
	});
	graphics.beginFill(color, .06);
	graphics.drawShape(shape);
	graphics.endFill();
	canvas.interface.addChild(graphics);
	shown.set(key, {
		graphics,
		timer: setTimeout(() => fade(key), HOLD)
	});
}
function clearAuraPreviews() {
	for (const key of [...shown.keys()]) remove(key);
}
function registerAuraPreviews() {
	Hooks.on("canvasTearDown", clearAuraPreviews);
}
//#endregion
//#region src/foundry/geometry.ts
function tokenShape(token) {
	if (typeof token.getShape === "function") return token.getShape() ?? null;
	return token.shape ?? null;
}
/** The centre of every grid space a token covers. */
function tokenCenters(token) {
	const shape = tokenShape(token);
	if (!shape || !canvas.ready) return [];
	const grid = canvas.grid;
	const [i0, j0, i1, j1] = grid.getOffsetRange(token.bounds);
	const gridless = grid.type === CONST.GRID_TYPES.GRIDLESS;
	const delta = gridless ? canvas.dimensions.size : 1;
	const offset = gridless ? canvas.dimensions.size / 2 : 0;
	const points = [];
	for (let i = i0; i < i1; i += delta) for (let j = j0; j < j1; j += delta) {
		const point = grid.getCenterPoint({
			i: i + offset,
			j: j + offset
		});
		if (shape.contains(point.x - token.document.x, point.y - token.document.y)) points.push(point);
	}
	return points;
}
/** The area an aura of `range` feet around `source` covers, limited by walls per requirement; null for none or infinite. */
function auraShape(source, range, require, pad) {
	if (!canvas.ready || range <= 0) return null;
	let radius = range;
	if (pad) radius += canvas.grid.distance * Math.max(source.document.width, source.document.height) * .5;
	const center = source.center;
	let shape = new PIXI.Polygon(canvas.grid.getCircle(center, radius));
	for (const type of require) shape = ClockwiseSweepPolygon.create(center, {
		includeDarkness: type === "sight",
		type,
		debug: false,
		useThreshold: type !== "move",
		boundaryShapes: [shape]
	});
	return shape;
}
/**
* Whether `roller` stands within `range` feet of `source` (-1 = anywhere), limited by walls for each
* requirement ("sight", "move", "sound", "light"), as v1's TokenAura.
*/
function withinAura(source, roller, range, require, pad) {
	if (range === -1) return true;
	const shape = auraShape(source, range, require, pad);
	return !!shape && tokenCenters(roller).some((point) => shape.contains(point.x, point.y));
}
/**
* Whether a canvas point lies inside a measured template. In v14 a template's shape exists only
* once the templates layer has drawn it, so it is computed from the document when missing.
* Like MeasuredTemplate#testPoint, points within a pixel of the edge count as inside.
*/
function templateContains(template, point) {
	let shape = template.shape;
	if (!shape && typeof template._computeShape === "function") try {
		shape = template._computeShape();
	} catch {
		shape = null;
	}
	if (!shape) return false;
	const x = point.x - template.document.x;
	const y = point.y - template.document.y;
	for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (shape.contains(x + dx, y + dy)) return true;
	return false;
}
//#endregion
//#region src/foundry/collect.ts
var trees = {};
/** Load dnd5e's language, tool and weapon trees once the system is ready. */
async function loadTraitTrees() {
	const [languages, tool, weapon] = await Promise.all([
		"languages",
		"tool",
		"weapon"
	].map((category) => dnd5e.documents.Trait.choices(category)));
	trees = {
		languages: asRecord(languages),
		tool: asRecord(tool),
		weapon: asRecord(weapon)
	};
}
function traitTrees() {
	return trees;
}
function activeEffects(document) {
	return callList(document, "allApplicableEffects").filter(isDocument).filter((effect) => read(effect, "active") === true);
}
function actorDocuments(actor) {
	return [
		actor,
		...listOf(read(actor, "items")).filter(isDocument),
		...listOf(read(actor, "appliedEffects")).filter(isDocument)
	];
}
function candidates(roller) {
	const list = [];
	const self = (document) => list.push({
		document,
		kind: "self",
		sourceToken: null
	});
	if (roller.item) activeEffects(roller.item).forEach(self);
	actorDocuments(roller.actor).forEach(self);
	const token = roller.token;
	const scene = token?.document.parent;
	if (!token || !scene) return list;
	const actors = /* @__PURE__ */ new Set([roller.actor.uuid]);
	for (const other of listOf(read(scene, "tokens")).filter(isDocument)) {
		const actor = read(other, "actor");
		if (other === token.document || read(other, "hidden") === true || !isDocument(actor)) continue;
		if (read(actor, "type") === "group" || actors.has(actor.uuid)) continue;
		actors.add(actor.uuid);
		for (const document of actorDocuments(actor)) list.push({
			document,
			kind: "token",
			sourceToken: other
		});
	}
	let centers = null;
	for (const template of listOf(read(scene, "templates")).filter(isDocument)) {
		const placeable = read(template, "object");
		if (read(template, "hidden") === true || !placeable) continue;
		centers ??= tokenCenters(token);
		if (centers.some((point) => templateContains(placeable, point))) list.push({
			document: template,
			kind: "template",
			sourceToken: null
		});
	}
	for (const region of listOf(read(token.document, "regions")).filter(isDocument)) list.push({
		document: region,
		kind: "region",
		sourceToken: null
	});
	return list;
}
function sourceContext(candidate, info, roller, auras) {
	const owner = info.owner;
	let sourceDisposition = null;
	if (candidate.kind === "token") sourceDisposition = asNumber(read(candidate.sourceToken, "disposition"));
	if (candidate.kind === "template") sourceDisposition = asNumber(read(candidate.document, `flags.${MODULE_SCOPE}.templateDisposition`));
	let rangeData = null;
	return {
		kind: candidate.kind,
		sourceDisposition,
		rollerDisposition: asNumber(read(roller.token?.document, "disposition")) ?? asNumber(read(roller.actor, "prototypeToken.disposition")),
		own: !!owner && owner.uuid === roller.actor.uuid,
		sourceStatuses: stringList(read(owner, "statuses")),
		sourceImmunities: stringList(read(owner, "system.traits.ci.value")),
		evaluateRange: (formula) => simplifyNumber(formula, rangeData ??= originRollData(info.document, true)),
		withinRange: (range, require) => {
			const source = read(candidate.sourceToken, "object");
			if (!source || !roller.token) return false;
			const key = `${candidate.sourceToken?.uuid}|${range}|${require.join(",")}`;
			let inside = auras.get(key);
			if (inside === void 0) {
				const pad = !canvas.grid.isGridless || setting(SETTINGS.padAuraRadius);
				inside = withinAura(source, roller.token, range, require, pad);
				auras.set(key, inside);
				if (setting(SETTINGS.showAuraRanges) && range !== -1) {
					const shape = auraShape(source, range, require, pad);
					if (shape) previewAura(key, shape, inside);
				}
			}
			return inside;
		}
	};
}
function runScript(script, roller, blueprint) {
	if (setting(SETTINGS.disableScripts)) return null;
	const check = new Function("actor", "item", "token", "bonus", "activity", "details", script);
	return check.call(check, roller.actor, roller.item, roller.token, blueprint, roller.activity, roller.details) === true;
}
function addEntry(collected, info, candidate, roller, auras) {
	const { blueprint } = info;
	const context = sourceContext(candidate, info, roller, auras);
	const env = {
		evaluateNumber: (formula) => evaluateNumber(formula, roller.rollData),
		replaceData: (text) => replaceData(text, roller.rollData),
		runScript: (script) => {
			try {
				return runScript(script, roller, blueprint);
			} catch (error) {
				console.error(`Build-n-Action | script check in "${blueprint.name}" failed`, error);
				throw error;
			}
		},
		carrierItemUuid: info.carrierItem?.uuid ?? null,
		reach: (node) => reachOutcome(asRecord(node.data).reach, context),
		limitAvailable: (blueprintId, nodeId, limit) => isLimitAvailable(roller.actor, blueprintId, nodeId, limit)
	};
	const entry = {
		compiled: compileBlueprint(blueprint),
		env,
		documentUuid: info.document.uuid,
		actorUuid: info.owner?.uuid ?? null
	};
	collected.entries.push(entry);
	collected.sources.set(entry, info);
}
/** Every blueprint that may take part in this roll (and the roller's matching riders), with environments. */
function collect(roller, event, activation = null) {
	const collected = {
		entries: [],
		sources: /* @__PURE__ */ new Map()
	};
	const templates = /* @__PURE__ */ new Set();
	const auras = /* @__PURE__ */ new Map();
	for (const candidate of candidates(roller)) {
		const { document } = candidate;
		if (isSuppressed(document)) continue;
		for (const blueprint of documentBlueprints(document).blueprints) {
			if (!blueprint.enabled) continue;
			const compiled = compileBlueprint(blueprint);
			if (!compiled.pathsFor(event).length && !compiled.pathsFor("signal").length) continue;
			const item = carrierItem(document);
			if (candidate.kind === "template") {
				const key = `${item?.uuid ?? document.uuid}|${blueprint.id}`;
				if (templates.has(key)) continue;
				templates.add(key);
			}
			addEntry(collected, {
				document,
				kind: candidate.kind,
				blueprint,
				owner: ownerActor(document),
				origin: rollDataOrigin(document),
				carrierItem: item
			}, candidate, roller, auras);
		}
	}
	for (const rider of activeRiders(roller.actor, event, activation)) {
		const origin = rider.source.origin ? documentFromUuid(rider.source.origin) : null;
		const document = origin ?? roller.actor;
		addEntry(collected, {
			document,
			kind: "self",
			blueprint: riderBlueprint(rider, event),
			owner: roller.actor,
			origin: origin ? rollDataOrigin(origin) : roller.actor,
			carrierItem: null,
			rider
		}, {
			document,
			kind: "self",
			sourceToken: null
		}, roller, auras);
	}
	return collected;
}
/** Name of a blueprint's carrier for the roll dialog, e.g. "Longsword". */
function sourceLabel(info) {
	return asString(read(info.carrierItem ?? info.document, "name")) || info.document.documentName;
}
/**
* One blueprint as if stored on `document`, for the editor's Test panel. The collector's gates are reported, not
* applied: a suppressed carrier still runs, and `suppressed` says it would be skipped in play.
*/
function entryFor$1(document, blueprint, roller) {
	const owner = ownerActor(document);
	let kind = "self";
	if (document.documentName === "MeasuredTemplate") kind = "template";
	else if (document.documentName === "Region") kind = "region";
	else if (owner && owner.uuid !== roller.actor.uuid) kind = "token";
	const sourceToken = kind === "token" && owner ? actorToken(owner)?.document ?? null : null;
	const collected = {
		entries: [],
		sources: /* @__PURE__ */ new Map()
	};
	addEntry(collected, {
		document,
		kind,
		blueprint,
		owner,
		origin: rollDataOrigin(document),
		carrierItem: carrierItem(document)
	}, {
		document,
		kind,
		sourceToken
	}, roller, /* @__PURE__ */ new Map());
	const entry = collected.entries[0];
	if (!entry) throw new Error("Build-n-Action | could not prepare the blueprint for a test");
	return {
		entry,
		suppressed: isSuppressed(document)
	};
}
//#endregion
//#region src/runtime/effect-state.ts
/** Foundry resets the prepared `duration.expired` of an effect without a timed duration, so the stored flag counts too. */
function isExpired(effect) {
	return read(effect, "duration.expired") === true || read(effect, "_source.duration.expired") === true;
}
function text(effect, path) {
	return asString(read(effect, path)).trim() || null;
}
/**
* An effect's state as the collector sees it (src/foundry/documents.ts isSuppressed): off when disabled; expired when its
* duration is over (Foundry 14 keeps an effect that DAE's special durations end, marked expired); suppressed when
* otherwise inactive (an unequipped item) or when it does not apply to its actor (an item effect that does not transfer).
*/
function effectSummary(effect) {
	let state = "active";
	if (read(effect, "disabled") === true) state = "disabled";
	else if (read(effect, "active") !== true && isExpired(effect)) state = "expired";
	else if (read(effect, "active") !== true || read(effect, "modifiesActor") !== true && read(effect, "isAppliedEnchantment") !== true) state = "suppressed";
	return {
		state,
		disableCondition: text(effect, "flags.dae.disableCondition"),
		enableCondition: text(effect, "flags.dae.enableCondition"),
		specialDurations: stringList(read(effect, "flags.dae.specialDuration"))
	};
}
//#endregion
//#region src/foundry/effects.ts
/** DAE's localized special-duration labels, when DAE is active; keys otherwise. */
function durationLabels(keys) {
	const api = read(game.modules.get("dae"), "api");
	const labelsOf = read(api, "daeSpecialDurations");
	const labels = typeof labelsOf === "function" ? labelsOf.call(api) : void 0;
	return keys.map((key) => labels?.[key] ?? key);
}
function effectStatus(effect) {
	const summary = effectSummary(effect);
	return {
		...summary,
		specialDurations: durationLabels(summary.specialDurations),
		openConfig: () => {
			effect.sheet?.render({ force: true });
		}
	};
}
/** For actors and items the user owns: move a blueprint onto a new effect of theirs. */
function createEffectsHost(carrier) {
	const create = carrier.createEmbeddedDocuments?.bind(carrier);
	if (!["Actor", "Item"].includes(carrier.documentName) || !carrier.isOwner || !create) return void 0;
	return { moveToEffect: async (blueprint) => {
		const name = blueprint.name || game.i18n.localize("BNA.UI.Rail.untitled");
		const [effect] = await create("ActiveEffect", [{
			name,
			img: blueprint.img,
			transfer: carrier.documentName === "Item",
			disabled: false
		}]);
		if (!effect) throw new Error("Build-n-Action | the effect was not created");
		await saveBlueprint(effect, blueprint);
		ui.notifications.info(game.i18n.format("BNA.Effects.moved", { name }));
		effect.sheet?.render({ force: true });
	} };
}
//#endregion
//#region src/foundry/roll-state.ts
var LIMIT = 20;
var pending = /* @__PURE__ */ new Map();
function registerPending(roll) {
	const id = randomId();
	pending.set(id, roll);
	while (pending.size > LIMIT) {
		const oldest = pending.keys().next().value;
		if (oldest === void 0) break;
		pending.delete(oldest);
	}
	return id;
}
function pendingRoll(id) {
	return typeof id === "string" ? pending.get(id) ?? null : null;
}
var records = [];
function remember(event, actor, facts, chain, ms) {
	records.unshift({
		event,
		time: Date.now(),
		ms,
		actor,
		facts,
		runs: chain.runs,
		intents: chain.intents.map((intent) => ({
			blueprintId: intent.blueprintId,
			nodeId: intent.nodeId,
			type: intent.type,
			optional: intent.common.optional,
			document: intent.entry.documentUuid
		})),
		signals: chain.signals,
		truncated: chain.truncated
	});
	records.length = Math.min(records.length, LIMIT);
}
function recentRolls() {
	return records;
}
//#endregion
//#region src/foundry/evaluate.ts
var warned = /* @__PURE__ */ new Set();
function warnOnce(name, error) {
	if (warned.has(name)) return;
	warned.add(name);
	console.warn(`Build-n-Action | the ${name} hook failed; the game continues without blueprints.`, error);
}
/** Run a hook body; the first failure per hook and session is logged, and the game goes on. */
function guarded(name, run) {
	try {
		run();
	} catch (error) {
		warnOnce(name, error);
	}
}
async function guardedAsync(name, run) {
	try {
		await run();
	} catch (error) {
		warnOnce(name, error);
	}
}
function first(targets) {
	return listOf(targets)[0] ?? null;
}
/** The roll's target: Midi's workflow targets (hit targets first for damage), else the user's first target. */
function resolveRollTarget(config, preferHit) {
	const workflow = read(config, "workflow") ?? read(config, "midiOptions.workflow");
	if (workflow && typeof workflow === "object" && ("targets" in workflow || "hitTargets" in workflow)) {
		if (preferHit) {
			const hit = first(read(workflow, "hitTargets"));
			if (hit) return hit;
		}
		return first(read(workflow, "targets"));
	}
	return first(game.user.targets);
}
function makeRoller(actor, item, activity, target, details, deterministic = false) {
	const rollData = rollDataOf(activity ?? item ?? actor, deterministic);
	if (target?.actor) rollData.target = rollDataOf(target.actor, deterministic);
	if (activity && details.spellLevel === void 0) details.spellLevel = asNumber(read(rollData, "item.level"));
	return {
		actor,
		item,
		activity,
		token: actorToken(actor),
		target,
		details,
		rollData
	};
}
/** Collect, build facts and run the chain for the fired pins; null when nothing takes part or a hook vetoes. */
function evaluateEvent(event, roller, pins = ["out"], activation = null) {
	const started = performance.now();
	const collected = collect(roller, event, activation);
	if (!collected.entries.length) return null;
	const facts = buildRollFacts({
		event,
		actor: roller.actor,
		token: roller.token?.document ?? null,
		item: roller.item,
		activity: roller.activity,
		target: roller.target ? {
			actor: roller.target.actor,
			document: roller.target.document
		} : null,
		details: roller.details
	}, traitTrees());
	const context = {
		event,
		actor: roller.actor,
		item: roller.item,
		activity: roller.activity,
		target: roller.target?.actor ?? null,
		facts
	};
	if (Hooks.call(`build-n-action.preEvaluate`, event, context) === false) return null;
	const chain = runWithSignals(collected.entries, {
		event,
		pins
	}, facts);
	Hooks.callAll(`${MODULE_SCOPE}.evaluate`, event, context, chain.intents);
	remember(event, roller.actor.uuid, facts, chain, performance.now() - started);
	return {
		collected,
		chain,
		facts,
		context
	};
}
/** Results that no `build-n-action.preApplyResult` hook vetoed. */
function allowIntents(intents, context) {
	return intents.filter((intent) => Hooks.call(`${MODULE_SCOPE}.preApplyResult`, intent, context) !== false);
}
function announceApplied(intents, context) {
	for (const intent of intents) Hooks.callAll(`${MODULE_SCOPE}.applyResult`, intent, context);
}
function recordUsages(intents, actor) {
	for (const intent of intents) {
		if (intent.common.limit === "none") continue;
		recordUsage(actor, intent.blueprintId, intent.nodeId).catch((error) => console.warn("Build-n-Action | could not record a limited use", error));
	}
}
/** Activation key of a Midi workflow: its item card, else its id. */
function midiActivation(workflow) {
	const id = asString(read(workflow, "itemCardUuid")) || asString(read(workflow, "id"));
	return id ? `midi:${id}` : null;
}
/** Activation key of a roll: Midi's workflow, else the usage card it came from. */
function activationOf(config, message) {
	const workflow = read(config, "workflow") ?? read(config, "midiOptions.workflow");
	if (workflow && typeof workflow === "object") return midiActivation(workflow);
	const data = asRecord(read(message, "data"));
	const origin = asString(data["flags.dnd5e.originatingMessage"]) || asString(read(data, "flags.dnd5e.originatingMessage"));
	if (origin) return `message:${origin}`;
	const target = read(config, "event.target");
	const card = target instanceof Element ? target.closest("[data-message-id]") : null;
	const id = card instanceof HTMLElement ? card.dataset.messageId ?? "" : "";
	return id ? `message:${id}` : null;
}
var activations = /* @__PURE__ */ new Map();
/** Remember the activation of an activity's latest attack, for the plain dnd5e attack reaction. */
function rememberActivation(activityUuid, activation) {
	if (!activityUuid) return;
	if (activation) activations.set(activityUuid, activation);
	else activations.delete(activityUuid);
}
function activationFor(activityUuid) {
	return activations.get(activityUuid) ?? null;
}
//#endregion
//#region src/core/storage/library.ts
var EXPORT_TYPE = "build-n-action.blueprints";
/** The world library's entries: valid blueprints, the first of each id. */
function readLibrary(value) {
	const list = [];
	const ids = /* @__PURE__ */ new Set();
	for (const raw of Array.isArray(value) ? value : []) {
		const result = validateBlueprintSource(raw);
		if (!result.ok || ids.has(result.value.id)) continue;
		ids.add(result.value.id);
		list.push(result.value);
	}
	return list;
}
function withLibraryEntry(list, blueprint) {
	return list.some((entry) => entry.id === blueprint.id) ? list.map((entry) => entry.id === blueprint.id ? blueprint : entry) : [...list, blueprint];
}
function withoutLibraryEntry(list, id) {
	return list.filter((entry) => entry.id !== id);
}
function exportBlueprints(blueprints) {
	const data = {
		type: EXPORT_TYPE,
		version: 2,
		blueprints: [...blueprints]
	};
	return JSON.stringify(data, null, 2);
}
/** A v1 bonus has a v1 roll type and no schema version. */
function isLegacyBonus(raw) {
	const record = asRecord(raw);
	return record.schemaVersion === void 0 && [
		"attack",
		"damage",
		"save",
		"throw",
		"test",
		"hitdie"
	].includes(String(record.type));
}
function readEntry(raw) {
	if (isLegacyBonus(raw)) return convertLegacyBonus(raw, "item").blueprint;
	const result = validateBlueprintSource(raw);
	return result.ok ? result.value : null;
}
/** Blueprints from exported JSON, a bare blueprint or array, or v1 bonus JSON. */
function importBlueprints(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		return {
			blueprints: [],
			rejected: 0,
			error: "invalidJson"
		};
	}
	const record = asRecord(data);
	let raws;
	if (Array.isArray(data)) raws = data;
	else if (record.type === "build-n-action.blueprints" && Array.isArray(record.blueprints)) raws = record.blueprints;
	else raws = [data];
	const blueprints = [];
	let rejected = 0;
	for (const raw of raws) {
		const entry = readEntry(raw);
		if (entry) blueprints.push(entry);
		else rejected++;
	}
	return {
		blueprints,
		rejected,
		error: null
	};
}
//#endregion
//#region src/foundry/library.ts
var SETTING = "library";
var listeners = /* @__PURE__ */ new Set();
var cache = null;
function registerLibrary() {
	game.settings.register(MODULE_SCOPE, SETTING, {
		scope: "world",
		config: false,
		type: Object,
		default: { blueprints: [] },
		onChange: () => listeners.forEach((listener) => listener())
	});
}
/** The library's valid entries; the same array until the setting changes. */
function libraryEntries() {
	let raw;
	try {
		raw = game.settings.get(MODULE_SCOPE, SETTING);
	} catch {
		raw = null;
	}
	const current = cache && cache.raw === raw ? cache : {
		raw,
		entries: readLibrary(read(raw, "blueprints"))
	};
	cache = current;
	return current.entries;
}
async function store(entries) {
	if (!game.user.isGM) throw new Error("Build-n-Action | only the GM can change the blueprint library");
	await game.settings.set(MODULE_SCOPE, SETTING, { blueprints: entries });
}
function download(blueprints) {
	const single = blueprints.length === 1 ? blueprints[0] : void 0;
	const name = single ? `blueprint-${(single.name || single.id).replace(/[^\p{L}\p{N}-]+/gu, "-").toLowerCase()}` : "blueprint-library";
	foundry.utils.saveDataToFile(exportBlueprints(blueprints), "application/json", `${name}.json`);
}
async function importInto(text) {
	const result = importBlueprints(text);
	if (result.error) {
		ui.notifications.warn(game.i18n.localize("BNA.Library.importFailed"));
		return result;
	}
	await store(result.blueprints.reduce(withLibraryEntry, [...libraryEntries()]));
	ui.notifications.info(game.i18n.format("BNA.Library.imported", {
		count: result.blueprints.length,
		rejected: result.rejected
	}));
	return result;
}
/** The library for the editor; one instance is shared by every editor window. */
var host = null;
function libraryHost() {
	host ??= {
		entries: libraryEntries,
		canEdit: () => game.user.isGM,
		add: (blueprint) => store(withLibraryEntry(libraryEntries(), blueprint)),
		remove: (id) => store(withoutLibraryEntry(libraryEntries(), id)),
		import: importInto,
		download,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
	return host;
}
/** Add a copy of a library entry (by id or as a blueprint) to a document. */
async function applyLibraryEntry(entry, document) {
	const source = typeof entry === "string" ? libraryEntries().find((candidate) => candidate.id === entry) : entry;
	if (!source) throw new Error(`Build-n-Action | no library entry "${String(entry)}"`);
	return saveBlueprint(document, duplicateBlueprint(source, source.name));
}
function createLibraryApi() {
	const library = libraryHost();
	return {
		list: () => [...libraryEntries()],
		add: async (blueprint) => {
			const result = validateBlueprintSource(blueprint);
			if (!result.ok) throw new Error("Build-n-Action | the blueprint is not valid");
			await library.add(result.value);
		},
		remove: (id) => library.remove(id),
		apply: applyLibraryEntry,
		export: (ids) => exportBlueprints(ids ? libraryEntries().filter((entry) => ids.includes(entry.id)) : libraryEntries()),
		import: (text) => importInto(text)
	};
}
//#endregion
//#region src/runtime/drag.ts
var BLUEPRINT_DRAG = "Blueprint";
/** What a drop carries, if it is a blueprint. UUIDs must have the blueprint form and plain characters. */
function parseBlueprintDrop(data) {
	const record = asRecord(data);
	if (record.type !== "Blueprint" && record.type !== "ContextualBonus") return null;
	const uuid = asString(record.uuid);
	if (uuid) return parseBlueprintUuid(uuid) && /^[\w.-]+$/.test(uuid) ? {
		kind: "uuid",
		uuid
	} : null;
	if (record.type !== "Blueprint") return null;
	const result = validateBlueprintSource(record.data);
	return result.ok ? {
		kind: "data",
		blueprint: result.value
	} : null;
}
//#endregion
//#region src/foundry/transfer.ts
function blueprintDragData(document, blueprint) {
	return {
		type: BLUEPRINT_DRAG,
		uuid: blueprintUuid(document.uuid, blueprint.id)
	};
}
/** The blueprint a drop carries and the document it lives on (null when it came as data). */
async function resolveBlueprintDrop(data) {
	const drop = parseBlueprintDrop(data);
	if (!drop) return null;
	if (drop.kind === "data") return {
		document: null,
		blueprint: drop.blueprint
	};
	return blueprintFromUuid(drop.uuid);
}
function createTransferHost(carrier) {
	return {
		dragData: (blueprint) => blueprintDragData(carrier, blueprint),
		resolveDrop: async (data) => {
			const found = await resolveBlueprintDrop(data);
			return found && found.document !== carrier ? found.blueprint : null;
		}
	};
}
//#endregion
//#region src/foundry/editor/host.ts
/** Roll-data roots that come from the roll itself, so the carrier's data cannot confirm them. */
var ROLL_ROOTS = [
	"target.",
	"item.",
	"activity."
];
function byLabel(a, b) {
	return a.label.localeCompare(b.label, game.i18n.lang);
}
function activityOf(item, id) {
	if (!item || !id) return null;
	return listOf(read(item, "system.activities")).find((activity) => read(activity, "id") === id) ?? null;
}
/** Documents whose blueprints can hear this carrier's signals: the owner, its items and effects, and the carrier. */
function neighbours(carrier) {
	const owner = ownerActor(carrier);
	const list = owner ? [
		owner,
		...listOf(read(owner, "items")).filter(isDocument),
		...listOf(read(owner, "appliedEffects")).filter(isDocument),
		carrier
	] : [carrier];
	return [...new Map(list.map((document) => [document.uuid, document])).values()];
}
function previewFormula(formula, data) {
	try {
		if (!Roll.validate(formula)) return null;
		const replaced = Roll.replaceFormulaData(formula, data, {
			missing: "0",
			warn: false
		});
		return dnd5e.dice.simplifyRollFormula(replaced, { preserveFlavor: true }) || replaced;
	} catch {
		return null;
	}
}
/** Run the edited blueprint as if stored on the carrier, for the chosen roller, item, target and outcome. */
function simulate(carrier, blueprint, request) {
	const actor = documentFromUuid(request.actorUuid);
	if (!actor) return null;
	const item = request.itemUuid ? documentFromUuid(request.itemUuid) : null;
	const activity = activityOf(item, request.activityId);
	const target = read(request.targetUuid ? documentFromUuid(request.targetUuid) : null, "object") ?? null;
	const roller = makeRoller(actor, item, activity, target, request.event === "savingThrow" ? { saveAbility: request.abilityId } : {
		abilityId: request.abilityId,
		skillId: request.skillId
	}, true);
	const { entry, suppressed } = entryFor$1(carrier, blueprint, roller);
	const facts = buildRollFacts({
		event: request.event,
		actor,
		token: roller.token?.document ?? null,
		item,
		activity,
		target: target ? {
			actor: target.actor,
			document: target.document
		} : null,
		details: roller.details
	}, traitTrees());
	const trigger = {
		event: request.event,
		pins: request.pins,
		...request.signal ? { signal: request.signal } : {}
	};
	const notes = [];
	if (suppressed) notes.push("suppressed");
	if (!roller.token) notes.push("noToken");
	return {
		run: runBlueprint(entry.compiled, trigger, facts, entry.env),
		notes
	};
}
function createFoundryHost(carrier) {
	let paths = null;
	let known = null;
	const rollPaths = () => {
		paths ??= rollDataPaths(originRollData(carrier, true));
		known ??= new Set(paths.map((path) => path.slice(1)));
		return {
			paths,
			known
		};
	};
	return {
		library: libraryHost(),
		transfer: createTransferHost(carrier),
		effects: createEffectsHost(carrier),
		lintEnv: (blueprint) => {
			const { sent, received } = blueprintSignals([...neighbours(carrier).flatMap((document) => documentBlueprints(document).blueprints).filter((entry) => entry.id !== blueprint.id), blueprint]);
			return {
				validateFormula: (formula) => {
					try {
						return Roll.validate(formula);
					} catch {
						return false;
					}
				},
				hasPath: (path) => ROLL_ROOTS.some((root) => path.startsWith(root)) || rollPaths().known.has(path),
				signalsSent: sent,
				signalsReceived: received
			};
		},
		simulator: {
			actors: () => listOf(game.actors).filter(isDocument).filter((actor) => read(actor, "type") !== "group" && (game.user.isGM || actor.isOwner)).map((actor) => ({
				value: actor.uuid,
				label: actor.name
			})).sort(byLabel),
			items: (actorUuid) => {
				const carried = carrierItem(carrier)?.uuid;
				return listOf(read(documentFromUuid(actorUuid), "items")).filter(isDocument).flatMap((item) => {
					const activities = listOf(read(item, "system.activities")).map((activity) => ({
						value: asString(read(activity, "id")),
						label: asString(read(activity, "name")) || asString(read(activity, "type"))
					})).filter((activity) => activity.value);
					return activities.length || item.uuid === carried ? [{
						uuid: item.uuid,
						name: item.name,
						activities
					}] : [];
				}).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
			},
			targets: () => (canvas.ready ? canvas.tokens.placeables : []).filter((token) => game.user.isGM || !token.document.hidden).map((token) => ({
				value: token.document.uuid,
				label: token.document.name
			})).sort(byLabel),
			defaults: () => {
				const actor = (canvas.ready ? canvas.tokens.controlled[0]?.actor ?? null : null) ?? ownerActor(carrier) ?? game.user.character;
				const item = carrierItem(carrier);
				const target = listOf(game.user.targets)[0];
				return {
					actorUuid: actor?.uuid ?? null,
					itemUuid: item && actor && item.parent?.uuid === actor.uuid ? item.uuid : null,
					targetUuid: target?.document.uuid ?? null
				};
			},
			run: (blueprint, request) => simulate(carrier, blueprint, request)
		},
		formula: {
			paths: () => rollPaths().paths,
			preview: (formula) => previewFormula(formula, originRollData(carrier, true))
		},
		preferences: {
			coachSeen: () => clientSetting(CLIENT_SETTINGS.coachSeen) === true,
			markCoachSeen: () => {
				setClientSetting(CLIENT_SETTINGS.coachSeen, true).catch((error) => console.warn("Build-n-Action | could not remember the guide", error));
			}
		}
	};
}
//#endregion
//#region src/core/storage/migration.ts
/** Plan the migration of one document's flags: convert v1 bonuses into stored blueprints and back up the originals. */
function planMigration(scope, carrier) {
	const flags = asRecord(scope);
	if (!storedEntries(flags.bonuses).length) return {
		converted: 0,
		failed: 0,
		issues: [],
		changes: null
	};
	const storedIds = new Set(storedEntries(flags.blueprints).map(storedId));
	const { blueprints, issues } = readBlueprints(flags, carrier);
	let state = {
		blueprints: storedEntries(flags.blueprints),
		bonuses: storedEntries(flags.bonuses),
		legacyBackup: { ...asRecord(flags.legacyBackup) }
	};
	let converted = 0;
	for (const blueprint of blueprints) {
		if (storedIds.has(blueprint.id)) continue;
		const update = upsertBlueprint(state, blueprint);
		state = {
			blueprints: update.blueprints,
			bonuses: update.bonuses ?? state.bonuses,
			legacyBackup: update.legacyBackup ?? state.legacyBackup
		};
		converted++;
	}
	const shadowed = state.bonuses.filter((entry) => storedIds.has(storedId(entry)));
	if (shadowed.length) state = {
		...state,
		bonuses: state.bonuses.filter((entry) => !storedIds.has(storedId(entry))),
		legacyBackup: {
			...state.legacyBackup,
			...Object.fromEntries(shadowed.map((entry) => [storedId(entry), entry]))
		}
	};
	const changed = converted > 0 || shadowed.length > 0;
	return {
		converted,
		failed: state.bonuses.length,
		issues,
		changes: changed ? flagChanges({
			blueprints: state.blueprints,
			bonuses: state.bonuses,
			legacyBackup: state.legacyBackup
		}) : null
	};
}
/** Changes that delete the kept v1 originals, or null when there are none. */
function backupRemoval(scope) {
	const backup = asRecord(asRecord(scope).legacyBackup);
	return Object.keys(backup).length ? { [`flags.${MODULE_SCOPE}.-=legacyBackup`]: null } : null;
}
//#endregion
//#region src/foundry/migration.ts
var PACK_TYPES = ["Actor", "Item"];
function withEmbedded(document) {
	return [
		document,
		...listOf(read(document, "items")).filter(isDocument).flatMap((item) => [item, ...listOf(read(item, "effects")).filter(isDocument)]),
		...listOf(read(document, "effects")).filter(isDocument)
	];
}
function worldDocuments() {
	return [
		...listOf(game.actors).filter(isDocument).flatMap(withEmbedded),
		...listOf(game.items).filter(isDocument).flatMap(withEmbedded),
		...listOf(game.scenes).flatMap((scene) => [...listOf(read(scene, "regions")), ...listOf(read(scene, "templates"))]).filter(isDocument)
	];
}
function migrationPacks() {
	return listOf(game.packs).map((pack) => pack).filter((pack) => PACK_TYPES.includes(pack.documentName)).map((pack) => ({
		id: pack.collection,
		label: pack.metadata.label,
		documentName: pack.documentName,
		locked: pack.locked
	}));
}
/** Run `task` over the world's documents and the chosen packs' documents; locked packs are unlocked when `unlock`. */
async function overDocuments(options, unlock, task) {
	const relock = [];
	try {
		const documents = worldDocuments();
		for (const id of options.packs ?? []) {
			const pack = game.packs.get(id);
			if (!pack) continue;
			if (unlock && pack.locked) {
				await pack.configure({ locked: false });
				relock.push(pack);
			}
			documents.push(...(await pack.getDocuments()).filter(isDocument).flatMap(withEmbedded));
		}
		return await task(options.include ? documents.filter(options.include) : documents);
	} finally {
		for (const pack of relock) await pack.configure({ locked: true });
	}
}
function plan(document) {
	const carrier = carrierKind(document);
	return carrier ? planMigration(read(document, `flags.${MODULE_SCOPE}`), carrier) : null;
}
function entryFor(document, converted, failed, warnings, error) {
	return {
		uuid: document.uuid,
		label: document.name,
		documentName: document.documentName,
		converted,
		failed,
		warnings,
		error
	};
}
function summarize(entries) {
	return {
		documents: entries.length,
		converted: entries.reduce((sum, entry) => sum + entry.converted, 0),
		failed: entries.reduce((sum, entry) => sum + entry.failed, 0),
		errors: entries.filter((entry) => entry.error).length,
		entries
	};
}
/** A dry run: which documents carry v1 bonuses and what would convert. Changes nothing. */
async function scanMigration(options = {}) {
	return overDocuments(options, false, (documents) => Promise.resolve(summarize(documents.flatMap((document) => {
		const result = plan(document);
		return result && (result.converted || result.failed) ? [entryFor(document, result.converted, result.failed, result.issues.length, null)] : [];
	}))));
}
/** Convert every v1 bonus in the world and the chosen packs; each document is updated on its own. */
async function runMigration(options = {}) {
	return overDocuments(options, true, async (documents) => {
		const pending = documents.flatMap((document) => {
			const result = plan(document);
			return result?.changes || result?.failed ? [{
				document,
				result
			}] : [];
		});
		const entries = [];
		for (const [index, { document, result }] of pending.entries()) {
			let error = null;
			if (result.changes) try {
				await document.update(result.changes);
			} catch (caught) {
				error = caught instanceof Error ? caught.message : String(caught);
				console.error(`Build-n-Action | could not migrate ${document.uuid}`, caught);
			}
			entries.push(entryFor(document, error ? 0 : result.converted, result.failed, result.issues.length, error));
			options.onProgress?.(index + 1, pending.length);
		}
		return summarize(entries);
	});
}
/** Delete the kept v1 originals everywhere; returns how many documents had some. */
async function deleteBackups(options = {}) {
	return overDocuments(options, true, async (documents) => {
		let count = 0;
		for (const document of documents) {
			const changes = backupRemoval(read(document, `flags.${MODULE_SCOPE}`));
			if (!changes) continue;
			try {
				await document.update(changes);
				count++;
			} catch (error) {
				console.error(`Build-n-Action | could not delete the backup of ${document.uuid}`, error);
			}
		}
		return count;
	});
}
//#endregion
//#region src/foundry/migration-app.ts
function element(tag, className = "", text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== void 0) node.textContent = text;
	return node;
}
function button(label, onClick, primary = false) {
	const node = element("button", primary ? "bna-migration__primary" : "", label);
	node.type = "button";
	node.addEventListener("click", onClick);
	return node;
}
/** Foundry's own name for a document type ("Item" → "Предмет"), or the raw name. */
function documentType(documentName) {
	const key = `DOCUMENT.${documentName}`;
	return game.i18n.has(key) ? game.i18n.localize(key) : documentName;
}
var MigrationApp = class extends foundry.applications.api.ApplicationV2 {
	static DEFAULT_OPTIONS = {
		id: "bna-migration",
		classes: ["bna-migration-window"],
		window: {
			title: "BNA.Migration.title",
			icon: "fa-solid fa-diagram-project",
			resizable: true
		},
		position: {
			width: 620,
			height: 640
		}
	};
	#step = "choose";
	#packs = /* @__PURE__ */ new Set();
	#report = null;
	#progress = [0, 0];
	#note = "";
	#busy = false;
	async _renderHTML() {
		const root = element("div", "bna-migration bna-surface");
		const t = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);
		if (this.#step === "choose") {
			root.append(element("p", "", t("BNA.Migration.intro")));
			const packs = migrationPacks();
			if (packs.length) {
				const fieldset = element("fieldset");
				fieldset.append(element("legend", "", t("BNA.Migration.packs")));
				for (const pack of packs) {
					const label = element("label", "bna-migration__pack");
					const box = element("input");
					box.type = "checkbox";
					box.checked = this.#packs.has(pack.id);
					box.addEventListener("change", () => {
						if (box.checked) this.#packs.add(pack.id);
						else this.#packs.delete(pack.id);
					});
					label.append(box, document.createTextNode(pack.label));
					if (pack.locked) label.append(element("span", "bna-migration__muted", t("BNA.Migration.locked")));
					fieldset.append(label);
				}
				root.append(fieldset);
			}
			root.append(element("div", "bna-migration__actions"));
			root.lastElementChild?.append(button(t("BNA.Migration.scan"), () => void this.#scan(), true));
		}
		if (this.#report && (this.#step === "report" || this.#step === "done")) {
			const report = this.#report;
			const summaryKey = this.#step === "done" ? "BNA.Migration.doneSummary" : "BNA.Migration.scanSummary";
			root.append(element("p", "bna-migration__summary", t(summaryKey, {
				documents: report.documents,
				converted: report.converted,
				failed: report.failed,
				errors: report.errors
			})));
			if (!report.entries.length) root.append(element("p", "bna-migration__muted", t("BNA.Migration.nothing")));
			const list = element("ul", "bna-migration__list");
			for (const entry of report.entries) {
				const item = element("li", entry.error ? "is-error" : "");
				const open = element("button", "bna-migration__link", entry.label);
				open.type = "button";
				open.addEventListener("click", () => {
					fromUuid(entry.uuid).then((found) => {
						(found?.sheet)?.render({ force: true });
					});
				});
				item.append(open, element("span", "bna-migration__muted", entry.error ? t("BNA.Migration.entryError", { error: entry.error }) : t("BNA.Migration.entry", {
					type: documentType(entry.documentName),
					converted: entry.converted,
					failed: entry.failed
				})));
				list.append(item);
			}
			root.append(list);
			const actions = element("div", "bna-migration__actions");
			if (this.#step === "report") {
				actions.append(button(t("BNA.Migration.back"), () => this.#go("choose")));
				if (report.converted) actions.append(button(t("BNA.Migration.run"), () => void this.#run(), true));
			}
			actions.append(button(t("BNA.Migration.deleteBackups"), () => void this.#deleteBackups()));
			root.append(actions);
		}
		if (this.#step === "running") {
			const [done, total] = this.#progress;
			const bar = element("progress");
			bar.max = Math.max(total, 1);
			bar.value = done;
			root.append(element("p", "", t("BNA.Migration.running", {
				done,
				total
			})), bar);
		}
		if (this.#note) root.append(element("p", "bna-migration__note", this.#note));
		root.querySelectorAll("button").forEach((node) => {
			node.disabled = this.#busy;
		});
		return root;
	}
	_replaceHTML(result, content) {
		content.replaceChildren(result);
	}
	#go(step) {
		this.#step = step;
		this.#note = "";
		this.render();
	}
	async #scan() {
		this.#busy = true;
		this.render();
		try {
			this.#report = await scanMigration({ packs: [...this.#packs] });
			this.#step = "report";
		} finally {
			this.#busy = false;
			this.render();
		}
	}
	async #run() {
		this.#step = "running";
		this.#progress = [0, this.#report?.documents ?? 0];
		this.render();
		try {
			this.#report = await runMigration({
				packs: [...this.#packs],
				onProgress: (done, total) => {
					this.#progress = [done, total];
					this.render();
				}
			});
			this.#step = "done";
		} catch (error) {
			console.error("Build-n-Action | the migration stopped", error);
			this.#step = "report";
			this.#note = game.i18n.format("BNA.Migration.entryError", { error: error instanceof Error ? error.message : String(error) });
		}
		this.render();
	}
	async #deleteBackups() {
		if (!await foundry.applications.api.DialogV2.confirm({
			window: { title: "BNA.Migration.deleteBackups" },
			content: `<p>${game.i18n.localize("BNA.Migration.deleteBackupsConfirm")}</p>`
		})) return;
		this.#busy = true;
		this.render();
		try {
			const count = await deleteBackups({ packs: [...this.#packs] });
			this.#note = game.i18n.format("BNA.Migration.backupsDeleted", { count });
		} finally {
			this.#busy = false;
			this.render();
		}
	}
};
/** "Migrate the world" in the module settings, for the GM only. */
function registerMigrationMenu() {
	game.settings.registerMenu(MODULE_SCOPE, "migration", {
		name: "BNA.Setting.migration.name",
		label: "BNA.Setting.migration.label",
		hint: "BNA.Setting.migration.hint",
		icon: "fa-solid fa-diagram-project",
		type: MigrationApp,
		restricted: true
	});
}
//#endregion
//#region src/foundry/api.ts
var INTEGRATIONS = {
	"midi-qol": {
		label: "Midi QOL",
		minimum: "14.0.12"
	},
	dae: {
		label: "DAE",
		minimum: "14.0.14"
	}
};
function getIntegrationStatus() {
	return Object.fromEntries(Object.entries(INTEGRATIONS).map(([id, support]) => {
		const module = game.modules.get(id);
		const version = module?.version ?? null;
		const compatible = !module?.active || !version || !foundry.utils.isNewerVersion(support.minimum, version);
		return [id, {
			active: module?.active === true,
			compatible,
			minimum: support.minimum,
			version
		}];
	}));
}
/** Warn about active integrations older than supported; neither is required. */
function validateIntegrations() {
	for (const [id, state] of Object.entries(getIntegrationStatus())) {
		if (!state.active || state.compatible) continue;
		const label = INTEGRATIONS[id].label;
		console.warn(`Build-n-Action | ${label} ${state.version} is older than the supported ${state.minimum}.`);
	}
}
function find(document, id) {
	const blueprint = documentBlueprints(document).blueprints.find((entry) => entry.id === id);
	return blueprint ? {
		document,
		blueprint
	} : null;
}
/** Resolve `<parent>.Blueprint.<id>` or a v1 `<parent>.ContextualBonus.<id>` synchronously. */
function blueprintFromUuidSync(uuid) {
	const parsed = parseBlueprintUuid(uuid);
	const document = parsed ? documentFromUuid(parsed.parentUuid) : null;
	return parsed && document ? find(document, parsed.id) : null;
}
async function blueprintFromUuid(uuid) {
	const parsed = parseBlueprintUuid(uuid);
	if (!parsed) return null;
	const document = await fromUuid(parsed.parentUuid);
	return isDocument(document) ? find(document, parsed.id) : null;
}
/** Validate and store a blueprint on a document; a converted v1 bonus is retired to the backup. */
async function saveBlueprint(document, blueprint) {
	const result = validateBlueprintSource(blueprint);
	if (!result.ok) {
		const problems = result.issues.map((issue) => `${issue.path || "(root)"}: ${issue.code}`).join(", ");
		throw new Error(`Build-n-Action | the blueprint is not valid (${problems})`);
	}
	await document.update(flagChanges(upsertBlueprint(read(document, `flags.${MODULE_SCOPE}`), result.value)));
	return result.value;
}
async function removeBlueprint(document, id) {
	const found = find(document, id);
	if (!found) return false;
	await document.update(flagChanges(deleteBlueprint(read(document, `flags.${MODULE_SCOPE}`), found.blueprint)));
	return true;
}
/** Turn a blueprint on or off (also what v1 hotbar macros call). */
async function toggleBlueprint(uuid) {
	const found = await blueprintFromUuid(uuid);
	if (!found) {
		ui.notifications.warn(game.i18n.localize("BNA.Runtime.NotFound"));
		return null;
	}
	const enabled = !found.blueprint.enabled;
	await saveBlueprint(found.document, {
		...found.blueprint,
		enabled
	});
	ui.notifications.info(game.i18n.format(enabled ? "BNA.Runtime.Enabled" : "BNA.Runtime.Disabled", { name: found.blueprint.name }));
	return enabled;
}
function validated(blueprint) {
	const result = validateBlueprintSource(blueprint);
	if (!result.ok) throw new Error(`Build-n-Action | the blueprint is not valid (${result.issues.map((issue) => issue.code).join(", ")})`);
	return result.value;
}
/** Store a new blueprint on a document, from optional partial data; it gets a fresh id. */
async function createStoredBlueprint(document, data = {}) {
	return saveBlueprint(document, {
		...createBlueprint(),
		...asRecord(data),
		id: randomId()
	});
}
/** Copy a stored blueprint next to the original. */
async function duplicateStoredBlueprint(uuid) {
	const found = await blueprintFromUuid(uuid);
	if (!found) return null;
	const name = game.i18n.format("BNA.UI.Rail.copyName", { name: found.blueprint.name || game.i18n.localize("BNA.UI.Rail.untitled") });
	return saveBlueprint(found.document, duplicateBlueprint(found.blueprint, name));
}
/** The Test panel's run, for macros: what the blueprint would do for this roller, item, target and outcome. */
function simulateBlueprint(blueprint, context) {
	return simulate(context.document, validated(blueprint), {
		actorUuid: context.actorUuid,
		itemUuid: context.itemUuid ?? null,
		activityId: context.activityId ?? null,
		targetUuid: context.targetUuid ?? null,
		event: context.event,
		pins: context.pins ?? ["out"],
		signal: context.signal ?? null,
		abilityId: context.abilityId ?? null,
		skillId: context.skillId ?? null
	});
}
function createApi() {
	return {
		blueprints: {
			get: (document) => documentBlueprints(document).blueprints,
			issues: (document) => documentBlueprints(document).issues,
			fromUuid: blueprintFromUuid,
			fromUuidSync: blueprintFromUuidSync,
			save: saveBlueprint,
			delete: removeBlueprint,
			toggle: toggleBlueprint,
			uuid: (document, id) => blueprintUuid(document.uuid, id),
			create: createStoredBlueprint,
			duplicate: duplicateStoredBlueprint,
			compile: (blueprint) => compileBlueprint(validated(blueprint)),
			simulate: simulateBlueprint
		},
		openEditor,
		library: createLibraryApi(),
		migration: {
			packs: migrationPacks,
			scan: scanMigration,
			run: runMigration,
			deleteBackups,
			open: () => new MigrationApp().render({ force: true })
		},
		hotbarToggle: toggleBlueprint,
		fromUuid: blueprintFromUuid,
		fromUuidSync: blueprintFromUuidSync,
		getIntegrationStatus,
		debug: { recentRolls }
	};
}
//#endregion
//#region src/core/phrase/formatter.ts
function createPhraseFormatter(translator, provider) {
	const label = (value, spec) => {
		if (!value) return "";
		if ("static" in spec) {
			const match = spec.static.find((choice) => choice.value === value);
			return match ? translator.t(match.label) : value;
		}
		return provider.choices(spec.source).find((choice) => choice.value === value)?.label ?? value;
	};
	const join = (items, conjunctionKey) => {
		if (items.length <= 1) return items[0] ?? "";
		return `${items.slice(0, -1).join(", ")} ${translator.t(conjunctionKey)} ${items.at(-1)}`;
	};
	const joinAnd = (items) => join(items, "BNA.Phrase.And");
	const joinOr = (items) => join(items, "BNA.Phrase.Or");
	return {
		t: (key, data) => translator.t(key, data),
		choice: label,
		choices(values, spec) {
			const included = [];
			const excluded = [];
			for (const value of values) if (value.startsWith("!")) excluded.push(label(value.slice(1), spec));
			else included.push(label(value, spec));
			if (!included.length && !excluded.length) return translator.t("BNA.Phrase.Any");
			if (!excluded.length) return joinOr(included);
			if (!included.length) return translator.t("BNA.Phrase.NotValues", { values: joinOr(excluded) });
			return translator.t("BNA.Phrase.ButNot", {
				values: joinOr(included),
				excluded: joinOr(excluded)
			});
		},
		signed(formula) {
			const trimmed = formula.trim();
			if (!trimmed) return "+0";
			return /^[+-]/.test(trimmed) ? trimmed : `+${trimmed}`;
		},
		joinAnd,
		joinOr
	};
}
//#endregion
//#region src/runtime/choice-sources.ts
function labelOf(entry, key) {
	if (typeof entry === "string") return entry;
	return asString(read(entry, "label")) || asString(read(entry, "name")) || key;
}
function childrenOf(node) {
	const children = read(node, "children");
	return children && typeof children === "object" ? children : null;
}
function choice(value, label, group) {
	return group ? {
		value,
		label,
		group
	} : {
		value,
		label
	};
}
function fromRecord(record, data) {
	return Object.entries(asRecord(record)).map(([value, entry]) => choice(value, data.localize(labelOf(entry, value))));
}
/** Every entry of a trait tree, grouped under its parent's label. */
function fromTree(tree, data, group) {
	if (!tree) return [];
	return Object.entries(tree).flatMap(([value, node]) => {
		const label = data.localize(labelOf(node, value));
		const children = childrenOf(node);
		return [choice(value, label, group), ...children ? fromTree(children, data, label) : []];
	});
}
/** Entries without children, grouped under their parent's label. */
function leaves(tree, data, group) {
	if (!tree) return [];
	return Object.entries(tree).flatMap(([value, node]) => {
		const label = data.localize(labelOf(node, value));
		const children = childrenOf(node);
		return children ? leaves(children, data, label) : [choice(value, label, group)];
	});
}
function properties(kind, data) {
	const valid = new Set(listOf(read(data.dnd5e, `validProperties.${kind}`)).filter((key) => typeof key === "string"));
	return fromRecord(data.dnd5e.itemProperties, data).filter((entry) => valid.has(entry.value));
}
/** The options of one dynamic choice list. */
function choicesFor(source, data) {
	const config = data.dnd5e;
	switch (source) {
		case "abilities":
		case "actorSizes":
		case "armorTypes":
		case "attackClassifications":
		case "attackModes":
		case "attackTypes":
		case "creatureTypes":
		case "currencies":
		case "featureTypes":
		case "proficiencyLevels":
		case "skills":
		case "spellLevels":
		case "spellSchools": return fromRecord(config[source], data);
		case "damageAndHealingTypes": return [...fromRecord(config.damageTypes, data), ...fromRecord(config.healingTypes, data)];
		case "spellComponents": return properties("spell", data);
		case "weaponProperties": return properties("weapon", data);
		case "spellMethods": return fromRecord(config.spellcasting, data);
		case "spellSlotLevels": return [...Object.entries(asRecord(config.spellLevels)).filter(([level]) => Number(level) > 0).map(([level, entry]) => choice(`spell${level}`, data.localize(labelOf(entry, level)))), choice("pact", data.localize("DND5E.SpellLevelPact"))];
		case "statusEffects": return data.statusEffects.flatMap((effect) => {
			const id = asString(read(effect, "id"));
			return id ? [choice(id, data.localize(labelOf(effect, id)))] : [];
		});
		case "itemTypes": return Object.entries(data.itemTypes).map(([value, label]) => choice(value, data.localize(label)));
		case "throwTypes": return [
			...fromRecord(config.abilities, data),
			choice("death", data.localize("DND5E.DeathSave")),
			choice("concentration", data.localize("DND5E.Concentration"))
		];
		case "languages": return fromTree(data.trees.languages, data);
		case "tools": return fromTree(data.trees.tool, data);
		case "weaponTypes": return [...fromRecord(config.weaponTypes, data), ...leaves(data.trees.weapon, data)];
		case "documentEffects": return data.effects.map((effect) => choice(effect.id, effect.name));
	}
}
//#endregion
//#region src/foundry/choices.ts
var foundryTranslator = {
	t: (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key),
	has: (key) => game.i18n.has(key)
};
function sourceData(carrier) {
	const effectsOwner = carrier ? carrierItem(carrier) ?? carrier : null;
	return {
		dnd5e: CONFIG.DND5E,
		statusEffects: CONFIG.statusEffects,
		itemTypes: Object.fromEntries(Object.entries(CONFIG.Item.typeLabels).filter(([type]) => type !== "base")),
		trees: traitTrees(),
		effects: listOf(read(effectsOwner, "effects")).filter(isDocument).map((effect) => ({
			id: effect.id,
			name: effect.name
		})),
		localize: (key) => game.i18n.localize(key)
	};
}
/** Choice lists from CONFIG and the carrier's effects; built on first use and cached per provider. */
function foundryChoices(carrier = null) {
	let data = null;
	const cache = /* @__PURE__ */ new Map();
	return { choices(source) {
		let list = cache.get(source);
		if (!list) {
			data ??= sourceData(carrier);
			list = choicesFor(source, data);
			cache.set(source, list);
		}
		return list;
	} };
}
//#endregion
export { documentBlueprints as $, replaceData as A, asRecord as At, createRider as B, pendingRoll as C, COMMON_RESULT_FIELDS as Ct, sourceLabel as D, CONDITION_NODE_FIELDS as Dt, loadTraitTrees as E, CHECKS as Et, addRider as F, EVENT_TYPES as Ft, SETTINGS as G, canEdit as H, riderClock as I, resolveEditorTheme as J, clientSetting as K, useRiders as L, scaledFormula as M, asStrings as Mt, simplifyNumber as N, STATIC as Nt, registerAuraPreviews as O, asBoolean as Ot, resolveModifiers as P, CONDITION_NODE_TYPE as Pt, carrierKind as Q, countRest as R, resolveRollTarget as S, getResult as St, effectStatus as T, EVENTS as Tt, openEditor as U, lintBlueprint as V, CLIENT_SETTINGS as W, setting as X, setClientSetting as Y, actorToken as Z, guardedAsync as _, validateBlueprintSource as _t, removeBlueprint as a, listOf as at, recordUsages as b, getCheck as bt, registerMigrationMenu as c, enumeratePaths as ct, activationFor as d, createCheck as dt, documentFromUuid as et, activationOf as f, createEdge as ft, guarded as g, isFieldVisible as gt, evaluateEvent as h, defaultsFor as ht, createApi as i, touchesBlueprints as it, resolveForeign as j, asString as jt, modifyFormulaParts as k, asNumber as kt, createFoundryHost as l, MODULE_SCOPE as lt, announceApplied as m, duplicateBlueprint as mt, foundryTranslator as n, originRollData as nt, saveBlueprint as o, read as ot, allowIntents as p, createNode as pt, registerSettings as q, createPhraseFormatter as r, rollDataOf as rt, validateIntegrations as s, stringList as st, foundryChoices as t, isDocument as tt, registerLibrary as u, createBlueprint as ut, makeRoller as v, randomId as vt, registerPending as w, RESULTS as wt, rememberActivation as x, getEvent as xt, midiActivation as y, canConnect as yt, recordUsage as z };

//# sourceMappingURL=choices-JhATeK3R.mjs.map