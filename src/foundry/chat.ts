import type { ChainIntent } from "../core/engine/interpreter";
import { asString } from "../core/registry/data";
import type { ApplyContext } from "./apply";

/** Owners and GMs, who see a reminder from a blueprint that has no roll dialog to show it in. */
function reminderRecipients(actor: FoundryDocument): string[] {
  return [...game.users].filter(user => user.isGM || (actor.testUserPermission?.(user, "OWNER") ?? false)).map(user => user.id);
}

/** Whisper reminders to the roller's owners and the GMs; triggers and continuations have no roll dialog to show them in. */
export async function whisperReminders(reminders: readonly ChainIntent[], ctx: ApplyContext): Promise<void> {
  for (const intent of reminders) {
    const text = asString(intent.data.text).trim();
    if (!text) continue;
    const name = ctx.sources.get(intent.entry)?.blueprint.name ?? "";
    await ChatMessage.implementation.create({
      content: `<p><strong>${foundry.utils.escapeHTML(name)}</strong></p><p>${foundry.utils.escapeHTML(text)}</p>`,
      whisper: reminderRecipients(ctx.roller.actor),
      speaker: ChatMessage.implementation.getSpeaker({ actor: ctx.roller.actor })
    });
  }
}
