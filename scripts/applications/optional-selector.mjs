import {MODULE, SETTINGS} from "../constants.mjs";
import {ContextualBonus} from "../models/contextual-bonus-model.mjs";
import registry from "../registry.mjs";
import {
  buildHitDiceUpdates,
  calculateConsumptionScale,
  calculateItemConsumption
} from "../services/consumption.mjs";
import {adjustCriticalRanges, adjustSavingThrowRanges} from "../utils/roll-config.mjs";

export default class OptionalSelector {
  /**
   * @constructor
   * @param {string} id     Id for the registry.
   */
  constructor(id) {
    const registered = registry.get(id);
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
    const root = isV2 ? this.dialog.element : this.dialog.element?.[0];

    // Applying an optional bonus rebuilds the dialog, which re-fires the render hook.
    // The injected element survives that rebuild and records which optionals were already
    // applied, so injecting a second copy would stack duplicate blocks and let the same
    // bonus be applied - and its resource consumed - again on every rebuild.
    if (root?.querySelector(`.${MODULE.ID}.optionals`)) return;

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
      const group = root.querySelector("fieldset[data-application-part=configuration]");
      group.insertAdjacentElement("afterend", this.form);
    } else {
      const group = root.querySelector(".dialog-content > form");
      group.append(this.form);
      this.dialog.setPosition({height: "auto"});
    }
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
      // dnd5e labels a leveled slot with DND5E.SpellLevelSpell and a pact slot with
      // DND5E.SpellLevelPact; there is no "...Slot" key, so that suffix rendered raw.
      const isLeveled = /spell[0-9]+/.test(key);
      options[key] = game.i18n.format(`DND5E.SpellLevel${isLeveled ? "Spell" : key.capitalize()}`, {
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
