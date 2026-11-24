import { describe, expect, it } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { compileBlueprint } from "../core/engine/compile";
import type { ChainEntry } from "../core/engine/interpreter";
import { passed } from "../core/engine/reasons";
import { rollFacts } from "../core/testing/facts";
import { makeEdge, makeNode } from "../core/testing/graph";
import {
  BLUEPRINT_DRAG,
  LEGACY_DRAG,
  createEditorHost,
  defaultDragData,
  parseBlueprintDrop,
  parseDragText,
  parseEffectDrop,
  readDroppedBlueprint,
  simulatedRollMode,
} from "./editor-host";

const blueprint = createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "Hex" });

describe("blueprint and effect drag-drop helpers", () => {
  it("carries blueprints by data by default and validates drops", () => {
    expect(defaultDragData(blueprint)).toEqual({ type: BLUEPRINT_DRAG, data: blueprint });
    expect(readDroppedBlueprint(defaultDragData(blueprint))).toEqual(blueprint);
    expect(readDroppedBlueprint({ type: "Item", uuid: "Item.x" })).toBeNull();
    expect(readDroppedBlueprint({ type: BLUEPRINT_DRAG, data: { id: "bad" } })).toBeNull();
    expect(readDroppedBlueprint(null)).toBeNull();
  });

  it("reads blueprint, v1 UUID, and data drags while rejecting injection or invalid payloads", () => {
    expect(
      parseBlueprintDrop({ type: BLUEPRINT_DRAG, uuid: "Actor.a.Item.b.Blueprint.aB3dE5gH7jK9mN1p" }),
    ).toEqual({ kind: "uuid", uuid: "Actor.a.Item.b.Blueprint.aB3dE5gH7jK9mN1p" });
    expect(
      parseBlueprintDrop({ type: LEGACY_DRAG, uuid: "Item.b.ContextualBonus.aB3dE5gH7jK9mN1p" }),
    ).toEqual({ kind: "uuid", uuid: "Item.b.ContextualBonus.aB3dE5gH7jK9mN1p" });
    expect(parseBlueprintDrop({ type: BLUEPRINT_DRAG, data: blueprint })).toEqual({
      kind: "data",
      blueprint,
    });
    expect(parseBlueprintDrop({ type: "Item", uuid: "Item.b" })).toBeNull();
    expect(
      parseBlueprintDrop({ type: BLUEPRINT_DRAG, uuid: 'Item.b");alert(1);(".Blueprint.aB3dE5gH7jK9mN1p' }),
    ).toBeNull();
    expect(parseBlueprintDrop({ type: BLUEPRINT_DRAG, data: { id: "bad" } })).toBeNull();
    expect(parseBlueprintDrop(undefined)).toBeNull();
  });

  it("parses drag JSON text and ActiveEffect drop payloads", () => {
    expect(parseDragText(JSON.stringify({ type: BLUEPRINT_DRAG, uuid: "Item.a.Blueprint.b" }))).toEqual({
      type: BLUEPRINT_DRAG,
      uuid: "Item.a.Blueprint.b",
    });
    expect(parseDragText("not json")).toBeNull();
    expect(parseDragText("")).toBeNull();

    expect(
      parseEffectDrop(JSON.stringify({ type: "ActiveEffect", uuid: "Item.staff.ActiveEffect.hex" })),
    ).toEqual({ uuid: "Item.staff.ActiveEffect.hex", valid: true });
    expect(parseEffectDrop(JSON.stringify({ type: "ActiveEffect", uuid: "Item.staff" }))).toEqual({
      uuid: "Item.staff",
      valid: false,
    });
    expect(parseEffectDrop(JSON.stringify({ type: "Item", uuid: "Item.staff.ActiveEffect.hex" }))).toBeNull();
    expect(parseEffectDrop("bad json")).toBeNull();
  });
});

describe("createEditorHost", () => {
  it("unifies lint paths (including roll & counter roots), effect selection, and runThrough simulation", async () => {
    const bp = createBlueprint({
      id: "SimHostTest00001",
      nodes: [
        makeNode("event", "turnStart", "ev"),
        makeNode("result", "demandSave", "save", {
          ability: "con",
          dcMode: "formula",
          dc: "12",
          who: "target",
          common: { optional: true },
        }),
        makeNode("result", "reminder", "rem", { text: "Saved" }),
      ],
      edges: [makeEdge("ev", "out", "save"), makeEdge("save", "succeeded", "rem")],
    });
    const host = createEditorHost({
      lint: {
        neighbourBlueprints: () => [],
        validateFormula: () => true,
        hasKnownPath: (path) => path === "attributes.prof",
      },
      formula: { paths: () => ["@attributes.prof"], preview: () => "2" },
      effectSelection: {
        choices: () => [{ uuid: "Item.a.ActiveEffect.b", name: "Bless" }],
        resolve: async (uuid) => ({ uuid, name: "Bless" }),
      },
      simulator: {
        actors: () => [{ value: "Actor.a", label: "Aria" }],
        items: () => [],
        targets: () => [{ value: "Token.t", label: "Foe" }],
        defaults: () => ({ actorUuid: "Actor.a", itemUuid: null, targetUuid: "Token.t" }),
        prepare: (edited, request) => {
          const entry: ChainEntry = {
            compiled: compileBlueprint(edited),
            documentUuid: "Item.a",
            actorUuid: "Actor.a",
            env: {
              evaluateNumber: () => null,
              replaceData: (t) => t,
              runScript: () => null,
              carrierItemUuid: null,
              reach: () => passed("matched"),
              limitAvailable: () => true,
            },
          };
          return { entry, facts: rollFacts({ event: request.event }), suppressed: true, hasToken: false };
        },
      },
    });

    const lint = host.lintEnv?.(bp);
    expect(lint?.hasPath?.("attributes.prof")).toBe(true);
    expect(lint?.hasPath?.("target.attributes.hp.value")).toBe(true);
    expect(lint?.hasPath?.("item.level")).toBe(true);
    expect(lint?.hasPath?.("activity.dc")).toBe(true);
    expect(lint?.hasPath?.("counters.combo")).toBe(true);
    expect(lint?.hasPath?.("unknown.path")).toBe(false);

    expect(await host.effectSelection?.resolve("Item.a")).toBeNull();
    expect(await host.effectSelection?.resolve("Item.a.ActiveEffect.b")).toEqual({
      uuid: "Item.a.ActiveEffect.b",
      name: "Bless",
    });

    const sim = host.simulator?.run(bp, {
      actorUuid: "Actor.a",
      itemUuid: null,
      activityId: null,
      targetUuid: "Token.t",
      event: "turnStart",
      pins: ["out"],
      signal: null,
      abilityId: null,
      skillId: null,
      saveOutcome: "succeeded",
      counters: {},
    });
    expect(sim?.notes).toEqual(["suppressed", "noToken", "trigger", "chosen"]);
    expect(sim?.run.intents.some((intent) => intent.nodeId === "rem")).toBe(true);

    expect(
      simulatedRollMode({
        actorUuid: "Actor.a",
        itemUuid: null,
        activityId: null,
        targetUuid: null,
        event: "attackRoll",
        pins: ["out"],
        signal: null,
        abilityId: null,
        skillId: null,
        saveOutcome: "failed",
        counters: {},
      }),
    ).toBe("normal");
    expect(
      simulatedRollMode({
        actorUuid: "Actor.a",
        itemUuid: null,
        activityId: null,
        targetUuid: null,
        event: "damageRoll",
        pins: ["out"],
        signal: null,
        abilityId: null,
        skillId: null,
        saveOutcome: "failed",
        counters: {},
      }),
    ).toBeNull();
    expect(
      simulatedRollMode({
        actorUuid: "Actor.a",
        itemUuid: null,
        activityId: null,
        targetUuid: null,
        event: "damageRoll",
        pins: ["out"],
        signal: null,
        abilityId: null,
        skillId: null,
        rollMode: "advantage",
        saveOutcome: "failed",
        counters: {},
      }),
    ).toBe("advantage");
  });
});
