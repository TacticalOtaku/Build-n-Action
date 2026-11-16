import type { ChainIntent } from "../core/engine/interpreter";
import { createPhraseFormatter } from "../core/phrase/formatter";
import { asNumber, asRecord, asString, asStrings } from "../core/registry/data";
import { getResult } from "../core/registry/index";
import type { PhraseFormatter } from "../core/registry/types";
import { costAvailable, costOptions, costScales, resolveCost, type Choice, type CostOption, type ResolvedCost } from "../runtime/choices";
import { reminderKey, type EvaluationContext, type PendingRoll } from "../runtime/play";
import { read } from "../runtime/read";
import { resolvedAdvantageMode, type ProcessConfig } from "../runtime/roll-config";
import { applyModifiers, applyRollIntents, type ApplyContext } from "./apply";
import { foundryChoices, foundryTranslator } from "./choices";
import { sourceLabel, type SourceInfo } from "./collect";
import { originRollData, recordUsage, rollDataOf } from "./documents";
import { scaledFormula, simplifyNumber } from "./formulas";
import { costState, payCost, reminderRecipients } from "./operations";
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

type FoundryPendingRoll = PendingRoll<FoundryDocument, FoundryDocument, FoundryDocument, TokenPlaceable>;
type AnnounceFn = (intents: readonly ChainIntent[], context: EvaluationContext<FoundryDocument, FoundryDocument>) => void;

function applyChoice(
  pending: FoundryPendingRoll,
  choice: Choice,
  info: SourceInfo,
  scale: number,
  damageType: string | undefined,
  app: unknown,
  announce: AnnounceFn
): void {
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
  const changedAdvantage = choice.intents.some(intent => intent.type === "rollAdvantage");
  if (changedAdvantage) syncDialogAdvantage(app, config);
  const rebuild = read(app, "rebuild");
  if (typeof rebuild === "function") rebuild.call(app);
  if (changedAdvantage) {
    const render = read(app, "render");
    if (typeof render === "function") void render.call(app, { parts: ["buttons"] });
  }
  announce(choice.intents, pending.context);
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
export function renderChoices(host: ChoiceHost, sorted: { choices: readonly Choice[]; reminders: readonly ChainIntent[] }): HTMLFieldSetElement | null {
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

/** Keep the roll dialog's highlighted button and advantage mode aligned with updated config flags. */
export function syncDialogAdvantage(dialog: unknown, config: ProcessConfig): void {
  if (!dialog || (typeof dialog !== "object")) return;
  const holder = dialog as Record<string, unknown>;
  const existing = holder.options;
  const record = (existing && (typeof existing === "object") && !Array.isArray(existing))
    ? existing as Record<string, unknown>
    : null;
  const resolved = resolvedAdvantageMode(config);
  const numericMode = (resolved === "advantage") ? 1 : ((resolved === "disadvantage") ? -1 : 0);
  if (record && !Object.isFrozen(record)) {
    record.defaultButton = resolved;
    if ("advantageMode" in record) record.advantageMode = numericMode;
    return;
  }
  const updated: Record<string, unknown> = { ...(record ?? {}), defaultButton: resolved };
  if ("advantageMode" in updated) updated.advantageMode = numericMode;
  try {
    holder.options = (record && Object.isFrozen(record)) ? Object.freeze(updated) : updated;
  } catch {
    // Custom dialog shims with read-only getter options keep roll.options as the fallback source.
  }
}

function dialogReminderVisible(intent: ChainIntent, actor: FoundryDocument): boolean {
  const audience = asString(intent.data.audience, "auto");
  if ((audience === "all") || (audience === "target")) return false;
  if (audience === "gm") return game.user.isGM;
  if (audience === "self") return reminderRecipients("self", actor)?.includes(game.user.id) ?? false;
  return true;
}

/** Show the "Build-n-Action" panel inside a Foundry roll configuration dialog when pending choices exist. */
export function renderRollPanel(pending: FoundryPendingRoll | null, app: unknown, announce: AnnounceFn): void {
  const root = read(app, "element");
  if (!pending || !(root instanceof HTMLElement) || root.querySelector(".bna-panel")) return;
  const visibleReminders = pending.sorted.reminders.filter(reminder => dialogReminderVisible(reminder, pending.ctx.roller.actor));
  const host: ChoiceHost = {
    ctx: pending.ctx,
    applied: pending.applied,
    apply: (choice, info, scale, damageType) => applyChoice(pending, choice, info, scale, damageType, app, announce)
  };
  const panel = renderChoices(host, { ...pending.sorted, reminders: visibleReminders });
  if (!panel) return;
  for (const reminder of visibleReminders) pending.shownReminders.add(reminderKey(reminder));
  const anchor = root.querySelector('fieldset[data-application-part="configuration"]');
  if (anchor) anchor.after(panel);
  else (root.querySelector(".window-content") ?? root).append(panel);
}

/** Prompt the player with optional reaction choices inside a dialog. */
export async function promptChoices(choices: readonly Choice[], ctx: ApplyContext, apply: ChoiceHost["apply"]): Promise<void> {
  const host: ChoiceHost = { ctx, applied: new Set(), apply };
  const panel = renderChoices(host, { choices, reminders: [] });
  if (!panel) return;
  await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format("BNA.Reaction.Title", { name: ctx.roller.actor.name }), icon: "fa-solid fa-diagram-project" },
    position: { width: 420 },
    content: "<div class=\"bna-reaction\"></div>",
    buttons: [{ action: "done", label: game.i18n.localize("BNA.Reaction.Done"), default: true }],
    rejectClose: false,
    render: (_event: unknown, dialog: unknown) => {
      const element = asRecord(dialog).element;
      if (element instanceof HTMLElement) element.querySelector(".bna-reaction")?.append(panel);
    }
  });
}
