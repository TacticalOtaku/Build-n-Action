import { nextCounterValue, readCounterStore } from "../core/counters/counters";
import { asNumber, asRecord, asString } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import {
  hitDiceSpend,
  type ClassHitDice,
  type CostOption,
  type CostState,
  type ResolvedCost,
} from "../runtime/choices";
import { effectSources } from "../runtime/facts";
import {
  currencyValue,
  pickSlot,
  planCostPayment,
  quantityValue,
  slotValue,
  tempHp,
  usesSpent,
  type Operation,
} from "../runtime/operations";
import { listOf, read, stringList } from "../runtime/read";
import type { SourceInfo } from "./collect";
import { documentFromUuid, isDocument, ownerActor, queueFor } from "./documents";
import { addRider } from "./riders";

function number(value: unknown): number {
  return asNumber(value) ?? 0;
}

function numbersIn(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(asRecord(value)).map(([key, entry]) => [key, number(entry)]));
}

async function call(target: unknown, method: string, ...args: unknown[]): Promise<unknown> {
  const fn = read(target, method);
  if (typeof fn !== "function") throw new Error(`Build-n-Action | ${method} is not available`);
  return fn.apply(target, args);
}

async function documentAt(uuid: string): Promise<FoundryDocument | null> {
  if (!uuid) return null;
  const found = await fromUuid(uuid);
  return isDocument(found) ? found : null;
}

function slotsOf(actor: FoundryDocument): CostState["slots"] {
  return Object.entries(asRecord(read(actor, "system.spells"))).flatMap(([key, slot]) => {
    const level = asNumber(read(slot, "level"));
    const value = asNumber(read(slot, "value"));
    const max = asNumber(read(slot, "max"));
    return level === null || value === null || max === null ? [] : [{ key, level, value, max }];
  });
}

function classHitDice(actor: FoundryDocument): ClassHitDice[] {
  return listOf(read(actor, "system.attributes.hd.classes"))
    .filter(isDocument)
    .map((cls) => ({
      id: cls.id,
      denomination: asString(read(cls, "system.hd.denomination")),
      levels: number(read(cls, "system.levels")),
      spent: number(read(cls, "system.hd.spent")),
    }));
}

function effectExists(effect: FoundryDocument): boolean {
  const effects = read(effect.parent, "effects");
  const has = read(effects, "has");
  return typeof has === "function" && has.call(effects, effect.id) === true;
}

/** What the roller and the blueprint's carrier can pay right now. */
export function costState(type: string, actor: FoundryDocument, info: SourceInfo): CostState {
  const carrier = info.document;
  const item = carrier.documentName === "Item" ? carrier : null;
  const payer = ["uses", "quantity", "effect"].includes(type) ? carrier : actor;
  const hp = read(actor, "system.attributes.hp");
  const hd = read(actor, "system.attributes.hd");
  return {
    owner: payer.isOwner === true,
    actorType: asString(read(actor, "type")),
    uses: item
      ? {
          value: number(read(item, "system.uses.value")),
          max: number(read(item, "system.uses.max")),
          limited: read(item, "hasLimitedUses") === true,
        }
      : null,
    quantity:
      item && typeof read(item, "system.quantity") === "number"
        ? number(read(item, "system.quantity"))
        : null,
    effect: carrier.documentName === "ActiveEffect" && effectExists(carrier),
    slots: slotsOf(actor),
    hp: hp
      ? {
          value: number(read(hp, "value")),
          temp: number(read(hp, "temp")),
          max: number(read(hp, "max")),
          tempmax: number(read(hp, "tempmax")),
        }
      : null,
    currency: numbersIn(read(actor, "system.currency")),
    hitDice: hd
      ? {
          value: number(read(hd, "value")),
          max: number(read(hd, "max")),
          bySize: numbersIn(read(hd, "bySize")),
        }
      : null,
    inspiration: read(actor, "system.attributes.inspiration") === true,
    currencies: Object.keys(asRecord(CONFIG.DND5E.currencies)),
    hitDieTypes: stringList(CONFIG.DND5E.hitDieTypes),
  };
}

/** Pay a choice's cost; false when the player cancelled a confirmation or the cost is unsupported. */
export async function payCost(
  cost: ResolvedCost,
  option: CostOption,
  actor: FoundryDocument,
  info: SourceInfo,
): Promise<boolean> {
  const carrier = info.document;
  const plan = planCostPayment(cost, option, {
    actor: actor.uuid,
    carrier: carrier.uuid,
    usesSpent: number(read(carrier, "system.uses.spent")),
    usesMax: number(read(carrier, "system.uses.max")),
    autoDestroy: read(carrier, "system.uses.autoDestroy") === true,
  });
  if (!plan) return false;
  if (plan.kind === "none") return true;
  if (plan.kind === "confirmDelete") return !!(await call(carrier, "deleteDialog"));
  await executeOperation(plan.op);
  return true;
}

/** Whether a user can reach a document: they own it, or it belongs to a creature on the scene they look at. */
function reachable(document: FoundryDocument | null, user: UserLike): boolean {
  if (!document) return false;
  if (document.testUserPermission?.(user, "OWNER") === true) return true;
  const actor = ownerActor(document);
  const scene = game.scenes.get(user.viewedScene ?? "");
  return (
    !!actor &&
    listOf(read(scene, "tokens")).some((token) => read(read(token, "actor"), "uuid") === actor.uuid)
  );
}

/**
 * Whether the GM makes a change another user asked for. Their reactions change what they own and the creatures they
 * roll against, so a change must reach one of those; anything else in the world is refused.
 */
export function mayRequest(op: Operation, user: UserLike): boolean {
  if (!reachable(documentFromUuid(op.actor), user)) return false;
  if (op.kind === "copyEffect") return reachable(documentFromUuid(op.effect), user);
  if (op.kind === "resource" && op.item) return reachable(documentFromUuid(op.item), user);
  if (op.kind === "chat" && op.target) return reachable(documentFromUuid(op.target), user);
  return true;
}

/** Whether this user may make the change without the GM. */
export function canRunLocally(op: Operation): boolean {
  if (op.kind === "chat") return game.user.isGM || (!game.users.activeGM && op.audience !== "gm");
  const actor = documentFromUuid(op.actor);
  // Counters are changed by the active GM alone, one change at a time; without a GM, by an owner.
  if (op.kind === "counter")
    return game.users.activeGM?.id === game.user.id || (!game.users.activeGM && actor?.isOwner === true);
  if (!actor?.isOwner) return false;
  if (op.kind === "resource" && op.item) return documentFromUuid(op.item)?.isOwner === true;
  return true;
}

/** Format a chat note safely so user-entered text cannot inject markup. */
export function reminderNoteHtml(label: string, text: string): string {
  const escapedLabel = foundry.utils.escapeHTML(label);
  const escapedText = foundry.utils.escapeHTML(text).replaceAll("\n", "<br>");
  return `<p><strong>${escapedLabel}</strong></p><p>${escapedText}</p>`;
}

/** Chat whisper user IDs for a reminder audience, or null when no recipient applies (for example, missing target). */
export function reminderRecipients(
  audience: string,
  actor: FoundryDocument,
  targetActor: FoundryDocument | null = null,
): string[] | null {
  const users = [...game.users];
  const gmIds = users.filter((user) => user.isGM).map((user) => user.id);
  switch (audience) {
    case "all":
      return [];
    case "gm":
      return gmIds.length ? gmIds : null;
    case "self": {
      const playerOwners = users
        .filter((user) => !user.isGM && actor.testUserPermission?.(user, "OWNER") === true)
        .map((user) => user.id);
      const ids = playerOwners.length ? playerOwners : gmIds;
      return ids.length ? ids : null;
    }
    case "target": {
      if (!targetActor) return null;
      const ids = users
        .filter((user) => user.isGM || targetActor.testUserPermission?.(user, "OWNER") === true)
        .map((user) => user.id);
      return ids.length ? ids : null;
    }
    default: {
      const ids = users
        .filter((user) => user.isGM || actor.testUserPermission?.(user, "OWNER") === true)
        .map((user) => user.id);
      return ids.length ? ids : null;
    }
  }
}

async function applyResource(
  actor: FoundryDocument,
  op: Extract<Operation, { kind: "resource" }>,
): Promise<void> {
  switch (op.resource) {
    case "uses": {
      const item = await documentAt(op.item ?? "");
      if (!item) return;
      await item.update({
        "system.uses.spent": usesSpent(
          number(read(item, "system.uses.spent")),
          number(read(item, "system.uses.max")),
          op.delta,
        ),
      });
      return;
    }
    case "quantity": {
      const item = await documentAt(op.item ?? "");
      if (!item) return;
      await item.update({
        "system.quantity": quantityValue(number(read(item, "system.quantity")), op.delta),
      });
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
      await call(actor, "applyDamage", -op.delta);
      return;
    case "tempHp":
      await actor.update({
        "system.attributes.hp.temp": tempHp(number(read(actor, "system.attributes.hp.temp")), op.delta),
      });
      return;
    case "hitDice": {
      const subtype = op.slot || (op.delta < 0 ? "smallest" : "largest");
      const updates = hitDiceSpend(classHitDice(actor), subtype, -op.delta).map((entry) => ({
        _id: entry.id,
        "system.hd.spent": entry.spent,
      }));
      if (updates.length) await call(actor, "updateEmbeddedDocuments", "Item", updates);
      return;
    }
    case "currency":
      await actor.update({
        [`system.currency.${op.currency}`]: currencyValue(
          number(read(actor, `system.currency.${op.currency}`)),
          op.delta,
        ),
      });
      return;
    case "inspiration":
      await actor.update({ "system.attributes.inspiration": op.delta > 0 });
      return;
  }
}

/** Make one change; throws when the documents are missing. */
export async function executeOperation(op: Operation): Promise<void> {
  const actor = await documentAt(op.actor);
  if (!actor) throw new Error(`Build-n-Action | no actor ${op.actor}`);
  switch (op.kind) {
    case "status":
      await call(actor, "toggleStatusEffect", op.status, { active: op.active });
      return;
    case "copyEffect": {
      const effect = await documentAt(op.effect);
      if (!effect) throw new Error(`Build-n-Action | no effect ${op.effect}`);
      const data = asRecord(await call(effect, "toObject"));
      delete data._id;
      const flags = asRecord(data.flags);
      data.flags = {
        ...flags,
        [MODULE_SCOPE]: { ...asRecord(flags[MODULE_SCOPE]), effectSources: effectSources(effect) },
      };
      Object.assign(data, { origin: op.origin, transfer: false, disabled: false });
      await call(actor, "createEmbeddedDocuments", "ActiveEffect", [data]);
      return;
    }
    case "removeEffects": {
      const ids = listOf(read(actor, "effects"))
        .filter(isDocument)
        .filter((effect) => effect.name === op.name)
        .map((effect) => effect.id);
      if (ids.length) await call(actor, "deleteEmbeddedDocuments", "ActiveEffect", ids);
      return;
    }
    case "resource":
      await applyResource(actor, op);
      return;
    case "rider":
      await addRider(actor, op.rider);
      return;
    case "counter":
      await queueFor(actor, async () => {
        const current =
          readCounterStore(read(actor, `flags.${MODULE_SCOPE}.counters`)).values[op.key] ?? op.def.initial;
        await actor.update({
          [`flags.${MODULE_SCOPE}.counters.values.${op.key}`]: nextCounterValue(
            current,
            op.action,
            op.amount,
            op.def,
          ),
        });
      });
      return;
    case "chat": {
      const targetActor = op.target ? await documentAt(op.target) : null;
      const whisper = reminderRecipients(op.audience, actor, targetActor);
      if (whisper === null) return;
      await ChatMessage.implementation.create({
        content: reminderNoteHtml(op.label, op.text),
        whisper,
        speaker: ChatMessage.implementation.getSpeaker({ actor }),
      });
      return;
    }
  }
}
