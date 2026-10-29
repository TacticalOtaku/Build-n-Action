import { asNumber, asRecord, asString } from "../core/registry/data";
import { hitDiceSpend, type ClassHitDice, type CostOption, type CostState, type ResolvedCost } from "../runtime/choices";
import { listOf, read, stringList } from "../runtime/read";
import type { SourceInfo } from "./collect";
import { isDocument } from "./documents";

function number(value: unknown): number {
  return asNumber(value) ?? 0;
}

export function slotsOf(actor: FoundryDocument): CostState["slots"] {
  return Object.entries(asRecord(read(actor, "system.spells"))).flatMap(([key, slot]) => {
    const level = asNumber(read(slot, "level"));
    const value = asNumber(read(slot, "value"));
    const max = asNumber(read(slot, "max"));
    return ((level === null) || (value === null) || (max === null)) ? [] : [{ key, level, value, max }];
  });
}

function numbersIn(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(asRecord(value)).map(([key, entry]) => [key, number(entry)]));
}

function effectExists(effect: FoundryDocument): boolean {
  const effects = read(effect.parent, "effects");
  const has = read(effects, "has");
  return (typeof has === "function") && (has.call(effects, effect.id) === true);
}

/** A character's classes with their hit dice (dnd5e 5.x fields). */
export function classHitDice(actor: FoundryDocument): ClassHitDice[] {
  return listOf(read(actor, "system.attributes.hd.classes")).filter(isDocument).map(cls => ({
    id: cls.id,
    denomination: asString(read(cls, "system.hd.denomination")),
    levels: number(read(cls, "system.levels")),
    spent: number(read(cls, "system.hd.spent"))
  }));
}

/** What the roller and the blueprint's carrier can pay right now. */
export function costState(type: string, actor: FoundryDocument, info: SourceInfo): CostState {
  const carrier = info.document;
  const item = (carrier.documentName === "Item") ? carrier : null;
  const payer = ["uses", "quantity", "effect"].includes(type) ? carrier : actor;
  const hp = read(actor, "system.attributes.hp");
  const hd = read(actor, "system.attributes.hd");
  return {
    owner: payer.isOwner === true,
    actorType: asString(read(actor, "type")),
    uses: item
      ? { value: number(read(item, "system.uses.value")), max: number(read(item, "system.uses.max")), limited: read(item, "hasLimitedUses") === true }
      : null,
    quantity: (item && (typeof read(item, "system.quantity") === "number")) ? number(read(item, "system.quantity")) : null,
    effect: (carrier.documentName === "ActiveEffect") && effectExists(carrier),
    slots: slotsOf(actor),
    hp: hp ? {
      value: number(read(hp, "value")), temp: number(read(hp, "temp")), max: number(read(hp, "max")), tempmax: number(read(hp, "tempmax"))
    } : null,
    currency: numbersIn(read(actor, "system.currency")),
    hitDice: hd ? { value: number(read(hd, "value")), max: number(read(hd, "max")), bySize: numbersIn(read(hd, "bySize")) } : null,
    inspiration: read(actor, "system.attributes.inspiration") === true,
    currencies: Object.keys(asRecord(CONFIG.DND5E.currencies)),
    hitDieTypes: stringList(CONFIG.DND5E.hitDieTypes)
  };
}

async function call(target: unknown, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = read(target, method);
  if (typeof fn !== "function") throw new Error(`Build-n-Action | ${method} is not available`);
  return fn.apply(target, args);
}

async function confirmDelete(document: FoundryDocument): Promise<boolean> {
  return !!(await call(document, "deleteDialog"));
}

/** Pay a choice's cost; false when the player cancelled a confirmation. */
export async function payCost(cost: ResolvedCost, option: CostOption, actor: FoundryDocument, info: SourceInfo): Promise<boolean> {
  const carrier = info.document;
  switch (cost.type) {
    case "none":
      return true;
    case "uses": {
      const spent = number(read(carrier, "system.uses.spent")) + option.amount;
      if ((spent >= number(read(carrier, "system.uses.max"))) && (read(carrier, "system.uses.autoDestroy") === true)) {
        return confirmDelete(carrier);
      }
      await carrier.update({ "system.uses.spent": spent });
      return true;
    }
    case "quantity":
      await carrier.update({ "system.quantity": number(read(carrier, "system.quantity")) - option.amount });
      return true;
    case "slots":
      await actor.update({ [`system.spells.${option.value}.value`]: number(read(actor, `system.spells.${option.value}.value`)) - 1 });
      return true;
    case "health":
      await call(actor, "applyDamage", option.amount);
      return true;
    case "effect":
      return confirmDelete(carrier);
    case "inspiration":
      await actor.update({ "system.attributes.inspiration": false });
      return true;
    case "currency":
      await actor.update({ [`system.currency.${cost.subtype}`]: number(read(actor, `system.currency.${cost.subtype}`)) - option.amount });
      return true;
    case "hitdice": {
      const classes = classHitDice(actor);
      const updates = hitDiceSpend(classes, cost.subtype, option.amount).map(entry => ({ _id: entry.id, "system.hd.spent": entry.spent }));
      await call(actor, "updateEmbeddedDocuments", "Item", updates);
      return true;
    }
    default:
      return false;
  }
}
