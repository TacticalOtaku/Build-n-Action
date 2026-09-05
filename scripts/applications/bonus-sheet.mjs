import {ContextualBonus} from "../models/contextual-bonus-model.mjs";
import {MODULE} from "../constants.mjs";
import fields from "../fields/_module.mjs";
import {getCollection} from "../services/bonus-repository.mjs";
import {updateBonusImage} from "../services/bonus-image.mjs";
import {scrollFilterIntoView} from "./filter-navigation.mjs";
import KeysDialog from "./keys-dialog.mjs";

export default class BonusSheet extends foundry.applications.api.HandlebarsApplicationMixin(
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

    const imageInput = this.element.querySelector("input[name=img]");
    const imagePreview = this.element.querySelector("[data-bna-image-preview]");
    const fallbackImage = imagePreview?.dataset.fallbackSrc ?? "icons/svg/dice-target.svg";
    const showImagePreview = path => {
      if (imagePreview) imagePreview.src = String(path ?? "").trim() || fallbackImage;
    };
    imagePreview?.addEventListener("error", () => {
      if (!imagePreview.src.endsWith(fallbackImage)) imagePreview.src = fallbackImage;
    });
    imageInput?.addEventListener("input", event => showImagePreview(event.currentTarget.value));
    imageInput?.addEventListener("change", async event => {
      // Prevent DocumentSheetV2 submit-on-change from persisting nested bonus
      // data through the parent ActiveEffect. ContextualBonus owns this field.
      event.stopPropagation();
      await updateBonusImage(this.bonus, event.currentTarget.value);
      await this.render({force: true});
    });

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
      // Removing the last repeat drops the filter entirely, the same as a single one.
      if (property.length) {
        data.filters[id] = property;
      } else {
        this._filters.delete(id);
        delete data.filters[id];
      }
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
