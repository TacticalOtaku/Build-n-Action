import { STATIC } from "./choices";
import type { EventType, PinId } from "./constants";
import type { FieldSpec, StaticChoice } from "./fields";
import type { EventDefinition } from "./types";

function reachField(modes: readonly StaticChoice[], text = "reach"): FieldSpec {
  return {
    key: "reach",
    kind: "group",
    label: `BNA.Field.${text}.label`,
    hint: `BNA.Field.${text}.hint`,
    fields: [
      {
        key: "mode", kind: "select", label: "BNA.Field.reachMode.label", hint: `BNA.Field.${text}Mode.hint`,
        default: "self", choices: { static: modes }
      },
      {
        key: "range", kind: "formula", label: "BNA.Field.reachRange.label", hint: "BNA.Field.reachRange.hint",
        default: "10", visibleWhen: { key: "mode", in: ["aura"] }
      },
      {
        key: "disposition", kind: "select", label: "BNA.Field.reachDisposition.label",
        hint: "BNA.Field.reachDisposition.hint", default: "1", choices: { static: STATIC.disposition },
        visibleWhen: { key: "mode", in: ["aura", "template"] }
      },
      {
        key: "includeSelf", kind: "toggle", label: "BNA.Field.reachIncludeSelf.label",
        hint: "BNA.Field.reachIncludeSelf.hint", default: true, visibleWhen: { key: "mode", in: ["aura", "template"] }
      },
      {
        key: "blockers", kind: "multiselect", label: "BNA.Field.reachBlockers.label",
        hint: "BNA.Field.reachBlockers.hint", default: [], choices: { source: "statusEffects" },
        visibleWhen: { key: "mode", in: ["aura"] }
      },
      {
        key: "require", kind: "group", label: "BNA.Field.reachRequire.label", hint: "BNA.Field.reachRequire.hint",
        visibleWhen: { key: "mode", in: ["aura"] },
        fields: [
          { key: "sight", kind: "toggle", label: "BNA.Field.requireSight.label", default: false },
          { key: "move", kind: "toggle", label: "BNA.Field.requireMove.label", default: false },
          { key: "sound", kind: "toggle", label: "BNA.Field.requireSound.label", default: false },
          { key: "light", kind: "toggle", label: "BNA.Field.requireLight.label", default: false }
        ]
      }
    ]
  };
}

/** "Whose roll": the roller only, or creatures reached by my aura, template, or this region. */
export const REACH_FIELD: FieldSpec = reachField(STATIC.reachMode);

/** Turn events: my turn, or the turn of a creature in my aura. */
const TURN_REACH: FieldSpec = reachField(STATIC.turnReachMode, "turnReach");

/** Region events: which tokens count, by their disposition. */
export const REGION_TOKENS: FieldSpec = {
  key: "tokens", kind: "select", label: "BNA.Field.regionTokens.label", hint: "BNA.Field.regionTokens.hint",
  default: "any", choices: { static: STATIC.regionTokens }
};

function trigger(type: EventType, icon: string, fields: readonly FieldSpec[]): EventDefinition {
  return { kind: "event", type, phase: "trigger", icon, pins: ["out"], fields };
}

const SIGNAL_NAME: FieldSpec = {
  key: "name", kind: "text", label: "BNA.Field.signalName.label", hint: "BNA.Field.signalName.hint", default: ""
};

function pre(type: EventType, icon: string): EventDefinition {
  return { kind: "event", type, phase: "pre", icon, pins: ["out"], fields: [REACH_FIELD] };
}

function post(type: EventType, icon: string, pins: readonly PinId[]): EventDefinition {
  return { kind: "event", type, phase: "post", icon, pins, fields: [REACH_FIELD] };
}

export const EVENTS: readonly EventDefinition[] = [
  pre("attackRoll", "crosshair"),
  pre("damageRoll", "swords"),
  pre("saveDC", "shield-alert"),
  pre("savingThrow", "shield"),
  pre("abilityCheck", "brain"),
  pre("hitDie", "heart-pulse"),
  post("afterAttack", "target", ["hit", "miss", "crit", "fumble"]),
  post("afterTargetSave", "shield-x", ["failed", "succeeded"]),
  post("afterDamage", "skull", ["dealt", "dropped"]),
  post("afterCheck", "check-check", ["success", "failure"]),
  trigger("turnStart", "play", [TURN_REACH]),
  trigger("turnEnd", "square", [TURN_REACH]),
  trigger("regionEnter", "log-in", [REGION_TOKENS]),
  trigger("regionExit", "log-out", [REGION_TOKENS]),
  trigger("shortRest", "sun", []),
  trigger("longRest", "moon", []),
  { kind: "event", type: "signal", phase: "signal", icon: "radio", pins: ["out"], fields: [SIGNAL_NAME] }
];
