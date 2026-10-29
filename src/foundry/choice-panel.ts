import type { ChainIntent } from "../core/engine/interpreter";
import { createPhraseFormatter } from "../core/phrase/formatter";
import { asNumber, asString, asStrings } from "../core/registry/data";
import { getResult } from "../core/registry/index";
import type { PhraseFormatter } from "../core/registry/types";
import { MODULE_SCOPE } from "../core/storage/repository";
import { costAvailable, costOptions, costScales, resolveCost, type Choice, type CostOption, type ResolvedCost, type SortedIntents } from "../runtime/choices";
import { read } from "../runtime/read";
import type { ProcessConfig } from "../runtime/roll-config";
import { applyModifiers, applyRollIntents } from "./apply";
import { foundryChoices, foundryTranslator } from "./choices";
import { sourceLabel, type SourceInfo } from "./collect";
import { costState, payCost } from "./consume";
import { originRollData, rollDataOf } from "./documents";
import { scaledFormula, simplifyNumber } from "./formulas";
import type { ApplyContext } from "./apply";
import { announceApplied, guarded } from "./evaluate";
import { pendingRoll, type PendingRoll } from "./roll-state";
import { recordUsage } from "./usage";
import { log } from "../core/log";

const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  uses: "DND5E.Uses", quantity: "DND5E.Quantity", health: "DND5E.HitPoints", hitdice: "DND5E.HitDice"
};

const provider = foundryChoices();

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function describe(intents: readonly ChainIntent[], fmt: PhraseFormatter): string {
  return intents.map(intent => getResult(intent.type)?.phrase(intent.data, fmt) ?? intent.type).filter(Boolean).join("; ");
}

function capitalize(text: string): string {
  return text ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;
}

function optionLabel(cost: ResolvedCost, option: CostOption, actor: FoundryDocument): string {
  if (cost.type === "slots") {
    const level = asNumber(read(actor, `system.spells.${option.value}.level`)) ?? 0;
    const leveled = /^spell\d+$/.test(option.value);
    return game.i18n.format(leveled ? "DND5E.SpellLevelSpell" : `DND5E.SpellLevel${capitalize(option.value)}`, {
      level: leveled ? game.i18n.localize(`DND5E.SpellLevel${level}`) : level,
      n: option.available
    });
  }
  const resource = RESOURCE_LABELS[cost.type]
    ?? ((cost.type === "currency") ? asString(read(CONFIG.DND5E.currencies, `${cost.subtype}.label`)) : "");
  return game.i18n.format("BNA.Panel.Option", { amount: option.amount, resource: game.i18n.localize(resource), available: option.available });
}

/** Who shows choices and what applying one does: change the open roll dialog, or perform reaction changes. */
export interface ChoiceHost {
  ctx: ApplyContext;
  /** Keys of choices already applied (a re-render must not offer them twice). */
  applied: Set<string>;
  apply(choice: Choice, info: SourceInfo, scale: number, damageType: string | undefined): Promise<void> | void;
}

/** Roll data for a choice: the activity's when the blueprint is on the rolled item, else its origin's; plus @scaling. */
export function choiceData(info: SourceInfo, ctx: ApplyContext, scale: number): Record<string, unknown> {
  const { roller } = ctx;
  const onRolledItem = (info.kind !== "template") && !!roller.activity && !!info.origin && (info.origin.uuid === roller.item?.uuid);
  const data = onRolledItem ? rollDataOf(roller.activity) : originRollData(info.document);
  data.scaling = new dnd5e.documents.Scaling(scale);
  return data;
}

function applyChoice(pending: PendingRoll, choice: Choice, info: SourceInfo, scale: number, damageType: string | undefined, app: unknown): void {
  const config = read(app, "config") as ProcessConfig | undefined;
  if (!config) return;
  const { ctx, tracker } = pending;
  const start = (config.rolls ?? []).map(roll => (roll.parts ?? []).length);
  const criticalBefore = config.critical?.bonusDamage ?? "";
  const earlier = [...tracker.active];
  const data = choiceData(info, ctx, scale);
  applyRollIntents(config, choice.intents, ctx, tracker, {
    data,
    damageType,
    formula: intent => (intent.type === "rollBonus")
      ? scaledFormula(asString(intent.data.formula), choice.cost.formula, data, scale)
      : undefined
  });
  const criticalChanged = (config.critical?.bonusDamage ?? "") !== criticalBefore;
  for (const intent of earlier) applyModifiers(config, intent, ctx, tracker, start, criticalChanged);
  const rebuild = read(app, "rebuild");
  if (typeof rebuild === "function") rebuild.call(app);
  announceApplied(choice.intents, pending.context);
  pending.chosen.push(...choice.intents);
}

interface Controls {
  button: HTMLButtonElement;
  amount: HTMLSelectElement | null;
  damageType: HTMLSelectElement | null;
}

async function onApply(host: ChoiceHost, choice: Choice, info: SourceInfo, cost: ResolvedCost, section: HTMLElement, controls: Controls): Promise<void> {
  if (host.applied.has(choice.key)) return;
  const { button } = controls;
  const actor = host.ctx.roller.actor;
  button.disabled = true;
  try {
    const state = costState(cost.type, actor, info);
    const options = costOptions(cost, state);
    const option = controls.amount ? options.find(entry => entry.value === controls.amount?.value) : options[0];
    if (!option || !costAvailable(cost, state)) {
      ui.notifications.warn(game.i18n.localize("BNA.Panel.CannotPay"));
      button.disabled = false;
      return;
    }
    if (!(await payCost(cost, option, actor, info))) {
      button.disabled = false;
      return;
    }
    await host.apply(choice, info, option.scale, controls.damageType?.value || undefined);
    for (const intent of choice.intents) {
      if (intent.common.limit === "none") continue;
      recordUsage(actor, intent.blueprintId, intent.nodeId).catch(error => log.warn("could not record a limited use", error));
    }
    host.applied.add(choice.key);
    section.classList.add("is-applied");
    button.textContent = game.i18n.localize("BNA.Panel.Applied");
    for (const select of [controls.amount, controls.damageType]) {
      if (select) select.disabled = true;
    }
  } catch (error) {
    log.warn("could not apply a choice", error);
    button.disabled = false;
  }
}

function reminderNote(intent: ChainIntent, host: ChoiceHost): HTMLElement {
  const info = host.ctx.sources.get(intent.entry);
  const note = element("aside", "bna-note");
  note.append(element("strong", "", info?.blueprint.name || game.i18n.localize("BNA.Panel.Reminder")), asString(intent.data.text));
  return note;
}

function choiceSection(choice: Choice, host: ChoiceHost, fmt: PhraseFormatter): HTMLElement | null {
  const first = choice.intents[0];
  const info = first ? host.ctx.sources.get(first.entry) : undefined;
  if (!info) return null;
  const actor = host.ctx.roller.actor;
  const originData = originRollData(info.document, true);
  const cost = resolveCost(choice.cost, formula => simplifyNumber(formula, originData));
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
  if (info.blueprint.description) {
    foundry.applications.ux.TextEditor.implementation
      .enrichHTML(info.blueprint.description, { rollData: originData, relativeTo: info.origin })
      .then(html => { description.innerHTML = html; })
      .catch(() => undefined);
  }

  const row = element("div", "bna-choice__controls");
  const controls: Controls = { button: element("button", "bna-choice__apply"), amount: null, damageType: null };
  if (costScales(cost, state)) {
    controls.amount = element("select", "bna-choice__amount");
    controls.amount.setAttribute("aria-label", game.i18n.localize("BNA.Panel.Amount"));
    for (const option of options) controls.amount.append(new Option(optionLabel(cost, option, actor), option.value));
    row.append(controls.amount);
  }
  const typed = (host.ctx.event === "damageRoll")
    ? choice.intents.find(intent => (intent.type === "rollBonus") && (asStrings(intent.data.damageTypes).length > 1))
    : undefined;
  if (typed) {
    controls.damageType = element("select", "bna-choice__type");
    controls.damageType.setAttribute("aria-label", game.i18n.localize("BNA.Panel.DamageType"));
    const labels = provider.choices("damageAndHealingTypes");
    for (const type of asStrings(typed.data.damageTypes)) {
      controls.damageType.append(new Option(labels.find(label => label.value === type)?.label ?? type, type));
    }
    row.append(controls.damageType);
  }
  controls.button.type = "button";
  controls.button.disabled = applied;
  for (const select of [controls.amount, controls.damageType]) {
    if (select) select.disabled = applied;
  }
  controls.button.textContent = game.i18n.localize(applied ? "BNA.Panel.Applied" : ((cost.type === "none") ? "BNA.Panel.Apply" : "BNA.Panel.Spend"));
  controls.button.addEventListener("click", () => {
    void onApply(host, choice, info, cost, section, controls);
  });
  row.append(controls.button);
  section.append(row);
  return section;
}

/** The "Build-n-Action" fieldset with reminders and choices; null when there is nothing to offer. */
export function renderChoices(host: ChoiceHost, sorted: Pick<SortedIntents, "choices" | "reminders">): HTMLFieldSetElement | null {
  const fmt = createPhraseFormatter(foundryTranslator, provider);
  const panel = element("fieldset", "bna-surface bna-panel");
  panel.append(element("legend", "", "Build-n-Action"));
  for (const reminder of sorted.reminders) panel.append(reminderNote(reminder, host));
  for (const choice of sorted.choices) {
    const section = choiceSection(choice, host, fmt);
    if (section) panel.append(section);
  }
  return (panel.children.length > 1) ? panel : null;
}

function renderPanel(app: unknown): void {
  const pending = pendingRoll(read(app, `options.${MODULE_SCOPE}.pending`));
  const root = read(app, "element");
  if (!pending || !(root instanceof HTMLElement) || root.querySelector(".bna-panel")) return;
  const host: ChoiceHost = {
    ctx: pending.ctx,
    applied: pending.applied,
    apply: (choice, info, scale, damageType) => applyChoice(pending, choice, info, scale, damageType, app)
  };
  const panel = renderChoices(host, pending.sorted);
  if (!panel) return;
  const anchor = root.querySelector('fieldset[data-application-part="configuration"]');
  if (anchor) anchor.after(panel);
  else (root.querySelector(".window-content") ?? root).append(panel);
}

export function registerChoicePanel(): void {
  Hooks.on("renderRollConfigurationDialog", (app: unknown) => guarded("roll dialog", () => renderPanel(app)));
}
