const MODULE = {
  ID: "build-n-action",
  NAME: "Build-n-Action",
  ICON: "fa-solid fa-wand-magic-sparkles",
  CONSUMPTION_TYPES: {
    currency: "DND5E.Currency",
    effect: "BUILD_N_ACTION.FIELDS.consume.type.optionEffect",
    health: "DND5E.HitPoints",
    hitdice: "DND5E.HitDice",
    inspiration: "DND5E.Inspiration",
    quantity: "DND5E.Quantity",
    slots: "BUILD_N_ACTION.FIELDS.consume.type.optionSlots",
    uses: "DND5E.LimitedUses"
  },
  DISPOSITION_TYPES: {
    2: "BUILD_N_ACTION.FIELDS.aura.disposition.optionAny",
    1: "BUILD_N_ACTION.FIELDS.aura.disposition.optionAlly",
    "-1": "BUILD_N_ACTION.FIELDS.aura.disposition.optionEnemy"
  },
  HEALTH_PERCENTAGES_CHOICES: {
    0: "BUILD_N_ACTION.FIELDS.filters.healthPercentages.type.optionLT",
    1: "BUILD_N_ACTION.FIELDS.filters.healthPercentages.type.optionGT"
  },
  ATTACK_MODES_CHOICES: {
    offhand: "DND5E.ATTACK.Mode.Offhand",
    oneHanded: "DND5E.ATTACK.Mode.OneHanded",
    thrown: "DND5E.ATTACK.Mode.Thrown",
    "thrown-offhand": "DND5E.ATTACK.Mode.ThrownOffhand",
    twoHanded: "DND5E.ATTACK.Mode.TwoHanded"
  },
  SPELL_COMPONENT_CHOICES: {
    ANY: "BUILD_N_ACTION.FIELDS.filters.spellComponents.match.optionAny",
    ALL: "BUILD_N_ACTION.FIELDS.filters.spellComponents.match.optionAll"
  },
  TOKEN_SIZES_CHOICES: {
    0: "BUILD_N_ACTION.FIELDS.filters.tokenSizes.type.optionGT",
    1: "BUILD_N_ACTION.FIELDS.filters.tokenSizes.type.optionLT"
  },
  MODIFIER_MODES: {
    0: "BUILD_N_ACTION.MODIFIERS.FIELDS.mode.optionAdd",
    1: "BUILD_N_ACTION.MODIFIERS.FIELDS.mode.optionMultiply"
  }
};

/* -------------------------------------------------- */

const SETTINGS = {
  AURA: "showAuraRanges",
  LABEL: "headerLabel",
  PLAYERS: "allowPlayers",
  SCRIPT: "disableCustomScriptFilter",
  FUMBLE: "allowFumbleNegation",
  SHEET_TAB: "showSheetTab",
  RADIUS: "padAuraRadius"
};

/**
 * A mixin function for base filter behaviour.
 * @param {Class} Base      The base class.
 * @returns {Class}
 * @mixin
 */
function FilterMixin(Base) {
  return class BaseFilter extends Base {
    /**
     * The name of the filter.
     * @type {string}
     */
    static name = null;

    /* -------------------------------------------------- */

    /**
     * Whether this filter can be added more than once to a buildNAction.
     * @type {boolean}
     */
    static repeatable = false;

    /* -------------------------------------------------- */

    /**
     * What handlebars template to use when rendering this filter in the builder.
     * @type {string}
     */
    static template = null;

    /* -------------------------------------------------- */

    /**
     * Whether this filter has 'exclude' as an option in KeysDialog.
     * @type {boolean}
     */
    static canExclude = false;

    /* -------------------------------------------------- */

    /**
     * Should this filter display the trash button?
     * @type {boolean}
     */
    static trash = true;

    /* -------------------------------------------------- */

    /**
     * Get the current data values of this filter.
     * @param {ContextualBonus} bonus     The instance of the buildNAction on which this field lives.
     */
    static value(bonus) {
      return foundry.utils.getProperty(bonus, `filters.${this.name}`);
    }

    /* -------------------------------------------------- */

    /**
     * Render the filter.
     * @param {ContextualBonus} bonus     The bonus being rendered.
     * @returns {string}          The rendered template.
     */
    static render(bonus) {
      throw new Error("This must be subclassed!");
    }

    /* -------------------------------------------------- */

    /**
     * Determine whether this filter data should be saved on the document.
     * @param {ContextualBonus} bonus     The bonus being embedded.
     * @returns {boolean}         Whether to save the filter.
     */
    static storage(bonus) {
      return this.value(bonus).size > 0;
    }

    /* -------------------------------------------------- */

    /** @override */
    toFormGroup(formConfig, inputConfig) {
      const element = super.toFormGroup(formConfig, inputConfig);

      if (this.constructor.trash) {
        const trash = document.createElement("A");
        trash.dataset.action = "deleteFilter";
        trash.dataset.id = this.constructor.name;
        trash.innerHTML = "<i class='fa-solid fa-trash'></i>";
        element.querySelector(".form-fields").after(trash);
      }

      return element;
    }
  };
}

const {SchemaField: SchemaField$d, StringField: StringField$c, ArrayField} = foundry.data.fields;

// ArrayField that filters invalid comparison fields.
class ArbitraryComparisonField extends FilterMixin(ArrayField) {
  /** @override */
  static name = "arbitraryComparisons";

  /* -------------------------------------------------- */

  /** @override */
  static repeatable = true;

  /* -------------------------------------------------- */

  /** @override */
  constructor(options = {}) {
    super(new SchemaField$d({
      one: new StringField$c(),
      other: new StringField$c(),
      operator: new StringField$c({
        required: true,
        initial: "EQ",
        choices: {EQ: "=", LT: "<", GT: ">", LE: "<=", GE: ">="}
      })
    }), options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>{{label}}</legend>
      <p class="hint">{{hint}}</p>
      {{#each comparisons as |c idx|}}
      <div class="form-group">
        <div class="form-fields">
          {{formInput c.one.field value=c.one.value placeholder=../placeholder1 name=c.one.name}}
          {{formInput c.operator.field value=c.operator.value name=c.operator.name}}
          {{formInput c.other.field value=c.other.value placeholder=../placeholder2 name=c.other.name}}
        </div>
        <a data-action="deleteFilter" data-id="${this.name}" data-idx="{{idx}}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </div>
      {{/each}}
    </fieldset>`;

    const field = bonus.schema.getField("filters.arbitraryComparisons");
    const {one, other, operator} = field.element.fields;
    const data = {
      label: field.label,
      hint: field.hint,
      placeholder1: game.i18n.localize("BUILD_N_ACTION.FIELDS.filters.arbitraryComparisons.one.placeholder"),
      placeholder2: game.i18n.localize("BUILD_N_ACTION.FIELDS.filters.arbitraryComparisons.other.placeholder"),
      comparisons: bonus.filters.arbitraryComparisons.map((c, i) => {
        return {
          one: {field: one, value: c.one, name: `filters.${this.name}.${i}.one`},
          other: {field: other, value: c.other, name: `filters.${this.name}.${i}.other`},
          operator: {field: operator, value: c.operator, name: `filters.${this.name}.${i}.operator`}
        };
      })
    };

    return data.comparisons.length ? Handlebars.compile(template)(data) : "";
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    return this.value(bonus).filter(i => i).length > 0;
  }
}

const {SchemaField: SchemaField$c, SetField: SetField$6, StringField: StringField$b} = foundry.data.fields;

/* -------------------------------------------------- */

class AttackModesField extends FilterMixin(SchemaField$c) {
  /** @override */
  static name = "attackModes";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      value: new SetField$6(new StringField$b({choices: CONFIG.DND5E.attackTypes})),
      classification: new SetField$6(new StringField$b({choices: CONFIG.DND5E.attackClassifications})),
      mode: new SetField$6(new StringField$b({choices: MODULE.ATTACK_MODES_CHOICES}))
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const schema = bonus.schema.getField("filters.attackModes");
    const {value, mode, classification} = schema.fields;

    const context = {
      value: {
        field: value,
        value: bonus.filters.attackModes.value
      },
      mode: {
        field: mode,
        value: bonus.filters.attackModes.mode
      },
      classification: {
        field: classification,
        value: bonus.filters.attackModes.classification
      },
      legend: schema.label,
      hint: schema.hint
    };

    const template = `
    <fieldset>
      <legend>
        {{legend}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      {{formGroup value.field value=value.value}}
      {{formGroup classification.field value=classification.value}}
      {{formGroup mode.field value=mode.value}}
    </fieldset>`;

    return Handlebars.compile(template)(context);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    const value = this.value(bonus);
    return Object.values(value).some(v => v.size);
  }
}

const {SetField: SetField$5, NumberField: NumberField$6, StringField: StringField$a, SchemaField: SchemaField$b} = foundry.data.fields;

let BaseField$1 = class BaseField extends FilterMixin(SetField$5) {
  /** @override */
  static render(bonus) {
    const field = bonus.schema.getField(`filters.${this.name}`);
    const value = bonus.filters[this.name] ?? new Set();
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      {{formInput field value=value}}
    </fieldset>`;
    return Handlebars.compile(template)({
      field: field, value: value, hint: field.hint, label: field.label
    });
  }

  /* -------------------------------------------------- */

  /** @override */
  _cleanType(value, ...args) {
    const choices = (this.element.choices instanceof Function) ? this.element.choices() : this.element.choices;
    value = super._cleanType(value, ...args).filter(v => v in choices);
    return value;
  }
};

/* -------------------------------------------------- */

class ProficiencyLevelsField extends BaseField$1 {
  /** @override */
  static name = "proficiencyLevels";

  /* -------------------------------------------------- */

  constructor() {
    super(new NumberField$6({choices: CONFIG.DND5E.proficiencyLevels}));
  }
}

/* -------------------------------------------------- */

class ItemTypesField extends BaseField$1 {
  /** @override */
  static name = "itemTypes";

  /* -------------------------------------------------- */

  constructor() {
    super(new StringField$a({
      choices: Object.keys(dnd5e.dataModels.item.config).reduce((acc, type) => {
        if (!dnd5e.dataModels.item.config[type].schema.getField("activities")) return acc;
        acc[type] = game.i18n.localize(`TYPES.Item.${type}`);
        return acc;
      }, {})
    }));
  }
}

/* -------------------------------------------------- */

class SpellLevelsField extends BaseField$1 {
  /** @override */
  static name = "spellLevels";

  /* -------------------------------------------------- */

  constructor() {
    super(new NumberField$6({choices: CONFIG.DND5E.spellLevels}));
  }
}

/* -------------------------------------------------- */

class SpellComponentsField extends FilterMixin(SchemaField$b) {
  /** @override */
  static name = "spellComponents";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      types: new BaseField$1(new StringField$a({
        choices: () => CONFIG.DND5E.validProperties.spell.reduce((acc, p) => {
          const prop = CONFIG.DND5E.itemProperties[p];
          if (prop) acc[p] = prop;
          return acc;
        }, {})
      })),
      match: new StringField$a({
        required: true,
        initial: "ANY",
        choices: MODULE.SPELL_COMPONENT_CHOICES
      }),
      ...fields
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{types.parent.label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{types.parent.hint}}</p>
      <div class="form-group">
        <label>{{types.label}}</label>
        <div class="form-fields">
          {{formInput types value=typesValue}}
        </div>
      </div>
      <div class="form-group">
        <label>{{match.label}}</label>
        <div class="form-fields">
          {{formInput match value=matchValue sort=true}}
        </div>
      </div>
    </fieldset>`;

    return Handlebars.compile(template)({
      types: bonus.schema.getField("filters.spellComponents.types"),
      match: bonus.schema.getField("filters.spellComponents.match"),
      typesValue: bonus.filters.spellComponents.types,
      matchValue: bonus.filters.spellComponents.match
    });
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    return !!this.value(bonus).types?.filter(u => u).size;
  }
}

/* -------------------------------------------------- */

class ActorCreatureSizesField extends BaseField$1 {
  /** @override */
  static name = "actorCreatureSizes";

  /* -------------------------------------------------- */

  constructor() {
    super(new StringField$a({choices: CONFIG.DND5E.actorSizes}));
  }
}

/* -------------------------------------------------- */

class PreparationModesField extends BaseField$1 {
  /** @override */
  static name = "preparationModes";

  /* -------------------------------------------------- */

  constructor() {
    super(new StringField$a({choices: CONFIG.DND5E.spellPreparationModes}));
  }
}

/* -------------------------------------------------- */

var checkboxFields = {
  ActorCreatureSizesField,
  ItemTypesField,
  PreparationModesField,
  ProficiencyLevelsField,
  SpellComponentsField,
  SpellLevelsField
};

const {JavaScriptField, StringField: StringField$9} = foundry.data.fields;

class CustomScriptsField extends FilterMixin(JavaScriptField) {
  /** @override */
  static name = "customScripts";

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const field = bonus.schema.getField(`filters.${this.name}`);
    const value = bonus.filters[this.name] ?? "";

    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      <div class="form-group">
        <div class="form-fields">
          {{formInput field value=value}}
        </div>
      </div>
    </fieldset>`;

    return Handlebars.compile(template)({
      field: field,
      value: value,
      label: field.label,
      hint: field.hint
    });
  }

  /* -------------------------------------------------- */

  /** @override */
  _validateType(value, options) {
    return StringField$9.prototype._validateType.call(this, value, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    return !!this.value(bonus)?.length;
  }
}

const {SchemaField: SchemaField$a, StringField: StringField$8} = foundry.data.fields;

class FeatureTypesField extends FilterMixin(SchemaField$a) {
  /** @override */
  static name = "featureTypes";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      type: new StringField$8({required: false}),
      subtype: new StringField$8({required: true}),
      ...fields
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const schema = bonus.schema.getField("filters.featureTypes");
    const {type, subtype} = schema.fields;

    const value1 = bonus.filters.featureTypes.type;
    const value2 = bonus.filters.featureTypes.subtype;
    const choices1 = CONFIG.DND5E.featureTypes;
    const choices2 = CONFIG.DND5E.featureTypes[value1]?.subtypes ?? {};

    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      {{formGroup type value=value1 sort=true choices=choices1}}
      {{#if choices2}}
      {{formGroup subtype value=value2 sort=true choices=choices2}}
      {{/if}}
    </fieldset>`;

    const data = {
      type: type,
      subtype: subtype,
      value1: value1,
      value2: value2,
      choices1: choices1,
      choices2: foundry.utils.isEmpty(choices2) ? null : choices2,
      label: schema.label,
      hint: schema.hint
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    const value = this.value(bonus);
    return value.type in CONFIG.DND5E.featureTypes;
  }
}

const {SchemaField: SchemaField$9, NumberField: NumberField$5} = foundry.data.fields;

class HealthPercentagesField extends FilterMixin(SchemaField$9) {
  /** @override */
  static name = "healthPercentages";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      value: new NumberField$5({
        min: 0,
        max: 100,
        step: 1,
        integer: true,
        nullable: true, // nullable required to be able to remove it
        initial: 50
      }),
      type: new NumberField$5({
        initial: null,
        nullable: true, // nullable required to be able to remove it
        choices: MODULE.HEALTH_PERCENTAGES_CHOICES
      }),
      ...fields
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      {{formGroup valueField value=value}}
      {{formGroup typeField value=type}}
    </fieldset>`;

    const schema = bonus.schema.getField(`filters.${this.name}`);
    const valueField = bonus.schema.getField(`filters.${this.name}.value`);
    const typeField = bonus.schema.getField(`filters.${this.name}.type`);
    const data = {
      valueField: valueField,
      typeField: typeField,
      value: bonus.filters[this.name].value,
      type: bonus.filters[this.name].type,
      hint: schema.hint,
      label: schema.label
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    return !Object.values(this.value(bonus)).includes(null);
  }
}

const {SchemaField: SchemaField$8, SetField: SetField$4, StringField: StringField$7} = foundry.data.fields;

class IdentifiersField extends FilterMixin(SchemaField$8) {
  /** @override */
  static name = "identifiers";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({values: new SetField$4(new StringField$7(), {slug: true}), ...fields}, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      <div class="form-group">
        <div class="form-fields">
          {{formInput field value=value slug=true placeholder=placeholder}}
        </div>
      </div>
    </fieldset>`;

    const schema = bonus.schema.getField(`filters.${this.name}`);
    const field = bonus.schema.getField(`filters.${this.name}.values`);
    const value = bonus.filters.identifiers.values;

    const data = {
      label: schema.label,
      hint: schema.hint,
      field: field,
      value: value,
      placeholder: game.i18n.localize("BUILD_N_ACTION.FIELDS.filters.identifiers.value.placeholder")
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    return !!bonus.filters.identifiers?.values?.size;
  }
}

const {SchemaField: SchemaField$7, SetField: SetField$3, StringField: StringField$6} = foundry.data.fields;

class MarkersField extends FilterMixin(SchemaField$7) {
  /** @override */
  static name = "markers";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      values: new SetField$3(new StringField$6(), {slug: true}),
      target: new SetField$3(new StringField$6(), {slug: true}),
      ...fields
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      {{formGroup values.field value=values.value slug=true placeholder=placeholder}}
      {{formGroup target.field value=target.value slug=true placeholder=placeholder}}
    </fieldset>`;

    const schema = bonus.schema.getField(`filters.${this.name}`);
    const field = bonus.schema.getField(`filters.${this.name}.values`);
    const target = bonus.schema.getField(`filters.${this.name}.target`);

    const data = {
      label: schema.label,
      hint: schema.hint,
      values: {field: field, value: bonus.filters[this.name].values},
      target: {field: target, value: bonus.filters[this.name].target},
      placeholder: game.i18n.localize(`BUILD_N_ACTION.FIELDS.filters.${this.name}.placeholder`)
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    const {values, target} = bonus.filters[this.name] ?? {};
    return !!values?.size || !!target?.size;
  }
}

const {SchemaField: SchemaField$6, NumberField: NumberField$4, BooleanField: BooleanField$5} = foundry.data.fields;

class RemainingSpellSlotsField extends FilterMixin(SchemaField$6) {
  /** @override */
  static name = "remainingSpellSlots";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      min: new NumberField$4({min: 0, step: 1, integer: true}),
      max: new NumberField$4({min: 0, step: 1, integer: true}),
      size: new BooleanField$5(),
      ...fields
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      <div class="form-group">
        <label>{{localize "BUILD_N_ACTION.FIELDS.filters.remainingSpellSlots.rangeLabel"}}</label>
        <div class="form-fields">
          {{formInput minField value=min placeholder=phmin}}
          &mdash;
          {{formInput maxField value=max placeholder=phmax}}
        </div>
      </div>
      {{formGroup sizeField value=size}}
    </fieldset>`;

    const schema = bonus.schema.getField(`filters.${this.name}`);
    const {min: minField, max: maxField, size: sizeField} = schema.fields;
    const {min, max, size} = bonus.filters[this.name];

    const data = {
      label: schema.label,
      hint: schema.hint,
      minField, min,
      maxField, max,
      sizeField, size,
      phmin: game.i18n.localize("Minimum"),
      phmax: game.i18n.localize("Maximum")
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    const {min, max} = bonus.filters[this.name];
    return Number.isNumeric(min) || Number.isNumeric(max);
  }
}

let proficiencyTrees = {};

/** @param {object} trees */
function setProficiencyTrees(trees) {
  proficiencyTrees = trees;
}

/** @returns {object} */
function getProficiencyTrees() {
  return proficiencyTrees;
}

/**
 * Does this actor speak a given language?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
function speaksLanguage(actor, trait) {
  return hasTrait(actor, trait, "languages");
}

/**
 * Does this actor have a given weapon proficiency?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
function hasWeaponProficiency(actor, trait) {
  return hasTrait(actor, trait, "weapon");
}

/**
 * Does this actor have a given armor proficiency?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
function hasArmorProficiency(actor, trait) {
  return hasTrait(actor, trait, "armor");
}

/**
 * Does this actor have a given tool proficiency?
 *
 * @param {Actor5e} actor
 * @param {string} trait
 * @returns {boolean}
 */
function hasToolProficiency(actor, trait) {
  return hasTrait(actor, trait, "tool");
}

/**
 * Retrieve a path through nested proficiencies.
 *
 * @param {string} key
 * @param {string} category
 * @returns {string[]}
 */
function proficiencyTree(key, category) {
  const root = proficiencyTrees[category];
  if (!root) return [];

  const find = (node) => {
    for (const [nodeKey, value] of Object.entries(node)) {
      if (nodeKey === key) return [nodeKey];
      if (!value.children) continue;
      const childPath = find(value.children);
      if (childPath.length) return [nodeKey, ...childPath];
    }
    return [];
  };

  return find(root);
}

function hasTrait(actor, trait, category) {
  const path = CONFIG.DND5E.traits[category].actorKeyPath ?? `system.traits.${category}`;
  const set = foundry.utils.getProperty(actor, path)?.value ?? new Set();
  if (set.has(trait)) return true;
  return set.some(value => {
    const [key, node] = proficiencyTrees[category]?.find(value) ?? [];
    return (key === trait) || (node?.children && node.children.find(trait));
  });
}

const {SetField: SetField$2, StringField: StringField$5} = foundry.data.fields;

class BaseField extends FilterMixin(SetField$2) {
  /** @override */
  static canExclude = true;

  /* -------------------------------------------------- */

  /** @override */
  static trash = false;

  /* -------------------------------------------------- */

  /**
   * Encapsulate this in a fieldset when using the formGroup hbs helper?
   * @type {boolean}
   */
  static fieldset = true;

  /* -------------------------------------------------- */

  constructor(options = {}) {
    super(new StringField$5(), options);
  }

  /* -------------------------------------------------- */

  /** @override */
  _cast(value) {
    // If the given value is a string, split it at each ';' and trim the results to get an array.
    if (typeof value === "string") value = value.split(";").map(v => v.trim());
    return super._cast(value);
  }

  /* -------------------------------------------------- */

  /** @override */
  _cleanType(value, ...args) {
    value = super._cleanType(value, ...args).reduce((acc, v) => {
      if (v) acc.add(v);
      return acc;
    }, new Set());
    return Array.from(value);
  }

  /* -------------------------------------------------- */

  /** @override */
  _toInput(config) {
    if ((config.value instanceof Set) || Array.isArray(config.value)) {
      config.value = Array.from(config.value).join(";");
    }
    return foundry.data.fields.StringField.prototype._toInput.call(this, config);
  }

  /* -------------------------------------------------- */

  /** @override */
  toFormGroup(formConfig, inputConfig) {
    const element = super.toFormGroup(formConfig, inputConfig);

    const input = element.querySelector("input");
    const button = document.createElement("BUTTON");
    button.dataset.action = "keysDialog";
    button.dataset.property = input.name;
    button.dataset.id = this.constructor.name;
    button.type = "button";
    button.innerHTML = `<i class="fa-solid fa-key"></i> ${game.i18n.localize("BUILD_N_ACTION.Keys")}`;
    input.after(button);

    if (this.constructor.fieldset) {
      const set = document.createElement("FIELDSET");
      const label = element.querySelector("LABEL");
      set.innerHTML = `
      <legend>
        ${label.textContent}
        <a data-action="deleteFilter" data-id="${this.constructor.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>`;
      label.remove();

      const hint = element.querySelector(".hint");
      hint.remove();
      set.appendChild(hint);

      set.appendChild(element);
      return set;
    }

    return element;
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = "{{formGroup field value=value}}";
    const data = {
      field: bonus.schema.getField(`filters.${this.name}`),
      value: bonus.filters[this.name]
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /**
   * Retrieve the choices for a Keys dialog when configuring this field.
   * @returns {{value: string, label: string}[]}
   */
  static choices() {
    throw new Error("This must be subclassed!");
  }
}

/* -------------------------------------------------- */

class AbilitiesField extends BaseField {
  /** @override */
  static name = "abilities";

  /* -------------------------------------------------- */

  /** @override */
  static canExclude = true;

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const abilities = Object.entries(CONFIG.DND5E.abilities);
    return abilities.map(([value, {label}]) => ({value, label}));
  }
}

/* -------------------------------------------------- */

class SaveAbilitiesField extends AbilitiesField {
  /** @override */
  static name = "saveAbilities";
}

/* -------------------------------------------------- */

class ThrowTypesField extends AbilitiesField {
  /** @override */
  static name = "throwTypes";

  /* -------------------------------------------------- */

  /** @override */
  static canExclude = false;

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const choices = super.choices();

    choices.push({
      value: "death",
      label: game.i18n.localize("DND5E.DeathSave")
    }, {
      value: "concentration",
      label: game.i18n.localize("DND5E.Concentration")
    });

    return choices;
  }
}

/* -------------------------------------------------- */

class StatusEffectsField extends BaseField {
  /** @override */
  static name = "statusEffects";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    return CONFIG.statusEffects.reduce((acc, {id, img, name}) => {
      if (id && img && name) acc.push({value: id, label: name, icon: img});
      return acc;
    }, []);
  }
}

/* -------------------------------------------------- */

class TargetEffectsField extends StatusEffectsField {
  /** @override */
  static name = "targetEffects";
}

/* -------------------------------------------------- */

class AuraBlockersField extends StatusEffectsField {
  /** @override */
  static name = "auraBlockers";

  /* -------------------------------------------------- */

  /** @override */
  static canExclude = false;

  /* -------------------------------------------------- */

  /** @override */
  static trash = false;

  /* -------------------------------------------------- */

  /** @override */
  static fieldset = false;
}

/* -------------------------------------------------- */

class CreatureTypesField extends BaseField {
  /** @override */
  static name = "creatureTypes";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const types = Object.entries(CONFIG.DND5E.creatureTypes);
    return types.map(([k, v]) => {
      return {value: k, label: v.label};
    }).sort((a, b) => a.label.localeCompare(b.label));
  }
}

/* -------------------------------------------------- */

class ActorCreatureTypesField extends CreatureTypesField {
  /** @override */
  static name = "actorCreatureTypes";
}

/* -------------------------------------------------- */

class BaseArmorsField extends BaseField {
  /** @override */
  static name = "baseArmors";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    return Array.from(getProficiencyTrees().armor.asSet()).map(k => {
      return {
        value: k,
        label: dnd5e.documents.Trait.keyLabel(`armor:${k}`)
      };
    });
  }
}

/* -------------------------------------------------- */

class TargetArmorsField extends BaseArmorsField {
  /** @override */
  static name = "targetArmors";
}

/* -------------------------------------------------- */

class BaseToolsField extends BaseField {
  /** @override */
  static name = "baseTools";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    return Array.from(getProficiencyTrees().tool.asSet()).map(k => {
      return {
        value: k,
        label: dnd5e.documents.Trait.keyLabel(`tool:${k}`)
      };
    });
  }
}

/* -------------------------------------------------- */

class BaseWeaponsField extends BaseField {
  /** @override */
  static name = "baseWeapons";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    return Array.from(getProficiencyTrees().weapon.asSet()).map(k => {
      return {
        value: k,
        label: dnd5e.documents.Trait.keyLabel(`weapon:${k}`)
      };
    });
  }
}

/* -------------------------------------------------- */

class DamageTypesField extends BaseField {
  /** @override */
  static name = "damageTypes";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const damages = Object.entries(CONFIG.DND5E.damageTypes);
    const heals = Object.entries(CONFIG.DND5E.healingTypes);
    return [...damages, ...heals].map(([k, v]) => ({value: k, label: v.label}));
  }
}

/* -------------------------------------------------- */

class SkillIdsField extends BaseField {
  /** @override */
  static name = "skillIds";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    return Array.from(getProficiencyTrees().skills.asSet()).map(k => {
      return {
        value: k,
        label: dnd5e.documents.Trait.keyLabel(`skills:${k}`)
      };
    });
  }
}

/* -------------------------------------------------- */

class SpellSchoolsField extends BaseField {
  /** @override */
  static name = "spellSchools";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const schools = Object.entries(CONFIG.DND5E.spellSchools);
    return schools.map(([k, v]) => ({value: k, label: v.label}));
  }
}

/* -------------------------------------------------- */

class WeaponPropertiesField extends BaseField {
  /** @override */
  static name = "weaponProperties";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const keys = CONFIG.DND5E.validProperties.weapon;
    const labels = CONFIG.DND5E.itemProperties;
    return keys.reduce((acc, k) => {
      const label = labels[k]?.label;
      if (label) acc.push({value: k, label: label});
      return acc;
    }, []);
  }
}

/* -------------------------------------------------- */

class ActorLanguagesField extends BaseField {
  /** @override */
  static name = "actorLanguages";

  /* -------------------------------------------------- */

  /** @override */
  static choices() {
    const trait = dnd5e.documents.Trait;
    const choices = getProficiencyTrees().languages;

    const langs = new Set();
    const cats = new Set();

    const construct = (c) => {
      for (const [key, choice] of Object.entries(c)) {
        if (choice.children) {
          cats.add(key);
          construct(choice.children);
        } else langs.add(key);
      }
    };

    construct(choices);

    const toLabel = (k, isCat = true) => ({value: k, label: trait.keyLabel(`languages:${k}`), isCategory: isCat});

    return Array.from(cats.map(k => toLabel(k, true))).concat(Array.from(langs.map(k => toLabel(k, false))));
  }
}

/* -------------------------------------------------- */

var semicolonFields = {
  AbilitiesField,
  ActorCreatureTypesField,
  ActorLanguagesField,
  AuraBlockersField,
  BaseArmorsField,
  BaseToolsField,
  BaseWeaponsField,
  CreatureTypesField,
  DamageTypesField,
  SaveAbilitiesField,
  SkillIdsField,
  SpellSchoolsField,
  StatusEffectsField,
  TargetArmorsField,
  TargetEffectsField,
  ThrowTypesField,
  WeaponPropertiesField
};

const {SchemaField: SchemaField$5, SetField: SetField$1, StringField: StringField$4} = foundry.data.fields;

class SourceClassesField extends FilterMixin(SchemaField$5) {
  /** @override */
  static name = "sourceClasses";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({values: new SetField$1(new StringField$4(), {slug: true}), ...fields}, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      <div class="form-group">
        <div class="form-fields">
          {{formInput field value=value slug=true placeholder=placeholder}}
        </div>
      </div>
    </fieldset>`;

    const schema = bonus.schema.getField(`filters.${this.name}`);
    const field = bonus.schema.getField(`filters.${this.name}.values`);
    const value = bonus.filters.sourceClasses.values;

    const data = {
      label: schema.label,
      hint: schema.hint,
      field: field,
      value: value,
      placeholder: game.i18n.localize("BUILD_N_ACTION.FIELDS.filters.sourceClasses.value.placeholder")
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    return !!bonus.filters.sourceClasses?.values?.size;
  }
}

const {SchemaField: SchemaField$4, NumberField: NumberField$3, BooleanField: BooleanField$4} = foundry.data.fields;

class TokenSizesField extends FilterMixin(SchemaField$4) {
  /** @override */
  static name = "tokenSizes";

  /* -------------------------------------------------- */

  constructor(fields = {}, options = {}) {
    super({
      size: new NumberField$3({min: 0.5, step: 0.5}),
      type: new NumberField$3({
        choices: MODULE.TOKEN_SIZES_CHOICES,
        initial: 0
      }),
      self: new BooleanField$4(),
      ...fields
    }, options);
  }

  /* -------------------------------------------------- */

  /** @override */
  static render(bonus) {
    const template = `
    <fieldset>
      <legend>
        {{label}}
        <a data-action="deleteFilter" data-id="${this.name}">
          <i class="fa-solid fa-trash"></i>
        </a>
      </legend>
      <p class="hint">{{hint}}</p>
      <div class="form-group">
        <label>{{sizeField.label}}</label>
        <div class="form-fields">
          {{formInput typeField value=type}}
          {{formInput sizeField value=size placeholder=phSize}}
        </div>
      </div>
      {{formGroup selfField value=self}}
    </fieldset>`;

    const schema = bonus.schema.getField(`filters.${this.name}`);
    const {type: typeField, size: sizeField, self: selfField} = schema.fields;
    const {type, size, self} = bonus.filters[this.name];

    const data = {
      label: schema.label,
      hint: schema.hint,
      typeField, type,
      sizeField, size,
      selfField, self,
      phSize: game.i18n.localize("BUILD_N_ACTION.FIELDS.filters.tokenSizes.size.placeholder")
    };

    return Handlebars.compile(template)(data);
  }

  /* -------------------------------------------------- */

  /** @override */
  static storage(bonus) {
    const {size, type, self} = this.value(bonus) ?? {};
    return Number.isNumeric(size) && Number.isNumeric(type);
  }
}

var fields = Object.values({
  ...checkboxFields,
  ...semicolonFields,
  ArbitraryComparisonField,
  AttackModesField,
  CustomScriptsField,
  FeatureTypesField,
  HealthPercentagesField,
  IdentifiersField,
  MarkersField,
  RemainingSpellSlotsField,
  SourceClassesField,
  TokenSizesField
}).reduce((acc, field) => {
  acc[field.name] = field;
  return acc;
}, {});

let BonusSheetClass;
let TokenAuraClass;

/**
 * Configure UI classes at the composition root without making data models
 * depend on the public global API.
 *
 * @param {object} applications
 * @param {typeof ApplicationV2} applications.BonusSheet
 * @param {typeof TokenAura} applications.TokenAura
 */
function configureApplicationFactories({BonusSheet, TokenAura}) {
  BonusSheetClass = BonusSheet;
  TokenAuraClass = TokenAura;
}

/**
 * Return the existing sheet for a bonus or construct a new one.
 *
 * @param {ContextualBonus} bonus
 * @returns {BonusSheet}
 */
function getBonusSheet(bonus) {
  if (!BonusSheetClass) throw new Error("Build-n-Action application factories are not configured.");
  const sheet = foundry.applications.instances.get(BonusSheetClass.applicationId(bonus));
  return sheet ?? new BonusSheetClass({bonus});
}

/** Apply current display settings to tracked token auras. */
function refreshTokenAuras() {
  TokenAuraClass?.refreshAll();
}

/**
 * Construct the configured aura visualization.
 *
 * @param {TokenDocument5e} token
 * @param {ContextualBonus} bonus
 * @returns {TokenAura}
 */
function createTokenAura(token, bonus) {
  if (!TokenAuraClass) throw new Error("Build-n-Action application factories are not configured.");
  return new TokenAuraClass(token, bonus);
}

/**
 * Read raw contextual-bonus data from a document flag.
 *
 * @param {Document|object} document
 * @returns {object[]}
 */
function getStoredBonusData(document) {
  let stored = foundry.utils.getProperty(document, `flags.${MODULE.ID}.bonuses`) ?? [];
  if (stored instanceof Map) stored = stored.values();
  else if (foundry.utils.getType(stored) === "Object") stored = Object.values(stored);
  return Array.isArray(stored) ? stored.filter(Boolean) : Array.from(stored ?? []);
}

/**
 * Replace one stored bonus or append it when it is new.
 *
 * @param {Document} document
 * @param {string} id
 * @param {object} data
 * @returns {Promise<void>}
 */
async function upsertStoredBonus(document, id, data) {
  const stored = getStoredBonusData(document).filter(entry => entry.id !== id);
  stored.push(data);
  await document.setFlag(MODULE.ID, "bonuses", stored);
}

/**
 * Remove one stored bonus.
 *
 * @param {Document} document
 * @param {string} id
 * @returns {Promise<void>}
 */
async function removeStoredBonus(document, id) {
  const stored = getStoredBonusData(document).filter(entry => entry.id !== id);
  await document.setFlag(MODULE.ID, "bonuses", stored);
}

const {BooleanField: BooleanField$3, StringField: StringField$3, NumberField: NumberField$2, SchemaField: SchemaField$3} = foundry.data.fields;

class AuraModel extends foundry.abstract.DataModel {
  /** @override */
  static defineSchema() {
    return {
      enabled: new BooleanField$3(),
      template: new BooleanField$3(),
      range: new StringField$3({required: true}),
      self: new BooleanField$3({initial: true}),
      disposition: new NumberField$2({
        initial: 2,
        choices: MODULE.DISPOSITION_TYPES
      }),
      blockers: new fields.auraBlockers(),
      require: new SchemaField$3(CONST.WALL_RESTRICTION_TYPES.reduce((acc, k) => {
        acc[k] = new BooleanField$3();
        return acc;
      }, {}))
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  _initialize(...args) {
    super._initialize(...args);
    this.prepareDerivedData();
  }

  /* -------------------------------------------------- */

  /** @override */
  static migrateData(source) {
    if (source.isTemplate) source.template = source.isTemplate;
  }

  /* -------------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    if (!this.bonus) return;

    // Prepare aura range.
    if (this.range) {
      const range = dnd5e.utils.simplifyBonus(this.range, this.getRollData());
      this.range = range;
    }

    // Scene regions cannot be auras.
    if (this.bonus.region) this.enabled = false;
  }

  /* -------------------------------------------------- */

  /**
   * Get applicable roll data from the origin.
   * @returns {object}      The roll data.
   */
  getRollData() {
    return this.bonus?.getRollData?.({deterministic: true}) ?? {};
  }

  /* -------------------------------------------------- */
  /*   Properties                                       */
  /* -------------------------------------------------- */

  /**
   * The buildNAction this lives on.
   * @type {ContextualBonus}
   */
  get bonus() {
    return this.parent;
  }

  /* -------------------------------------------------- */

  /**
   * Get whether this has a range that matters.
   * @type {boolean}
   */
  get _validRange() {
    return (this.range === -1) || (this.range > 0);
  }

  /* -------------------------------------------------- */

  /**
   * Whether the buildNAction is an enabled and valid aura centered on a token. This is true if the property is enabled, the
   * template aura property is not enabled, and the range of the aura is valid.
   * @type {boolean}
   */
  get isToken() {
    return this.enabled && !this.template && this._validRange && !this.bonus.isExclusive;
  }

  /* -------------------------------------------------- */

  /**
   * Whether the buildNAction is a template aura. This is true if the aura property is enabled, along with the 'template' aura
   * property, and the item on which the buildNAction is embedded can create a measured template.
   * @type {boolean}
   */
  get isTemplate() {
    const item = this.bonus.parent;
    if (!(item instanceof Item)) return false;
    return this.enabled && this.template && !this.bonus.isExclusive && !!item.system.activities?.some(a => {
      return a.target.template?.type;
    });
  }

  /* -------------------------------------------------- */

  /**
   * Whether the buildNAction aura is suppressed due to its originating actor having at least one of the blocker conditions.
   * @type {boolean}
   */
  get isBlocked() {
    const actor = this.bonus.actor;
    const blockers = new Set(this.blockers);
    const ci = actor.system.traits?.ci?.value ?? new Set();
    for (const c of ci) blockers.delete(c);
    return blockers.intersects(actor.statuses);
  }

  /* -------------------------------------------------- */
  /*   Bonus collection                                 */
  /* -------------------------------------------------- */

  /**
   * Return whether this should be filtered out of token auras due to being blocked from affecting its owner.
   * @type {boolean}
   */
  get isAffectingSelf() {
    if (!this.isToken) return true;
    return !this.isBlocked && this.self;
  }

  /* -------------------------------------------------- */

  /**
   * Is this a token aura that is not blocked?
   * @type {boolean}
   */
  get isActiveTokenAura() {
    return this.enabled && !this.template && this._validRange && !this.isBlocked;
  }
}

const {BooleanField: BooleanField$2, StringField: StringField$2, SchemaField: SchemaField$2, NumberField: NumberField$1} = foundry.data.fields;

class ConsumptionModel extends foundry.abstract.DataModel {
  /** @override */
  static defineSchema() {
    return {
      enabled: new BooleanField$2(),
      type: new StringField$2({
        required: true,
        initial: "",
        blank: true,
        choices: MODULE.CONSUMPTION_TYPES
      }),
      subtype: new StringField$2({
        required: true,
        blank: true,
        initial: ""
      }),
      scales: new BooleanField$2(),
      formula: new StringField$2({required: true}),
      value: new SchemaField$2({
        min: new StringField$2({required: true}),
        max: new StringField$2({required: true}),
        step: new NumberField$1({integer: true, min: 1, step: 1})
      })
    };
  }

  /* -------------------------------------------------- */
  /*   Data preparation                                 */
  /* -------------------------------------------------- */

  /** @override */
  _initialize(...args) {
    super._initialize(...args);
    this.prepareDerivedData();
  }

  /* -------------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    if (!this.bonus) return;
    const rollData = this.getRollData();
    this.value.min = this.value.min ? dnd5e.utils.simplifyBonus(this.value.min, rollData) : 1;
    this.value.max = this.value.max ? dnd5e.utils.simplifyBonus(this.value.max, rollData) : null;
    if ((this.value.min > this.value.max) && (this.value.max !== null)) {
      const m = this.value.min;
      this.value.min = this.value.max;
      this.value.max = m;
    }
  }

  /* -------------------------------------------------- */
  /*   Migrations                                       */
  /* -------------------------------------------------- */

  /** @override */
  static migrateData(source) {
    // Resource as a consumption type is deprecated fully and without replacement.
    if (source.type === "resource") source.type = "";
  }

  /* -------------------------------------------------- */
  /*   Properties                                       */
  /* -------------------------------------------------- */

  /**
   * The buildNAction this lives on.
   * @type {ContextualBonus}
   */
  get bonus() {
    return this.parent;
  }

  /* -------------------------------------------------- */

  /**
   * Whether the set up in consumption can be used to create something that consumes.
   * This looks only at the consumption data and not at anything else about the buildNAction.
   * @type {boolean}
   */
  get isValidConsumption() {
    const {type, value} = this;
    if (!(type in MODULE.CONSUMPTION_TYPES) || ["save", "hitdie"].includes(this.parent.type)) return false;
    const invalidScale = this.scales && ((this.value.max ?? Infinity) < this.value.min);

    switch (type) {
      case "uses":
        if (!(this.bonus.parent instanceof Item) || invalidScale) return false;
        return this.bonus.parent.hasLimitedUses && (value.min > 0);
      case "quantity":
        if (!(this.bonus.parent instanceof Item) || invalidScale) return false;
        return this.bonus.parent.system.schema.has("quantity") && (value.min > 0);
      case "effect":
        return this.bonus.parent instanceof ActiveEffect;
      case "health":
      case "slots":
        if (invalidScale) return false;
        return value.min > 0;
      case "currency":
        if (invalidScale) return false;
        return Object.keys(CONFIG.DND5E.currencies).includes(this.subtype) && (value.min > 0);
      case "inspiration":
        return true;
      case "hitdice":
        if (invalidScale) return false;
        return ["smallest", "largest"].concat(CONFIG.DND5E.hitDieTypes).includes(this.subtype) && (value.min > 0);
      default:
        return false;
    }
  }

  /* -------------------------------------------------- */
  /*   Instance methods                                 */
  /* -------------------------------------------------- */

  /**
   * Is the actor or user able to make the change when performing the consumption?
   * This checks for permission issues only as well as properties being existing on the actor.
   * It does not check for correct setup of the consumption data on the bonus.
   * This can be used to determine whether a bonus should appear in the Optional Selector, but
   * NOT due to lack of resources.
   * @param {Actor5e} actor     The actor performing the roll.
   * @returns {boolean}
   */
  canActorConsume(actor) {
    if (!this.isValidConsumption) return false;

    switch (this.type) {
      case "uses":
      case "quantity":
      case "effect":
        return this.bonus.parent.isOwner;
      case "slots":
        return !!actor.system.spells && actor.isOwner;
      case "health":
        return !!actor.system.attributes?.hp && actor.isOwner;
      case "currency":
        return !!actor.system.currency && actor.isOwner;
      case "inspiration":
      case "hitdice":
        return (actor.type === "character") && actor.isOwner;
      default:
        return false;
    }
  }

  /* -------------------------------------------------- */

  /**
   * Whether there are enough remaining of the target to be consumed.
   * @param {Actor5e|Item5e|ActiveEffect5e} document      The target of consumption.
   * @param {number} [min]                                A different minimum value to test against.
   * @returns {boolean}
   */
  canBeConsumed(document, min) {
    if (!this.isValidConsumption) return false;

    min ??= this.value.min;
    const {hd, hp} = document.system?.attributes ?? {};

    switch (this.type) {
      case "uses":
        return document.system.uses.value >= min;
      case "quantity":
        return document.system.quantity >= min;
      case "effect":
        return document.parent.effects.has(document.id);
      case "slots":
        return Object.values(document.system.spells).some(s => s.value && s.max && s.level && (s.level >= min));
      case "health":
        return (hp.value + hp.temp) >= min;
      case "currency":
        return document.system.currency[this.subtype] >= min;
      case "inspiration":
        return document.system.attributes.inspiration;
      case "hitdice":
        return (["smallest", "largest"].includes(this.subtype) ? hd.value : hd.bySize[this.subtype] ?? 0) >= min;
      default:
        return false;
    }
  }

  /* -------------------------------------------------- */

  /**
   * Get applicable roll data from the origin.
   * @returns {object}      The roll data.
   */
  getRollData() {
    return this.bonus?.getRollData?.({deterministic: true}) ?? {};
  }
}

const {SchemaField: SchemaField$1, BooleanField: BooleanField$1, NumberField, StringField: StringField$1} = foundry.data.fields;

/* Child of ContextualBonus#bonuses that holds all die modifiers. */
class ModifiersModel extends foundry.abstract.DataModel {
  /** @override */
  static defineSchema() {
    return {
      amount: new SchemaField$1({
        enabled: new BooleanField$1(),
        mode: new NumberField({initial: 0, choices: MODULE.MODIFIER_MODES}),
        value: new StringField$1({required: true})
      }),
      size: new SchemaField$1({
        enabled: new BooleanField$1(),
        mode: new NumberField({initial: 0, choices: MODULE.MODIFIER_MODES}),
        value: new StringField$1({required: true})
      }),
      reroll: new SchemaField$1({
        enabled: new BooleanField$1(),
        value: new StringField$1({required: true}),
        invert: new BooleanField$1(),
        recursive: new BooleanField$1(),
        limit: new StringField$1({required: true})
      }),
      explode: new SchemaField$1({
        enabled: new BooleanField$1(),
        value: new StringField$1({required: true}),
        once: new BooleanField$1(),
        limit: new StringField$1({required: true})
      }),
      minimum: new SchemaField$1({
        enabled: new BooleanField$1(),
        value: new StringField$1({required: true}),
        maximize: new BooleanField$1()
      }),
      maximum: new SchemaField$1({
        enabled: new BooleanField$1(),
        value: new StringField$1({required: true}),
        zero: new BooleanField$1()
      }),
      config: new SchemaField$1({
        first: new BooleanField$1()
      })
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["BUILD_N_ACTION.MODIFIERS"];

  /* -------------------------------------------------- */
  /*   Data preparation                                 */
  /* -------------------------------------------------- */

  /** @override */
  _initialize(...args) {
    super._initialize(...args);
    this.prepareDerivedData();
  }

  /* -------------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    if (!this.bonus) return;
    const rollData = this.bonus.getRollData({deterministic: true});
    for (const m of ["amount", "size", "reroll", "explode", "minimum", "maximum"]) {
      const value = this[m].value;
      if (!value) this[m].value = null;
      else {
        const bonus = dnd5e.utils.simplifyBonus(value, rollData);
        this[m].value = Number.isNumeric(bonus) ? Math.round(bonus) : null;
      }

      if (!("limit" in this[m])) continue;

      const limit = this[m].limit;
      if (!limit) this[m].limit = null;
      else {
        const bonus = Math.round(dnd5e.utils.simplifyBonus(limit, rollData));
        this[m].limit = (Number.isNumeric(bonus) && (bonus > 0)) ? bonus : null;
      }
    }
  }

  /* -------------------------------------------------- */
  /*   Dice modifications                               */
  /* -------------------------------------------------- */

  /**
   * Regex to determine whether a die already has a modifier.
   */
  static REGEX = Object.freeze({
    reroll: /rr?([0-9]+)?([<>=]+)?([0-9]+)?/i,
    explode: /xo?([0-9]+)?([<>=]+)?([0-9]+)?/i,
    minimum: /(?:min)([0-9]+)/i,
    maximum: /(?:max)([0-9]+)/i
  });

  /* -------------------------------------------------- */

  /**
   * Append applicable modifiers to a die.
   * @param {DieTerm} die           The die term that will be mutated.
   * @param {object} [options]      Options object meant to specifically bypass certain modifications.
   */
  modifyDie(die, options = {}) {
    if (options.amount !== false) this._modifyAmount(die);
    if (options.size !== false) this._modifySize(die);
    if (options.reroll !== false) this._modifyReroll(die);
    if (options.explode !== false) this._modifyExplode(die);
    if (options.minimum !== false) this._modifyMin(die);
    if (options.maximum !== false) this._modifyMax(die);
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable amount modifiers to a die.
   * @param {DieTerm} die     The die term that will be mutated.
   */
  _modifyAmount(die) {
    if (!this.hasAmount) return;
    const isMult = this.amount.mode === MODULE.MODIFIER_MODES.MULTIPLY;

    if ((die._number instanceof Roll) && die._number.isDeterministic) {
      const total = die._number.evaluateSync().total;
      die._number = total;
    }

    if (Number.isInteger(die._number)) {
      if (isMult) die._number = Math.max(0, die._number * this.amount.value);
      else die._number = Math.max(0, die._number + this.amount.value);
    }
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable size modifiers to a die.
   * @param {DieTerm} die     The die term that will be mutated.
   */
  _modifySize(die) {
    if (!this.hasSize) return;
    const isMult = this.size.mode === MODULE.MODIFIER_MODES.MULTIPLY;

    if ((die._faces instanceof Roll) && die._faces.isDeterministic) {
      const total = die._faces.evaluateSync().total;
      die._faces = total;
    }

    if (Number.isInteger(die._faces)) {
      if (isMult) die._faces = Math.max(0, die._faces * this.size.value);
      else die._faces = Math.max(0, die._faces + this.size.value);
    }
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable reroll modifiers to a die.
   * @param {DieTerm} die     The die term that will be mutated.
   */
  _modifyReroll(die) {
    if (!this.hasReroll || die.modifiers.some(m => m.match(this.constructor.REGEX.reroll))) return;
    const l = this.reroll.limit;
    const prefix = this.reroll.recursive ? (l ? `rr${l}` : "rr") : "r";
    const v = this.reroll.value ?? 1;
    let mod;
    if (this.reroll.invert) {
      if (v > 0) {
        // reroll if strictly greater than x.
        mod = (v >= die.faces) ? `${prefix}=${die.faces}` : `${prefix}>${v}`;
      } else if (v === 0) {
        // reroll if max.
        mod = `${prefix}=${die.faces}`;
      } else {
        // reroll if strictly greater than (size-x).
        mod = (die.faces + v <= 1) ? `${prefix}=1` : `${prefix}>${die.faces + v}`;
      }
    } else {
      if (v > 0) {
        // reroll if strictly less than x.
        mod = (v === 1) ? `${prefix}=1` : `${prefix}<${Math.min(die.faces, v)}`;
      } else if (v === 0) {
        // reroll 1s.
        mod = `${prefix}=1`;
      } else {
        // reroll if strictly less than (size-x).
        mod = (die.faces + v <= 1) ? `${prefix}=1` : `${prefix}<${die.faces + v}`;
      }
    }
    if (die.faces > 1) die.modifiers.push(mod);
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable explode modifiers to a die.
   * @param {DieTerm} die     The die term that will be mutated.
   */
  _modifyExplode(die) {
    if (!this.hasExplode || die.modifiers.some(m => m.match(this.constructor.REGEX.explode))) return;
    const v = this.explode.value ?? 0;
    const l = this.explode.limit;
    const prefix = (this.explode.once || (l === 1)) ? "xo" : (l ? `x${l}` : "x");
    const _prefix = () => /x\d+/.test(prefix) ? `${prefix}=${die.faces}` : prefix;
    let valid;
    let mod;
    if (v === 0) {
      mod = _prefix();
      valid = (die.faces > 1) || (prefix === "xo");
    } else if (v > 0) {
      mod = (v >= die.faces) ? _prefix() : `${prefix}>=${v}`;
      valid = (v <= die.faces) && (((v === 1) && (prefix === "xo")) || (v > 1));
    } else if (v < 0) {
      const m = Math.max(1, die.faces + v);
      mod = `${prefix}>=${m}`;
      valid = (m > 1) || (prefix == "xo");
    }
    if (valid || l) die.modifiers.push(mod);
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable minimum modifiers to a die.
   * @param {DieTerm} die     The die term that will be mutated.
   */
  _modifyMin(die) {
    if (!this.hasMin || die.modifiers.some(m => m.match(this.constructor.REGEX.minimum))) return;
    const f = die.faces;
    let mod;
    const min = this.minimum.value;
    if (this.minimum.maximize) mod = `min${f}`;
    else mod = `min${(min > 0) ? Math.min(min, f) : Math.max(1, f + min)}`;
    if (mod !== "min1") die.modifiers.push(mod);
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable maximum modifiers to a die.
   * @param {DieTerm} die     The die term that will be mutated.
   */
  _modifyMax(die) {
    if (!this.hasMax || die.modifiers.some(m => m.match(this.constructor.REGEX.maximum))) return;
    const zero = this.maximum.zero;
    const v = this.maximum.value;
    const max = (v === 0) ? (zero ? 0 : 1) : (v > 0) ? v : Math.max(zero ? 0 : 1, die.faces + v);
    if (max < die.faces) die.modifiers.push(`max${max}`);
  }

  /* -------------------------------------------------- */

  /**
   * Append applicable modifiers to a roll part.
   * @param {string[]|number[]} parts           The roll part. **will be mutated**
   * @param {object} [rollData]                 Roll data for roll construction.
   * @param {object} [options]
   * @param {boolean} [options.ignoreFirst]     Whether to ignore the 'first' property'.
   * @returns {boolean}                         Whether all but the first die were skipped.
   */
  modifyParts(parts, rollData = {}, options = {}) {
    if (!this.hasModifiers) return;
    const first = !options.ignoreFirst && this.config.first;
    for (let i = 0; i < parts.length; i++) {
      const part = String(parts[i]);
      const roll = new CONFIG.Dice.DamageRoll(part, rollData);
      if (!roll.dice.length) continue;

      for (const die of roll.dice) {
        this.modifyDie(die);
        if (first) break;
      }
      parts[i] = Roll.fromTerms(roll.terms).formula;
      if (first) return true;
    }
    return false;
  }

  /* -------------------------------------------------- */
  /*   Properties                                       */
  /* -------------------------------------------------- */

  /**
   * The buildNAction this lives on.
   * @type {ContextualBonus}
   */
  get bonus() {
    return this.parent?.parent ?? null;
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus affect the dice amount?
   * @type {boolean}
   */
  get hasAmount() {
    if (!this.amount.enabled) return false;
    return Number.isInteger(this.amount.value);
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus affect explosive dice?
   * @type {boolean}
   */
  get hasExplode() {
    if (!this.explode.enabled) return false;
    return (this.maximum.value === null) || Number.isInteger(this.explode.value);
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus affect the maximum cap?
   * @type {boolean}
   */
  get hasMax() {
    if (!this.maximum.enabled) return false;
    return Number.isInteger(this.maximum.value);
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus affect the minimum cap?
   * @type {boolean}
   */
  get hasMin() {
    if (!this.minimum.enabled) return false;
    if (this.minimum.maximize) return true;
    return Number.isInteger(this.minimum.value) && (this.minimum.value !== 0);
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus have applicable modifiers for dice?
   * @type {boolean}
   */
  get hasModifiers() {
    return this.hasAmount || this.hasSize || this.hasReroll || this.hasExplode || this.hasMin || this.hasMax;
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus affect rerolling?
   * @type {boolean}
   */
  get hasReroll() {
    if (!this.reroll.enabled) return false;
    return (this.reroll.value === null) || Number.isInteger(this.reroll.value);
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus affect the die size?
   * @type {boolean}
   */
  get hasSize() {
    if (!this.size.enabled) return false;
    return Number.isInteger(this.size.value);
  }
}

const {
  BooleanField, DocumentIdField, EmbeddedDataField,
  FilePathField, HTMLField, IntegerSortField,
  ObjectField, SchemaField, SetField, StringField
} = foundry.data.fields;

/**
 * Configuration for how a bonus consumes a property.
 *
 * @typedef {object} ConsumptionModel
 * @property {boolean} enabled        Whether the bonus consumes a property.
 * @property {boolean} scales         Whether the bonus scales with its consumed property.
 * @property {string} type            The type of the consumed property.
 * @property {object} value
 * @property {string} value.min       The minimum amount the bonus consumes.
 * @property {string} value.max       The maximum amount the bonus consumes.
 * @property {number} value.step      The interval size between the min and max.
 * @property {string} formula         The formula used to scale up the bonus.
 */

/**
 * Configuration for the aura properties of a bonus.
 *
 * @typedef {object} AuraModel
 * @property {boolean} enabled            Whether the bonus is an aura.
 * @property {boolean} template           Whether the bonus is an aura on a template.
 * @property {string} range               The range of the aura.
 * @property {boolean} self               Whether the aura can also affect its owner.
 * @property {number} disposition         The type of actors, by token disposition, to affect with the aura.
 * @property {Set<string>} blockers       Statuses that disable this aura when its owner is affected.
 * @property {object} require
 * @property {boolean} require.move       Whether the aura requires a direct, unobstructed path of movement.
 * @property {boolean} require.sight      Whether the aura requires a direct line of sight.
 */

/**
 * Configuration for the changes a bonus provides.
 *
 * @typedef {object} BonusConfiguration
 * @property {string} bonus                     Bonus to the roll that is added on top.
 * @property {string} criticalBonusDice         Amount of dice to increase the damage by on critical hits.
 * @property {string} criticalBonusDamage       Bonus to a damage roll that is added on top only on critical hits.
 * @property {string} targetValue               Modification to the target value a saving throw must meet to be
 *                                              considered a success.
 * @property {string} deathSaveCritical         Modification to the threshold at which a death saving throw is
 *                                              considered a critical success.
 * @property {string} criticalRange             Modification to the threshold at which an attack roll is considered
 *                                              a critical hit.
 * @property {string} fumbleRange               Modification to the threshold at which an attack roll is considered
 *                                              an automatic failure.
 * @property {ModifiersModel} modifiers
 */

/**
 * Configuration for dice modifier bonuses.
 *
 * @typedef {object} ModifiersModel
 * @property {object} config                Additional configurations.
 * @property {boolean} config.first         Whether modifiers affect only the first die encountered.
 * @property {object} amount
 * @property {boolean} amount.enabled       Whether this modifier is enabled.
 * @property {string} amount.value          The amount to upscale a die's number by.
 * @property {object} size
 * @property {boolean} size.enabled         Whether this modifier is enabled.
 * @property {string} size.value            The amount to upscale a die's faces by.
 * @property {object} reroll
 * @property {boolean} reroll.enabled       Whether this modifier is enabled.
 * @property {string} reroll.value          The threshold for rerolling a die.
 * @property {boolean} reroll.invert        Whether the threshold is inverted.
 * @property {boolean} reroll.recursive     Whether to reroll recursively.
 * @property {string} reroll.limit          The maximum number of times a die can reroll.
 * @property {object} explode
 * @property {boolean} explode.enabled      Whether this modifier is enabled.
 * @property {string} explode.value         The threshold for exploding a die.
 * @property {boolean} explode.once         Whether a die can explode at most once.
 * @property {string} explode.limit         The maximum number of times a die can explode.
 * @property {object} minimum
 * @property {boolean} minimum.enabled      Whether this modifier is enabled.
 * @property {string} minimum.value         The minimum value a die can roll.
 * @property {boolean} minimum.maximize     Whether to simply maximize dice.
 * @property {object} maximum
 * @property {boolean} maximum.enabled      Whether this modifier is enabled.
 * @property {string} maximum.value         The maximum value a die can roll.
 * @property {boolean} maximum.zero         Whether the maximum can be zero, else at least 1.
 */

/**
 * Data model of a generic ContextualBonus. This includes all properties; depending on the type, some will not exist.
 *
 * @property {string} name                    The name of the bonus.
 * @property {string} id                      The id of the bonus.
 * @property {string} type                    The type of the bonus.
 * @property {boolean} enabled                Whether the bonus is currently active.
 * @property {string} description             The description of the bonus.
 * @property {boolean} optional               Whether the additive bonus is opted into in the roll config.
 * @property {boolean} reminder               Is this optional bonus just a reminder?
 * @property {boolean} exclusive              Whether the bonus is applying only to its parent item,
 *                                            or its parent effect's parent item.
 * @property {object} filters                 Schema of valid filter types.
 * @property {ConsumptionModel} consume
 * @property {AuraModel} aura
 * @property {BonusConfiguration} bonuses
 *
 */
class ContextualBonus extends foundry.abstract.DataModel {
  constructor(data, options = {}) {
    data = foundry.utils.mergeObject({
      name: options.parent?.name ?? game.i18n.localize("BUILD_N_ACTION.NewContextualBonus"),
      img: options.parent?.img ?? "icons/svg/dice-target.svg"
    }, data);
    super(data, options);
  }

  /* -------------------------------------------------- */
  /*   Properties                                       */
  /* -------------------------------------------------- */

  /** @override */
  static metadata = Object.freeze({
    label: "BUILD_N_ACTION.BaseContextualBonus",
    documentName: "BuildNActionBonus",
    icon: null,
    defaultImg: null
  });

  /* -------------------------------------------------- */

  /**
   * Available buildNAction types.
   * @type {string[]}
   */
  static TYPES = Object.freeze([
    "attack",
    "damage",
    "hitdie",
    "save",
    "test",
    "throw"
  ]);

  /* -------------------------------------------------- */

  /**
   * The actor that this bonus is currently directly or indirectly embedded on, if any.
   * @type {Actor5e|null}
   */
  get actor() {
    if (this.parent instanceof Actor) return this.parent;

    if (this.parent instanceof Item) return this.parent.parent ?? null;

    if (this.parent instanceof ActiveEffect) {
      if (this.parent.parent instanceof Actor) return this.parent.parent;
      if (this.parent.parent instanceof Item) return this.parent.parent.parent ?? null;
    }

    if (this.parent instanceof MeasuredTemplateDocument) {
      const uuid = this.parent.flags.dnd5e?.origin ?? "";
      if (!uuid) return null;
      const parts = uuid.split(".");
      parts.pop(); parts.pop();
      const itemUuid = parts.join(".");
      const item = fromUuidSync(itemUuid);
      return (item instanceof Item) ? (item.parent ?? null) : null;
    }

    return null;
  }

  /* -------------------------------------------------- */

  /**
   * Variable to track whether this bonus has modified dice and was halted at the first die.
   * @type {boolean}
   */
  _halted = false;

  /* -------------------------------------------------- */

  /**
   * Whether a buildNAction is valid for being 'item only' in the builder. It must be embedded in an item (or an
   * effect on an item which targets the item's actor), must not be an aura or template aura, and the item
   * must be able to use activities.
   * @type {boolean}
   */
  get canExclude() {
    let item;
    if (this.parent instanceof Item) item = this.parent;
    else if (this.parent instanceof ActiveEffect) {
      if (!(this.parent.target instanceof Actor) || !(this.parent.parent instanceof Item)) return false;
      item = this.parent.parent;
    }
    if (!item) return false;
    return item.system.schema.has("activities");
  }

  /* -------------------------------------------------- */

  /**
   * Can this bonus act as a reminder?
   * @type {boolean}
   */
  get canRemind() {
    return ["attack", "damage", "hitdie", "throw", "test"].includes(this.type) && !this.hasBonuses && this.optional;
  }

  /* -------------------------------------------------- */

  /**
   * The effect that this bonus is currently directly embedded on, if any.
   * @type {ActiveEffect5e|null}
   */
  get effect() {
    return (this.parent instanceof ActiveEffect) ? this.parent : null;
  }

  /* -------------------------------------------------- */

  /**
   * Does this buildNAction have an additive bonus?
   * @type {boolean}
   */
  get hasAdditiveBonus() {
    return !!this.bonuses.bonus && Roll.validate(this.bonuses.bonus);
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus modify a property that isn't an additive bonus or dice modifier?
   * Such as critical thresholds or bonus critical damage.
   * @type {boolean}
   */
  get hasPropertyBonuses() {
    return false;
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus add dice modifiers?
   * @type {boolean}
   */
  get hasDiceModifiers() {
    return !!this.bonuses.modifiers?.hasModifiers;
  }

  /* -------------------------------------------------- */

  /**
   * Is this providing a bonus to parts, any properties, or dice modifiers?
   * @type {boolean}
   */
  get hasBonuses() {
    return this.hasAdditiveBonus || this.hasPropertyBonuses || this.hasDiceModifiers;
  }

  /* -------------------------------------------------- */

  /**
   * Does this bonus have a damage or healing type?
   * @type {boolean}
   */
  get hasDamageType() {
    return false;
  }

  /* -------------------------------------------------- */

  /**
   * Getter for the metadata icon for this buildNAction type.
   * @type {string}
   */
  get icon() {
    return this.constructor.metadata.icon;
  }

  /* -------------------------------------------------- */

  /**
   * Whether the bonus applies only to its parent item. This is true if it has the property enabled and is valid to do so.
   * @type {boolean}
   */
  get isExclusive() {
    return this.exclusive && this.canExclude;
  }

  /* -------------------------------------------------- */

  /**
   * Whether the bonus can toggle the 'Optional' icon in the builder. This requires that it
   * applies to attack rolls, damage rolls, saving throws, or ability checks; any of the rolls
   * that have a roll configuration dialog.
   * @type {boolean}
   */
  get isOptionable() {
    switch (this.type) {
      case "damage":
      case "hitdie":
        return this.hasBonuses;
      case "attack":
      case "throw":
      case "test":
        // These roll types currently require an additive formula; dice-only optional bonuses are unsupported.
        return !!this.bonuses.bonus;
      default:
        return false;
    }
  }

  /* -------------------------------------------------- */

  /**
   * Whether a buildNAction is currently optional, which is only true if it is both able to be optional, and toggled as such.
   * @type {boolean}
   */
  get isOptional() {
    return this.optional && this.isOptionable;
  }

  /* -------------------------------------------------- */

  /**
   * Is this bonus a reminder, and not an actual 'bonus'?
   * @type {boolean}
   */
  get isReminder() {
    return this.reminder && this.canRemind;
  }

  /* -------------------------------------------------- */

  /**
   * Whether the buildNAction is unavailable due to its parent item being unequipped,
   * unattuned (if required), uncrewed, or its parent effect being inactive or suppressed.
   * @type {boolean}
   */
  get isSuppressed() {
    // If this bonus lives on an effect, template, or region, defer to those.
    const effect = this.effect;
    if (effect) {
      if (!effect.active) return true;
      if (effect.isAppliedEnchantment) return false;
      return !effect.modifiesActor;
    }
    const template = this.template;
    if (template) return template.hidden;
    if (this.region) return false; // a region cannot be disabled.

    const item = this.item;
    if (!item) return false;

    const actor = item.actor;
    if (!actor) return false;

    // Special case for vehicle equipment since the system does not suppress 'effects' from these.
    if (actor.type === "vehicle") {
      return ("crewed" in item.system) && !item.system.crewed;
    }

    return item.areEffectsSuppressed;
  }

  /* -------------------------------------------------- */

  /**
   * The item that this bonus is currently directly or indirectly embedded on, if any.
   * @type {Item5e|null}
   */
  get item() {
    if (this.parent instanceof Actor) return null;

    if (this.parent instanceof Item) return this.parent;

    if (this.parent instanceof MeasuredTemplateDocument) {
      const uuid = this.parent.flags.dnd5e?.origin ?? "";
      if (!uuid) return null;
      const parts = uuid.split(".");
      parts.pop(); parts.pop();
      const itemUuid = parts.join(".");
      const item = fromUuidSync(itemUuid);
      return (item instanceof Item) ? item : null;
    }

    if (this.parent instanceof ActiveEffect) {
      let item;
      try {
        item = fromUuidSync(this.parent.origin ?? "");
      } catch (err) {
        console.warn(err);
        return null;
      }
      return (item instanceof Item) ? item : null;
    }

    return null;
  }

  /* -------------------------------------------------- */

  /**
   * The true source of the buildNAction intended for the retrieval of roll data.
   * - If the buildNAction is embedded on a template, this returns the item that created it.
   * - If the buildNAction is embedded on an item or actor, this simply returns that item or actor.
   * - If the buildNAction is embedded on an effect, this returns the actor or item from which the effect originates.
   * @type {Actor5e|Item5e|null}
   */
  get origin() {
    if (this.parent instanceof MeasuredTemplateDocument) {
      const uuid = this.parent.flags.dnd5e?.origin ?? "";
      if (!uuid) return null;
      const parts = uuid.split(".");
      parts.pop(); parts.pop();
      const itemUuid = parts.join(".");
      const item = fromUuidSync(itemUuid);
      return (item instanceof Item) ? item : null;
    }

    if (this.parent instanceof Item) return this.parent;

    if (this.parent instanceof Actor) return this.parent;

    if (this.parent instanceof ActiveEffect) {
      let origin;
      try {
        origin = fromUuidSync(this.parent.origin);
        if (!origin) return null;
      } catch (err) {
        console.warn(err);
        return null;
      }

      if (origin instanceof Item) return origin;
      if (origin instanceof Actor) return origin;
      if (origin instanceof ActiveEffect) return origin.parent;
      return null;
    }

    return null;
  }

  /* -------------------------------------------------- */

  /**
   * The scene region that this bonus is currently embedded on, if any.
   * @type {SceneRegion|null}
   */
  get region() {
    return (this.parent instanceof RegionDocument) ? this.parent : null;
  }

  /* -------------------------------------------------- */

  /**
   * The sheet of the bonus.
   * @type {BonusSheet}
   */
  get sheet() {
    return getBonusSheet(this);
  }

  /* -------------------------------------------------- */

  /**
   * The template that this bonus is currently directly embedded on, if any.
   * @type {MeasuredTemplateDocument|null}
   */
  get template() {
    return (this.parent instanceof MeasuredTemplateDocument) ? this.parent : null;
  }

  /* -------------------------------------------------- */

  /**
   * Get the corresponding token of the actor that has the bonus, no matter what type of document it is embedded in.
   * Note that this is different from the 'origin' and is dependant on where the bonus currently lives.
   * @type {Token5e|null}
   */
  get token() {
    const actor = this.actor;
    if (!actor) return null;
    const token = actor.isToken ? actor.token?.object : actor.getActiveTokens()[0];
    return token ? token : null;
  }

  /* -------------------------------------------------- */

  /**
   * A formatted uuid of a buildNAction, an extension of its parent's uuid.
   * @type {string}
   */
  get uuid() {
    return `${this.parent.uuid}.ContextualBonus.${this.id}`;
  }

  /* -------------------------------------------------- */
  /*   Data preparation                                 */
  /* -------------------------------------------------- */

  /** @override */
  static defineSchema() {
    const base = this._defineBaseSchema();
    base.bonuses = new SchemaField(this._defineBonusSchema());
    base.filters = new SchemaField(this._defineFilterSchema());
    return base;
  }

  /* -------------------------------------------------- */

  /**
   * Define the basics of the schema, properties that are not type specific.
   * @returns {object}      An object of properties.
   */
  static _defineBaseSchema() {
    return {
      id: new DocumentIdField({initial: () => foundry.utils.randomID()}),
      sort: new IntegerSortField(),
      name: new StringField({required: true, blank: false}),
      img: new FilePathField({categories: ["IMAGE"]}),
      type: new StringField({required: true, initial: "base", readonly: true}),
      enabled: new BooleanField({initial: true}),
      exclusive: new BooleanField(),
      optional: new BooleanField(),
      reminder: new BooleanField(),
      description: new HTMLField(),
      consume: new EmbeddedDataField(ConsumptionModel),
      aura: new EmbeddedDataField(AuraModel),
      flags: new ObjectField()
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["BUILD_N_ACTION"];

  /* -------------------------------------------------- */

  /**
   * Define the bonuses data of the schema.
   * @returns {object}      An object of properties.
   */
  static _defineBonusSchema() {
    return {};
  }

  /* -------------------------------------------------- */

  /**
   * Define the filter data of the schema.
   * @returns {object}      An object of properties.
   */
  static _defineFilterSchema() {
    return {
      actorCreatureSizes: new fields.actorCreatureSizes(),
      actorCreatureTypes: new fields.actorCreatureTypes(),
      actorLanguages: new fields.actorLanguages(),
      arbitraryComparisons: new fields.arbitraryComparisons(),
      baseArmors: new fields.baseArmors(),
      customScripts: new fields.customScripts(),
      healthPercentages: new fields.healthPercentages(),
      markers: new fields.markers(),
      remainingSpellSlots: new fields.remainingSpellSlots(),
      statusEffects: new fields.statusEffects()
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  _initialize(...args) {
    super._initialize(...args);
    this.prepareDerivedData();
  }

  /* -------------------------------------------------- */

  /**
   * Prepare any derived values.
   */
  prepareDerivedData() {}

  /* -------------------------------------------------- */
  /*   Migration                                        */
  /* -------------------------------------------------- */

  /** @override */
  static migrateData(source) {
    this.migrateMinimum(source);
    this.migrateDeathSaveTargetValue(source);
    this.migrateArbitraryComparisonPlural(source);
  }

  /* -------------------------------------------------- */

  /**
   * Migrate the old version of maximizing dice.
   * @param {object} source     Candidate source data.
   */
  static migrateMinimum(source) {
    const minimum = source?.bonuses?.modifiers?.minimum;
    if (!minimum) return;
    if (!("maximize" in minimum) && (minimum.value === "-1")) {
      minimum.value = "";
      minimum.maximize = true;
    }
  }

  /* -------------------------------------------------- */

  /**
   * Migrate 'deathSaveTargetValue' to 'targetValue'.
   * @param {object} source     Candidate source data.
   */
  static migrateDeathSaveTargetValue(source) {
    const tv = source?.bonuses?.deathSaveTargetValue;
    if (tv) foundry.utils.setProperty(source, "bonuses.targetValue", tv);
  }

  /* -------------------------------------------------- */

  /**
   * Rename the 'arbitraryComparison' property to 'arbitraryComparisons'.
   * @param {object} source     Candidate source data.
   */
  static migrateArbitraryComparisonPlural(source) {
    const v = source?.filters?.arbitraryComparison;
    if (v?.length && !source.filters.arbitraryComparisons) {
      source.filters.arbitraryComparisons = v;
    }
  }

  /* -------------------------------------------------- */
  /*   Instance methods                                 */
  /* -------------------------------------------------- */

  /** @override */
  testUserPermission() {
    // Since babs are always local, all users have permission to render them.
    // Proper permissions are handled elsewhere.
    return true;
  }

  /* -------------------------------------------------- */

  /** @override */
  toDragData() {
    return {type: "ContextualBonus", uuid: this.uuid};
  }

  /* -------------------------------------------------- */

  /**
   * Get applicable roll data from the origin.
   * @param {boolean} deterministic     Whether to force flat values for properties that could be a die term or flat term.
   * @returns {object}                  The roll data.
   */
  getRollData({deterministic = false} = {}) {
    const rollData = this.origin?.getRollData({deterministic}) ?? {};
    const level = this.template ? this.template.getFlag("dnd5e", "spellLevel") : null;
    if (level) foundry.utils.setProperty(rollData, "item.level", level);
    return rollData;
  }

  /* -------------------------------------------------- */

  /**
   * Get the value of a flag on this buildNAction.
   * @param {string} scope
   * @param {string} key
   * @returns {*}
   */
  getFlag(scope, key) {
    const scopes = this.parent.constructor.database.getFlagScopes();
    if (!scopes.includes(scope)) throw new Error(`Flag scope "${scope}" is not valid or not currently active.`);
    return foundry.utils.getProperty(this.flags?.[scope], key);
  }

  /* -------------------------------------------------- */

  /**
   * Set a flag on this buildNAction.
   * @param {string} scope
   * @param {string} key
   * @param {*} value
   * @returns {Promise<ContextualBonus>}
   */
  async setFlag(scope, key, value) {
    const scopes = this.parent.constructor.database.getFlagScopes();
    if (!scopes.includes(scope)) throw new Error(`Flag scope "${scope}" is not valid or not currently active.`);
    await this.update({[`flags.${scope}.${key}`]: value});
    return this;
  }

  /* -------------------------------------------------- */

  /**
   * Remove a flag on this buildNAction.
   * @param {string} scope
   * @param {string} key
   * @return {Promise<ContextualBonus>}
   */
  async unsetFlag(scope, key) {
    const scopes = this.parent.constructor.database.getFlagScopes();
    if (!scopes.includes(scope)) throw new Error(`Flag scope "${scope}" is not valid or not currently active.`);
    const head = key.split(".");
    const tail = `-=${head.pop()}`;
    key = ["flags", scope, ...head, tail].join(".");
    await this.update({[key]: null});
    return this;
  }

  /* -------------------------------------------------- */

  /**
   * Toggle this bonus.
   * @param {boolean} [state]     A specific state to set the bonus to.
   * @returns {Promise<ContextualBonus>}
   */
  async toggle(state = null) {
    await this.update({enabled: [true, false].includes(state) ? state : !this.enabled});
    return this;
  }

  /* -------------------------------------------------- */
  /*   Life-cycle methods                               */
  /* -------------------------------------------------- */

  /**
   * Update this bonus, propagating the data to its parent.
   * @param {object} changes        The update object.
   * @param {object} [options]      The update options.
   * @returns {Promise<ContextualBonus>}
   */
  async update(changes, options = {}) {
    changes = foundry.utils.expandObject(changes);

    this.updateSource(changes, options);
    await upsertStoredBonus(this.parent, this.id, this.toObject());
    this.#updateContentLinks();
    return this;
  }

  /* -------------------------------------------------- */

  /**
   * Refresh the state of all content links.
   */
  #updateContentLinks() {
    for (const link of document.querySelectorAll(`a[data-link][data-uuid="${this.uuid}"]`)) {
      link.classList.toggle("enabled", this.enabled);
    }
  }

  /* -------------------------------------------------- */

  /**
   * Delete this bonus.
   * @returns {Promise<ContextualBonus>}
   */
  async delete() {
    await removeStoredBonus(this.parent, this.id);
    return this;
  }

  /* -------------------------------------------------- */

  /**
   * Present a Dialog form to confirm deletion of this bonus.
   * @param {object} [options]      Options to configure the deletetion.
   * @returns {Promise}             A Promise which resolves to the deleted bonus.
   */
  async deleteDialog(options = {}) {
    const type = game.i18n.localize(this.constructor.metadata.label);
    return foundry.applications.api.DialogV2.confirm({
      window: {
        title: `Build-n-Action: ${this.name}`,
        icon: MODULE.ICON
      },
      position: {
        width: 400
      },
      content: `<p>${game.i18n.localize("AreYouSure")} ${game.i18n.format("SIDEBAR.DeleteWarning", {type})}</p>`,
      yes: {
        callback: () => this.delete(),
        default: true
      },
      no: {
        default: false
      },
      rejectClose: false,
      modal: true,
      ...options
    });
  }
}

// a bonus attached to an item; attack rolls, damage rolls, save dc.
class ItemBonus extends ContextualBonus {
  /** @override */
  static _defineFilterSchema() {
    return {
      ...super._defineFilterSchema(),
      abilities: new fields.abilities(),
      baseWeapons: new fields.baseWeapons(),
      creatureTypes: new fields.creatureTypes(),
      damageTypes: new fields.damageTypes(),
      featureTypes: new fields.featureTypes(),
      identifiers: new fields.identifiers(),
      itemTypes: new fields.itemTypes(),
      preparationModes: new fields.preparationModes(),
      sourceClasses: new fields.sourceClasses(),
      spellComponents: new fields.spellComponents(),
      spellLevels: new fields.spellLevels(),
      spellSchools: new fields.spellSchools(),
      targetArmors: new fields.targetArmors(),
      targetEffects: new fields.targetEffects(),
      tokenSizes: new fields.tokenSizes(),
      weaponProperties: new fields.weaponProperties()
    };
  }
}

class AttackBonus extends ItemBonus {
  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    label: "BUILD_N_ACTION.AttackBonus",
    icon: "fa-solid fa-location-crosshairs",
    defaultImg: "systems/dnd5e/icons/svg/trait-weapon-proficiencies.svg"
  }, {inplace: false}));

  /* -------------------------------------------------- */

  /** @override */
  static _defineBaseSchema() {
    const schema = super._defineBaseSchema();
    schema.type = new StringField({
      required: true,
      readonly: true,
      initial: "attack"
    });
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    "BUILD_N_ACTION.ATTACK"
  ];

  /* -------------------------------------------------- */

  /** @override */
  static _defineBonusSchema() {
    return {
      ...super._defineBonusSchema(),
      bonus: new StringField({required: true}),
      criticalRange: new StringField({required: true}),
      fumbleRange: new StringField({required: true})
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static _defineFilterSchema() {
    return {
      ...super._defineFilterSchema(),
      proficiencyLevels: new fields.proficiencyLevels()
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  get hasPropertyBonuses() {
    return !!this.bonuses.criticalRange || !!this.bonuses.fumbleRange;
  }
}

class DamageBonus extends ItemBonus {
  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    label: "BUILD_N_ACTION.DamageBonus",
    icon: "fa-solid fa-burst",
    defaultImg: "systems/dnd5e/icons/svg/properties/magical.svg"
  }, {inplace: false}));

  /* -------------------------------------------------- */

  /** @override */
  static _defineBaseSchema() {
    const schema = super._defineBaseSchema();
    schema.type = new StringField({
      required: true,
      readonly: true,
      initial: "damage"
    });
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    "BUILD_N_ACTION.DAMAGE"
  ];

  /* -------------------------------------------------- */

  /** @override */
  static _defineBonusSchema() {
    return {
      ...super._defineBonusSchema(),
      bonus: new StringField({required: true}),
      damageType: new SetField(new StringField()),
      criticalBonusDice: new StringField({required: true}),
      criticalBonusDamage: new StringField({required: true}),
      modifiers: new EmbeddedDataField(ModifiersModel)
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static _defineFilterSchema() {
    const schema = super._defineFilterSchema();
    schema.attackModes = new fields.attackModes();
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static migrateData(source) {
    super.migrateData(source);
    if (!source.damageType) return;
    if (foundry.utils.getType(source.damageType) === "string") {
      source.damageType = [source.damageType];
    }
  }

  /* -------------------------------------------------- */

  /** @override */
  get hasDamageType() {
    const types = this.bonuses.damageType;
    return types.some(type => (type in CONFIG.DND5E.damageTypes) || (type in CONFIG.DND5E.healingTypes));
  }

  /* -------------------------------------------------- */

  /** @override */
  get hasPropertyBonuses() {
    return !!this.bonuses.criticalBonusDice || !!this.bonuses.criticalBonusDamage;
  }
}

class SaveBonus extends ItemBonus {
  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    label: "BUILD_N_ACTION.SaveBonus",
    icon: "fa-solid fa-hand-sparkles",
    defaultImg: "systems/dnd5e/icons/svg/trait-damage-resistances.svg"
  }, {inplace: false}));

  /* -------------------------------------------------- */

  /** @override */
  static _defineBaseSchema() {
    const schema = super._defineBaseSchema();
    schema.type = new StringField({
      required: true,
      readonly: true,
      initial: "save"
    });
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    "BUILD_N_ACTION.SAVE"
  ];

  /* -------------------------------------------------- */

  /** @override */
  static _defineBonusSchema() {
    return {
      ...super._defineBonusSchema(),
      bonus: new StringField({required: true})
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static _defineFilterSchema() {
    return {
      ...super._defineFilterSchema(),
      saveAbilities: new fields.saveAbilities()
    };
  }
}

class ThrowBonus extends ContextualBonus {
  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    label: "BUILD_N_ACTION.ThrowBonus",
    icon: "fa-solid fa-person-falling-burst",
    defaultImg: "systems/dnd5e/icons/svg/trait-saves.svg"
  }, {inplace: false}));

  /* -------------------------------------------------- */

  /** @override */
  static _defineBaseSchema() {
    const schema = super._defineBaseSchema();
    schema.type = new StringField({
      required: true,
      readonly: true,
      initial: "throw"
    });
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    "BUILD_N_ACTION.THROW"
  ];

  /* -------------------------------------------------- */

  /** @override */
  static _defineBonusSchema() {
    return {
      ...super._defineBonusSchema(),
      bonus: new StringField({required: true}),
      targetValue: new StringField({required: true}),
      deathSaveCritical: new StringField({required: true})
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static _defineFilterSchema() {
    return {
      ...super._defineFilterSchema(),
      creatureTypes: new fields.creatureTypes(),
      proficiencyLevels: new fields.proficiencyLevels(),
      targetEffects: new fields.targetEffects(),
      throwTypes: new fields.throwTypes()
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  get hasPropertyBonuses() {
    return !!this.bonuses.targetValue || !!this.bonuses.deathSaveCritical;
  }
}

class TestBonus extends ContextualBonus {
  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    label: "BUILD_N_ACTION.TestBonus",
    icon: "fa-solid fa-bolt",
    defaultImg: "systems/dnd5e/icons/svg/trait-skills.svg"
  }, {inplace: false}));

  /* -------------------------------------------------- */

  /** @override */
  static _defineBaseSchema() {
    const schema = super._defineBaseSchema();
    schema.type = new StringField({
      required: true,
      readonly: true,
      initial: "test"
    });
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    "BUILD_N_ACTION.TEST"
  ];

  /* -------------------------------------------------- */

  /** @override */
  static _defineBonusSchema() {
    return {
      ...super._defineBonusSchema(),
      bonus: new StringField({required: true})
    };
  }

  /* -------------------------------------------------- */

  /** @override */
  static _defineFilterSchema() {
    return {
      ...super._defineFilterSchema(),
      abilities: new fields.abilities(),
      baseTools: new fields.baseTools(),
      proficiencyLevels: new fields.proficiencyLevels(),
      skillIds: new fields.skillIds()
    };
  }
}

class HitDieBonus extends ContextualBonus {
  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    label: "BUILD_N_ACTION.HitdieContextualBonus",
    icon: "fa-solid fa-heart-pulse",
    defaultImg: "systems/dnd5e/icons/svg/hit-points.svg"
  }, {inplace: false}));

  /* -------------------------------------------------- */

  /** @override */
  static _defineBaseSchema() {
    const schema = super._defineBaseSchema();
    schema.type = new StringField({
      required: true,
      readonly: true,
      initial: "hitdie"
    });
    return schema;
  }

  /* -------------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    "BUILD_N_ACTION.HITDIE"
  ];

  /* -------------------------------------------------- */

  /** @override */
  static _defineBonusSchema() {
    return {
      ...super._defineBonusSchema(),
      bonus: new StringField({required: true}),
      modifiers: new EmbeddedDataField(ModifiersModel)
    };
  }
}

var contextualBonuses = {
  attack: AttackBonus,
  damage: DamageBonus,
  hitdie: HitDieBonus,
  save: SaveBonus,
  test: TestBonus,
  throw: ThrowBonus
};

const {Collection} = foundry.utils;

/**
 * Simple class for holding onto bonuses in a structured manner depending on their type and effect.
 * @param {Iterable<ContextualBonus>} bonuses     The bonuses to structure.
 */
class BonusCollection {
  constructor(bonuses) {
    this.#bonuses = bonuses;
  }

  /* -------------------------------------------------- */

  /**
   * The bonuses to structure.
   * @type {Iterable<ContextualBonus>}
   */
  #bonuses = null;

  /* -------------------------------------------------- */

  /**
   * Reference to the size of the collection, regardless of type of iterator.
   * @type {number}
   */
  get size() {
    return this.all.size;
  }

  /* -------------------------------------------------- */

  /**
   * All the bonuses regardless of bonus, type, or modifiers.
   * @type {Collection<string, ContextualBonus>}
   */
  get all() {
    if (!this.#all) {
      const collection = new Collection();
      for (const bonus of this.#bonuses) {
        collection.set(bonus.uuid, bonus);
      }
      this.#all = collection;
    }
    return this.#all;
  }

  /* -------------------------------------------------- */

  /**
   * All the bonuses regardless of bonus, type, or modifiers.
   * @type {Collection<string, ContextualBonus>}
   */
  #all = null;

  /* -------------------------------------------------- */

  /**
   * All the bonuses that are just reminders.
   * @type {Collection<string, ContextualBonus>}
   */
  get reminders() {
    if (!this.#reminders) {
      const collection = new Collection();
      for (const bonus of this.#bonuses) {
        if (bonus.isReminder) collection.set(bonus.uuid, bonus);
      }
      this.#reminders = collection;
    }
    return this.#reminders;
  }

  /* -------------------------------------------------- */

  /**
   * All the bonuses that are just reminders.
   * @type {Collection<string, ContextualBonus>}
   */
  #reminders = null;

  /* -------------------------------------------------- */

  /**
   * All the bonuses that have dice modifiers.
   * @type {Collection<string, ContextualBonus>}
   */
  get modifiers() {
    if (!this.#modifiers) {
      const collection = new Collection();
      for (const bonus of this.#bonuses) {
        if (bonus.hasDiceModifiers) collection.set(bonus.uuid, bonus);
      }
      this.#modifiers = collection;
    }
    return this.#modifiers;
  }

  /* -------------------------------------------------- */

  /**
   * All the bonuses that have dice modifiers.
   * @type {Collection<string, ContextualBonus>}
   */
  #modifiers = null;

  /* -------------------------------------------------- */

  /**
   * All the bonuses that are optional.
   * @type {Collection<string, ContextualBonus>}
   */
  get optionals() {
    if (!this.#optionals) {
      const collection = new Collection();
      for (const bonus of this.#bonuses) {
        if (bonus.isOptional) collection.set(bonus.uuid, bonus);
      }
      this.#optionals = collection;
    }
    return this.#optionals;
  }

  /* -------------------------------------------------- */

  /**
   * All the bonuses that are optional.
   * @type {Collection<string, ContextualBonus>}
   */
  #optionals = null;

  /* -------------------------------------------------- */

  /**
   * All the bonuses that apply immediately with no configuration.
   * @type {Collection<string, ContextualBonus>}
   */
  get nonoptional() {
    if (!this.#nonoptional) {
      const collection = new Collection();
      for (const bonus of this.#bonuses) {
        if (bonus.isOptional || bonus.isReminder) continue;
        if (bonus.hasBonuses) collection.set(bonus.uuid, bonus);
      }
      this.#nonoptional = collection;
    }
    return this.#nonoptional;
  }

  /* -------------------------------------------------- */

  /**
   * All the bonuses that apply immediately with no configuration.
   * @type {Collection<string, ContextualBonus>}
   */
  #nonoptional = null;
}

const EMBEDDABLE_DOCUMENT_TYPES = new Set(["Actor", "Item", "ActiveEffect", "Region"]);

/** @param {Document|object|null} document */
function isEmbeddableDocument(document) {
  return EMBEDDABLE_DOCUMENT_TYPES.has(document?.documentName);
}

/**
 * Create a contextual bonus in memory.
 *
 * @param {object} data
 * @param {Document|null} [parent]
 * @returns {ContextualBonus}
 */
function createBonus(data, parent = null) {
  if (!data || !(data.type in contextualBonuses)) throw new Error("INVALID BUILD_N_ACTION TYPE.");
  const source = {...data, id: foundry.utils.randomID()};
  return new contextualBonuses[source.type](source, {parent});
}

/**
 * Construct the collection of bonuses stored on a document.
 *
 * @param {Document} document
 * @returns {Collection<ContextualBonus>}
 */
function getCollection(document) {
  const contents = [];
  for (const bonusData of getStoredBonusData(document)) {
    try {
      if (!foundry.data.validators.isValidId(bonusData.id)) continue;
      const BonusModel = contextualBonuses[bonusData.type];
      if (!BonusModel) continue;
      const bonus = new BonusModel(bonusData, {parent: document});
      contents.push([bonus.id, bonus]);
    } catch (error) {
      console.warn(error);
    }
  }
  return new foundry.utils.Collection(contents);
}

/**
 * Return embedded documents that contain contextual bonuses.
 *
 * @param {Document} document
 * @returns {object}
 */
function findEmbeddedDocumentsWithBonuses(document) {
  const documents = {};
  for (const [, embedded] of document.traverseEmbeddedDocuments()) {
    const collection = embedded.constructor.metadata.collection;
    documents[collection] ??= [];
    if (getCollection(embedded).size) documents[collection].push(embedded);
  }
  return documents;
}

/**
 * Persist a contextual bonus on a document.
 *
 * @param {Document} document
 * @param {ContextualBonus} bonus
 * @param {object} [options]
 * @param {boolean} [options.renderSheet]
 * @returns {Promise<Document|string|null>}
 */
async function embedBonus(document, bonus, {renderSheet = true, ...options} = {}) {
  if (!isEmbeddableDocument(document)) {
    throw new Error("The document provided is not a valid document type for Build-n-Action!");
  }
  if (!Object.values(contextualBonuses).some(Model => bonus instanceof Model)) return null;

  const id = await persistBonus(document, bonus);
  if (renderSheet) await getCollection(document).get(id).sheet.render({force: true});
  return options.bonusId ? id : document;
}

/**
 * Duplicate an embedded contextual bonus.
 *
 * @param {ContextualBonus} bonus
 * @returns {Promise<ContextualBonus>}
 */
async function duplicateBonus(bonus) {
  const data = bonus.toObject();
  data.name = game.i18n.format("BUILD_N_ACTION.BonusCopy", {name: data.name});
  const duplicate = new bonus.constructor(data, {parent: bonus.parent});
  const id = await embedBonus(bonus.parent, duplicate, {bonusId: true});
  return getCollection(bonus.parent).get(id);
}

/** @param {string} uuid */
async function fromUuid(uuid) {
  try {
    const {parentUuid, id} = splitUuid(uuid);
    const parent = await globalThis.fromUuid(parentUuid);
    return getCollection(parent).get(id) ?? null;
  } catch {
    return null;
  }
}

/** @param {string} uuid */
function fromUuidSync$1(uuid) {
  try {
    const {parentUuid, id} = splitUuid(uuid);
    const parent = globalThis.fromUuidSync(parentUuid);
    return getCollection(parent).get(id) ?? null;
  } catch {
    return null;
  }
}

async function persistBonus(document, bonus) {
  const data = bonus.toObject();
  for (const id of Object.keys(data.filters)) {
    if (!fields[id].storage(bonus)) delete data.filters[id];
  }
  data.id = foundry.utils.randomID();

  const collection = getCollection(document);
  collection.delete(data.id);
  const stored = collection.map(entry => entry.toObject());
  stored.push(data);
  await document.setFlag(MODULE.ID, "bonuses", stored);
  return data.id;
}

function splitUuid(uuid) {
  const parts = uuid.split(".");
  const id = parts.pop();
  parts.pop();
  return {parentUuid: parts.join("."), id};
}

/**
 * A helper class that collects and then hangs onto the bonuses for one particular
 * roll. The bonuses are filtered here only with regards to:
 * - aura blockers, aura range, aura disposition
 * - the hidden state of tokens
 * - the hidden state of measured templates
 * - item exclusivity (buildNAction being item-only)
 * - item attunement/equipped state (isSuppressed)
 * - effects being unavailable
 */
class BonusCollector {
  constructor({activity, item, actor, type}) {
    this.activity = activity;
    this.item = item;
    this.actor = actor;
    this.type = type;

    // Set up canvas elements.
    this.token = this.actor.token?.object ?? this.actor.getActiveTokens()[0];
    if (this.token) this.tokenCenters = this.constructor._collectTokenCenters(this.token);

    this.bonuses = this._collectBonuses();
  }

  /* -------------------------------------------------- */

  /**
   * The type of bonuses being collected.
   * @type {string}
   */
  type = null;

  /* -------------------------------------------------- */

  /**
   * Collected bonuses.
   * @type {ContextualBonus[]}
   */
  bonuses = [];

  /* -------------------------------------------------- */

  /**
   * The activity being used.
   * @type {Activity|null}
   */
  activity = null;

  /* -------------------------------------------------- */

  /**
   * The item performing the roll, if any.
   * @type {Item5e|null}
   */
  item = null;

  /* -------------------------------------------------- */

  /**
   * The actor performing the roll or owning the item performing the roll.
   * @type {Actor5e}
   */
  actor = null;

  /* -------------------------------------------------- */

  /**
   * The token object of the actor performing the roll, if any.
   * @type {Token5e|null}
   */
  token = null;

  /* -------------------------------------------------- */

  /**
   * Center points of all occupied grid spaces of the token placeable.
   * @type {object[]}
   */
  tokenCenters = [];

  /* -------------------------------------------------- */

  /**
   * Token documents on the same scene which are valid, not a group, and not the same token.
   * @type {TokenDocument5e[]}
   */
  tokens = [];

  /* -------------------------------------------------- */

  /**
   * Reference to auras that are to be drawn later.
   * @type {Set<TokenAura>}
   */
  auras = new Set();

  /* -------------------------------------------------- */

  /**
   * A method that can be called at any point to retrieve the bonuses hung on to.
   * This returns a collection of uuids mapping to bonuses due to ids not necessarily changing.
   * @returns {Collection<ContextualBonus>}     The collection of bonuses.
   */
  returnBonuses() {
    return new foundry.utils.Collection(this.bonuses.map(b => [b.uuid, b]));
  }

  /* -------------------------------------------------- */

  /**
   * Main collection method that calls the below collectors for self, all tokens, and all templates.
   * This method also ensures that overlapping templates from one item do not apply twice.
   * @returns {ContextualBonus[]}
   */
  _collectBonuses() {
    const bonuses = {
      actor: this._collectFromSelf(),
      token: [],
      template: [],
      regions: []
    };

    // Token and template auras.
    if (this.token) {

      // Collect token auras.
      const _uuids = new Set();
      for (const token of this.token.scene.tokens) {
        if (token.actor && (token.actor.type !== "group") && (token !== this.token.document) && !token.hidden) {
          if (_uuids.has(token.actor.uuid)) continue;
          bonuses.token.push(...this._collectFromToken(token));
          _uuids.add(token.actor.uuid);
        }
      }

      // Special consideration for templates; allow overlapping without stacking the same bonus.
      const map = new Map();
      for (const template of this.token.scene.templates) {
        const boni = this._collectFromTemplate(template);
        for (const b of boni) map.set(`${b.item.uuid}.ContextualBonus.${b.id}`, b);
      }
      bonuses.template.push(...map.values());

      // Collection from scene regions.
      for (const region of this.token.document.regions) {
        const collected = this._collectFromRegion(region);
        bonuses.regions.push(...collected);
      }
    }

    return bonuses.actor.concat(bonuses.token).concat(bonuses.template).concat(bonuses.regions);
  }

  /* -------------------------------------------------- */

  /**
   * Destroy all auras that were created and drawn during this collection.
   */
  destroyAuras() {
    for (const aura of this.auras) aura.destroy({fadeOut: true});
  }

  /* -------------------------------------------------- */

  /**
   * Get all bonuses that originate from yourself.
   * @returns {ContextualBonus[]}     The array of bonuses.
   */
  _collectFromSelf() {

    // A filter for discarding blocked or suppressed auras, template auras, and auras that do not affect self.
    const validSelfAura = (bab) => {
      return !bab.aura.isTemplate && bab.aura.isAffectingSelf;
    };

    const enchantments = [];
    if (this.item) {
      for (const effect of this.item.allApplicableEffects()) {
        if (effect.active) enchantments.push(...this._collectFromDocument(effect, [validSelfAura]));
      }
    }

    const actor = this._collectFromDocument(this.actor, [validSelfAura]);
    const items = this.actor.items.reduce((acc, item) => acc.concat(this._collectFromDocument(item, [validSelfAura])), []);
    const effects = this.actor.appliedEffects.reduce((acc, effect) => acc.concat(this._collectFromDocument(effect, [validSelfAura])), []);
    return [...enchantments, ...actor, ...items, ...effects];
  }

  /* -------------------------------------------------- */

  /**
   * Get all bonuses that originate from another token on the scene.
   * @param {TokenDocument5e} token     The token.
   * @returns {ContextualBonus[]}               The array of aura bonuses that apply.
   */
  _collectFromToken(token) {
    const bonuses = [];

    const checker = (object) => {
      const collection = getCollection(object);
      for (const bonus of collection) {
        if (this.type !== bonus.type) continue; // discard bonuses of the wrong type.
        if (!bonus.aura.isActiveTokenAura) continue; // discard blocked and suppressed auras.
        if (bonus.aura.isTemplate) continue; // discard template auras.
        if (!this._matchTokenDisposition(token, bonus)) continue; // discard invalid targeting bonuses.
        if (!this._generalFilter(bonus)) continue;

        // Skip creating pixi auras for infinite-range auras.
        if (bonus.aura.range === -1) {
          bonuses.push(bonus);
        } else {
          const aura = createTokenAura(token, bonus);
          aura.initialize(this.token);
          if (aura.isApplying) bonuses.push(bonus);
          this.auras.add(aura);
        }
      }
    };

    checker(token.actor);
    for (const item of token.actor.items) checker(item);
    for (const effect of token.actor.appliedEffects) checker(effect);

    return bonuses;
  }

  /* -------------------------------------------------- */

  /**
   * Get all bonuses that originate from templates the rolling token is standing on.
   * @param {MeasuredTemplateDocument} template     The template.
   * @returns {ContextualBonus[]}                           The array of bonuses.
   */
  _collectFromTemplate(template) {
    if (template.hidden) return [];
    if (!this._tokenWithinTemplate(template.object)) return [];

    // A filter for discarding template auras that are blocked or do not affect self (if they are your own).
    const templateAuraChecker = (bab) => {
      if (bab.aura.isBlocked) return false;
      const isOwn = this.token.actor === bab.actor;
      if (isOwn) return bab.aura.self;
      return this._matchTemplateDisposition(template, bab);
    };

    const templates = this._collectFromDocument(template, [templateAuraChecker]);
    return templates;
  }

  /* -------------------------------------------------- */

  /**
   * Collect bonuses from a scene region the token is standing in.
   * @param {RegionDocument} region     The region.
   * @returns {ContextualBonus[]}               The array of bonuses.
   */
  _collectFromRegion(region) {
    return this._collectFromDocument(region, []);
  }

  /* -------------------------------------------------- */

  /**
   * General collection method that all other collection methods call in some fashion.
   * Gets an array of Build-n-Action bonuses from that document.
   * @param {Document5e} document          The token, actor, item, effect, or template.
   * @param {function[]} [filterings]      An array of additional functions used to filter.
   * @returns {ContextualBonus[]}                  An array of Build-n-Action bonuses of the right type.
   */
  _collectFromDocument(document, filterings = []) {
    const bonuses = getCollection(document).reduce((acc, bonus) => {
      if (this.type !== bonus.type) return acc;
      if (!this._generalFilter(bonus)) return acc;
      for (const fn of filterings) if (!fn(bonus)) return acc;
      acc.push(bonus);
      return acc;
    }, []);
    return bonuses;
  }

  /* -------------------------------------------------- */

  /**
   * Some general filters that apply no matter where the buildNAction is located.
   * @param {ContextualBonus} bonus     A buildNAction to evaluate.
   * @returns {boolean}         Whether the bonus should be retained.
   */
  _generalFilter(bonus) {
    if (!bonus.enabled) return false;
    if (bonus.isSuppressed) return false;

    // Filter for exclusivity.
    if (!bonus.isExclusive) return true;
    const item = bonus.item;
    return item ? (this.item?.uuid === item.uuid) : true;
  }

  /* -------------------------------------------------- */

  /**
   * Get the centers of all grid spaces that overlap with a token document.
   * @param {Token5e} token     The token document on the scene.
   * @returns {object[]}        An array of xy coordinates.
   */
  static _collectTokenCenters(token) {
    const points = [];
    const shape = token.shape;
    const [i, j, i1, j1] = canvas.grid.getOffsetRange(token.bounds);
    const delta = (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) ? canvas.dimensions.size : 1;
    const offset = (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) ? canvas.dimensions.size / 2 : 0;
    for (let x = i; x < i1; x += delta) {
      for (let y = j; y < j1; y += delta) {
        const point = canvas.grid.getCenterPoint({i: x + offset, j: y + offset});
        const p = {
          x: point.x - token.document.x,
          y: point.y - token.document.y
        };
        if (shape.contains(p.x, p.y)) points.push(point);
      }
    }
    return points;
  }

  /* -------------------------------------------------- */

  /**
   * Get whether the rolling token has any grid center within a given template.
   * @param {MeasuredTemplate} template     A measured template placeable.
   * @returns {boolean}                     Whether the rolling token is contained.
   */
  _tokenWithinTemplate(template) {
    const {shape, x: tx, y: ty} = template;
    return this.tokenCenters.some(({x, y}) => shape.contains(x - tx, y - ty));
  }

  /* -------------------------------------------------- */

  /**
   * Get whether an aura can target the rolling actor's token depending on its targeting.
   * @param {TokenDocument5e} token     The token on whom the aura was found.
   * @param {ContextualBonus} bonus             The buildNAction with the aura.
   * @returns {boolean}                 Whether the bonus can apply.
   */
  _matchTokenDisposition(token, bonus) {
    const tisp = token.disposition;
    const bisp = bonus.aura.disposition;
    return this._matchDisposition(tisp, bisp);
  }

  /* -------------------------------------------------- */

  /**
   * Get whether a template aura can target the contained token depending on its targeting.
   * @param {MeasuredTemplateDocument} template   The containing template.
   * @param {ContextualBonus} bonus                       The buildNAction with the aura.
   * @returns {boolean}                           Whether the bonus can apply.
   */
  _matchTemplateDisposition(template, bonus) {
    const tisp = template.flags[MODULE.ID]?.templateDisposition;
    const bisp = bonus.aura.disposition;
    return this._matchDisposition(tisp, bisp);
  }

  /* -------------------------------------------------- */

  /**
   * Given a disposition of a template/token and the targeting of of an aura, get whether the aura should apply.
   * @param {number} tisp   Token or template disposition.
   * @param {number} bisp   The targeting disposition of a buildNAction.
   * @returns {boolean}     Whether the targeting applies.
   */
  _matchDisposition(tisp, bisp) {
    if (bisp === 2) { // any
      // If the bonus targets everyone, immediately return true.
      return true;
    } else if (bisp === 1) { // allies
      // If the bonus targets allies, the roller and the source must match.
      return tisp === this.token.document.disposition;
    } else if (bisp === -1) { // enemies
      // If the bonus targets enemies, the roller and the source must have opposite dispositions.
      const modes = CONST.TOKEN_DISPOSITIONS;
      const set = new Set([tisp, this.token.document.disposition]);
      return set.has(modes.FRIENDLY) && set.has(modes.HOSTILE);
    }
  }
}

/* -------------------------------------------------- */

/**
 * Remove bonuses that fail any configured filter.
 *
 * Evaluation short-circuits on the first failed filter so custom scripts and
 * expensive target checks never run for an already rejected bonus.
 *
 * @param {Map<string, ContextualBonus>} bonuses
 * @param {Record<string, Function>} filterRegistry
 * @param {object} subjects
 * @param {object} details
 * @returns {Map<string, ContextualBonus>}
 */
function evaluateBonusFilters(bonuses, filterRegistry, subjects, details) {
  for (const [key, bonus] of bonuses.entries()) {
    for (const [filterId, value] of Object.entries(bonus.filters)) {
      const filter = filterRegistry[filterId];
      if (!filter) {
        bonuses.delete(key);
        break;
      }
      if (filter.call(bonus, subjects, value, details)) continue;
      bonuses.delete(key);
      break;
    }
  }
  return bonuses;
}

function firstTarget(targets) {
  if (!targets) return null;
  if (typeof targets.first === "function") return targets.first() ?? null;
  return targets[Symbol.iterator]?.().next().value ?? null;
}

/**
 * Resolve the target used while evaluating a roll.
 * @param {object} rollConfig       Current dnd5e roll configuration.
 * @param {object} [options]
 * @param {boolean} [options.preferHitTargets]  Prefer confirmed Midi hits for damage rolls.
 * @param {Iterable} [options.userTargets]      Current Foundry user targets.
 * @returns {Token|null}
 */
function resolveRollTarget(rollConfig = {}, {
  preferHitTargets = false,
  userTargets = globalThis.game?.user?.targets
} = {}) {
  const workflow = rollConfig.workflow ?? rollConfig.midiOptions?.workflow;
  const hasWorkflowTargets = workflow && (("targets" in Object(workflow)) || ("hitTargets" in Object(workflow)));
  if (hasWorkflowTargets) {
    if (preferHitTargets) {
      const hitTarget = firstTarget(workflow.hitTargets);
      if (hitTarget) return hitTarget;
    }
    return firstTarget(workflow.targets);
  }
  return firstTarget(userTargets);
}

/**
 * Resolve the target already attached to a filtering subject, falling back to
 * native Foundry targeting only for callers which have no explicit roll context.
 * @param {object} subjects          Filtering subjects.
 * @param {Iterable} userTargets    Current Foundry user targets.
 * @returns {Token|null}
 */
function resolveSubjectTarget(subjects = {}, userTargets = globalThis.game?.user?.targets) {
  if (Object.hasOwn(subjects, "target")) return subjects.target ?? null;
  return firstTarget(userTargets);
}

const AURA_CLEANUP_DELAY_MS = 2000;

/**
 * @typedef {object} SubjectConfig
 * @property {Activity} [activity]      The activity that was used.
 * @property {Item5e} [item]            The item whose activity was used.
 * @property {Actor5e} actor            The actor performing a roll or using an item.
 * @property {Token5e|null} [target]     The authoritative target for this roll.
 */

/* -------------------------------------------------- */

/**
 * @typedef {object} DetailsConfig
 * @property {string} [ability]               If a saving throw, the ability used.
 * @property {boolean} [isConcentration]      If a saving throw, whether this is for concentration.
 * @property {boolean} [isDeath]              If a saving throw, whether this is a death save.
 *
 * @property {string} [abilityId]             If an ability check, the ability used.
 * @property {string} [skillId]               If a skill check, the id of the skill.
 * @property {string} [toolId]                If a tool check, the id of the tool type.
 *
 * @property {number} [spellLevel]            The level of the spell, when available.
 * @property {string} [attackMode]            If a damage roll, the attack mode.
 */

/* -------------------------------------------------- */

/**
 * @param {SubjectConfig} subjects      Subject config.
 * @param {string} type                 The type of roll.
 * @param {DetailsConfig} details       Details config.
 * @returns {BonusCollection}           The filtered Collection.
 */
function _check(subjects, type, details) {
  const collector = new BonusCollector({...subjects, type: type});
  const bonuses = collector.returnBonuses();
  const filtered = _finalFilterBonuses(type, bonuses, subjects, details);
  setTimeout(() => collector.destroyAuras(), AURA_CLEANUP_DELAY_MS);
  return new BonusCollection(filtered);
}

/* -------------------------------------------------- */

/**
 * Initiate the collection and filtering of bonuses applying to hit die rolls.
 * @param {SubjectConfig} subjects      Subject config.
 * @returns {BonusCollection}           The filtered Collection.
 */
function hitDieCheck(subjects) {
  return _check(subjects, "hitdie", {});
}

/* -------------------------------------------------- */

/**
 * Initiate the collection and filtering of bonuses applying to saving throws.
 * @param {SubjectConfig} subjects      Subject config.
 * @param {DetailsConfig} details       Details config.
 * @returns {BonusCollection}           The filtered Collection.
 */
function throwCheck(subjects, details) {
  return _check(subjects, "throw", details);
}

/* -------------------------------------------------- */

/**
 * Initiate the collection and filtering of bonuses applying to ability checks.
 * @param {SubjectConfig} subjects      Subject config.
 * @param {DetailsConfig} details       Details config.
 * @returns {BonusCollection}           The filtered Collection.
 */
function testCheck(subjects, details) {
  return _check(subjects, "test", details);
}

/* -------------------------------------------------- */

/**
 * Initiate the collection and filtering of bonuses applying to attack rolls, damage rolls, and save DCs.
 * @param {SubjectConfig} subjects      Subject config.
 * @param {string} hookType             The type of hook ('attack', 'damage', or 'save').
 * @param {DetailsConfig} details       Details config.
 * @returns {BonusCollection}           The filtered Collection.
 */
function itemCheck(subjects, hookType, details) {
  return _check(subjects, hookType, details);
}

/* -------------------------------------------------- */

/**
 * Filters the Collection of bonuses using the filters of ContextualBonus.
 * @param {string} hookType                 The type of hook being executed ('attack', 'damage',
 *                                          'save', 'throw', 'test', 'hitdie').
 * @param {Collection<ContextualBonus>} bonuses     The Build-n-Action bonuses to filter. **will be mutated**
 * @param {SubjectConfig} subjects          Subject config.
 * @param {DetailsConfig} details           Details config.
 * @returns {Collection<ContextualBonus>}           The filtered Collection.
 */
function _finalFilterBonuses(hookType, bonuses, subjects, details) {
  /**
   * A hook that is called before the collection of bonuses has been filtered.
   * @param {Collection<ContextualBonus>} bonuses     The collection of bonuses, before filtering.
   * @param {SubjectConfig} subjects          Subject config.
   * @param {DetailsConfig} details           Details config.
   * @param {string} hookType                 The type of hook being executed ('attack', 'damage',
   *                                          'save', 'throw', 'test', 'hitdie').
   */
  Hooks.callAll(`${MODULE.ID}.preFilterBonuses`, bonuses, subjects, details, hookType);

  evaluateBonusFilters(bonuses, filters, subjects, details);

  _replaceRollDataOfBonuses(bonuses, subjects);

  /**
   * A hook that is called after the collection of bonuses has been filtered.
   * @param {Collection<ContextualBonus>} bonuses     The array of bonuses, after filtering.
   * @param {SubjectConfig} subjects          Subject config.
   * @param {DetailsConfig} details           Details config.
   * @param {string} hookType                 The type of hook being executed ('attack', 'damage',
   *                                          'save', 'throw', 'test', 'hitdie').
   */
  Hooks.callAll(`${MODULE.ID}.filterBonuses`, bonuses, subjects, details, hookType);

  return bonuses;
}

/* -------------------------------------------------- */

/**
 * Replace roll data of bonuses that originate from foreign sources, including transferred effects.
 * @param {Collection<ContextualBonus>} bonuses     A collection of Build-n-Action bonuses whose data to replace.
 * @param {SubjectConfig} subjects          Subject config.
 */
function _replaceRollDataOfBonuses(bonuses, {activity, item, actor}) {
  for (const bonus of bonuses) {
    // Do not replace roll data of optional bonuses as this is done later.
    if (bonus.isOptional) continue;

    const src = bonus.origin;

    // Don't bother if the origin could not be found.
    if (!src) continue;

    // Don't bother with different roll data if the origin is the current actor rolling.
    if (src.uuid === actor.uuid) continue;

    // Don't bother with different roll data if the origin is the item being rolled.
    if (src.uuid === item?.uuid) continue;

    // Foreign-source bonuses must resolve formulas against their origin's roll data.
    const data = src.getRollData();

    const update = Object.entries(bonus.bonuses).reduce((acc, [key, val]) => {
      if (!val || (typeof val !== "string")) return acc;
      acc[key] = Roll.replaceFormulaData(val, data, {missing: 0});
      return acc;
    }, {});
    try {
      bonus.updateSource({bonuses: update});
    } catch (err) {
      console.warn("ContextualBonus | Issue updating bonus data:", err);
    }
  }
}

/* -------------------------------------------------- */

/**
 * Split a set into 'included' and 'excluded'.
 * @param {Set<string>} filter      The set of strings, some with '!' prefixed.
 * @returns {object}                An object with two sets of strings.
 */
function _splitExclusion(filter) {
  const rgx = /([!]+)?(.+)/;
  const data = filter.reduce((acc, str) => {
    const [, bangs, string] = str.match(rgx) ?? [];
    if (!string) return acc;
    if (bangs) acc.excluded.add(string);
    else acc.included.add(string);
    return acc;
  }, {included: new Set(), excluded: new Set()});
  return data;
}

/* -------------------------------------------------- */

/**
 * Utility function to split a string by '/'.
 * @param {string} str        The string to split.
 * @returns {Set<string>}     The set of strings.
 */
function _split(str) {
  str ||= "";
  return str.split("/").reduce((acc, e) => {
    const trim = e.trim().toLowerCase();
    if (trim.length) acc.add(trim);
    return acc;
  }, new Set());
}

/* -------------------------------------------------- */

/**
 * Utility function to split racial values.
 * @param {Actor5e} actor     The actor.
 * @returns {Set<string>}     The different 'races' to compare against.
 */
function _splitRaces(actor) {
  let races = new Set();

  /**
   * Find the type object on the actor to read from. We prefer the actor data,
   * since that is subject to effects and later changes, while the race item is not.
   */
  const type = actor.system.details?.type;

  if (type) {
    races = _split(type.subtype);
    if (type.value === "custom") _split(type.custom).forEach(k => races.add(k));
    else races.add(type.value);
  }
  return races;
}

/* -------------------------------------------------- */

/**
 * Return whether a set of values overlaps a non-empty set of required values,
 * while also not overlapping a non-empty set of excluded values.
 * @param {Set<*>} values       The current values.
 * @param {Set<*>} included     Required values.
 * @param {Set<*>} excluded     Excluded values.
 * @returns {boolean}           Result of the test.
 */
function _testInclusion(values, included, excluded) {
  if (included.size && !included.intersects(values)) return false;
  if (excluded.size && excluded.intersects(values)) return false;
  return true;
}

/* -------------------------------------------------- */
/*   Filtering functions                              */
/* -------------------------------------------------- */

const filters = {
  abilities,
  actorCreatureSizes,
  actorCreatureTypes,
  actorLanguages,
  arbitraryComparisons,
  attackModes,
  baseArmors,
  baseTools,
  baseWeapons,
  creatureTypes,
  customScripts,
  damageTypes,
  featureTypes,
  healthPercentages,
  identifiers,
  itemTypes,
  markers,
  preparationModes,
  proficiencyLevels,
  remainingSpellSlots,
  saveAbilities,
  skillIds,
  sourceClasses,
  spellComponents,
  spellLevels,
  spellSchools,
  statusEffects,
  targetArmors,
  targetEffects,
  throwTypes,
  tokenSizes,
  weaponProperties
};

/* -------------------------------------------------- */

/**
 * Find out if the item is using one of the abilities in the filter. Consideration is made
 * by the system itself for items set to 'Default' to look for finesse weapons and spellcasting
 * abilities. Note that this is the ability set at the top level of the item's action, and
 * is NOT the ability used to determine the dc of the saving throw.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of abilities.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the actor or item is using one of the abilities.
 */
function abilities(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  let abi;

  // Case 1: Tool Checks.
  if (details.toolId) abi = details.abilityId;

  // Case 2: Attack/Damage rolls.
  else if (subjects.activity) abi = subjects.activity.ability;

  // Case 3: AbilityTest or Skill.
  else if (subjects.actor) abi = details.abilityId;

  if (!abi) return false;

  // Test the filters.
  return _testInclusion(new Set([abi]), included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the actor is one of the correct creature sizes.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of valid creature sizes.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the actor is a correct creature size.
 */
function actorCreatureSizes(subjects, filter, details) {
  if (!filter.size) return true;
  const size = subjects.actor.system.traits?.size;
  return !!size && filter.has(size);
}

/* -------------------------------------------------- */

/**
 * Find out if the rolling actor is one of the included creature etypes and none of the excluded types.
 * In the case of no values, refer to whether any specific creature type was included.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of creature types the rolling actor must or must not be.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the rolling actor is of a valid creature type.
 */
function actorCreatureTypes(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  const ad = subjects.actor.system.details;
  if (!ad) return !included.size;

  // All the races the rolling actor is a member of.
  const races = _splitRaces(subjects.actor);

  return _testInclusion(races, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the actor speaks one of the included languages while not any of the excluded languages.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of languages the actor must speak or not speak.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}
 */
function actorLanguages(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);

  const values = subjects.actor.system.traits?.languages?.value;
  if (!values) return false;

  const speaksAny = included.some(lang => speaksLanguage(subjects.actor, lang));
  if (included.size && !speaksAny) return false;

  if (!excluded.size) return true;

  // If e.g. "standard" is excluded, the actor must not be able to speak "dwarvish".
  for (const k of values) {
    const nodes = new Set(proficiencyTree(k, "languages"));
    if (nodes.intersects(excluded)) return false;
  }
  return true;
}

/* -------------------------------------------------- */

/**
 * Find out if 'one' and 'other have the correct relationship for each of the comparisons.
 * If 'one' and 'other' do not both evaluate to numbers, string comparison is instead used.
 * For string comparison, inequality operators are taken to mean substrings. The comparisons
 * are done after replacing any roll data.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects        Subject config.
 * @param {object[]} filter               An array of objects with 'one', 'other', and 'operator'.
 * @param {string} filter[].one           One value to compare against another.
 * @param {string} filter[].other         One value to compare against another.
 * @param {string} filter[].operator      The kind of comparison to make between the two values.
 * @param {DetailsConfig} details         Details config.
 * @returns {boolean}                     Whether every comparison were in the correct relationship.
 */
function arbitraryComparisons(subjects, filter, details) {
  if (!filter.length) return true;

  const rollData = (subjects.activity ?? subjects.item ?? subjects.actor).getRollData();
  const target = resolveSubjectTarget(subjects);
  if (target?.actor) rollData.target = target.actor.getRollData();

  for (const {one, other, operator} of filter) {
    // This method immediately returns false if invalid data somehow.
    if (!one || !other) return false;

    const left = Roll.replaceFormulaData(one, rollData);
    const right = Roll.replaceFormulaData(other, rollData);

    try {
      // try comparing numbers.
      const nLeft = Roll.create(left).evaluateSync().total;
      const nRight = Roll.create(right).evaluateSync().total;
      if ((operator === "EQ") && !(nLeft === nRight)) return false;
      else if ((operator === "LT") && !(nLeft < nRight)) return false;
      else if ((operator === "GT") && !(nLeft > nRight)) return false;
      else if ((operator === "LE") && !(nLeft <= nRight)) return false;
      else if ((operator === "GE") && !(nLeft >= nRight)) return false;
    } catch {
      // try comparing strings.
      if ((operator === "EQ") && !(left == right)) return false;
      else if (["LT", "LE"].includes(operator) && !(right.includes(left))) return false;
      else if (["GT", "GE"].includes(operator) && !(left.includes(right))) return false;
    }
  }
  return true;
}

/* -------------------------------------------------- */

/**
 * For damage rolls only, filter by the attack classification and mode.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects                Subject config.
 * @param {object} filter                         The array of attack types.
 * @param {Set<string>} filter.value              The attack type (melee, ranged).
 * @param {Set<string>} filter.classification     The attack classification (weapon, spell, unarmed).
 * @param {Set<string>} filter.mode               The attack mode (offhand, one-handed, etc.).
 * @param {DetailsConfig} details                 Details config.
 * @returns {boolean}                             Whether the item has any of the required attack types.
 */
function attackModes(subjects, filter, details) {
  if (subjects.activity.type !== "attack") return true;
  const {value, classification} = subjects.activity.attack.type;
  if (filter.value.size && !filter.value.has(value)) return false;
  if (filter.classification.size && !filter.classification.has(classification)) return false;
  if (filter.mode.size && !filter.mode.has(details.attackMode)) return false;

  return true;
}

/* -------------------------------------------------- */

/**
 * Find out if the actor is wearing one of the included armor types
 * in the filter and none of the excluded types. Note that this includes shields as well.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of base armor keys.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the rolling actor is wearing appropriate armor.
 */
function baseArmors(subjects, filter, details) {
  const {included, excluded} = _splitExclusion(filter);

  const ac = subjects.actor.system.attributes?.ac ?? {};
  const shield = ac?.equippedShield ?? null;
  const armor = ac?.equippedArmor ?? null;
  const types = new Set();
  if (shield) types.add(shield.system.type.baseItem).add(shield.system.type.value);
  if (armor) types.add(armor.system.type.baseItem).add(armor.system.type.value);
  if (ac.calc === "natural") types.add("natural");

  // If no armor worn.
  if (!types.size) return !(included.size > 0);

  return _testInclusion(types, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the tool being rolled for a check is one of the correct types.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The types of tool types.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the tool type matches the filter.
 */
function baseTools(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  if (!details.toolId) return !included.size;

  const types = new Set(proficiencyTree(details.toolId, "tool"));
  return _testInclusion(types, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the item's base weapon type is one of the valid ones in the filter.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of weapon baseItem keys.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item's baseItem was in the filter.
 */
function baseWeapons(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  if (subjects.item.type !== "weapon") return !included.size;
  const types = new Set([subjects.item.system.type.value, subjects.item.system.type.baseItem]);
  return _testInclusion(types, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the target is one of the included creature types and none of the excluded types.
 * In the case of no targets, refer to whether any specific creature type was included.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of creature types the target must or must not be.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the target is of a valid creature type.
 */
function creatureTypes(subjects, filter, details) {
  if (!filter.size) return true;
  const target = resolveSubjectTarget(subjects);
  const {included, excluded} = _splitExclusion(filter);
  const ad = target?.actor?.system.details;
  if (!ad) return !included.size;

  // All the races the target is a member of.
  const races = _splitRaces(target.actor);

  return _testInclusion(races, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the embedded script returns true.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {string} script               The script saved in the filter.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   True if the script returns true, otherwise false.
 */
function customScripts(subjects, script, details) {
  if (!script?.length) return true;
  if (game.settings.get(MODULE.ID, SETTINGS.SCRIPT)) return true;
  try {
    const {actor, item, activity} = subjects;
    const func = Function("actor", "item", "token", "bonus", "activity", "details", script);
    const token = (actor.isToken ? actor.token.object : actor.getActiveTokens()[0]) ?? null;
    const valid = func.call(func, actor, item, token, this, activity, details) === true;
    return valid;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/* -------------------------------------------------- */

/**
 * Find out if the item has any of the included damage types in its damage parts and none of the excluded types.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of damage types.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item's damage types overlap with the filter.
 */
function damageTypes(subjects, filter, details) {
  if (!filter.size) return true;
  let parts;
  switch (subjects.activity.type) {
    case "heal":
      parts = [subjects.activity.healing];
      break;
    case "attack":
    case "damage":
    case "save":
      parts = subjects.activity.damage.parts;
      break;
    default:
      return false;
  }
  const types = parts.reduce((acc, part) => acc.union(part.types), new Set());
  const {included, excluded} = _splitExclusion(filter);
  return _testInclusion(types, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the item that made the roll was the correct feature type and feature subtype.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {object} filter               The filter object.
 * @param {string} [filter.type]        The feature type.
 * @param {string} [filter.subtype]     The feature subtype.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the feature is the correct type.
 */
function featureTypes(subjects, {type, subtype}, details) {
  const config = CONFIG.DND5E.featureTypes;
  if (!type || !(type in config)) return true;
  if (subjects.item.type !== "feat") return false;
  if (type !== subjects.item.system.type.value) return false;

  const subtypes = config[type]?.subtypes ?? {};
  const hasSubtype = !foundry.utils.isEmpty(subtypes);
  if (!hasSubtype || !subtype) return true;

  return subjects.item.system.type.subtype === subtype;
}

/* -------------------------------------------------- */

/**
 * Find out if the health of the actor is at or above/below the threshold.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {object} filter               The object used for the filtering.
 * @param {number} filter.value         The hit point percentage threshold.
 * @param {number} filter.type          The type of threshold (0 for 'x or lower' and 1 for 'x and higher').
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the threshold is obeyed.
 */
function healthPercentages(subjects, filter, details) {
  if (!Number.isNumeric(filter.value) || ![0, 1].includes(filter.type)) return true;
  if (!subjects.actor.system.attributes?.hp) return false;
  const hp = subjects.actor.system.attributes.hp.pct; // this takes tempmax into account, but not temphp.
  return ((filter.type === 0) && (hp <= filter.value)) || ((filter.type === 1) && (hp >= filter.value));
}

/* -------------------------------------------------- */

/**
 * Find out if the item being used has the right identifier.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects        Subject config.
 * @param {object} filter                 The filter data.
 * @param {Set<string>} filter.values     The set of identifiers.
 * @param {DetailsConfig} details         Details config.
 * @returns {boolean}                     Whether the identifier of the item is valid.
 */
function identifiers(subjects, filter, details) {
  return !filter.values.size || filter.values.has(subjects.item.identifier);
}

/* -------------------------------------------------- */

/**
 * Find out if the item's type is one of the valid ones in the filter.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of item type keys.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item's type was in the filter.
 */
function itemTypes(subjects, filter, details) {
  return !filter.size || filter.has(subjects.item.type);
}

/* -------------------------------------------------- */

/**
 * Find out if the actor or item has any of the valid markers, as well as the target.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects        Subject config.
 * @param {object} filter                 The filter data.
 * @param {Set<string>} filter.values     The set of valid markers on the one performing the roll.
 * @param {Set<string>} filter.target     The set of valid markers on the target.
 * @param {DetailsConfig} details         Details config.
 * @returns {boolean}                     Whether the actor or item has any of the valid markers.
 */
function markers(subjects, filter, details) {

  const _hasMarker = (document, markers) => {
    const stored = document.getFlag(MODULE.ID, "markers") ?? [];
    return stored.some(marker => markers.has(marker));
  };

  const hasMarker = (document, markers) => {
    if (_hasMarker(document, markers)) return true;

    for (const effect of document.allApplicableEffects?.() ?? []) {
      if (effect.active && _hasMarker(effect, markers)) return true;
    }

    return false;
  };

  if (filter.values.size) {
    const itemMarked = !subjects.item || hasMarker(subjects.item, filter.values);
    if (!itemMarked && !hasMarker(subjects.actor, filter.values)) return false;
  }

  if (filter.target.size) {
    const targetActor = resolveSubjectTarget(subjects)?.actor;
    if (!targetActor || !hasMarker(targetActor, filter.target)) return false;
  }

  return true;
}

/* -------------------------------------------------- */

/**
 * Find out if the spell that is cast is one able to consume a spell slot.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The types of preparation modes allowed.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the spell matches the preparation mode.
 */
function preparationModes(subjects, filter, details) {
  return !filter.size || ((subjects.item.type === "spell") && filter.has(subjects.item.system.preparation.mode));
}

/* -------------------------------------------------- */

/**
 * Find out if the roll was proficient, and if at a valid level.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<number>} filter          The levels of valid proficiencies.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the roll was one of the proficiency levels.
 */
function proficiencyLevels(subjects, filter, details) {
  if (!filter.size) return true;

  // Case 1: Skill.
  if (details.skillId) {
    return filter.has(subjects.actor.system.skills[details.skillId]?.prof.multiplier || 0);
  }

  // Case 2: Ability Check.
  else if (details.abilityId && !details.toolId) {
    return filter.has(subjects.actor.system.abilities[details.abilityId]?.checkProf.multiplier || 0);
  }

  // Case 3: Death Saving Throw.
  else if (details.isDeath) {
    return filter.has(Number(subjects.actor.flags.dnd5e?.diamondSoul || false));
  }

  // Case 4: Saving Throw.
  else if (details.ability) {
    return filter.has(subjects.actor.system.abilities[details.ability]?.saveProf.multiplier || 0);
  }

  // Case 5: Weapon, equipment, spell, tool item.
  else if (subjects.item) {
    return filter.has(subjects.item.system.prof.multiplier);
  }

  // Case 6: Tool check without an item.
  else if (details.toolId) {
    return filter.has(subjects.actor.system.tools[details.toolId]?.prof.multiplier || 0);
  }

  // Else somehow return false.
  else return false;
}

/* -------------------------------------------------- */

/**
 * Find out if the actor has a number of spell slots remaining between the min and max.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {object} filter               The filtering for the bonus.
 * @param {number} filter.min           The minimum value available required for the bonus to apply.
 * @param {number} filter.max           The maximum value available required for the bonus to apply.
 * @param {boolean} [filter.size]       Whether to take the size of the spell slot into account.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the number of spell slots remaining falls within the bounds.
 */
function remainingSpellSlots(subjects, {min, max, size = false}, details) {
  if (![min, max].some(m => Number.isInteger(m))) return true;
  const spells = Object.values(subjects.actor.system.spells ?? {}).reduce((acc, val) => {
    if (!val.level || !val.value || !val.max) return acc;
    return acc + Math.clamp(val.value, 0, val.max) * (size ? val.level : 1);
  }, 0);
  return spells.between(min || 0, max || Infinity);
}

/* -------------------------------------------------- */

/**
 * Find out if the saving throw in the activity is set using an ability in the filter.
 * This filter is only available for bonuses applying specifically to saving throw DCs.
 * Special consideration is made for activities with save DC set using spellcasting ability.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The ability that is used to set the DC of the item's saving throw.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item's saving throw is set using an ability in the filter.
 */
function saveAbilities(subjects, filter, details) {
  if (!filter.size) return true;
  if (subjects.activity.type !== "save") return false;
  if (!subjects.activity.save.dc.calculation) return false;

  const {included, excluded} = _splitExclusion(filter);
  let abl;
  if (subjects.activity.save.dc.calculation === "spellcasting") {
    abl = subjects.activity.spellcastingAbility;
  } else {
    abl = subjects.activity.save.dc.calculation;
  }

  return _testInclusion(new Set([abl]), included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the skill being rolled is one of the correct types.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The types of skill ids.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the skill matches the filter.
 */
function skillIds(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  if (!details.skillId) return !included.size;
  return _testInclusion(new Set([details.skillId]), included, excluded);
}

/* -------------------------------------------------- */

/**
 * Does this spell belong to a specific class?
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects        Subject config.
 * @param {object} filter                 The filter data.
 * @param {Set<string>} filter.values     The set of class identifiers.
 * @param {DetailsConfig} details         Details config.
 * @returns {boolean}                     Whether the source class of the spell is valid.
 */
function sourceClasses(subjects, filter, details) {
  if (subjects.item.type !== "spell") return true;
  return !filter.values.size || filter.values.has(subjects.item.system.sourceClass);
}

/* -------------------------------------------------- */

/**
 * Find out if the item is a spell and has any, or all, of the required spell components.
 * The item must match either all or at least one, depending on what is set.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects        Subject config.
 * @param {object} filter                 The filtering object.
 * @param {Set<string>} filter.types      The array of spell components in the filter.
 * @param {string} filter.match           The type of matching, either 'ALL' or 'ANY'.
 * @param {DetailsConfig} details         Details config.
 * @returns {boolean}                     Whether the item matched correctly with the components.
 */
function spellComponents(subjects, filter, details) {
  if (!filter.types.size) return true;
  if (subjects.item.type !== "spell") return false;
  const comps = subjects.item.system.properties;

  switch (filter.match) {
    case "ALL":
      return filter.types.isSubset(comps);
    case "ANY":
      return filter.types.intersects(comps);
    default:
      return false;
  }
}

/* -------------------------------------------------- */

/**
 * Find out if the item was cast at any of the required spell levels. When a spell is upcast,
 * the item here is the cloned spell only in the case of save dc bonuses, meaning we need to
 * pass on the correct spell level for attack and damage roll bonuses.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<number>} filter          The set of spell levels in the filter.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item is at one of the appropriate levels.
 */
function spellLevels(subjects, filter, details) {
  if (!filter.size) return true;
  if (subjects.item.type !== "spell") return false;
  return filter.has(details.spellLevel ?? subjects.item.system.level);
}

/* -------------------------------------------------- */

/**
 * Find out if the item is a spell and belongs to one of the filter's spell schools.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of spell schools.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item is a spell and is of one of these schools.
 */
function spellSchools(subjects, filter, details) {
  return !filter.size || ((subjects.item.type === "spell") && filter.has(subjects.item.system.school));
}

/* -------------------------------------------------- */

/**
 * Find out if the actor has any of the included effects and none of the excluded effects.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of effect statuses you must have or must not have.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the actor has any included effects and no excluded effects.
 */
function statusEffects(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);

  // Discard any conditions the actor is immune to.
  const ci = subjects.actor.system.traits?.ci?.value ?? new Set();
  for (const k of ci) {
    included.delete(k);
    excluded.delete(k);
  }

  return _testInclusion(subjects.actor.statuses, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the actor is wearing one of the included armor types
 * in the filter and none of the excluded types. Note that this includes shields as well.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of base armor keys.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the rolling actor is wearing appropriate armor.
 */
function targetArmors(subjects, filter, details) {
  const target = resolveSubjectTarget(subjects)?.actor;
  if (!target) return !_splitExclusion(filter).included.size;
  return baseArmors({actor: target}, filter);
}

/* -------------------------------------------------- */

/**
 * Find out if the target actor has any of the status conditions required.
 * The bonus will apply if the target actor exists and has at least one.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of effect statuses the target must have or must not have.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the target actor has any of the status effects.
 */
function targetEffects(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  const actor = resolveSubjectTarget(subjects)?.actor;
  if (!actor) return !included.size;

  // Discard any conditions the actor is immune to.
  const ci = actor.system.traits?.ci?.value ?? new Set();
  for (const k of ci) {
    included.delete(k);
    excluded.delete(k);
  }

  return _testInclusion(actor.statuses, included, excluded);
}

/* -------------------------------------------------- */

/**
 * Find out if the bonus should apply to this type of saving throw.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of saving throw types to check for.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the throw type is in the filter.
 */
function throwTypes(subjects, filter, details) {
  if (!filter.size) return true;
  return (!!details.ability && filter.has(details.ability))
    || (filter.has("concentration") && details.isConcentration)
    || (filter.has("death") && details.isDeath);
}

/* -------------------------------------------------- */

/**
 * Find out if the targeted token is at least x-by-x or larger, or at most x-by-x or smaller,
 * while optionally also at most as big or small as the roller's token.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {object} filter               The filtering for the bonus.
 * @param {number} filter.size          The minimum/maximum size of the targeted token.
 * @param {number} filter.type          Whether it is 'at least' (0) or 'at most' (1).
 * @param {boolean} filter.self         Whether to clamp using the rolling token's size.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the targeted token matches the filter.
 */
function tokenSizes(subjects, filter, details) {
  if (!(filter.size > 0)) return true;
  const target = resolveSubjectTarget(subjects)?.document;
  if (!target) return false;
  const enemySize = Math.max(target.width, target.height);

  let se;
  if (filter.self) {
    const token = subjects.actor.token ?? subjects.actor.getActiveTokens(false, true)[0];
    if (!token) return false;
    se = Math.max(token.width, token.height);
  } else {
    se = filter.size;
  }

  switch (filter.type) {
    case 0:
      return enemySize >= Math.max(se, filter.size);
    case 1:
      return enemySize <= Math.min(se, filter.size);
    default:
      return false;
  }
}

/* -------------------------------------------------- */

/**
 * Find out if the item has any of the included weapon properties and none of the excluded properties.
 * @this {ContextualBonus}
 * @param {SubjectConfig} subjects      Subject config.
 * @param {Set<string>} filter          The set of properties you must have one of or none of.
 * @param {DetailsConfig} details       Details config.
 * @returns {boolean}                   Whether the item has any of the included and none of the excluded properties.
 */
function weaponProperties(subjects, filter, details) {
  if (!filter.size) return true;
  const {included, excluded} = _splitExclusion(filter);
  if (subjects.item.type !== "weapon") return !included.size;
  const props = subjects.item.system.properties;
  return _testInclusion(props, included, excluded);
}

const {ApplicationV2: ApplicationV2$1, HandlebarsApplicationMixin: HandlebarsApplicationMixin$1} = foundry.applications.api;

class BonusWorkshop extends HandlebarsApplicationMixin$1(ApplicationV2$1) {
  constructor(object, options = {}) {
    const uniqueId = `${MODULE.ID}-${object.uuid.replaceAll(".", "-")}`;
    super({...options, uniqueId});
    this.object = object;
    this.isItem = object.documentName === "Item";
    this.isEffect = object.documentName === "ActiveEffect";
    this.isActor = object.documentName === "Actor";
    this._documentAppId = uniqueId;
  }

  /* -------------------------------------------------- */

  /**
   * The right-hand side bonuses that have a collapsed description.
   * @type {Set<string>}
   */
  #collapsedBonuses = new Set();

  /* -------------------------------------------------- */

  /**
   * A reference to the owner of the bonuses.
   * @type {Actor5e|Item5e|ActiveEffect5e|RegionDocument}
   */
  get document() {
    return this.object;
  }

  /* -------------------------------------------------- */

  /** @override */
  get isEditable() {
    return !!this.document.sheet?.isEditable;
  }

  /* -------------------------------------------------- */

  /** @override */
  get title() {
    return `${MODULE.NAME}: ${this.document.name}`;
  }

  /* -------------------------------------------------- */

  /**
   * A reference to the collection of bonuses on this document.
   * @type {Collection<ContextualBonus>}
   */
  get collection() {
    return getCollection(this.document);
  }

  /* -------------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "builder", "dnd5e2"],
    window: {
      icon: MODULE.ICON,
      resizable: true
    },
    position: {
      width: 820,
      height: 720
    },
    actions: {
      "pick-type": this.#onClickType,
      "current-collapse": this.#onCollapseBonus,
      "current-toggle": this.#onToggleBonus,
      "current-copy": this.#onCopyBonus,
      "current-edit": this.#onClickBonus,
      "current-delete": this.#onDeleteBonus,
      "current-id": {handler: this.#onClickId, buttons: [0, 2]}
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/bonus-workshop.hbs`,
      scrollable: [".current-bonuses .bonuses"]
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const data = {
      isItem: this.isItem,
      isEffect: this.isEffect,
      isActor: this.isActor,
      parentName: this.document.name,
      currentBonuses: []
    };

    for (const bonus of this.collection) {
      data.currentBonuses.push({
        bonus,
        context: {
          collapsed: this.#collapsedBonuses.has(bonus.id),
          description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(bonus.description, {
            rollData: bonus.getRollData(), relativeTo: bonus.origin
          }),
          icon: bonus.icon,
          typeTooltip: `BUILD_N_ACTION.${bonus.type.toUpperCase()}.Label`
        }
      });
    }
    data.currentBonuses.sort((a, b) => a.bonus.name.localeCompare(b.bonus.name));

    data.createButtons = Object.entries(contextualBonuses).map(([type, cls]) => ({
      type, icon: cls.metadata.icon, label: `BUILD_N_ACTION.${type.toUpperCase()}.Label`
    }));
    data.ICON = MODULE.ICON;
    return data;
  }

  /* -------------------------------------------------- */

  /** @override */
  _onRender(...args) {
    super._onRender(...args);
    this.#updateResponsiveLayout(this.position.width);

    const content = this.element;
    if (!this.isEditable) {
      content.querySelectorAll(".select-type, .current-bonuses .functions").forEach(element => {
        element.style.pointerEvents = "none";
        element.classList.add("locked");
      });
      return;
    }

    content.querySelectorAll("[data-action='current-collapse']").forEach(element => {
      element.draggable = true;
      element.addEventListener("dragstart", this.#onDragStart.bind(this));
    });

    const dropZone = content.querySelector(".current-bonuses .bonuses");
    dropZone?.addEventListener("dragover", event => event.preventDefault());
    dropZone?.addEventListener("drop", this.#onDrop.bind(this));
  }

  /* -------------------------------------------------- */

  /** @override */
  _onPosition(position) {
    super._onPosition(position);
    this.#updateResponsiveLayout(position.width);
  }

  /* -------------------------------------------------- */

  /** Keep the type selector usable at narrow window sizes. */
  #updateResponsiveLayout(width) {
    const selector = this.element?.querySelector(".pages .select-type");
    selector?.classList.toggle("hidden", Number.parseInt(width) < 680);
  }

  /* -------------------------------------------------- */

  /** @override */
  render(...args) {
    this.document.apps[this._documentAppId] = this;
    return super.render(...args);
  }

  /* -------------------------------------------------- */

  /** @override */
  _onClose(options) {
    delete this.document.apps[this._documentAppId];
    return super._onClose(options);
  }

  /* -------------------------------------------------- */

  /** Start dragging a contextual bonus. */
  #onDragStart(event) {
    const label = event.currentTarget.closest(".bonus");
    const bonus = this.collection.get(label?.dataset.id);
    const dragData = bonus?.toDragData();
    if (dragData) event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  /* -------------------------------------------------- */

  /** Copy a dropped contextual bonus to this document. */
  async #onDrop(event) {
    event.preventDefault();
    if (!this.isEditable) return;

    let data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!data.uuid || (data.type !== "ContextualBonus")) return;

    let bonus = await fromUuid(data.uuid);
    if (!bonus || (bonus.parent === this.document)) return;

    data = bonus.toObject();
    data.id = foundry.utils.randomID();
    bonus = new contextualBonuses[data.type](data, {parent: this.document});
    await embedBonus(this.document, bonus);
  }

  /* -------------------------------------------------- */

  /** Handle creating a new bonus. */
  static async #onClickType(event, target) {
    if (!this.isEditable) return;
    const type = target.dataset.type;
    const bonus = new contextualBonuses[type]({}, {parent: this.document});
    return embedBonus(this.document, bonus);
  }

  /* -------------------------------------------------- */

  /** Render the sheet of an existing bonus. */
  static #onClickBonus(event, target) {
    if (!this.isEditable) return;
    const bonus = this.collection.get(target.closest(".bonus").dataset.id);
    return bonus.sheet.render({force: true});
  }

  /* -------------------------------------------------- */

  /** Collapse or expand a bonus description. */
  static #onCollapseBonus(event, target) {
    const bonus = target.closest(".bonus");
    const id = bonus.dataset.id;
    const isCollapsed = this.#collapsedBonuses.has(id);
    bonus.classList.toggle("collapsed", !isCollapsed);
    if (isCollapsed) this.#collapsedBonuses.delete(id);
    else this.#collapsedBonuses.add(id);
  }

  /* -------------------------------------------------- */

  /** Copy the id or uuid of a bonus. */
  static async #onClickId(event, target) {
    event.preventDefault();
    const bonus = this.collection.get(target.closest(".bonus").dataset.id);
    const isId = event.button === 2;
    const id = isId ? bonus.id : bonus.uuid;
    await game.clipboard.copyPlainText(id);
    ui.notifications.info(game.i18n.format("DOCUMENT.IdCopiedClipboard", {
      id, label: "ContextualBonus", type: isId ? "id" : "uuid"
    }));
  }

  /* -------------------------------------------------- */

  /** Delete a bonus. */
  static #onDeleteBonus(event, target) {
    if (!this.isEditable) return;
    return this.collection.get(target.closest(".bonus").dataset.id).deleteDialog();
  }

  /* -------------------------------------------------- */

  /** Toggle a bonus. */
  static #onToggleBonus(event, target) {
    if (!this.isEditable) return;
    return this.collection.get(target.closest(".bonus").dataset.id).toggle();
  }

  /* -------------------------------------------------- */

  /** Duplicate a bonus. */
  static #onCopyBonus(event, target) {
    if (!this.isEditable) return;
    const bonus = this.collection.get(target.closest(".bonus").dataset.id);
    return duplicateBonus(bonus);
  }
}

/**
 * Render the bonus workshop for a supported document.
 *
 * @param {Document} document
 * @returns {BonusWorkshop}
 */
function openBonusWorkshop(document) {
  if (!isEmbeddableDocument(document)) {
    throw new Error("The document provided is not a valid document type for Build-n-Action!");
  }
  return new BonusWorkshop(document).render(true);
}

var api = {
  applyMarkers,
  createBonus,
  duplicateBonus,
  embedBonus,
  findEmbeddedDocumentsWithBonuses,
  fromUuid,
  fromUuidSync: fromUuidSync$1,
  getCollection,
  hasArmorProficiency,
  hasToolProficiency,
  hasWeaponProficiency,
  hotbarToggle,
  openBonusWorkshop,
  proficiencyTree,
  speaksLanguage
};

/**
 * Apply markers to a document for the Markers filter.
 *
 * @param {Document} document
 * @returns {Promise<Document|null>}
 */
async function applyMarkers(document) {
  const {SetField, StringField} = foundry.data.fields;
  const field = new SetField(new StringField());
  const value = document.getFlag(MODULE.ID, "markers") ?? [];
  const html = field.toFormGroup({
    label: "BUILD_N_ACTION.MarkersDialog.field.label",
    hint: "BUILD_N_ACTION.MarkersDialog.field.hint",
    localize: true
  }, {value, name: "markers", slug: true}).outerHTML;

  return foundry.applications.api.DialogV2.prompt({
    rejectClose: false,
    content: `<fieldset>${html}</fieldset>`,
    window: {
      icon: "fa-solid fa-tags",
      title: game.i18n.format("BUILD_N_ACTION.MarkersDialog.title", {name: document.name})
    },
    position: {width: 400},
    ok: {
      callback: async (event, button) => {
        const markers = Array.from(button.form.elements.markers.value);
        await document.setFlag(MODULE.ID, "markers", markers);
        return document;
      }
    }
  });
}

/**
 * Toggle a contextual bonus from a hotbar macro.
 *
 * @param {string} uuid
 * @returns {Promise<ContextualBonus|undefined>}
 */
async function hotbarToggle(uuid) {
  const bonus = await fromUuid(uuid);
  if (!bonus) {
    ui.notifications.warn("BUILD_N_ACTION.BonusNotFound", {localize: true});
    return;
  }
  return bonus.toggle();
}

/**
 * Persist an explicitly selected image on a contextual bonus.
 *
 * Image selection is kept out of the parent DocumentSheet form submission so
 * the ContextualBonus remains the only owner of its nested flag data.
 *
 * @param {ContextualBonus} bonus
 * @param {string} path
 * @returns {Promise<ContextualBonus>}
 */
async function updateBonusImage(bonus, path) {
  path = String(path ?? "").trim();
  if (!path || (path === bonus.img)) return bonus;
  await bonus.update({img: path});
  return bonus;
}

/**
 * Scroll one filter card into view inside the filter picker.
 * Using the picker's own scroll offset avoids scrollIntoView selecting an outer
 * ApplicationV2 scroll container when the filter tab has two scrollable columns.
 *
 * @param {HTMLElement|null} tab     Filter tab root.
 * @param {string} id                Filter identifier.
 * @param {object} [options]
 * @param {ScrollBehavior} [options.behavior="smooth"]
 * @returns {boolean}                Whether a matching filter was found.
 */
function scrollFilterIntoView(tab, id, {behavior = "smooth"} = {}) {
  const picker = tab?.querySelector?.(".picker");
  if (!picker || !id) return false;

  const filters = Array.from(picker.querySelectorAll(".filter[data-id]"));
  const element = filters.find(filter => filter.dataset.id === id);
  if (!element) return false;

  const pickerTop = picker.getBoundingClientRect().top;
  const elementTop = element.getBoundingClientRect().top;
  const top = Math.max(0, picker.scrollTop + elementTop - pickerTop);

  if (typeof picker.scrollTo === "function") picker.scrollTo({top, behavior});
  else picker.scrollTop = top;

  for (const entry of tab.querySelectorAll(".toc [data-id]")) {
    entry.classList.toggle("viewed", entry.dataset.id === id);
  }
  return true;
}

class KeysDialog extends foundry.applications.api.DialogV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "keys-dialog"],
    modal: true,
    window: {
      resizable: false,
      icon: MODULE.ICON
    },
    position: {
      height: "auto",
      width: 400
    },
    actions: {
      cycle: this.#onCycleRight,
      cycleAll: this.#onCycleAll,
      cycleLeft: this.#onCycleLeft,
      cycleRight: this.#onCycleRight
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  static async prompt({canExclude, values, filterId, ...configuration} = {}) {
    const description = (filterId === "auraBlockers")
      ? "BUILD_N_ACTION.FIELDS.aura.blockers.hint"
      : `BUILD_N_ACTION.FIELDS.filters.${filterId}.hint`;

    configuration.content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE.ID}/templates/subapplications/keys-dialog.hbs`, {
        canExclude: canExclude,
        values: values,
        description: description
      }
    );
    configuration.filterId = filterId;
    configuration.rejectClose = false;
    return super.prompt(configuration);
  }

  /* -------------------------------------------------- */

  /** @override */
  get title() {
    const name = (this.options.filterId === "auraBlockers")
      ? "BUILD_N_ACTION.FIELDS.aura.blockers.label"
      : `BUILD_N_ACTION.FIELDS.filters.${this.options.filterId}.label`;
    return game.i18n.format("BUILD_N_ACTION.KeysDialogTitle", {name: game.i18n.localize(name)});
  }

  /* -------------------------------------------------- */

  /**
   * Cycle all selects in a column between the valid options.
   * @param {Event} event     The initiating click event.
   */
  static #onCycleAll(event, target) {
    const table = target.closest(".table");
    const selects = table.querySelectorAll("select");
    const newIndex = (selects[0].selectedIndex + 1) % selects[0].options.length;
    selects.forEach(select => select.selectedIndex = newIndex);
  }

  /* -------------------------------------------------- */

  /**
   * Custom implementation for label-to-checkbox linking.
   * @param {Event} event     The initiating click event.
   */
  static #onCycleRight(event, target) {
    const select = target.closest(".row").querySelector(".select select");
    const newIndex = (select.selectedIndex + 1) % select.options.length;
    select.selectedIndex = newIndex;
  }

  /* -------------------------------------------------- */

  /**
   * Cycle backwards in the select options.
   * @param {Event} event     The initiating click event.
   */
  static #onCycleLeft(event, target) {
    const select = target.nextElementSibling;
    const n = select.selectedIndex - 1;
    const mod = select.options.length;
    const newIndex = ((n % mod) + mod) % mod;
    select.selectedIndex = newIndex;
  }
}

class BonusSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.DocumentSheetV2
) {
  /**
   * @param {object} options            Optional configuration parameters for how the sheet behaves.
   * @param {ContextualBonus} options.bonus     The buildNAction managed by this sheet.
   */
  constructor({bonus, ...options}) {
    super({
      ...options,
      id: BonusSheet.applicationId(bonus),
      document: bonus.parent,
      bonusId: bonus.id
    });

    const ids = new Set(Object.keys(bonus.toObject().filters)).filter(id => {
      return fields[id].storage(bonus);
    });

    /**
     * The filters that are currently active.
     * @type {Set<string>}
     */
    this._filters = ids;
  }

  /* -------------------------------------------------- */

  /**
   * Return the stable ApplicationV2 id for a contextual bonus sheet.
   * @param {ContextualBonus} bonus
   * @returns {string}
   */
  static applicationId(bonus) {
    return `${MODULE.ID}-bonus-${bonus.uuid.replaceAll(".", "-")}`;
  }

  /* -------------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "sheet"],
    sheetConfig: false,
    window: {
      icon: MODULE.ICON,
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 760,
      height: 760
    },
    form: {
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addFilter: this.#onAddFilter,
      copyUuid: {handler: this.#onCopyUuid, buttons: [0, 2]},
      deleteFilter: this.#onDeleteFilter,
      editImage: this.#onEditImage,
      keysDialog: this.#onKeysDialog,
      viewFilter: this.#onViewFilter
    },
    bonusId: null
  };

  /* -------------------------------------------------- */

  /** @override */
  static PARTS = {
    header: {
      template: `modules/${MODULE.ID}/templates/sheet-header.hbs`
    },
    navigation: {
      template: `modules/${MODULE.ID}/templates/sheet-navigation.hbs`
    },
    description: {
      template: `modules/${MODULE.ID}/templates/sheet-description.hbs`,
      scrollable: [""]
    },
    bonuses: {
      template: `modules/${MODULE.ID}/templates/sheet-bonuses.hbs`,
      scrollable: [""]
    },
    configuration: {
      template: `modules/${MODULE.ID}/templates/sheet-configuration.hbs`,
      scrollable: [""]
    },
    filters: {
      template: `modules/${MODULE.ID}/templates/sheet-filters.hbs`,
      scrollable: [".toc", ".picker"]
    },
    advanced: {
      template: `modules/${MODULE.ID}/templates/sheet-advanced.hbs`,
      scrollable: [""]
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  tabGroups = {
    main: "description"
  };

  /* -------------------------------------------------- */

  /**
   * The buildNAction represented by this sheet.
   * @type {ContextualBonus}
   */
  get bonus() {
    return getCollection(this.document).get(this.options.bonusId);
  }

  /* -------------------------------------------------- */

  /** @override */
  get title() {
    return `${game.i18n.localize("BUILD_N_ACTION.ModuleTitle")}: ${this.bonus.name}`;
  }

  /* -------------------------------------------------- */

  /** @override */
  get isEditable() {
    return super.isEditable && !!this.document.isOwner;
  }

  /* -------------------------------------------------- */

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const submitData = foundry.utils.expandObject(formData.object);

    // Move bonuses.modifiers.config.enabled into respective objects.
    let enabled = submitData.bonuses?.modifiers?.config?.enabled;
    if (enabled) {
      enabled = new Set(enabled);
      for (const k of ["amount", "explode", "maximum", "minimum", "reroll", "size"]) {
        foundry.utils.setProperty(submitData, `bonuses.modifiers.${k}.enabled`, enabled.has(k));
      }
    }

    const bonus = this.bonus;

    bonus.validate({changes: submitData, clean: true, fallback: false});
    submitData.id = bonus.id;
    const collection = getCollection(this.document).contents.map(k => k.toObject());
    bonus.updateSource(submitData);
    collection.findSplice(k => k.id === bonus.id, bonus.toObject());
    return {flags: {[MODULE.ID]: {bonuses: collection}}};
  }

  /* -------------------------------------------------- */

  /** @override */
  render(...T) {
    if (!this.bonus) return this.close();
    return super.render(...T);
  }

  /* -------------------------------------------------- */

  /** @override */
  _onRender(...T) {
    super._onRender(...T);

    // Keep a single table-of-contents entry synchronized with the right-hand scroll position.
    const tab = this.element.querySelector(".tab[data-tab=filters]");
    const picker = tab?.querySelector(".picker");
    const filters = Array.from(picker?.querySelectorAll(".filter[data-id]") ?? []);
    const entries = Array.from(tab?.querySelectorAll(".toc [data-id]") ?? []);
    if (!picker || !filters.length || !entries.length) return;

    const updateViewedFilter = () => {
      const top = picker.getBoundingClientRect().top + 8;
      let current = filters[0];
      for (const filter of filters) {
        if (filter.getBoundingClientRect().top > top) break;
        current = filter;
      }
      const isAtBottom = picker.scrollTop + picker.clientHeight >= picker.scrollHeight - 1;
      if (isAtBottom) current = filters.at(-1);
      for (const entry of entries) entry.classList.toggle("viewed", entry.dataset.id === current.dataset.id);
    };

    picker.addEventListener("scroll", updateViewedFilter, {passive: true});
    updateViewedFilter();
  }

  /* -------------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const bonus = this.bonus;
    const source = bonus.toObject();
    const rollData = bonus.getRollData();
    const makeField = this.#createFieldFactory(bonus, source);
    return {
      aura: this.#prepareAura(makeField),
      bonus,
      bonuses: this.#prepareBonuses(makeField, source),
      consume: this.#prepareConsumption(makeField, source),
      fields: await this.#prepareRootFields(makeField, rollData),
      filterpickers: this.#prepareFilterPicker(),
      filters: this.#prepareFilters(),
      hasModifiers: !!source.bonuses?.modifiers,
      labels: this._prepareLabels(),
      modifiers: this.#prepareModifiers(makeField, source, rollData),
      tabs: this.#prepareTabs()
    };
  }

  #prepareTabs() {
    const tabs = {
      description: {
        icon: "fa-solid fa-pen-fancy",
        label: "BUILD_N_ACTION.SheetTabs.Description"
      },
      bonuses: {
        icon: "fa-solid fa-dice",
        label: "BUILD_N_ACTION.SheetTabs.Bonuses"
      },
      configuration: {
        icon: "fa-solid fa-wrench",
        label: "BUILD_N_ACTION.SheetTabs.Configuration"
      },
      filters: {
        icon: "fa-solid fa-plug",
        label: "BUILD_N_ACTION.SheetTabs.Filters"
      },
      advanced: {
        icon: "fa-solid fa-cubes",
        label: "BUILD_N_ACTION.SheetTabs.Advanced"
      }
    };
    for (const [id, tab] of Object.entries(tabs)) {
      tab.cssClass = (this.tabGroups.main === id) ? "active" : "";
      tab.id = id;
    }
    return tabs;
  }

  #createFieldFactory(bonus, source) {
    return (path, options = {}) => {
      const field = bonus.schema.getField(path);
      const value = foundry.utils.getProperty(source, path);
      return {field, value, ...options};
    };
  }

  async #prepareRootFields(makeField, rollData) {
    const bonus = this.bonus;
    const fields = {};
    fields.enabled = makeField("enabled");
    fields.exclusive = makeField("exclusive");
    fields.optional = makeField("optional");
    fields.reminder = makeField("reminder", {disabled: !bonus.canRemind});
    fields.img = makeField("img");
    fields.description = makeField("description", {
      height: 200,
      enriched: await foundry.applications.ux.TextEditor.implementation.enrichHTML(bonus.description, {
        rollData,
        relativeTo: bonus.origin
      })
    });
    return fields;
  }

  #prepareBonuses(makeField, source) {
    const bonuses = [];
    for (const key of Object.keys(source.bonuses)) {
      if (key === "modifiers") continue;
      let options = {};
      if (key === "damageType") {
        options = {isDamage: true, options: []};
        const damageGroup = game.i18n.localize("DND5E.Damage");
        const healingGroup = game.i18n.localize("DND5E.Healing");
        for (const [value, config] of Object.entries(CONFIG.DND5E.damageTypes)) {
          options.options.push({group: damageGroup, value, label: config.label});
        }
        for (const [value, config] of Object.entries(CONFIG.DND5E.healingTypes)) {
          options.options.push({group: healingGroup, value, label: config.label});
        }
      }
      bonuses.push(makeField(`bonuses.${key}`, options));
    }
    return bonuses;
  }

  #prepareModifiers(makeField, source, rollData) {
    if (!source.bonuses?.modifiers) return undefined;
    const model = this.bonus.bonuses.modifiers;
    const initial = model.schema.getInitialValue({});
    const modifiers = {enabled: {value: new Set(), choices: []}};
    for (const path of Object.keys(foundry.utils.flattenObject(initial))) {
      const parts = path.split(".");
      const key = parts.shift();
      const tail = parts.pop();
      modifiers[key] ??= {};
      if (tail !== "enabled") {
        modifiers[key][tail] = makeField(`bonuses.modifiers.${path}`);
        continue;
      }
      if (source.bonuses.modifiers[key].enabled) {
        modifiers[key].enabled = true;
        modifiers.enabled.value.add(key);
      }
      modifiers.enabled.choices.push({
        value: key,
        label: model.schema.getField(`${key}.enabled`).label
      });
    }
    modifiers.enabled.field = new foundry.data.fields.SetField(new foundry.data.fields.StringField(), {
      label: game.i18n.localize("BUILD_N_ACTION.MODIFIERS.FIELDS.config.enabled.label"),
      hint: game.i18n.localize("BUILD_N_ACTION.MODIFIERS.FIELDS.config.enabled.hint")
    });

    const parts = ["3", "2d10", "1d4"];
    model.modifyParts(parts, rollData);
    modifiers.config ??= {};
    modifiers.config.example = parts.join(" + ");
    return modifiers;
  }

  #prepareConsumption(makeField, source) {
    const bonus = this.bonus;
    const consume = {};
    if (!["save", "hitdie"].includes(bonus.type)) {
      consume.enabled = makeField("consume.enabled");
      consume.type = makeField("consume.type");
      consume.subtype = makeField("consume.subtype");
      consume.formula = makeField("consume.formula", {
        placeholder: bonus.bonuses.bonus,
        show: bonus.consume.scales
      });
      consume.step = makeField("consume.value.step", {
        show: ["health", "currency"].includes(source.consume.type) && bonus.consume.scales
      });

      const isSlot = (source.consume.type === "slots") ? "Slot" : "";
      const {scales, value} = bonus.consume;
      consume.value = {
        min: makeField("consume.value.min", {
          placeholder: game.i18n.localize(`BUILD_N_ACTION.FIELDS.consume.value.min.label${isSlot}`)
        }),
        max: makeField("consume.value.max", {
          placeholder: game.i18n.localize(`BUILD_N_ACTION.FIELDS.consume.value.max.label${isSlot}`)
        }),
        label: game.i18n.localize(`BUILD_N_ACTION.FIELDS.consume.value.label${isSlot}`),
        hint: game.i18n.localize(`BUILD_N_ACTION.FIELDS.consume.value.hint${scales ? "Scale" : ""}${isSlot}`),
        range: (scales && value.min && value.max) ? `(${value.min}&ndash;${value.max})` : null
      };

      consume.scales = makeField("consume.scales", {
        unavailable: !source.consume.type || ["effect", "inspiration"].includes(source.consume.type)
      });
      this.#prepareConsumptionSubtype(consume.subtype, source.consume.type);
    } else {
      consume.enabled = makeField("consume.enabled", {value: false, disabled: true});
    }
    return consume;
  }

  #prepareConsumptionSubtype(subtype, type) {
    subtype.show = true;
    if (type === "currency") {
      subtype.choices = Object.entries(CONFIG.DND5E.currencies)
        .sort((left, right) => right[1].conversion - left[1].conversion)
        .reduce((choices, [key, config]) => {
          choices[key] = config.label;
          return choices;
        }, {});
    } else if (type === "hitdice") {
      subtype.choices = CONFIG.DND5E.hitDieTypes.reduce((choices, denominator) => {
        choices[denominator] = denominator;
        return choices;
      }, {
        smallest: game.i18n.localize("DND5E.ConsumeHitDiceSmallest"),
        largest: game.i18n.localize("DND5E.ConsumeHitDiceLargest")
      });
    } else subtype.show = false;
  }

  #prepareAura(makeField) {
    const bonus = this.bonus;
    const aura = {};
    aura.enabled = makeField("aura.enabled");
    if (aura.enabled.value) {
      aura.range = makeField("aura.range");
      let label;
      let range;
      if (!bonus.aura.range || (bonus.aura.range > 0)) {
        label = "BUILD_N_ACTION.FIELDS.aura.range.labelFt";
        range = bonus.aura.range;
      } else if (bonus.aura.range === -1) {
        label = "BUILD_N_ACTION.FIELDS.aura.range.labelUnlimited";
        range = game.i18n.localize("DND5E.Unlimited");
      }
      if (label) aura.range.label = game.i18n.format(label, {range});

      aura.template = makeField("aura.template");
      aura.disposition = makeField("aura.disposition");
      aura.self = makeField("aura.self");
      aura.blockers = makeField("aura.blockers");
      aura.requirements = ["move", "light", "sight", "sound"].map(k => {
        return makeField(`aura.require.${k}`);
      });
    }
    return aura;
  }

  /* -------------------------------------------------- */

  /**
   * Prepare the filter picker.
   * @returns {object[]}
   */
  #prepareFilterPicker() {
    const bonus = this.bonus;
    const keys = Object.keys(bonus.filters);
    return keys.reduce((acc, key) => {
      if (!this._filters.has(key) || fields[key].repeatable) acc.push({
        id: key,
        repeats: fields[key].repeatable ? bonus.filters[key].length : null,
        field: bonus.schema.getField(`filters.${key}`)
      });
      return acc;
    }, []).sort((a, b) => {
      a = bonus.schema.getField(`filters.${a.id}`).label;
      b = bonus.schema.getField(`filters.${b.id}`).label;
      return a.localeCompare(b);
    });
  }

  /* -------------------------------------------------- */

  /**
   * Prepare filters.
   * @returns {string[]}
   */
  #prepareFilters() {
    const htmls = [];
    const bonus = this.bonus;
    const keys = [...this._filters].sort((a, b) => {
      a = bonus.schema.getField(`filters.${a}`).label;
      b = bonus.schema.getField(`filters.${b}`).label;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      const filter = fields[key];
      htmls.push(filter.render(bonus));
    }
    return htmls;
  }

  /* -------------------------------------------------- */

  /**
   * Prepare labels.
   * @returns {string[]}
   */
  _prepareLabels() {
    const labels = [];
    const bonus = this.bonus;

    labels.push(game.i18n.localize(`BUILD_N_ACTION.${bonus.type.toUpperCase()}.Label`));

    const filterLabels = Object.keys(bonus.filters).filter(key => {
      return fields[key].storage(bonus);
    }).length;
    labels.push(game.i18n.format("BUILD_N_ACTION.Labels.Filters", {n: filterLabels}));

    if (!bonus.enabled) labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.Disabled"));
    if (bonus.isExclusive) labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.Exclusive"));
    if (bonus.isOptional) labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.Optional"));
    if (bonus.consume.isValidConsumption && bonus.consume.enabled) {
      labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.Consuming"));
    }
    if (bonus.aura.isToken) labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.TokenAura"));
    if (bonus.aura.isTemplate) labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.TemplateAura"));
    if (bonus.isReminder) labels.push(game.i18n.localize("BUILD_N_ACTION.Labels.Reminder"));

    return labels;
  }

  /* -------------------------------------------------- */

  /**
   * Handle deleting a filter.
   * @param {Event} event             The initiating click event.
   * @param {HTMLElement} target      Targeted html element.
   */
  static #onDeleteFilter(event, target) {
    const bonus = this.bonus;
    const id = target.dataset.id;
    const data = bonus.toObject();

    if (fields[id].repeatable) {
      const idx = parseInt(target.dataset.idx);
      const property = foundry.utils.deepClone(data.filters[id]);
      property.splice(idx, 1);
      if (!property.length) delete data.filters[id];
      data.filters[id] = property;
    } else {
      this._filters.delete(id);
      delete data.filters[id];
    }

    const collection = getCollection(this.document).contents.map(k => k.toObject());
    collection.findSplice(k => k.id === bonus.id, data);
    this.document.update({[`flags.${MODULE.ID}.bonuses`]: collection});
  }

  /* -------------------------------------------------- */

  /**
   * Handle adding a filter.
   * @param {Event} event             The initiating click event.
   * @param {HTMLElement} target      Targeted html element.
   */
  static #onAddFilter(event, target) {
    const bonus = this.bonus;
    const id = target.closest("[data-id]").dataset.id;
    this._filters.add(id);
    if (fields[id].repeatable) {
      const data = bonus.toObject();
      data.filters[id].push({});
      const collection = getCollection(this.document).contents.map(k => k.toObject());
      collection.findSplice(k => k.id === bonus.id, data);
      this.document.update({[`flags.${MODULE.ID}.bonuses`]: collection});
    } else {
      this.render();
    }
  }

  /* -------------------------------------------------- */

  /**
   * Helper function to display the keys dialog and update the corresponding filter value.
   * @param {Event} event             The initiating click event.
   * @param {HTMLElement} target      Targeted html element.
   */
  static #onKeysDialog(event, target) {
    const bonus = this.bonus;
    const filterId = target.dataset.id;
    const filter = fields[filterId];
    const property = target.dataset.property;
    const list = filter.choices();
    const values = foundry.utils.getProperty(bonus, property);

    for (const value of values) {
      const key = value.replaceAll("!", "");
      const val = list.find(e => e.value === key);
      if (!val) continue;
      if (value.startsWith("!")) val.exclude = true;
      else val.include = true;
    }

    const types = {
      baseWeapons: CONFIG.DND5E.weaponTypes,
      baseArmors: CONFIG.DND5E.armorTypes,
      targetArmors: CONFIG.DND5E.armorTypes,
      baseTools: CONFIG.DND5E.toolTypes
    }[filterId] ?? null;

    const categories = [];
    if (types) {
      for (const [k, v] of Object.entries(types)) {
        const val = values.find(v => v.replaceAll("!", "") === k);
        categories.push({
          isCategory: true,
          exclude: val ? val.startsWith("!") : false,
          include: val ? !val.startsWith("!") : false,
          value: k,
          label: v
        });
      }
    }

    KeysDialog.prompt({
      ok: {
        label: "BUILD_N_ACTION.KeysDialogApplySelection",
        icon: "fa-solid fa-check",
        callback: async function(event, button) {
          const values = [];
          button.form.querySelectorAll(".table .select select").forEach(s => {
            if (s.value === "include") values.push(s.dataset.value);
            else if (s.value === "exclude") values.push("!" + s.dataset.value);
          });
          bonus.update({[property]: values});
        }
      },
      filterId: filterId,
      values: categories.length ? categories.concat(list) : list,
      canExclude: filter.canExclude
    });
  }

  /* -------------------------------------------------- */

  /**
   * Copy the uuid or id of the bonus.
   * @param {Event} event             The initiating click event.
   * @param {HTMLElement} target      Targeted html element.
   */
  static #onCopyUuid(event, target) {
    event.preventDefault(); // Don't open context menu
    event.stopPropagation(); // Don't trigger other events
    if (event.detail > 1) return; // Ignore repeated clicks

    const bonus = this.bonus;
    const id = (event.button === 2) ? bonus.id : bonus.uuid;
    const type = (event.button === 2) ? "id" : "uuid";
    const label = game.i18n.localize(bonus.constructor.metadata.label);
    game.clipboard.copyPlainText(id);
    ui.notifications.info(game.i18n.format("DOCUMENT.IdCopiedClipboard", {label, type, id}));
  }

  /* -------------------------------------------------- */

  /**
   * Select and persist a bonus image without routing it through the parent
   * DocumentSheet form submission.
   */
  static async #onEditImage() {
    if (!this.isEditable) return;
    const bonus = this.bonus;
    const picker = new foundry.applications.apps.FilePicker.implementation({
      current: bonus.img,
      type: "image",
      document: bonus.parent,
      callback: async path => {
        await updateBonusImage(bonus, path);
        await this.render({force: true});
      },
      position: {
        top: this.position.top + 40,
        left: this.position.left + 10
      }
    });
    return picker.browse();
  }

  /* -------------------------------------------------- */

  /**
   * Scroll a filter into view in the picker.
   * @param {Event} event             The initiating click event.
   * @param {HTMLElement} target      Targeted html element.
   */
  static #onViewFilter(event, target) {
    event.preventDefault();
    const id = target.closest("[data-id]")?.dataset.id;
    const tab = target.closest(".tab[data-tab=filters]");
    scrollFilterIntoView(tab, id);
  }
}

const currentAuras = {};

class TokenAura {
  /**
   * @constructor
   * @param {TokenDocument5e} token
   * @param {ContextualBonus} bonus
   */
  constructor(token, bonus) {
    this.#token = token;
    this.#bonus = bonus;
    this.showAuras = game.settings.get(MODULE.ID, SETTINGS.AURA);
    this.padRadius = !canvas.grid.isGridless || game.settings.get(MODULE.ID, SETTINGS.RADIUS);

    const auras = this.auras;
    const old = auras[bonus.uuid];
    if (old) old.destroy({fadeOut: false});
    auras[bonus.uuid] = this;
  }

  /* -------------------------------------------------- */

  /** Apply current display settings to all tracked auras. */
  static refreshAll() {
    const auras = this.values();
    const grid = globalThis.canvas?.grid;
    if (!auras.length || !grid) return;
    const showAuras = game.settings.get(MODULE.ID, SETTINGS.AURA);
    const padRadius = !grid.isGridless || game.settings.get(MODULE.ID, SETTINGS.RADIUS);
    for (const aura of auras) {
      aura.showAuras = showAuras;
      aura.padRadius = padRadius;
      aura.refresh();
    }
  }

  /* -------------------------------------------------- */

  /** @returns {TokenAura[]} */
  static values() {
    return Object.values(currentAuras);
  }

  /** Remove all tracked aura references during canvas teardown. */
  static clear() {
    for (const key of Object.keys(currentAuras)) delete currentAuras[key];
  }

  /* -------------------------------------------------- */

  /**
   * The color of the aura when the target is not contained within it.
   * @type {Color}
   */
  static RED = new Color(0xFF0000);

  /* -------------------------------------------------- */

  /**
   * The color of the aura when the target is contained within it.
   * @type {Color}
   */
  static GREEN = new Color(0x00FF00);

  /* -------------------------------------------------- */

  /**
   * The untinted default color of the aura.
   * @type {Color}
   */
  static WHITE = new Color(0xFFFFFF);

  /* -------------------------------------------------- */

  /**
   * The collection of auras being kept track of.
   * @type {Record<string, TokenAura>}
   */
  get auras() {
    return currentAuras;
  }

  /* -------------------------------------------------- */

  /**
   * The default color of the aura (white).
   * @type {Color}
   */
  get white() {
    return this.constructor.WHITE;
  }

  /* -------------------------------------------------- */

  /**
   * The name of this aura.
   * @type {string}
   */
  get name() {
    return `${this.bonus.uuid}-aura`;
  }

  /* -------------------------------------------------- */

  /**
   * Do auras show and fade in and out?
   * @type {boolean}
   */
  #showAuras = true;

  /* -------------------------------------------------- */

  /**
   * Do auras show and fade in and out?
   * @type {boolean}
   */
  get showAuras() {
    return this.#showAuras;
  }

  /* -------------------------------------------------- */

  /**
   * Set whether auras show and fade in and out.
   * @param {boolean} bool      Whether to show.
   */
  set showAuras(bool) {
    this.#showAuras = bool;
  }

  /* -------------------------------------------------- */

  /**
   * Do auras pad the radius due to token sizes?
   * @type {boolean}
   */
  #padRadius = true;

  /* -------------------------------------------------- */

  /**
   * Do auras pad the radius due to token sizes?
   * @type {boolean}
   */
  get padRadius() {
    return this.#padRadius;
  }

  /* -------------------------------------------------- */

  /**
   * Set whether auras are padded due to token size.
   * @param {boolean} bool      Whether to pad.
   */
  set padRadius(bool) {
    this.#padRadius = bool;
  }

  /* -------------------------------------------------- */

  /**
   * The origin of the aura.
   * @type {TokenDocument5e}
   */
  #token = null;

  /* -------------------------------------------------- */

  /**
   * The origin of the aura.
   * @type {TokenDocument5e}
   */
  get token() {
    return this.#token;
  }

  /* -------------------------------------------------- */

  /**
   * The buildNAction from which to draw data.
   * @type {ContextualBonus}
   */
  #bonus = null;

  /* -------------------------------------------------- */

  /**
   * The buildNAction from which to draw data.
   * @type {ContextualBonus}
   */
  get bonus() {
    return this.#bonus;
  }

  /* -------------------------------------------------- */

  /**
   * The drawn pixi graphics.
   * @type {PIXI.Graphics|null}
   */
  #element = null;

  /* -------------------------------------------------- */

  /**
   * The drawn pixi graphics.
   * @type {PIXI.Graphics|null}
   */
  get element() {
    return this.#element;
  }

  /* -------------------------------------------------- */

  /**
   * Set the displayed pixi graphical element.
   * @param {PIXI.Graphics}
   */
  set element(g) {
    this.#element = g;
  }

  /* -------------------------------------------------- */

  /**
   * The container element for the aura.
   * @type {PIXI.Container}
   */
  #container = null;

  /* -------------------------------------------------- */

  /**
   * The container element for the aura.
   * @type {PIXI.Container}
   */
  get container() {
    return this.#container;
  }

  /* -------------------------------------------------- */

  /**
   * Set the container element for the aura.
   * @param {PIXI.Container} c      The container.
   */
  set container(c) {
    this.#container = c;
  }

  /* -------------------------------------------------- */

  /**
   * A current token target this aura is being evaluated against. Not the origin of the aura.
   * @type {Token5e}
   */
  #target = null;

  /* -------------------------------------------------- */

  /**
   * A current token target this aura is being evaluated against. Not the origin of the aura.
   * @type {Token5e}
   */
  get target() {
    return this.#target;
  }

  /* -------------------------------------------------- */

  /**
   * Set the current token target of this aura.
   * @param {Token5e}
   */
  set target(token) {
    this.#target = token;
  }

  /* -------------------------------------------------- */

  /**
   * The type of wall restrictions that apply to this bonus.
   * @type {Set<string>}
   */
  get restrictions() {
    const r = new Set();
    for (const [k, v] of Object.entries(this.bonus.aura.require)) {
      if (v) r.add(k);
    }
    return r;
  }

  /* -------------------------------------------------- */

  /**
   * The radius of this aura, in grid measurement units.
   * @type {number}
   */
  get radius() {
    return this.bonus.aura.range;
  }

  /* -------------------------------------------------- */

  /**
   * Can this aura be drawn?
   * @type {boolean}
   */
  get isDrawable() {
    return this.bonus.aura._validRange;
  }

  /* -------------------------------------------------- */

  /**
   * Should this aura apply its bonus to the target?
   * @type {boolean}
   */
  get isApplying() {
    return this.element?.tint === this.constructor.GREEN;
  }

  /* -------------------------------------------------- */

  /**
   * Is this aura visible?
   * @type {boolean}
   */
  get visible() {
    return Boolean(this.token.object?.visible && this.token.object.renderable);
  }

  /* -------------------------------------------------- */

  /**
   * Initialize the aura.
   * @param {Token5e} target      The target to test containment against.
   */
  initialize(target) {
    this.target = target;
    this.refresh({fadeIn: true});
  }

  /* -------------------------------------------------- */

  /**
   * Refresh the drawn state of the container and the contained aura.
   * @param {object} [options]
   * @param {boolean} [options.fadeIn]      Should the aura fade in?
   */
  refresh({fadeIn = false} = {}) {
    // Create element.
    this.create();

    // Create container if missing.
    this.draw();

    // Color the element.
    this.colorize();

    // Add element to container.
    if (!this.container) return;
    this.container.addChild(this.element);

    // Fade in the container.
    if (!this.showAuras || !this.visible) this.hide();
    else if (fadeIn) this.fadeIn();
    else this.show();
  }

  /* -------------------------------------------------- */

  /**
   * Immediately hide this aura.
   */
  hide() {
    if (!this.container) return;
    CanvasAnimation.terminateAnimation(this.name);
    this.container.alpha = 0;
  }

  /* -------------------------------------------------- */

  /**
   * Immediately show this aura.
   */
  show() {
    if (!this.container) return;
    CanvasAnimation.terminateAnimation(this.name);
    this.container.alpha = 1;
  }

  /* -------------------------------------------------- */

  /**
   * Fade in the aura over a period of time.
   */
  fadeIn() {
    if (!this.container || !this.showAuras) return;
    this.show();
    CanvasAnimation.animate(
      [{attribute: "alpha", parent: this.container, to: 1, from: 0}],
      {name: this.name, duration: 200, easing: (x) => x * x}
    );
  }

  /* -------------------------------------------------- */

  /**
   * Create the inner pixi element and assign it.
   * @returns {PIXI.Graphics|null}
   */
  create() {
    if (!this.isDrawable || !this.token.object) return null;

    let radius = this.radius;
    if (this.padRadius) radius += canvas.grid.distance * Math.max(this.token.width, this.token.height) * 0.5;

    const center = this.token.object.center;
    const points = canvas.grid.getCircle(center, radius);

    let sweep = new PIXI.Polygon(points);
    for (const type of this.restrictions) {
      sweep = ClockwiseSweepPolygon.create(center, {
        includeDarkness: type === "sight",
        type: type,
        debug: false,
        useThreshold: type !== "move",
        boundaryShapes: [sweep]
      });
    }

    if (this.element) this.element.destroy();

    const g = new PIXI.Graphics();
    g.lineStyle({width: 3, color: this.white, alpha: 0.75});
    g.beginFill(0xFFFFFF, 0.03).drawPolygon(sweep).endFill();

    this.element = g;

    return g;
  }

  /* -------------------------------------------------- */

  /**
   * Create and assign a container if one is missing,
   * add the aura element to it, and add the container to the grid.
   * @returns {PIXI.Container|null}
   */
  draw() {
    if (!this.element || !this.token.object) return null;

    if (!this.container) {
      const container = new PIXI.Container();
      canvas.interface.grid.addChild(container);
      this.container = container;

      if (this.showAuras) this.show();
      else this.hide();
    }
    return this.container;
  }

  /* -------------------------------------------------- */

  /**
   * Set the color of the aura to either white, red, or green.
   */
  colorize() {
    if (!this.target) this.element.tint = this.white;
    else this.element.tint = this.contains(this.target) ? this.constructor.GREEN : this.constructor.RED;
  }

  /* -------------------------------------------------- */

  /**
   * Does this aura contain a token within its bounds?
   * @param {Token5e} token     A token placeable to test.
   * @returns {boolean}
   */
  contains(token) {
    if (!this.element || !token) return false;

    const shape = token.shape;
    const [i, j, i1, j1] = canvas.grid.getOffsetRange(token.bounds);
    const delta = (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) ? canvas.dimensions.size : 1;
    const offset = (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) ? canvas.dimensions.size / 2 : 0;
    for (let x = i; x < i1; x += delta) {
      for (let y = j; y < j1; y += delta) {
        const point = canvas.grid.getCenterPoint({i: x + offset, j: y + offset});
        const p = {
          x: point.x - token.document.x,
          y: point.y - token.document.y
        };
        if (shape.contains(p.x, p.y) && this.element.containsPoint(point)) {
          return true;
        }
      }
    }
    return false;
  }

  /* -------------------------------------------------- */

  /**
   * Destroy the aura and its container.
   * @param {object} [options]
   * @param {boolean} [options.fadeOut]     Should the aura fade out or be destroyed immediately?
   * @param {number} [options.duration]     Fade-out duration.
   */
  destroy({fadeOut = true, duration = 500} = {}) {
    const remove = () => {
      this.container?.destroy();
      delete this.auras[this.bonus.uuid];
    };

    if (this.container && fadeOut && this.showAuras && this.visible) {
      this.show();
      CanvasAnimation.animate(
        [{attribute: "alpha", parent: this.container, to: 0, from: 1}],
        {name: this.name, duration, easing: (x) => x * x}
      ).then(() => remove());
    } else remove();
  }
}

var applications = {
  BonusSheet,
  BonusWorkshop,
  KeysDialog,
  TokenAura
};

/**
 * Match a contextual bonus row against a user-entered search query.
 *
 * @param {string} text
 * @param {string} query
 * @param {string} [locale]
 * @returns {boolean}
 */
function matchesBonusSearch(text, query, locale) {
  query = String(query ?? "").trim().toLocaleLowerCase(locale);
  if (!query) return true;
  return String(text ?? "").toLocaleLowerCase(locale).includes(query);
}

const SHEET_MAPPINGS = new WeakMap();
const SHEET_SEARCHES = new WeakMap();

/**
 * Resolve a bonus from the current render mapping, falling back to its UUID.
 * The fallback handles partial sheet renders which can outlive the mapping
 * that existed when their DOM listeners were attached.
 *
 * @param {ActorSheet} sheet  Sheet containing the bonus row.
 * @param {string} uuid       Contextual bonus UUID from the row.
 * @returns {ContextualBonus|null}
 */
function _resolveBonus(sheet, uuid) {
  if (!uuid) return null;
  return SHEET_MAPPINGS.get(sheet)?.get(uuid) ?? fromUuidSync$1(uuid);
}

/**
 * Prepare one bonus row for the character-sheet tab.
 * @param {ActorSheet} sheet
 * @param {ContextualBonus} bonus
 * @param {object} rollData
 * @param {object} sections
 * @param {Set<string>} uuids
 */
async function _prepareBonusRow(sheet, bonus, rollData, sections, uuids) {
  SHEET_MAPPINGS.get(sheet).set(bonus.uuid, bonus);
  uuids.add(bonus.uuid);
  const section = sections[bonus.type] ??= {
    label: `BUILD_N_ACTION.${bonus.type.toUpperCase()}.Label`,
    key: bonus.type,
    bonuses: []
  };
  section.bonuses.push({
    bonus,
    labels: bonus.sheet._prepareLabels().slice(1).filterJoin(" &bull; "),
    tooltip: await foundry.applications.ux.TextEditor.implementation.enrichHTML(bonus.description, {
      rollData,
      relativeTo: bonus.origin
    }),
    isEmbedded: bonus.parent.isEmbedded,
    parentName: bonus.parent.name
  });
}

/**
 * Collect every bonus visible from an actor and its embedded documents.
 * @param {ActorSheet} sheet
 * @returns {Promise<{sections: object, uuids: Set<string>}>}
 */
async function _collectSheetBonuses(sheet) {
  const sections = {};
  const uuids = new Set();
  SHEET_MAPPINGS.set(sheet, new Map());

  const actorRollData = sheet.actor.getRollData();
  for (const bonus of getCollection(sheet.actor)) {
    await _prepareBonusRow(sheet, bonus, actorRollData, sections, uuids);
  }
  for (const item of sheet.actor.items) {
    const itemRollData = item.getRollData();
    for (const bonus of getCollection(item)) {
      await _prepareBonusRow(sheet, bonus, itemRollData, sections, uuids);
    }
    for (const effect of item.effects) {
      for (const bonus of getCollection(effect)) {
        await _prepareBonusRow(sheet, bonus, itemRollData, sections, uuids);
      }
    }
  }
  for (const effect of sheet.actor.effects) {
    for (const bonus of getCollection(effect)) {
      await _prepareBonusRow(sheet, bonus, actorRollData, sections, uuids);
    }
  }
  for (const section of Object.values(sections)) {
    section.bonuses.sort((a, b) => a.bonus.name.localeCompare(b.bonus.name, game.i18n.lang));
  }
  return {sections, uuids};
}

/**
 * Render the tab markup.
 * @param {ActorSheet} sheet
 * @param {object} sections
 * @returns {Promise<HTMLDivElement>}
 */
async function _renderSheetTab(sheet, sections) {
  const template = `modules/${MODULE.ID}/templates/subapplications/character-sheet-tab.hbs`;
  const div = document.createElement("DIV");
  const isActive = sheet.tabGroups.primary === MODULE.ID ? "active" : "";
  const isEdit = sheet.isEditMode;
  div.innerHTML = await foundry.applications.handlebars.renderTemplate(template, {
    ICON: MODULE.ICON,
    parentName: sheet.document.name,
    isActive,
    isEdit,
    searchQuery: SHEET_SEARCHES.get(sheet) ?? "",
    sections: Object.values(sections).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang))
  });
  return div;
}

/**
 * Add the Build-n-Action control to the public tab markup rendered by the
 * dnd5e 5.3.3 character and NPC sheets. The target structure comes from the
 * system's templates/shared/sidebar-tabs.hbs contract for the supported
 * version; no sheet class or prototype is mutated.
 *
 * @param {ActorSheet} sheet
 * @param {HTMLElement} html
 * @returns {HTMLElement|null}
 */
function _ensureTabControl(sheet, html) {
  const nav = html.querySelector("nav.tabs[data-group=primary]");
  if (!nav) return null;
  let control = nav.querySelector(`[data-tab="${MODULE.ID}"]`);
  if (control) return control;

  control = document.createElement("A");
  control.classList.add("item", "control");
  control.dataset.group = "primary";
  control.dataset.tab = MODULE.ID;
  const label = game.i18n.localize("BUILD_N_ACTION.ModuleTitle");
  control.dataset.tooltip = label;
  control.setAttribute("aria-label", label);
  const icon = document.createElement("I");
  icon.classList.add(...MODULE.ICON.split(" "));
  icon.inert = true;
  control.append(icon);
  nav.append(control);
  control.classList.toggle("active", sheet.tabGroups.primary === MODULE.ID);
  control.addEventListener("click", event => {
    event.preventDefault();
    sheet.changeTab(MODULE.ID, "primary", {event, navElement: control, updatePosition: true});
  });
  return control;
}

/**
 * Synchronize the tab control's bonus indicator and accessible label.
 * @param {HTMLElement} html
 * @param {boolean} hasBonuses
 */
function _configureTabControl(html, hasBonuses) {
  const tabControl = html.querySelector(`nav [data-tab="${MODULE.ID}"]`);
  if (!tabControl) return;
  const tooltip = game.i18n.localize("BUILD_N_ACTION.ModuleTitle");
  tabControl.classList.toggle("has-build-n-action-bonuses", hasBonuses);
  tabControl.dataset.tooltip = tooltip;
  tabControl.setAttribute("aria-label", tooltip);
}

/** Register the tab-owned bonus search without dnd5e private list methods. */
function _registerSearch(sheet, div) {
  const input = div.querySelector("[data-bna-search]");
  const clear = div.querySelector("[data-action=clearSearch]");
  const apply = query => {
    SHEET_SEARCHES.set(sheet, query);
    let visible = 0;
    for (const row of div.querySelectorAll(".item[data-search-value]")) {
      row.hidden = !matchesBonusSearch(row.dataset.searchValue, query, game.i18n.lang);
      if (!row.hidden) visible++;
    }
    for (const section of div.querySelectorAll(".items-section")) {
      section.hidden = !section.querySelector(".item:not([hidden])");
    }
    clear?.classList.toggle("active", !!String(query).trim());
    input?.setAttribute("aria-label", `${game.i18n.localize("BUILD_N_ACTION.SearchBonuses")}: ${visible}`);
  };
  input?.addEventListener("input", event => apply(event.currentTarget.value));
  clear?.addEventListener("click", () => {
    if (input) input.value = "";
    apply("");
    input?.focus();
  });
  apply(input?.value ?? "");
}

/**
 * Register actions that operate on a rendered bonus row.
 * @param {ActorSheet} sheet
 * @param {HTMLDivElement} div
 */
function _registerBonusActions(sheet, div) {
  div.querySelectorAll("[data-action]").forEach(node => {
    node.addEventListener("click", async event => {
      const target = event.currentTarget;
      if (target.dataset.action === "create") return _createChildBonus.call(sheet);
      if (target.dataset.action === "clearSearch") return;
      const uuid = target.closest("[data-item-uuid]")?.dataset.itemUuid;
      const bonus = _resolveBonus(sheet, uuid);
      if (!bonus) return;
      switch (target.dataset.action) {
        case "toggle":
          return bonus.toggle();
        case "edit":
          return bonus.sheet.render({force: true});
        case "delete":
          return bonus.deleteDialog();
        case "contextMenu":
          event.preventDefault();
          event.stopPropagation();
          return target.dispatchEvent(new PointerEvent("contextmenu", {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY
          }));
        default:
          return;
      }
    });
  });
}

/**
 * Register drag-and-drop behavior for bonus rows and sources.
 * @param {ActorSheet} sheet
 * @param {HTMLDivElement} div
 * @param {Set<string>} uuids
 */
function _registerDragAndDrop(sheet, div, uuids) {
  div.firstElementChild.addEventListener("drop", async event => {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (!sheet.isEditable) return;
    const bonus = await fromUuid(data.uuid);
    if (!bonus || uuids.has(bonus.uuid)) return;
    embedBonus(sheet.document, bonus);
  });
  div.querySelectorAll("[data-item-uuid][draggable]").forEach(node => {
    node.addEventListener("dragstart", event => {
      const bonus = _resolveBonus(sheet, event.currentTarget.dataset.itemUuid);
      const dragData = bonus?.toDragData();
      if (!dragData) return;
      event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    });
  });
}

/**
 * Register links back to a bonus source document.
 * @param {HTMLDivElement} div
 */
function _registerSourceActions(div) {
  div.querySelectorAll("[data-action='bonus-source']").forEach(node => {
    node.addEventListener("click", async event => {
      const item = await fromUuid(event.currentTarget.dataset.uuid);
      return item?.sheet.render(true);
    });
  });
}

/**
 * Handle rendering a new tab on the v2 character sheet.
 * @param {ActorSheet} sheet      The rendered sheet.
 * @param {HTMLElement} html      The element of the sheet.
 */
async function _onRenderCharacterSheet2(sheet, html) {
  const {sections, uuids} = await _collectSheetBonuses(sheet);
  const div = await _renderSheetTab(sheet, sections);
  _ensureTabControl(sheet, html);
  _configureTabControl(html, uuids.size > 0);
  _registerBonusActions(sheet, div);
  _registerDragAndDrop(sheet, div, uuids);
  _registerSourceActions(div);
  _registerSearch(sheet, div);

  const body = html.querySelector(".tab-body");
  if (!body) return;
  const tab = div.firstElementChild;
  const current = body.querySelector(`:scope > .tab.${MODULE.ID}`);
  if (current) current.replaceWith(tab);
  else body.appendChild(tab);

  new dnd5e.applications.ContextMenu5e(html, ".build-n-action-list .item[data-item-uuid]", [], {
    jQuery: false,
    onOpen: _onOpenContextMenu.bind(sheet)
  });
}

/* -------------------------------------------------- */

/**
 * Populate the context menu options.
 * @this {ActorSheet}
 * @param {HTMLElement} element     The targeted element.
 */
function _onOpenContextMenu(element) {
  const bonus = _resolveBonus(this, element.dataset.itemUuid);
  if (!bonus) {
    ui.context.menuItems = [];
    return;
  }
  ui.context.menuItems = [{
    name: "BUILD_N_ACTION.ContextMenu.Edit",
    icon: "<i class='fa-solid fa-edit'></i>",
    callback: () => bonus.sheet.render({force: true})
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Duplicate",
    icon: "<i class='fa-solid fa-copy'></i>",
    callback: () => duplicateBonus(bonus)
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Delete",
    icon: "<i class='fa-solid fa-trash'></i>",
    callback: () => bonus.deleteDialog()
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Enable",
    icon: "<i class='fa-solid fa-toggle-on'></i>",
    condition: () => !bonus.enabled,
    callback: () => bonus.toggle(),
    group: "instance"
  }, {
    name: "BUILD_N_ACTION.ContextMenu.Disable",
    icon: "<i class='fa-solid fa-toggle-off'></i>",
    condition: () => bonus.enabled,
    callback: () => bonus.toggle(),
    group: "instance"
  }];
}

/* -------------------------------------------------- */

/**
 * Utility method that creates a popup dialog for a new bonus.
 * @this {ActorSheet}
 * @returns {Promise}
 */
async function _createChildBonus() {
  if (!this.isEditable || (this.tabGroups.primary !== MODULE.ID)) return;
  const template = "systems/dnd5e/templates/apps/document-create.hbs";
  const data = {
    folders: [],
    folder: null,
    hasFolders: false,
    type: Object.keys(contextualBonuses)[0],
    types: Object.keys(contextualBonuses).reduce((acc, type) => {
      const label = game.i18n.localize(`BUILD_N_ACTION.${type.toUpperCase()}.Label`);
      acc.push({
        type: type,
        label: label,
        icon: contextualBonuses[type].metadata.defaultImg
      });
      return acc;
    }, []).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang))
  };
  const title = game.i18n.localize("BUILD_N_ACTION.Create");
  return foundry.applications.api.DialogV2.prompt({
    content: await foundry.applications.handlebars.renderTemplate(template, data),
    window: {title},
    position: {width: 350},
    classes: ["dnd5e2", "create-document", "dialog", MODULE.ID],
    ok: {
      label: title,
      callback: async (event, button) => {
        const form = button.form.querySelector("form") ?? button.form;
        const formData = new FormDataExtended(form).object;
        if (!formData.name?.trim()) delete formData.name;
        const bonus = createBonus(formData, this.document);
        return embedBonus(this.document, bonus);
      }
    },
    rejectClose: false,
    modal: true
  });
}

/* -------------------------------------------------- */

/** Initialize this part of the module. */
function characterSheetTabSetup() {
  if (!game.settings.get(MODULE.ID, SETTINGS.SHEET_TAB)) return;
  if (!game.user.isGM && !game.settings.get(MODULE.ID, SETTINGS.PLAYERS)) return;
  Hooks.on("renderCharacterActorSheet", _onRenderCharacterSheet2);
  Hooks.on("renderNPCActorSheet", _onRenderCharacterSheet2);
}

/**
 * Register enrichers.
 */
function enricherSetup() {
  CONFIG.TextEditor.enrichers.push({
    pattern: /@BNA\[(?<uuid>[^\]]+)\]/g,
    enricher: enrichContextualBonus
  });
}

/* -------------------------------------------------- */

/**
 * Enrich a content link.
 * @param {object} config     Configuration for the enrichment.
 * @returns {HTMLElement}     The created element.
 */
async function enrichContextualBonus(config) {
  const uuid = config.groups.uuid;
  const bonus = await fromUuid(uuid);
  if (!bonus) return;
  const anchor = document.createElement("A");
  anchor.dataset.uuid = uuid;
  anchor.dataset.link = "";
  anchor.classList.add(MODULE.ID, "content-link");
  if (bonus.enabled) anchor.classList.add("enabled");
  anchor.innerHTML = `<i class="${MODULE.ICON}"></i>${bonus.name}`;
  anchor.addEventListener("click", () => bonus.toggle());
  return anchor;
}

/* -------------------------------------------------- */

/**
 * Add a click event listener to content links.
 */
document.addEventListener("click", async (event) => {
  const target = event.target.closest(`a.${MODULE.ID}.content-link`);
  if (!target) return;
  if (event.detail > 1) event.preventDefault();
  const bonus = await fromUuid(target.dataset.uuid);
  await bonus?.toggle();
});

/**
 * Utility extension of Map to keep track of rolls and bonuses that apply to them.
 */
class RollRegistry extends Map {
  /**
   * Register an object of data with a generated id.
   * @param {object} config     The data to store.
   * @returns {string}          Randomly generated id to later retrieve the stored data.
   */
  register(config) {
    const id = foundry.utils.randomID();
    this.set(id, config);
    return id;
  }
}

/* -------------------------------------------------- */

/**
 * The registry of rolls being made.
 * @type {RollRegistry<string, object>}
 */
var registry = new RollRegistry();

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

class AppliedBonusesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({id: registryId, dialog, ...options}) {
    super({...options, registryId, uniqueId: `${dialog.id}-bonuses-overview`});
    this.dialog = dialog;
  }

  /* -------------------------------------------------- */

  /** @override */
  get title() {
    return game.i18n.localize("BUILD_N_ACTION.OverviewTitle");
  }

  /* -------------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: [MODULE.ID, "overview"],
    window: {
      icon: MODULE.ICON,
      resizable: false
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      close: this.#onCloseDialog,
      copyUuid: this.#onClickUuid
    },
    registryId: null
  };

  /* -------------------------------------------------- */

  /** @override */
  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/subapplications/applied-bonuses-dialog.hbs`
    }
  };

  /* -------------------------------------------------- */

  /** @override */
  async _prepareContext() {
    return {bonuses: registry.get(this.options.registryId)?.bonuses ?? []};
  }

  /* -------------------------------------------------- */

  /** Copy a source document UUID. */
  static async #onClickUuid(event, target) {
    await game.clipboard.copyPlainText(target.dataset.uuid);
    ui.notifications.info("BUILD_N_ACTION.OverviewCopied", {localize: true});
  }

  /* -------------------------------------------------- */

  /** Close the overview. */
  static #onCloseDialog() {
    return this.close();
  }
}

/**
 * Count bonuses stored directly on a document without constructing their data models.
 *
 * @param {Document|object|null} document  Document whose module flags should be inspected.
 * @returns {number}                       Number of configured Build-n-Action bonuses.
 */
function countDocumentBonuses(document) {
  const bonuses = document?.getFlag?.(MODULE.ID, "bonuses")
    ?? document?.flags?.[MODULE.ID]?.bonuses;

  if (Array.isArray(bonuses)) return bonuses.filter(Boolean).length;
  if ((bonuses instanceof Map) || (bonuses instanceof Set)) return bonuses.size;
  if (bonuses && (typeof bonuses === "object")) return Object.values(bonuses).filter(Boolean).length;
  return 0;
}

/**
 * Utility class for injecting header buttons onto actor, item, and effect sheets.
 */
class HeaderButton {
  constructor(application) {
    this.#application = application;
    this.#bonusCount = countDocumentBonuses(application.document);
  }

  /* -------------------------------------------------- */

  /**
   * The sheet that is having a header button or tab attached.
   */
  #application = null;

  /** Number of bonuses stored directly on the sheet document. */
  #bonusCount = 0;

  /* -------------------------------------------------- */

  /**
   * Should the button be available for this user?
   * @type {boolean}
   */
  get showButton() {
    return game.settings.get(MODULE.ID, SETTINGS.PLAYERS) || game.user.isGM;
  }

  /* -------------------------------------------------- */

  /**
   * Should the label be shown in a header button or just icon?
   * @type {boolean}
   */
  get showLabel() {
    return game.settings.get(MODULE.ID, SETTINGS.LABEL);
  }

  /* -------------------------------------------------- */

  /**
   * Does this application show a tab instead of a button?
   * @type {boolean}
   */
  get showTab() {
    switch (this.#application.constructor.name) {
      case "ActorSheet5eCharacter2":
      case "ActorSheet5eNPC2":
      case "CharacterActorSheet":
      case "NPCActorSheet":
        return game.settings.get(MODULE.ID, SETTINGS.SHEET_TAB);
      default:
        return false;
    }
  }

  /* -------------------------------------------------- */

  /**
   * The invalid document types that should prevent the button from being shown.
   * @type {Set<string>}
   */
  get invalidTypes() {
    switch (this.#application.document.documentName) {
      case "Actor":
        return new Set(["group"]);
      default:
        return new Set();
    }
  }

  /* -------------------------------------------------- */

  /**
   * The button label.
   * @type {string}
   */
  get label() {
    return game.i18n.localize("BUILD_N_ACTION.ModuleTitle");
  }

  /* -------------------------------------------------- */

  /** Header icon, marked when the document owns one or more bonuses. */
  get icon() {
    const marker = this.#bonusCount ? ` ${MODULE.ID}-bonus-marker` : "";
    return `${MODULE.ICON}${marker}`;
  }

  /* -------------------------------------------------- */

  /**
   * Inject the button in the application's header.
   * @param {Application} application     The rendered application.
   * @param {object[]} array              The array of buttons.
   */
  static inject(application, array) {
    const instance = new this(application);

    // Invalid document subtype.
    if (instance.invalidTypes.has(application.document.type)) return;

    // This application shows a tab instead of a header button.
    if (instance.showTab) return;

    // Header buttons are disabled.
    if (!instance.showButton) return;

    // Insert button.
    array.unshift({
      class: `${MODULE.ID}${instance.#bonusCount ? " has-bonuses" : ""}`,
      icon: instance.icon,
      onclick: () => openBonusWorkshop(application.document),
      label: instance.showLabel ? instance.label : ""
    });
  }

  /* -------------------------------------------------- */

  /**
   * Inject a control into a Foundry v14 ApplicationV2 header.
   * @param {ApplicationV2} application                  The rendered application.
   * @param {ApplicationHeaderControlsEntry[]} controls  The array of controls.
   */
  static injectV2(application, controls) {
    const document = application.document;
    if (!isEmbeddableDocument(document)) return;

    const instance = new this(application);
    if (instance.invalidTypes.has(document.type) || instance.showTab || !instance.showButton) return;

    controls.unshift({
      action: `${MODULE.ID}-builder`,
      icon: instance.icon,
      label: instance.label,
      onClick: () => openBonusWorkshop(document)
    });
  }
}

/* -------------------------------------------------- */

/**
 * Add a header button to display the source of all applied bonuses.
 * Supports both legacy roll dialogs and ApplicationV2 roll configuration.
 */
class HeaderButtonDialog extends HeaderButton {
  /** @override */
  static inject(application, array) {
    const id = application.options[MODULE.ID]?.registry;
    if (!id) return;

    const instance = new this(application);
    array.unshift({
      class: MODULE.ID,
      icon: MODULE.ICON,
      onclick: () => new AppliedBonusesDialog({id, dialog: application}).render(true),
      label: instance.showLabel ? instance.label : ""
    });
  }

  /** @override */
  static injectV2(application, controls) {
    const id = application.options[MODULE.ID]?.registry;
    if (!id) return;

    const instance = new this(application);
    controls.unshift({
      action: `${MODULE.ID}-applied`,
      icon: MODULE.ICON,
      label: instance.label,
      onClick: () => new AppliedBonusesDialog({id, dialog: application}).render(true)
    });
  }
}

/* -------------------------------------------------- */

var injections = {
  HeaderButton,
  HeaderButtonDialog};

const SUPPORTED_INTEGRATIONS = Object.freeze({
  "midi-qol": Object.freeze({label: "Midi QOL", minimum: "14.0.10"}),
  dae: Object.freeze({label: "DAE", minimum: "14.0.12"})
});

/**
 * Report the runtime state of optional automation integrations.
 * @returns {Record<string, {active: boolean, compatible: boolean, minimum: string, version: string|null}>}
 */
function getIntegrationStatus() {
  return Object.fromEntries(Object.entries(SUPPORTED_INTEGRATIONS).map(([id, support]) => {
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

/** Validate active integrations without making either module mandatory. */
function validateIntegrations() {
  const status = getIntegrationStatus();
  for (const [id, state] of Object.entries(status)) {
    if (!state.active || state.compatible) continue;
    const {label} = SUPPORTED_INTEGRATIONS[id];
    console.warn(`${MODULE.NAME} | ${label} ${state.version} is older than supported ${state.minimum}.`);
  }
  return status;
}

var models = {
  AuraModel,
  ConsumptionModel,
  ModifiersModel,
  ContextualBonus: contextualBonuses
};

/**
 * Apply immediate additive and critical damage bonuses.
 *
 * @param {object} config
 * @param {BonusCollection} bonuses
 * @param {Function} [simplifyBonus]
 */
function applyImmediateDamageBonuses(
  config,
  bonuses,
  simplifyBonus = dnd5e.utils.simplifyBonus
) {
  const critical = config.critical ??= {};
  critical.bonusDice ??= 0;
  critical.bonusDamage ??= "";

  for (const bonus of bonuses.nonoptional) {
    const rollData = config.rolls[0].data;
    if (bonus.hasPropertyBonuses) {
      critical.bonusDice += simplifyBonus(bonus.bonuses.criticalBonusDice, rollData);
      critical.bonusDamage = joinFormula(critical.bonusDamage, bonus.bonuses.criticalBonusDamage);
    }
    if (bonus.hasAdditiveBonus) appendDamagePart(config, bonus, rollData);
  }
}

/**
 * Apply dice modifiers and retain modifiers that can affect later optional bonuses.
 *
 * @param {object} config
 * @param {BonusCollection} bonuses
 * @param {Collection} modifiers
 */
function applyDamageDiceModifiers(config, bonuses, modifiers) {
  for (const bonus of bonuses.nonoptional) {
    if (!bonus.hasDiceModifiers) continue;
    applyModifierToRolls(config, bonus);
    applyModifierToCritical(config, bonus);
    if (!bonus._halted) modifiers.set(bonus.uuid, bonus);
  }
}

/**
 * Clamp and validate accumulated critical bonuses.
 *
 * @param {object} config
 * @param {Function} [validateFormula]
 */
function sanitizeCriticalBonuses(config, validateFormula = Roll.validate) {
  const critical = config.critical ??= {};
  critical.bonusDice = Math.max(0, critical.bonusDice ?? 0);
  if (critical.bonusDamage && !validateFormula(critical.bonusDamage)) {
    console.warn("Critical bonus damage resulted in invalid formula:", critical.bonusDamage);
    critical.bonusDamage = "";
  }
}

function appendDamagePart(config, bonus, rollData) {
  const roll = config.rolls.find(candidate => {
    if (!bonus.hasDamageType) return true;
    if (bonus.bonuses.damageType.size > 1) return false;
    return candidate.options.types.includes(bonus.bonuses.damageType.first());
  });

  if (roll) {
    roll.parts.push(bonus.bonuses.bonus);
    return;
  }

  config.rolls.push({
    data: rollData,
    parts: [bonus.bonuses.bonus],
    options: {
      properties: [...config.rolls[0].options.properties ?? []],
      type: bonus.bonuses.damageType.first(),
      types: Array.from(bonus.bonuses.damageType)
    }
  });
}

function applyModifierToRolls(config, bonus) {
  for (const {parts, data, options} of config.rolls) {
    if (bonus._halted) break;
    bonus._halted = bonus.bonuses.modifiers.modifyParts(parts, data) || false;

    if (!bonus._halted && options.critical?.bonusDamage) {
      const criticalParts = [options.critical.bonusDamage];
      bonus._halted = bonus.bonuses.modifiers.modifyParts(criticalParts, bonus.getRollData()) || false;
      options.critical.bonusDamage = criticalParts[0];
    }
  }
}

function applyModifierToCritical(config, bonus) {
  if (bonus._halted || !config.critical?.bonusDamage) return;
  const parts = [config.critical.bonusDamage];
  bonus._halted = bonus.bonuses.modifiers.modifyParts(parts, bonus.getRollData()) || false;
  config.critical.bonusDamage = parts[0];
}

function joinFormula(current, addition) {
  if (!addition) return current;
  return current ? `${current} + ${addition}` : addition;
}

/**
 * Append an additive part to every roll in a dnd5e BasicRoll process configuration.
 * @param {object} config  The process configuration to mutate.
 * @param {string} part    The formula part to append.
 */
function appendRollPart(config, part) {
  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    roll.parts ??= [];
    roll.parts.push(part);
  }
}

/**
 * Add target roll data to every data container used by a dnd5e roll process.
 *
 * dnd5e 5.3 may defer creating an individual roll's data object until after
 * the pre-roll hooks have run. Creating the container here is safe because
 * the system's buildConfig step merges its final roll data into that object.
 *
 * @param {object} config      The process configuration to mutate.
 * @param {object} targetData  Roll data for the targeted actor.
 */
function injectTargetData(config, targetData) {
  _removeLegacySenseAccessors(targetData);
  if (config.data && (typeof config.data === "object")) config.data.target = targetData;

  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    roll.data ??= {};
    roll.data.target = targetData;
  }
}

/**
 * Remove dnd5e 5.3 compatibility getters from ephemeral target roll data.
 * Reading those getters emits a deprecation warning when the roll dialog is
 * deep-cloned. The current values remain available under senses.ranges.
 *
 * @param {object} targetData  Target actor roll data to sanitize.
 */
function _removeLegacySenseAccessors(targetData, visited = new WeakSet()) {
  if (!targetData || (typeof targetData !== "object") || visited.has(targetData)) return;

  const prototype = Object.getPrototypeOf(targetData);
  if (!Array.isArray(targetData) && (prototype !== Object.prototype) && (prototype !== null)) return;
  visited.add(targetData);

  const descriptors = Object.getOwnPropertyDescriptors(targetData);
  const isSensesData = Object.hasOwn(descriptors, "ranges") && Object.hasOwn(descriptors.ranges, "value");
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Object.hasOwn(descriptor, "value")) {
      _removeLegacySenseAccessors(descriptor.value, visited);
    } else if (isSensesData && descriptor.configurable) {
      delete targetData[key];
    }
  }
}

/**
 * Adjust critical success and failure thresholds on every configured roll.
 * @param {object} config              The process configuration to mutate.
 * @param {number} criticalSuccess     Amount by which to expand the critical success range.
 * @param {number} criticalFailure     Amount by which to expand the critical failure range.
 * @param {boolean} allowFailureBelowOne  Whether a failure threshold below one is allowed.
 */
function adjustCriticalRanges(config, criticalSuccess, criticalFailure, allowFailureBelowOne = false) {
  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    const options = roll.options ??= {};
    options.criticalSuccess = Math.max(1, (options.criticalSuccess ?? 20) - criticalSuccess);
    options.criticalFailure = (options.criticalFailure ?? 1) + criticalFailure;
    if ((options.criticalFailure < 1) && !allowFailureBelowOne) options.criticalFailure = 1;
  }
}

/**
 * Adjust a saving throw target and, for death saves, its critical success threshold.
 * @param {object} config          The process configuration to mutate.
 * @param {number} targetBonus     Amount by which to reduce the target.
 * @param {number} criticalBonus   Amount by which to expand the death-save critical range.
 * @param {boolean} isDeath        Whether this is a death save.
 */
function adjustSavingThrowRanges(config, targetBonus, criticalBonus, isDeath) {
  if (Number.isFinite(Number(config.target))) config.target = Number(config.target) - targetBonus;
  if (!isDeath) return;

  for (const roll of config.rolls ?? []) {
    if (!roll || (typeof roll !== "object")) continue;
    const options = roll.options ??= {};
    options.criticalSuccess = Math.max(1, (options.criticalSuccess ?? 20) - criticalBonus);
    if (Number.isFinite(Number(config.target))) {
      config.target = Math.min(options.criticalSuccess, config.target);
    }
  }
}

/**
 * @typedef {object} SavingThrowDetails
 * @property {string} [ability]               The ability used for the saving throw.
 * @property {boolean} [isConcentration]      Whether this saving throw is to maintain concentration.
 * @property {boolean} [isDeath]              Whether this is a death saving throw.
 */

/* -------------------------------------------------- */
/*   Mutators                                         */
/* -------------------------------------------------- */

/**
 * When you force a saving throw...
 * @param {Activity} activity                           Activity being used.
 * @param {ActivityUseConfiguration} usageConfig        Configuration info for the activation.
 * @param {ActivityMessageConfiguration} messageConfig  Configuration info for the created chat message.
 * @param {ActivityUsageUpdates} updates                Applied usage updates.
 */
function postActivityConsumption(activity, usageConfig, messageConfig, updates) {
  if (activity.type !== "save") return;

  const subjects = {
    activity: activity,
    item: activity.item,
    actor: activity.item.actor,
    target: resolveRollTarget(usageConfig)
  };

  const rollData = activity.getRollData({deterministic: true});

  // Get bonuses:
  const bonuses = itemCheck(subjects, "save", {spellLevel: rollData.item.level});
  if (!bonuses.size) return;

  _addTargetData({data: rollData}, subjects.target, true);
  const totalBonus = bonuses.all.reduce((acc, bonus) => {
    return acc + dnd5e.utils.simplifyBonus(bonus.bonuses.bonus, rollData);
  }, 0);

  activity.save.dc.value += totalBonus;
}

/* -------------------------------------------------- */

/**
 * When you make an attack roll...
 * @param {AttackRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog    Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration data for the roll's message.
 */
function preRollAttack(config, dialog, message) {
  const item = config.subject?.item;
  if (!item) return;

  const subjects = {
    activity: config.subject,
    item: item,
    actor: item.actor,
    target: resolveRollTarget(config)
  };
  // get bonuses:
  const rollData = config.subject.getRollData();
  const spellLevel = rollData.item.level;
  const bonuses = itemCheck(subjects, "attack", {spellLevel});
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  // Gather up all bonuses.
  const mods = {criticalSuccess: 0, criticalFailure: 0};
  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
    if (bonus.hasPropertyBonuses) {
      mods.criticalSuccess += dnd5e.utils.simplifyBonus(bonus.bonuses.criticalRange, rollData);
      mods.criticalFailure += dnd5e.utils.simplifyBonus(bonus.bonuses.fumbleRange, rollData);
    }
  }

  const id = registry.register({
    ...subjects,
    bonuses: bonuses,
    // Attack rolls do not yet preserve dice modifiers for later optional bonuses.
    modifiers: new foundry.utils.Collection(),
    spellLevel: spellLevel,
    configurations: {config, dialog, message}
  });

  // Add parts.
  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  adjustCriticalRanges(config, mods.criticalSuccess, mods.criticalFailure,
    game.settings.get(MODULE.ID, SETTINGS.FUMBLE));
}

/* -------------------------------------------------- */

/**
 * When you make a damage roll...
 * @param {DamageRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog    Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration data for the roll's message.
 */
function preRollDamage(config, dialog, message) {
  const item = config.subject?.item;
  if (!item) return;

  // get bonus:
  const spellLevel = config.subject.getRollData().item.level;
  const attackMode = config.attackMode ?? null;

  const subjects = {
    activity: config.subject,
    item: item,
    actor: item.actor,
    target: resolveRollTarget(config, {preferHitTargets: true})
  };
  const bonuses = itemCheck(subjects, "damage", {spellLevel, attackMode});
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  // Used in the optional selector to determine which bonuses have and still should apply dice modifications.
  const modifiers = new foundry.utils.Collection();

  const id = registry.register({
    ...subjects,
    spellLevel: spellLevel,
    bonuses: bonuses,
    modifiers: modifiers,
    configurations: {config, dialog, message},
    attackMode: attackMode
  });
  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  applyImmediateDamageBonuses(config, bonuses);
  applyDamageDiceModifiers(config, bonuses, modifiers);
  sanitizeCriticalBonuses(config);
}

/* -------------------------------------------------- */

/**
 * When you roll a saving throw.
 * @param {SavingThrowRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog         Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message       Configuration data for the roll's message.
 */
function preRollSavingThrow(config, dialog, message) {
  const actor = config.subject;
  if (!actor) return;
  const details = {
    ability: config.ability,
    isConcentration: config.isConcentration ?? config.hookNames?.includes("concentration") ?? false,
    isDeath: config.hookNames?.includes("deathSave") ?? false
  };

  const subjects = {actor, target: resolveRollTarget(config)};
  const bonuses = throwCheck(subjects, details);
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  // Gather up all bonuses.
  const accum = {targetValue: 0, critical: 0};
  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
    const rollData = config.rolls[0]?.data ?? actor.getRollData();
    accum.targetValue += dnd5e.utils.simplifyBonus(bonus.bonuses.targetValue, rollData);
    accum.critical += dnd5e.utils.simplifyBonus(bonus.bonuses.deathSaveCritical, rollData);
  }

  const id = registry.register({
    actor: actor,
    bonuses: bonuses,
    // Saving throws do not yet preserve dice modifiers for later optional bonuses.
    modifiers: new foundry.utils.Collection(),
    details: details,
    configurations: {config, dialog, message}
  });

  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  // Add modifiers to raise/lower the target value and critical threshold.
  adjustSavingThrowRanges(config, accum.targetValue, accum.critical, details.isDeath);
}

/* -------------------------------------------------- */

/**
 * When you roll an ability, skill, or tool check.
 * @param {AbilityCheckRollProcessConfiguration} config  Configuration data for the pending roll.
 * @param {BasicRollDialogConfiguration} dialog          Presentation data for the roll configuration dialog.
 * @param {BasicRollMessageConfiguration} message        Configuration data for the roll's message.
 */
function preRollAbilityCheck(config, dialog, message) {
  const actor = config.subject;
  if (!actor) return;
  const subjects = {
    actor: actor,
    item: config.item,
    target: resolveRollTarget(config)
  };
  const details = {
    abilityId: config.ability,
    skillId: config.skill,
    toolId: config.tool
  };
  const bonuses = testCheck(subjects, details);
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
  }

  const id = registry.register({
    ...subjects,
    bonuses: bonuses,
    // Ability checks do not yet preserve dice modifiers for later optional bonuses.
    modifiers: new foundry.utils.Collection(),
    details: details,
    configurations: {config, dialog, message}
  });

  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);
}

/* -------------------------------------------------- */

/**
 * When you roll a hit die...
 * @param {HitDieRollProcessConfiguration} config  Configuration information for the roll.
 * @param {BasicRollDialogConfiguration} dialog    Configuration for the roll dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration for the roll message.
 */
function preRollHitDie(config, dialog, message) {
  const actor = config.subject;
  const subjects = {actor, target: resolveRollTarget(config)};
  const bonuses = hitDieCheck(subjects);
  if (!bonuses.size) return;
  _addTargetData(config, subjects.target);

  const modifiers = new foundry.utils.Collection();
  const id = registry.register({
    actor: actor,
    bonuses: bonuses,
    modifiers: modifiers,
    configurations: {config, dialog, message}
  });
  foundry.utils.setProperty(dialog, `options.${MODULE.ID}.registry`, id);

  for (const bonus of bonuses.nonoptional) {
    if (bonus.hasAdditiveBonus) {
      appendRollPart(config, bonus.bonuses.bonus);
    }
  }

  // Add die modifiers.
  for (const bonus of bonuses.nonoptional) {
    if (!bonus.hasDiceModifiers) continue;
    for (const {parts, data} of config.rolls) {
      if (bonus._halted) break;
      const halted = bonus.bonuses.modifiers.modifyParts(parts, data);
      if (halted) bonus._halted = true;
    }
    if (!bonus._halted) modifiers.set(bonus.uuid, bonus);
  }

  // Force dialog if there is an optional bonus.
  if (bonuses.optionals.size) dialog.configure = true;
}

/* -------------------------------------------------- */

/**
 * Inject buildNAction data on templates created by items.
 * @param {Activity} activity       Activity for which the template is being placed.
 * @param {object} templateData     Data used to create the new template.
 */
function preCreateActivityTemplate(activity, templateData) {
  const item = activity.item;
  if (!item?.isEmbedded) return;
  const [tokenDocument] = item.actor.isToken ? [item.actor.token] : item.actor.getActiveTokens(false, true);
  const disp = tokenDocument?.disposition ?? item.actor.prototypeToken.disposition;

  const bonusData = getCollection(item).reduce((acc, bonus) => {
    if (bonus.aura.isTemplate) acc.push(bonus.toObject());
    return acc;
  }, []);
  if (foundry.utils.isEmpty(bonusData)) return;
  foundry.utils.setProperty(templateData, `flags.${MODULE.ID}`, {
    bonuses: bonusData,
    templateDisposition: disp
  });
}

/* -------------------------------------------------- */

/**
 * Add the target's roll data to the actor's roll data.
 * @param {object} config               The roll config for this roll. **will be mutated**
 * @param {Token5e|null} target         The authoritative target for this roll.
 * @param {boolean} [deterministic]     Whether to force flat values for properties that could be a die or flat term.
 */
function _addTargetData(config, target, deterministic = false) {
  if (target?.actor) {
    const targetData = target.actor.getRollData({deterministic});
    injectTargetData(config, targetData);
  }
}

/* -------------------------------------------------- */

var mutators = {
  postActivityConsumption,
  preCreateActivityTemplate,
  preRollAbilityCheck,
  preRollAttack,
  preRollDamage,
  preRollHitDie,
  preRollSavingThrow
};

/**
 * Normalize a selectable consumption amount and its resulting bonus scale.
 *
 * @param {object} options
 * @param {boolean} options.scales
 * @param {string|number} options.scaleValue
 * @param {number} options.minimum
 * @param {number} [options.step]
 * @returns {{value: number, scale: number}}
 */
function calculateConsumptionScale({scales, scaleValue, minimum, step = 1}) {
  const value = Number.parseInt(scales ? scaleValue : minimum);
  const scale = scales ? Math.floor((value - minimum) / step) : 0;
  return {value, scale};
}

/**
 * Calculate the document update for item-use or quantity consumption.
 *
 * @param {"uses"|"quantity"} type
 * @param {Item5e} item
 * @param {number} value
 * @returns {{property: string, newValue: number}}
 */
function calculateItemConsumption(type, item, value) {
  if (type === "uses") {
    return {
      property: "system.uses.spent",
      newValue: item.system.uses.spent + value
    };
  }
  return {
    property: "system.quantity",
    newValue: item.system.quantity - value
  };
}

/**
 * Allocate hit-die consumption across eligible classes.
 *
 * @param {Item5e[]} classes
 * @param {string} subtype
 * @param {number} amount
 * @returns {object[]}
 */
function buildHitDiceUpdates(classes, subtype, amount) {
  const denominator = ["smallest", "largest"].includes(subtype) ? null : subtype;
  let eligible = classes.filter(cls => !denominator || (cls.system.hitDice === denominator));
  if (["smallest", "largest"].includes(subtype)) {
    eligible = [...eligible].sort((left, right) => {
      const order = left.system.hitDice.localeCompare(right.system.hitDice, "en", {numeric: true});
      return subtype === "largest" ? -order : order;
    });
  }

  const updates = [];
  let remaining = Number.parseInt(amount);
  for (const cls of eligible) {
    const available = ((remaining > 0) ? cls.system.levels : 0) - cls.system.hitDiceUsed;
    const delta = (remaining > 0) ? Math.min(remaining, available) : Math.max(remaining, available);
    if (!delta) continue;
    updates.push({_id: cls.id, "system.hitDiceUsed": cls.system.hitDiceUsed + delta});
    remaining -= delta;
    if (!remaining) break;
  }
  return updates;
}

class OptionalSelector {
  /**
   * @constructor
   * @param {string} id     Id for the registry.
   */
  constructor(id) {
    const registered = registry.get(id);
    this.#id = id;
    this.#registry = registered;

    /* -------------------------------------------------- */

    /**
     * The optional bonuses.
     * @type {Collection<ContextualBonus>}
     */
    this.optionals = registered.bonuses.optionals;

    /* -------------------------------------------------- */

    /**
     * The bonuses that just serve as reminders
     * @type {Collection<ContextualBonus>}
     */
    this.reminders = registered.bonuses.reminders;

    /* -------------------------------------------------- */

    /**
     * The actor performing the roll.
     * @type {Actor5e}
     */
    this.actor = registered.actor;

    /* -------------------------------------------------- */

    /**
     * The item being used.
     * @type {Item5e|void}
     */
    this.item = registered.item;

    /* -------------------------------------------------- */

    /**
     * The activity being used.
     * @type {Activity|void}
     */
    this.activity = registered.activity;

    /* -------------------------------------------------- */

    /**
     * The spell level of any item being rolled.
     * @type {number}
     */
    this.level = registered.spellLevel;

    /* -------------------------------------------------- */

    /**
     * Placeholder variable for the appended content.
     * @type {HTMLElement}
     */
    this.form = null;

    /* -------------------------------------------------- */

    /**
     * The dialog being appended to.
     * @type {Dialog}
     */
    this.dialog = registered.dialog;
  }

  /* -------------------------------------------------- */

  /**
     * The retrieved registry.
     * @type {object}
     */
  #registry = null;

  /* -------------------------------------------------- */

  /**
   * The id used to register data for this optional selector.
   * @type {string}
   */
  #id = null;

  /* -------------------------------------------------- */

  /** @override */
  get template() {
    return `modules/${MODULE.ID}/templates/subapplications/optional-selector.hbs`;
  }

  /* -------------------------------------------------- */

  /**
   * The situational bonus field to append bonuses to.
   * @type {HTMLElement}
   */
  get field() {
    return this.dialog.element[0]?.querySelector?.("[name=bonus]") ?? null;
  }

  /* -------------------------------------------------- */

  /**
   * Custom helper method for retrieving all the data for the template.
   * @returns {Promise<object>}
   */
  async getData() {
    const bonuses = [];
    for (const bonus of this.optionals) {

      // For bonuses that consume, skip them if they are invalid.
      if (bonus.consume.enabled) {
        const valid = this.testMinimumConsumption(bonus);
        if (!valid) continue;
      }

      const data = {
        tooltip: this._getTooltip(bonus),
        buildNAction: bonus,
        name: bonus.name.replaceAll("'", "\\'"),
        label: `BUILD_N_ACTION.OptionalSelector.Label${bonus.consume.enabled ? "Consume" : "Apply"}`,
        description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(bonus.description, {
          rollData: bonus.getRollData(), relativeTo: bonus.origin
        })
      };
      if (bonus.consume.enabled) {
        const type = ["uses", "quantity"].includes(bonus.consume.type) ? "item" : bonus.consume.type;
        data.scales = this.doesBonusScale(bonus);
        data.action = data.scales ? `consume-${type}-scale` : `consume-${type}`;
        data.options = data.scales ? this._constructScalingOptions(bonus) : null;

        data.scaleValue = new foundry.data.fields.StringField({required: true, choices: data.options});
        data.scaleDataset = {select: "scaleValue"};
      } else {
        data.action = "consume-none";
      }

      // Has multiple damage types
      if (bonus.bonuses.damageType?.size > 1) {
        const choices = {};
        for (const type of bonus.bonuses.damageType) {
          const label = CONFIG.DND5E.damageTypes[type].label;
          if (label) choices[type] = label;
        }
        data.damageTypes = new foundry.data.fields.StringField({required: true, choices: choices});
        data.damageTypeDataset = {select: "damageType"};
      }

      bonuses.push(data);
    }

    const reminders = [];
    for (const reminder of this.reminders) {
      reminders.push({
        uuid: reminder.uuid,
        name: reminder.name.replaceAll("'", "\\'"),
        description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(reminder.description, {
          rollData: reminder.getRollData(), relativeTo: reminder.origin
        })
      });
    }

    return {bonuses, reminders};
  }

  /* -------------------------------------------------- */

  /**
   * Does the bonus scale?
   * @param {ContextualBonus} bonus     A bonus to test.
   * @returns {boolean}         Whether it is set up to scale.
   */
  doesBonusScale(bonus) {
    if (!bonus.consume.scales || !bonus.consume.isValidConsumption) return false;

    // Cannot scale.
    if (["effect", "inspiration"].includes(bonus.consume.type)) return false;

    // Requires step.
    if (["health", "currency"].includes(bonus.consume.type)) return bonus.consume.value.step > 0;

    // The rest scale easily.
    return true;
  }

  /* -------------------------------------------------- */

  /**
   * Helper method to activate listeners on the optional bonuses' buttons.
   * @param {HTMLElement} html     The entire list of html injected onto the dialog.
   */
  activateListeners(html) {
    html.querySelectorAll("[data-action^='consume']").forEach(n => {
      n.addEventListener("click", this._onApplyOption.bind(this));
    });
  }

  /* -------------------------------------------------- */

  /**
   * Custom rendering method.
   * @returns {Promise}
   */
  async render() {
    const isV2 = !!this.dialog.element?.classList?.contains("dnd5e2");
    this.form = document.createElement(isV2 ? "FIELDSET" : "DIV");

    if (isV2) this.form.insertAdjacentHTML("beforeend", `<legend>${MODULE.NAME}</legend>`);
    this.form.classList.add(MODULE.ID, "optionals");

    const data = await this.getData();
    if (!data.bonuses.length && !data.reminders.length) return;
    data.isV2 = isV2;
    this.form.insertAdjacentHTML(
      "beforeend",
      await foundry.applications.handlebars.renderTemplate(this.template, data)
    );
    this.activateListeners(this.form);

    if (isV2) {
      const group = this.dialog.element.querySelector("fieldset[data-application-part=configuration]");
      group.insertAdjacentElement("afterend", this.form);
    } else {
      const group = this.dialog.element[0].querySelector(".dialog-content > form");
      group.append(this.form);
      this.dialog.setPosition({height: "auto"});
    }

    registry.delete(this.#id);
  }

  /* -------------------------------------------------- */

  /**
   * Get a tooltip for an optional bonus' origin.
   * @param {ContextualBonus} bonus     The buildNAction.
   * @returns {string}          A localized string.
   */
  _getTooltip(bonus) {
    let name;
    const docName = bonus.parent.constructor.documentName;
    if (bonus.parent instanceof MeasuredTemplateDocument) {
      name = game.i18n.localize(`DOCUMENT.${docName}`);
    } else {
      name = `${bonus.parent.name} (${game.i18n.localize(`DOCUMENT.${docName}`)})`;
    }
    return game.i18n.format("BUILD_N_ACTION.OriginName", {name});
  }

  /* -------------------------------------------------- */

  /**
   * Display a warning about lack of limited uses, quantity, spell slots, or missing effect.
   * @param {string} type     The consumption type of the buildNAction.
   */
  _displayConsumptionWarning(type) {
    ui.notifications.warn(`BUILD_N_ACTION.Warning.Consuming.${type.capitalize()}Unavailable`, {localize: true});
  }

  /* -------------------------------------------------- */

  /**
   * Construct options for a scaling bonus.
   * @param {ContextualBonus} bonus     The bonus.
   * @returns {string}          The string of select options.
   */
  _constructScalingOptions(bonus) {
    switch (bonus.consume.type) {
      case "uses":
      case "quantity":
        return this._constructItemOptions(bonus);
      case "slots":
        return this._constructSlotOptions(bonus);
      case "health":
        return this._constructHealthOptions(bonus);
      case "currency":
        return this._constructCurrencyOptions(bonus);
      case "hitdice":
        return this._constructHitDiceOptions(bonus);
      default:
        return null;
    }
  }

  /* -------------------------------------------------- */

  _constructItemOptions(bonus) {
    const isUses = bonus.consume.type === "uses";
    const item = bonus.item;
    const available = isUses ? item.system.uses.value : item.system.quantity;
    const capacity = isUses ? item.system.uses.max : item.system.quantity;
    if (available <= 0) return {};
    const min = bonus.consume.value.min || 1;
    const max = bonus.consume.value.max || Infinity;
    return Array.fromRange(available, 1).reduce((options, n) => {
      if (!n.between(min, max)) return options;
      options[n] = game.i18n.format("BUILD_N_ACTION.ConsumptionOption", {
        value: n,
        label: game.i18n.format(isUses ? "DND5E.Uses" : "DND5E.Quantity"),
        max: isUses ? `${available}/${capacity}` : available
      });
      return options;
    }, {});
  }

  /* -------------------------------------------------- */

  _constructSlotOptions(bonus) {
    // The option value is the spell property key, such as "spell3" or "pact".
    const entries = Object.entries(this.actor.system.spells).reduce((options, [key, slot]) => {
      if (!slot.value || !slot.max || !slot.level || (slot.level < (bonus.consume.value.min || 1))) {
        return options;
      }
      const isLeveled = /spell[0-9]+/.test(key);
      options[key] = game.i18n.format(`DND5E.SpellLevel${isLeveled ? "Slot" : key.capitalize()}`, {
        level: isLeveled ? game.i18n.localize(`DND5E.SpellLevel${slot.level}`) : slot.level,
        n: `${slot.value}/${slot.max}`
      });
      return options;
    }, {});
    return dnd5e.utils.sortObjectEntries(entries);
  }

  /* -------------------------------------------------- */

  _constructHealthOptions(bonus) {
    const value = bonus.consume.value;
    const hp = this.actor.system.attributes.hp;
    const available = Math.max(0, hp.value) + Math.max(0, hp.temp);
    const capacity = Math.max(0, hp.max) + Math.max(0, hp.tempmax);
    if ((available < value.min) || !(value.step > 0)) return {};
    const options = {};
    for (let i = value.min || 1; i <= Math.min(available, value.max || capacity); i += value.step) {
      options[i] = game.i18n.format("BUILD_N_ACTION.ConsumptionOption", {
        value: i,
        label: game.i18n.localize("DND5E.HitPoints"),
        max: `${available}/${capacity}`
      });
    }
    return options;
  }

  /* -------------------------------------------------- */

  _constructCurrencyOptions(bonus) {
    const value = bonus.consume.value;
    const subtype = bonus.consume.subtype;
    const available = this.actor.system.currency[subtype];
    if ((available < value.min) || !(value.step > 0)) return {};
    const options = {};
    for (let i = value.min || 1; i <= Math.min(available, value.max || Infinity); i += value.step) {
      options[i] = game.i18n.format("BUILD_N_ACTION.ConsumptionOption", {
        value: i,
        label: CONFIG.DND5E.currencies[subtype].label,
        max: available
      });
    }
    return options;
  }

  /* -------------------------------------------------- */

  _constructHitDiceOptions(bonus) {
    const value = bonus.consume.value;
    const subtype = bonus.consume.subtype;
    const hd = this.actor.system.attributes.hd;
    const isSizeSelector = ["largest", "smallest"].includes(subtype);
    const available = isSizeSelector ? hd.value : hd.bySize[subtype];
    const max = Math.min(value.max || Infinity, available);
    const label = isSizeSelector
      ? game.i18n.localize(`DND5E.ConsumeHitDice${subtype.capitalize()}`)
      : `${game.i18n.localize("DND5E.HitDice")} (${subtype})`;
    return Array.fromRange(max + 1 - value.min, value.min).reduce((options, n) => {
      options[n] = game.i18n.format("BUILD_N_ACTION.ConsumptionOption", {
        value: n,
        label,
        max: isSizeSelector ? `${hd.value}/${hd.max}` : available
      });
      return options;
    }, {});
  }

  /* -------------------------------------------------- */

  /**
   * Is consumption valid and allowed?
   * @param {ContextualBonus} bonus
   * @returns {boolean}
   */
  testMinimumConsumption(bonus) {
    const target = ["uses", "quantity", "effect"].includes(bonus.consume.type) ? bonus.parent : this.actor;
    return bonus.consume.canActorConsume(this.actor) && bonus.consume.canBeConsumed(target);
  }

  /* -------------------------------------------------- */

  /**
   * Apply an optional bonus. Depending on the bonus, consume a document or property and scale the applied value.
   * @param {Event} event     The initiating click event.
   */
  async _onApplyOption(event) {
    const button = event.currentTarget;
    button.disabled = true;
    const container = button.closest(".optional");
    const bonus = this.optionals.get(container.dataset.bonusUuid);
    const context = {
      bonus,
      button,
      damageType: this.#getDamageType(bonus, container),
      maximum: bonus.consume.value.max || Infinity,
      minimum: Number.parseInt(bonus.consume.value.min || 1),
      scales: button.dataset.action.endsWith("-scale"),
      scaleValue: container.querySelector("[data-select=scaleValue]")?.value
    };
    const type = (button.dataset.action === "consume-none") ? "none" : bonus.consume.type;
    const handlers = {
      uses: this.#consumeItem.bind(this),
      quantity: this.#consumeItem.bind(this),
      slots: this.#consumeSpellSlot.bind(this),
      health: this.#consumeHealth.bind(this),
      effect: this.#consumeEffect.bind(this),
      inspiration: this.#consumeInspiration.bind(this),
      currency: this.#consumeCurrency.bind(this),
      hitdice: this.#consumeHitDice.bind(this)
    };
    await (handlers[type] ?? this.#consumeNothing.bind(this))({...context, type});
  }

  #getDamageType(bonus, container) {
    if (bonus.type !== "damage") return undefined;
    const selected = container.querySelector("[data-select=damageType]")?.value;
    return selected || bonus.bonuses.damageType.first();
  }

  async #consumeItem(context) {
    const {bonus, button, minimum, scales, scaleValue, type} = context;
    const value = Number.parseInt(scales ? scaleValue : minimum);
    const {property, newValue} = calculateItemConsumption(type, bonus.item, value);
    if ((newValue === 0) && (type === "uses") && bonus.item.system.uses.autoDestroy) {
      if (!await bonus.item.deleteDialog()) {
        button.disabled = false;
        return;
      }
    } else {
      await bonus.item.update({[property]: newValue});
    }
    this.#finishConsumption(context, bonus.item, scales ? value - minimum : 0);
  }

  async #consumeSpellSlot(context) {
    const {bonus, maximum, minimum, scales, scaleValue} = context;
    const key = scales ? scaleValue : this._getLowestValidSpellSlotProperty(bonus);
    const spell = this.actor.system.spells[key];
    const scale = scales ? Math.min(spell.level - minimum, maximum - 1) : 0;
    await this.actor.update({[`system.spells.${key}.value`]: spell.value - 1});
    this.#finishConsumption(context, this.actor, scale);
  }

  async #consumeHealth(context) {
    const {value, scale} = calculateConsumptionScale({
      scales: context.scales,
      scaleValue: context.scaleValue,
      minimum: context.minimum,
      step: context.bonus.consume.value.step
    });
    await this.actor.applyDamage(value);
    this.#finishConsumption(context, this.actor, scale);
  }

  async #consumeEffect(context) {
    if (!await context.bonus.effect.deleteDialog()) {
      context.button.disabled = false;
      return;
    }
    this.#finishConsumption(context, context.bonus.effect, 0);
  }

  async #consumeInspiration(context) {
    await this.actor.update({"system.attributes.inspiration": false});
    this.#finishConsumption(context, this.actor, 0);
  }

  async #consumeCurrency(context) {
    const {bonus} = context;
    const {value, scale} = calculateConsumptionScale({
      scales: context.scales,
      scaleValue: context.scaleValue,
      minimum: context.minimum,
      step: bonus.consume.value.step
    });
    const currency = this.actor.system.currency[bonus.consume.subtype];
    await this.actor.update({[`system.currency.${bonus.consume.subtype}`]: currency - value});
    this.#finishConsumption(context, this.actor, scale);
  }

  async #consumeHitDice(context) {
    const value = Number.parseInt(context.scales ? context.scaleValue : context.minimum);
    const updates = buildHitDiceUpdates(
      Object.values(this.actor.classes),
      context.bonus.consume.subtype,
      value
    );
    await this.actor.updateEmbeddedDocuments("Item", updates);
    this.#finishConsumption(context, this.actor, context.scales ? value - context.minimum : 0);
  }

  async #consumeNothing(context) {
    this.#finishConsumption(context, null, 0);
  }

  #finishConsumption(context, consumer, scale) {
    const config = {bonus: this._scaleOptionalBonus(context.bonus, scale)};
    const apply = this.callHook(context.bonus, consumer, config);
    this._appendToField({
      buildNAction: context.bonus,
      target: context.button,
      bonus: config.bonus,
      apply,
      damageType: context.damageType,
      scale
    });
  }

  /* -------------------------------------------------- */

  /**
   * Return an upscaled bonus given a base and a number to multiply with. If 'scale' is 0, the default bonus is returned
   * and no scaling is performed. Evaluating roll data properties is necessary here, otherwise scaling will not work. It is
   * also needed for bonuses that do not scale, since they may be affected by dice modifiers.
   * @param {ContextualBonus} bonus     The buildNAction.
   * @param {number} scale      The number to upscale by multiplicatively.
   * @returns {string}          The upscaled bonus, simplified, and with the base attached.
   */
  _scaleOptionalBonus(bonus, scale) {
    const bonusFormula = scale ? (bonus.consume.formula || bonus.bonuses.bonus) : bonus.bonuses.bonus;
    const data = this._getRollData(bonus, scale);
    const roll = new CONFIG.Dice.DamageRoll(bonusFormula, data);
    if (!scale) return roll.formula;
    const formula = roll.alter(scale, 0, {multiplyNumeric: true}).formula;
    const base = Roll.replaceFormulaData(bonus.bonuses.bonus, data);
    return dnd5e.dice.simplifyRollFormula(`${base} + ${formula}`, {preserveFlavor: true});
  }

  /* -------------------------------------------------- */

  /**
   * Appends a bonus to the situational bonus field. If the field is empty, don't add a leading sign.
   * On the new roll configuration dialog, simply append to a roll's parts rather than paste into the field.
   * @param {object} config                   Appending configuration data.
   * @param {ContextualBonus} config.buildNAction          The ContextualBonus.
   * @param {HTMLElement} config.target       The target of the initiating click event.
   * @param {string} [config.bonus]           The bonus to add (not required if the type supports modifiers).
   * @param {boolean} [config.apply]          Whether the bonus should be applied.
   * @param {string} [config.damageType]      A selected damage type (required if a damage bonus).
   * @param {number} [scale]                  Upscaling property.
   */
  _appendToField({buildNAction, target, bonus, apply = true, damageType, scale = 0}) {
    if (!apply) return;
    this.#applyPropertyModifications(buildNAction, scale);
    this.#applyAdditiveBonus(buildNAction, bonus, damageType, scale);
    this.#applyDiceModifications(buildNAction, scale);
    this.dialog.rebuild?.();
    target.closest(".optional").classList.toggle("active", true);
  }

  /* -------------------------------------------------- */

  /**
   * Apply property modifications such as critical threshold.
   * @param {ContextualBonus} bonus       The bonus being applied.
   * @param {number} [scale]      Upscaling property.
   */
  #applyPropertyModifications(bonus, scale) {
    const config = this.dialog.config;
    const rollData = this._getRollData(bonus, scale);

    switch (bonus.type) {
      case "attack": {
        const critical = dnd5e.utils.simplifyBonus(bonus.bonuses.criticalRange, rollData);
        const fumble = dnd5e.utils.simplifyBonus(bonus.bonuses.fumbleRange, rollData);
        adjustCriticalRanges(config, critical, fumble, game.settings.get(MODULE.ID, SETTINGS.FUMBLE));
        break;
      }
      case "damage":
        if (!config.critical) config.critical = {};
        if (bonus.bonuses.criticalBonusDamage) {
          const addition = Roll.replaceFormulaData(bonus.bonuses.criticalBonusDamage, rollData);
          config.critical.bonusDamage = config.critical.bonusDamage ?
            `${config.critical.bonusDamage} + ${addition}` :
            addition;
        }
        if (bonus.bonuses.criticalBonusDice) {
          const addition = Roll.create(bonus.bonuses.criticalBonusDice, rollData).evaluateSync({strict: false}).total;
          config.critical.bonusDice = config.critical.bonusDice ? config.critical.bonusDice + addition : addition;
        }
        break;
      case "throw": {
        const target = dnd5e.utils.simplifyBonus(bonus.bonuses.targetValue, rollData);
        const critical = dnd5e.utils.simplifyBonus(bonus.bonuses.deathSaveCritical, rollData);
        adjustSavingThrowRanges(config, target, critical, this.#registry.details?.isDeath);
        break;
      }
    }
  }

  /* -------------------------------------------------- */

  /**
   * Apply the additive bonus of a buildNAction when it is toggled active.
   * @param {ContextualBonus} buildNAction         The bonus being toggled active.
   * @param {string} bonus            The additive bonus.
   * @param {string} [damageType]     A selected damage type (required if damage bonus).
   * @param {number} [scale]          Upscaling property.
   */
  #applyAdditiveBonus(buildNAction, bonus, damageType, scale) {
    if (!buildNAction.hasAdditiveBonus) return;

    // Legacy roll dialogs expose an input field instead of config.rolls.
    const field = this.field;

    if (field) {
      if (!field.value.trim()) field.value = bonus;
      else field.value = `${field.value.trim()} + ${bonus}`;
      return;
    }

    const roll = this.dialog.config.rolls.find(config => {
      if (!damageType) return true;
      const types = config.options.types;
      return (types.length === 1) && (types[0] === damageType);
    });

    if (roll) roll.parts.push(bonus);
    else {
      this.dialog.config.rolls.push({
        data: this._getRollData(buildNAction, scale),
        parts: [bonus],
        options: {
          properties: [...this.dialog.config.rolls[0].options.properties ?? []],
          type: damageType,
          types: [damageType]
        }
      });
    }
  }

  /* -------------------------------------------------- */

  /**
   * Apply dice modifiers to all parts in the roll config.
   * @param {ContextualBonus} buildNAction     A new bonus being toggled active.
   * @param {number} [scale]      Upscaling property.
   */
  #applyDiceModifications(buildNAction, scale) {
    // Store for later if other additive bonuses get added.
    if (buildNAction.hasDiceModifiers) this.#registry.modifiers.set(buildNAction.uuid, buildNAction);

    for (const bonus of this.#registry.modifiers) {
      const rollData = this._getRollData(bonus, scale);
      for (const {parts, data, options} of this.dialog.config.rolls) {
        if (bonus._halted) break;
        const halted = bonus.bonuses.modifiers.modifyParts(parts, data ?? rollData);
        if (halted) bonus._halted = true;

        // Modify critical bonus damage.
        if ((buildNAction.type === "damage") && !bonus._halted && options.critical?.bonusDamage) {
          const parts = [options.critical.bonusDamage];
          const halted = bonus.bonuses.modifiers.modifyParts(parts, rollData);
          if (halted) bonus._halted = true;
          options.critical.bonusDamage = parts[0];
        }
      }

      // Modify critical bonus damage.
      if ((buildNAction.type === "damage") && !bonus._halted && this.dialog.config.critical?.bonusDamage) {
        const parts = [this.dialog.config.critical.bonusDamage];
        const halted = bonus.bonuses.modifiers.modifyParts(parts, rollData);
        if (halted) bonus._halted = true;
        this.dialog.config.critical.bonusDamage = parts[0];
      }

      if (bonus._halted) this.#registry.modifiers.delete(bonus.uuid);
    }
  }

  /* -------------------------------------------------- */

  /**
   * Get the attribute key for the lowest available and valid spell slot. If the
   * lowest level is both a spell slot and a different kind of slot, prefer the
   * alternative. At this stage, an appropriate key is guaranteed to exist.
   * @param {ContextualBonus} bonus     The bonus used to determine the minimum spell level required.
   * @returns {string}          The attribute key.
   */
  _getLowestValidSpellSlotProperty(bonus) {
    const spells = this.actor.system.spells;
    const min = bonus.consume.value.min || 1;

    let lowest = Infinity;
    const pairs = Object.entries(spells).reduce((acc, [k, v]) => {
      if (!v.value || !v.max || !v.level || (v.level < min)) return acc;
      let set = acc.get(v.level);
      if (!set) {
        acc.set(v.level, new Set());
        set = acc.get(v.level);
      }
      set.add(k);

      lowest = Math.min(lowest, v.level);

      return acc;
    }, new Map());

    const keys = pairs.get(lowest);

    if (keys.size === 1) return keys.first();
    for (const k of keys) if (k.startsWith("spell")) keys.delete(k);
    return keys.first();
  }

  /* -------------------------------------------------- */

  /**
   * Construct the roll data for upscaling a bonus to ensure we use the roll data from the correct source.
   * This is because it may be an outside source, such as from an aura, or a granted effect, or it may be
   * a previously placed measured template aura using a different item level.
   * @param {ContextualBonus} bonus       The buildNAction.
   * @param {number} [scale]      Upscaling property.
   * @returns {object}            The roll data.
   */
  _getRollData(bonus, scale = 0) {
    const src = bonus.origin;
    if (!bonus.template && this.activity && (src.uuid === this.activity.item.uuid)) return this.activity.getRollData();
    const rollData = src.getRollData();
    rollData.scaling = new dnd5e.documents.Scaling(scale);
    return rollData;
  }

  /* -------------------------------------------------- */

  /**
   * A hook that is called after an actor, item, or effect is updated or deleted, but before any bonuses are applied.
   * @param {ContextualBonus} buildNAction                             The buildNAction that holds the optional bonus to apply.
   * @param {Actor5e|Item5e} roller                       The actor or item performing a roll or usage.
   * @param {Actor5e|Item5e|ActiveEffect5e} [target]      The actor or item that was updated or deleted, if any.
   * @param {object} config
   * @param {string} config.bonus                         The bonus that will be applied.
   * @returns {boolean}                                   Explicitly return false to cancel the application of the bonus.
   */
  callHook(buildNAction, target, config) {
    const roller = this.item ?? this.actor;
    const apply = Hooks.call(`${MODULE.ID}.applyOptionalBonus`, buildNAction, roller, target, config);
    return apply !== false;
  }
}

/** Document types whose open sheets expose Build-n-Action header controls. */
const DOCUMENT_TYPES = new Set(["Actor", "Item", "ActiveEffect", "Region"]);

/**
 * Re-render open document applications after a header-control setting changes.
 */
function refreshDocumentApplications() {
  const applications = new Set(Object.values(globalThis.ui?.windows ?? {}));
  for (const application of globalThis.foundry?.applications?.instances?.values?.() ?? []) {
    applications.add(application);
  }

  const ApplicationV2 = globalThis.foundry?.applications?.api?.ApplicationV2;
  for (const application of applications) {
    if (!DOCUMENT_TYPES.has(application.document?.documentName)) continue;
    if (ApplicationV2 && (application instanceof ApplicationV2)) application.render({force: true});
    else application.render(true);
  }
}

/**
 * Apply aura display settings to every aura currently tracked on the canvas.
 */
function refreshAuras() {
  refreshTokenAuras();
}

/**
 * Prompt connected clients to reload after changing startup-only sheet hooks.
 * @returns {Promise<void>}
 */
function reloadWorld() {
  return foundry.applications.settings.SettingsConfig.reloadConfirm({world: true});
}

/**
 * Register one world-scoped boolean setting.
 * @param {ClientSettings} settings
 * @param {string} key
 * @param {object} config
 */
function registerBooleanSetting(settings, key, config) {
  settings.register(MODULE.ID, key, {
    scope: "world",
    config: true,
    type: Boolean,
    ...config
  });
}

/**
 * Register all module settings using the Foundry V14 SettingConfig contract.
 * Injectable callbacks keep registration independently testable.
 *
 * @param {object} [options]
 * @param {ClientSettings} [options.settings]
 * @param {Function} [options.refreshDocuments]
 * @param {Function} [options.refreshAuraDisplays]
 * @param {Function} [options.reload]
 */
function registerSettings({
  settings = game.settings,
  refreshDocuments = refreshDocumentApplications,
  refreshAuraDisplays = refreshAuras,
  reload = reloadWorld
} = {}) {
  registerBooleanSetting(settings, SETTINGS.PLAYERS, {
    name: "BUILD_N_ACTION.SettingsShowBuilderForPlayersName",
    hint: "BUILD_N_ACTION.SettingsShowBuilderForPlayersHint",
    default: true,
    onChange: value => {
      refreshDocuments(value);
      if (settings.get?.(MODULE.ID, SETTINGS.SHEET_TAB)) return reload();
    }
  });

  registerBooleanSetting(settings, SETTINGS.LABEL, {
    name: "BUILD_N_ACTION.SettingsDisplayLabelName",
    hint: "BUILD_N_ACTION.SettingsDisplayLabelHint",
    default: false,
    onChange: refreshDocuments
  });

  registerBooleanSetting(settings, SETTINGS.SCRIPT, {
    name: "BUILD_N_ACTION.SettingsDisableCustomScriptFilterName",
    hint: "BUILD_N_ACTION.SettingsDisableCustomScriptFilterHint",
    default: false
  });

  registerBooleanSetting(settings, SETTINGS.AURA, {
    name: "BUILD_N_ACTION.SettingsShowAuraRangesName",
    hint: "BUILD_N_ACTION.SettingsShowAuraRangesHint",
    default: false,
    onChange: refreshAuraDisplays
  });

  registerBooleanSetting(settings, SETTINGS.RADIUS, {
    name: "BUILD_N_ACTION.SettingsPadAuraRadius",
    hint: "BUILD_N_ACTION.SettingsPadAuraRadiusHint",
    default: true,
    onChange: refreshAuraDisplays
  });

  registerBooleanSetting(settings, SETTINGS.FUMBLE, {
    name: "BUILD_N_ACTION.SettingsAllowFumbleNegationName",
    hint: "BUILD_N_ACTION.SettingsAllowFumbleNegationHint",
    default: false
  });

  registerBooleanSetting(settings, SETTINGS.SHEET_TAB, {
    name: "BUILD_N_ACTION.SettingsShowSheetTab",
    hint: "BUILD_N_ACTION.SettingsShowSheetTabHint",
    default: false,
    onChange: reload
  });
}

// Build the module-owned public API. The package API is canonical; the global
// is provided for macros and deliberately has no legacy aliases.
const buildNActionApi = {
  ...api,
  getIntegrationStatus,
  abstract: {
    DataModels: models.ContextualBonus,
    DataFields: {
      fields: fields,
      models: models
    },
    TYPES: Object.keys(models.ContextualBonus),
    applications: applications
  },
  filters: {...filters}
};
Object.defineProperty(buildNActionApi, "trees", {get: getProficiencyTrees});
configureApplicationFactories(applications);
globalThis.BuildNAction = buildNActionApi;
globalThis.buildNAction = buildNActionApi;

/* -------------------------------------------------- */

/**
 * Render the optional bonus selector on a roll dialog.
 * @param {Dialog} dialog     The dialog being rendered.
 */
async function _renderDialog(dialog) {
  const m = dialog.options[MODULE.ID];
  if (!m) return;
  const r = registry.get(m.registry);
  if (!r) return;
  r.dialog = dialog;
  new OptionalSelector(m.registry).render();
}

/* -------------------------------------------------- */

/**
 * On-drop handler for the hotbar.
 * @param {Hotbar} bar                The hotbar application.
 * @param {object} dropData           The drop data.
 * @param {string} dropData.type      The type of the dropped document.
 * @param {string} dropData.uuid      The uuid of the dropped document.
 * @param {number} slot               The slot on the hotbar where it was dropped.
 */
async function _onHotbarDrop(bar, {type, uuid}, slot) {
  if (type !== "ContextualBonus") return;
  const bonus = await buildNActionApi.fromUuid(uuid);
  const data = {
    img: bonus.img,
    command: `buildNAction.hotbarToggle("${uuid}");`,
    name: `${game.i18n.localize("BUILD_N_ACTION.ToggleBonus")}: ${bonus.name}`,
    type: CONST.MACRO_TYPES.SCRIPT
  };
  const macro = game.macros.find(m => {
    return Object.entries(data).every(([k, v]) => m[k] === v) && m.isAuthor;
  }) ?? await Macro.implementation.create(data);
  return game.user.assignHotbarMacro(macro, slot);
}

/* -------------------------------------------------- */

/** Setup the global 'trees' for proficiency searching. */
async function setupTree() {
  const trees = {};
  for (const k of ["languages", "weapon", "armor", "tool", "skills"]) {
    trees[k] = await dnd5e.documents.Trait.choices(k);
  }
  setProficiencyTrees(trees);
}

/* -------------------------------------------------- */

// General setup.
Hooks.once("init", registerSettings);
Hooks.once("init", enricherSetup);
Hooks.once("init", () => game.modules.get(MODULE.ID).api = buildNActionApi);
Hooks.on("hotbarDrop", _onHotbarDrop);
Hooks.once("setup", () => characterSheetTabSetup());

// Any application injections.
Hooks.on("getActiveEffectConfigHeaderButtons", (...T) => injections.HeaderButton.inject(...T));
Hooks.on("getActorSheetHeaderButtons", (...T) => injections.HeaderButton.inject(...T));
Hooks.on("getDialogHeaderButtons", (...T) => injections.HeaderButtonDialog.inject(...T));
Hooks.on("getItemSheetHeaderButtons", (...T) => injections.HeaderButton.inject(...T));
Hooks.on("getHeaderControlsApplicationV2", (application, controls) => {
  injections.HeaderButton.injectV2(application, controls);
  injections.HeaderButtonDialog.injectV2(application, controls);
});
Hooks.on("renderDialog", _renderDialog);
Hooks.on("renderRollConfigurationDialog", _renderDialog);
Hooks.on("refreshToken", token => {
  for (const aura of applications.TokenAura.values()) {
    if ((aura.target === token) || (aura.token === token.document)) aura.refresh();
  }
});
Hooks.on("deleteToken", tokenDocument => {
  for (const aura of applications.TokenAura.values()) {
    if (aura.token === tokenDocument) aura.destroy({fadeOut: false});
  }
});
Hooks.on("canvasTearDown", () => applications.TokenAura.clear());

// Roll hooks. Delay these to let other modules modify behaviour first.
Hooks.once("ready", function() {
  validateIntegrations();
  Hooks.callAll(`${MODULE.ID}.preInitializeRollHooks`);

  Hooks.on("dnd5e.postActivityConsumption", mutators.postActivityConsumption);
  Hooks.on("dnd5e.preRollAbilityCheck", mutators.preRollAbilityCheck);
  Hooks.on("dnd5e.preRollAttack", mutators.preRollAttack);
  Hooks.on("dnd5e.preRollDamage", mutators.preRollDamage);
  Hooks.on("dnd5e.preRollHitDie", mutators.preRollHitDie);
  Hooks.on("dnd5e.preRollSavingThrow", mutators.preRollSavingThrow);
  Hooks.on("dnd5e.preCreateActivityTemplate", mutators.preCreateActivityTemplate);

  Hooks.callAll(`${MODULE.ID}.initializeRollHooks`);
  Hooks.callAll(`${MODULE.ID}.ready`, buildNActionApi, getIntegrationStatus());
});

Hooks.once("init", function() {
  const hook = game.modules.get("babele")?.active && (game.babele?.initialized === false) ? "babele.ready" : "ready";
  Hooks.once(hook, () => setupTree());
});

Hooks.once("i18nInit", function() {
  for (const model of Object.values(models.ContextualBonus)) {
    Localization.localizeDataModel(model);
  }

  const localizeObject = object => {
    for (const [k, v] of Object.entries(object)) {
      object[k] = game.i18n.localize(v);
    }
  };

  localizeObject(MODULE.ATTACK_MODES_CHOICES);
  localizeObject(MODULE.CONSUMPTION_TYPES);
  localizeObject(MODULE.DISPOSITION_TYPES);
  localizeObject(MODULE.HEALTH_PERCENTAGES_CHOICES);
  localizeObject(MODULE.MODIFIER_MODES);
  localizeObject(MODULE.SPELL_COMPONENT_CHOICES);
  localizeObject(MODULE.TOKEN_SIZES_CHOICES);
});
