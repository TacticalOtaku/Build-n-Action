import { nextCounterValue, readCounterStore } from "../core/counters/counters";
import { asNumber, asRecord } from "../core/registry/data";
import { MODULE_SCOPE } from "../core/storage/repository";
import { hitDiceSpend } from "../runtime/choices";
import { currencyValue, pickSlot, slotValue, tempHp, usesSpent, type Operation } from "../runtime/operations";
import { listOf, read } from "../runtime/read";
import { effectSources } from "../runtime/effects";
import { classHitDice, slotsOf } from "./consume";
import { documentFromUuid, isDocument, ownerActor, queueFor } from "./documents";
import { addRider } from "./riders";

function number(value: unknown): number {
  return asNumber(value) ?? 0;
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

/** Whether a user can reach a document: they own it, or it belongs to a creature on the scene they look at. */
function reachable(document: FoundryDocument | null, user: UserLike): boolean {
  if (!document) return false;
  if (document.testUserPermission?.(user, "OWNER") === true) return true;
  const actor = ownerActor(document);
  const scene = game.scenes.get(user.viewedScene ?? "");
  return !!actor && listOf(read(scene, "tokens")).some(token => read(read(token, "actor"), "uuid") === actor.uuid);
}

/**
 * Whether the GM makes a change another user asked for. Their reactions change what they own and the creatures they
 * roll against, so a change must reach one of those; anything else in the world is refused.
 */
export function mayRequest(op: Operation, user: UserLike): boolean {
  if (!reachable(documentFromUuid(op.actor), user)) return false;
  if (op.kind === "copyEffect") return reachable(documentFromUuid(op.effect), user);
  if ((op.kind === "resource") && op.item) return reachable(documentFromUuid(op.item), user);
  return true;
}

/** Whether this user may make the change without the GM. */
export function canRunLocally(op: Operation): boolean {
  const actor = documentFromUuid(op.actor);
  // Counters are changed by the active GM alone, one change at a time; without a GM, by an owner.
  if (op.kind === "counter") return (game.users.activeGM?.id === game.user.id) || (!game.users.activeGM && actor?.isOwner === true);
  if (!actor?.isOwner) return false;
  if ((op.kind === "resource") && op.item) return documentFromUuid(op.item)?.isOwner === true;
  return true;
}

async function applyResource(actor: FoundryDocument, op: Extract<Operation, { kind: "resource" }>): Promise<void> {
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
      const slot = slots.find(entry => entry.key === key);
      if (!slot) return;
      await actor.update({ [`system.spells.${slot.key}.value`]: slotValue(slot.value, slot.max, op.delta) });
      return;
    }
    case "hp":
      await call(actor, "applyDamage", -op.delta);
      return;
    case "tempHp":
      await actor.update({ "system.attributes.hp.temp": tempHp(number(read(actor, "system.attributes.hp.temp")), op.delta) });
      return;
    case "hitDice": {
      const updates = hitDiceSpend(classHitDice(actor), (op.delta < 0) ? "smallest" : "largest", -op.delta)
        .map(entry => ({ _id: entry.id, "system.hd.spent": entry.spent }));
      if (updates.length) await call(actor, "updateEmbeddedDocuments", "Item", updates);
      return;
    }
    case "currency":
      await actor.update({ [`system.currency.${op.currency}`]: currencyValue(number(read(actor, `system.currency.${op.currency}`)), op.delta) });
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
      data.flags = { ...flags, [MODULE_SCOPE]: { ...asRecord(flags[MODULE_SCOPE]), effectSources: effectSources(effect) } };
      Object.assign(data, { origin: op.origin, transfer: false, disabled: false });
      await call(actor, "createEmbeddedDocuments", "ActiveEffect", [data]);
      return;
    }
    case "removeEffects": {
      const ids = listOf(read(actor, "effects")).filter(isDocument).filter(effect => effect.name === op.name).map(effect => effect.id);
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
        const current = readCounterStore(read(actor, `flags.${MODULE_SCOPE}.counters`)).values[op.key] ?? op.def.initial;
        await actor.update({ [`flags.${MODULE_SCOPE}.counters.values.${op.key}`]: nextCounterValue(current, op.action, op.amount, op.def) });
      });
      return;
  }
}
