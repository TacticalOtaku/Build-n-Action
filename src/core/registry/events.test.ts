import { describe, expect, it } from "vitest";
import { CONTINUATION_EVENTS, EVENT_TYPES, TRIGGER_EVENTS, type EventType } from "./constants";
import { EVENTS } from "./events";
import { defaultsFor } from "./fields";
import { getEvent } from "./index";

describe("event definitions", () => {
  it("defines every event type exactly once", () => {
    expect(EVENTS.map(event => event.type).sort()).toEqual(EVENT_TYPES.filter(type => !CONTINUATION_EVENTS.includes(type)).sort());
  });

  it("gives pre-roll events a single out pin", () => {
    for (const event of EVENTS.filter(e => e.phase === "pre")) expect(event.pins).toEqual(["out"]);
  });

  it("exposes outcome pins on reactions", () => {
    expect(getEvent("afterAttack")?.pins).toEqual(["hit", "miss", "crit", "fumble"]);
    expect(getEvent("afterTargetSave")?.pins).toEqual(["failed", "succeeded"]);
    expect(getEvent("afterDamage")?.pins).toEqual(["dealt", "dropped"]);
    expect(getEvent("afterCheck")?.pins).toEqual(["success", "failure"]);
  });

  it("defaults reach to the roller only", () => {
    const event = getEvent("attackRoll");
    expect(event).toBeDefined();
    expect(defaultsFor(event?.fields ?? [])).toEqual({
      reach: {
        mode: "self",
        range: "10",
        disposition: "1",
        includeSelf: true,
        blockers: [],
        require: { sight: false, move: false, sound: false, light: false }
      }
    });
  });

  it("gives signal events a name instead of a reach", () => {
    expect(defaultsFor(getEvent("signal")?.fields ?? [])).toEqual({ name: "" });
  });

  it("returns undefined for unknown types", () => {
    expect(getEvent("nope")).toBeUndefined();
  });

  it("adds triggers without a roll, with a single out pin", () => {
    for (const type of TRIGGER_EVENTS) {
      expect(getEvent(type)).toMatchObject({ phase: "trigger", pins: ["out"] });
    }
  });

  it("lets turn events reach me or my aura, region events filter tokens, and rests stay with me", () => {
    const modes = (type: EventType) => {
      const reach = getEvent(type)?.fields.find(field => field.key === "reach");
      const mode = (reach && ("fields" in reach)) ? reach.fields?.find(field => field.key === "mode") : undefined;
      return (mode && ("choices" in mode) && mode.choices && ("static" in mode.choices)) ? mode.choices.static.map(choice => choice.value) : null;
    };
    expect(modes("turnStart")).toEqual(["self", "aura"]);
    expect(getEvent("regionEnter")?.fields.map(field => field.key)).toEqual(["tokens"]);
    expect(getEvent("longRest")?.fields).toEqual([]);
  });
});
