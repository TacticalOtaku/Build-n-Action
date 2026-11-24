import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceInfo } from "./collect";
import {
  canRunLocally,
  costState,
  executeOperation,
  payCost,
  reminderNoteHtml,
  reminderRecipients,
} from "./operations";

// Copying must preserve exact source identity without overwriting origin or other modules' flags.
afterEach(() => vi.unstubAllGlobals());

describe("copied effect provenance", () => {
  it("preserves the original and immediate sources across repeated copies", async () => {
    let created: Record<string, unknown>[] = [];
    const original = {
      _id: "copy",
      name: "Custom",
      flags: {
        other: { value: 7 },
        "build-n-action": { markers: ["hex"], effectSources: ["Item.staff.ActiveEffect.original"] },
      },
    };
    const source = {
      documentName: "ActiveEffect",
      uuid: "Actor.hero.ActiveEffect.copy",
      ...original,
      toObject: () => structuredClone(original),
    };
    const actor = {
      documentName: "Actor",
      uuid: "Actor.target",
      createEmbeddedDocuments: async (_type: string, rows: Record<string, unknown>[]) => {
        created = rows;
      },
    };
    vi.stubGlobal("fromUuid", async (uuid: string) => (uuid === actor.uuid ? actor : source));
    await executeOperation({
      kind: "copyEffect",
      actor: actor.uuid,
      effect: source.uuid,
      origin: "Item.newOrigin",
    });
    expect(created[0]).toMatchObject({
      origin: "Item.newOrigin",
      disabled: false,
      transfer: false,
      flags: {
        other: { value: 7 },
        "build-n-action": {
          markers: ["hex"],
          effectSources: ["Actor.hero.ActiveEffect.copy", "Item.staff.ActiveEffect.original"],
        },
      },
    });
    expect(created[0]).not.toHaveProperty("_id");
    expect(original.flags["build-n-action"].effectSources).toEqual(["Item.staff.ActiveEffect.original"]);
  });
});

describe("unified cost payments and resource operations", () => {
  it("clamps slot, currency, and uses costs through the shared resource executor", async () => {
    const actorUpdates: Record<string, unknown>[] = [];
    const itemUpdates: Record<string, unknown>[] = [];
    const actor = {
      documentName: "Actor",
      uuid: "Actor.hero",
      type: "character",
      isOwner: true,
      system: {
        spells: { spell1: { level: 1, value: 0, max: 2 } },
        currency: { gp: 1 },
        attributes: {
          inspiration: true,
          hp: { value: 10, temp: 0, max: 10, tempmax: 0 },
          hd: { value: 1, max: 1, bySize: { d8: 1 }, classes: [] },
        },
      },
      update: async (changes: Record<string, unknown>) => {
        actorUpdates.push(changes);
      },
    } as unknown as FoundryDocument;
    const item = {
      documentName: "Item",
      uuid: "Actor.hero.Item.wand",
      isOwner: true,
      system: { uses: { spent: 2, value: 1, max: 3, autoDestroy: false }, quantity: 1 },
      hasLimitedUses: true,
      deleteDialog: vi.fn(async () => true),
      update: async (changes: Record<string, unknown>) => {
        itemUpdates.push(changes);
      },
    } as unknown as FoundryDocument;
    vi.stubGlobal("CONFIG", { DND5E: { currencies: { gp: {} }, hitDieTypes: ["d8"] } });
    vi.stubGlobal("fromUuid", async (uuid: string) =>
      uuid === actor.uuid ? actor : uuid === item.uuid ? item : null,
    );

    const info = { document: item } as unknown as SourceInfo;
    expect(costState("uses", actor, info)).toMatchObject({
      owner: true,
      uses: { value: 1, max: 3, limited: true },
      quantity: 1,
      inspiration: true,
    });

    const base = { subtype: "", min: 1, max: null, step: 1, scales: false, formula: "" };
    await payCost(
      { ...base, type: "slots" },
      { value: "spell1", amount: 1, scale: 0, available: "0/2" },
      actor,
      info,
    );
    await payCost(
      { ...base, type: "currency", subtype: "gp" },
      { value: "5", amount: 5, scale: 0, available: "1" },
      actor,
      info,
    );
    await payCost(
      { ...base, type: "inspiration" },
      { value: "1", amount: 1, scale: 0, available: "" },
      actor,
      info,
    );
    await payCost(
      { ...base, type: "uses" },
      { value: "5", amount: 5, scale: 0, available: "1/3" },
      actor,
      info,
    );
    await payCost(
      { ...base, type: "quantity" },
      { value: "5", amount: 5, scale: 0, available: "1" },
      actor,
      info,
    );

    expect(actorUpdates).toEqual([
      { "system.spells.spell1.value": 0 },
      { "system.currency.gp": 0 },
      { "system.attributes.inspiration": false },
    ]);
    expect(itemUpdates).toEqual([{ "system.uses.spent": 3 }, { "system.quantity": 0 }]);

    (item as unknown as { system: { uses: { autoDestroy: boolean } } }).system.uses.autoDestroy = true;
    expect(
      await payCost(
        { ...base, type: "uses" },
        { value: "1", amount: 1, scale: 0, available: "1/3" },
        actor,
        info,
      ),
    ).toBe(true);
    expect(
      (item as unknown as { deleteDialog: ReturnType<typeof vi.fn> }).deleteDialog,
    ).toHaveBeenCalledTimes(1);
  });
});

describe("reminder audience routing and safe chat formatting", () => {
  it("computes recipients per audience and escapes chat markup", async () => {
    const gm = { id: "u-gm", isGM: true, active: true };
    const p1 = { id: "u-p1", isGM: false, active: true };
    const p2 = { id: "u-p2", isGM: false, active: true };
    const created: Record<string, unknown>[] = [];
    const pc = {
      documentName: "Actor",
      uuid: "Actor.pc",
      isOwner: true,
      testUserPermission: (user: { id: string }) => user.id === p1.id,
    } as unknown as FoundryDocument;
    const npc = {
      documentName: "Actor",
      uuid: "Actor.npc",
      isOwner: false,
      testUserPermission: () => false,
    } as unknown as FoundryDocument;
    const target = {
      documentName: "Actor",
      uuid: "Actor.target",
      isOwner: false,
      testUserPermission: (user: { id: string }) => user.id === p2.id,
    } as unknown as FoundryDocument;

    vi.stubGlobal("foundry", {
      utils: { escapeHTML: (s: string) => s.replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
    });
    vi.stubGlobal("game", {
      user: p1,
      users: Object.assign([gm, p1, p2], { activeGM: gm }),
    });
    vi.stubGlobal(
      "fromUuid",
      async (uuid: string) => ({ "Actor.pc": pc, "Actor.target": target })[uuid] ?? null,
    );
    vi.stubGlobal("ChatMessage", {
      implementation: {
        create: async (data: Record<string, unknown>) => {
          created.push(data);
        },
        getSpeaker: ({ actor }: { actor: { uuid: string } }) => ({ actor: actor.uuid }),
      },
    });

    expect(reminderRecipients("auto", pc, target)).toEqual(["u-gm", "u-p1"]);
    expect(reminderRecipients("self", pc, target)).toEqual(["u-p1"]);
    expect(reminderRecipients("self", npc, target)).toEqual(["u-gm"]);
    expect(reminderRecipients("gm", pc, target)).toEqual(["u-gm"]);
    expect(reminderRecipients("target", pc, target)).toEqual(["u-gm", "u-p2"]);
    expect(reminderRecipients("target", pc, null)).toBeNull();
    expect(reminderRecipients("all", pc, target)).toEqual([]);

    expect(
      canRunLocally({
        kind: "chat",
        actor: pc.uuid,
        target: target.uuid,
        audience: "gm",
        label: "L",
        text: "S",
      }),
    ).toBe(false);
    expect(reminderNoteHtml("<b>Name</b>", "Line1\n<script>")).toBe(
      "<p><strong>&lt;b&gt;Name&lt;/b&gt;</strong></p><p>Line1<br>&lt;script&gt;</p>",
    );

    await executeOperation({
      kind: "chat",
      actor: pc.uuid,
      target: target.uuid,
      audience: "target",
      label: "Hex",
      text: "<ping>",
    });
    expect(created).toEqual([
      {
        content: "<p><strong>Hex</strong></p><p>&lt;ping&gt;</p>",
        whisper: ["u-gm", "u-p2"],
        speaker: { actor: "Actor.pc" },
      },
    ]);
  });
});
