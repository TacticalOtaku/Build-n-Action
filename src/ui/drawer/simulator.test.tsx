import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import type { BlueprintSource } from "../../core/blueprint/types";
import { runBlueprint, type BlueprintEnv } from "../../core/engine/interpreter";
import { passed } from "../../core/engine/reasons";
import { createTranslator } from "../../core/i18n";
import { createPhraseFormatter } from "../../core/phrase/formatter";
import { creatureFacts, rollDetails, rollFacts } from "../../core/testing/facts";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import en from "../../lang/en.json";
import type { SimulationRequest, SimulatorHost } from "../host";
import { renderWithServices } from "../testing/render";
import {
  SimulatorPanel, checkChoices, eventOptions, outcomeOptions, reasonText, subjectStore, summarizeRun
} from "./SimulatorPanel";

const env: BlueprintEnv = {
  evaluateNumber: () => null,
  replaceData: text => text,
  runScript: () => null,
  carrierItemUuid: null,
  reach: () => passed("matched"),
  limitAvailable: () => true
};

const blueprint = createBlueprint({
  id: "aB3dE5gH7jK9mN1p",
  nodes: [
    makeNode("event", "afterAttack", "ev"),
    { ...makeCondition("undead", [{ id: "c1", type: "creatureTypes", data: { values: ["undead"] } }]), position: { x: 300, y: 0 } },
    { ...makeNode("result", "rollBonus", "fire", { formula: "1d6" }), position: { x: 600, y: 0 } }
  ],
  edges: [makeEdge("ev", "hit", "undead"), makeEdge("undead", "yes", "fire")]
});

function simulator(overrides: Partial<SimulatorHost> = {}): SimulatorHost & { requests: SimulationRequest[] } {
  const requests: SimulationRequest[] = [];
  return {
    requests,
    actors: () => [{ value: "Actor.aria", label: "Aria" }],
    items: () => [{ uuid: "Item.sword", name: "Longsword", activities: [{ value: "atk", label: "Attack" }] }],
    targets: () => [{ value: "Token.lich", label: "Lich" }, { value: "Token.bandit", label: "Bandit" }],
    defaults: () => ({ actorUuid: "Actor.aria", itemUuid: "Item.sword", targetUuid: "Token.lich" }),
    run: (source, request) => {
      requests.push(request);
      const target = creatureFacts({ creatureTypes: [(request.targetUuid === "Token.lich") ? "undead" : "humanoid"] });
      return { run: runBlueprint(source, { event: request.event, pins: request.pins }, rollFacts({ event: request.event, target }), env), notes: [] };
    },
    ...overrides
  };
}

describe("SimulatorPanel", () => {
  it("starts from the host's defaults and reports what would apply", () => {
    const host = simulator();
    const onTrace = vi.fn();
    renderWithServices(<SimulatorPanel blueprint={blueprint} simulator={host} onTrace={onTrace} onFocus={vi.fn()} />);
    expect(host.requests.at(-1)).toMatchObject({
      actorUuid: "Actor.aria", itemUuid: "Item.sword", activityId: "atk", targetUuid: "Token.lich", event: "afterAttack", pins: ["hit"]
    });
    expect(screen.getByRole("heading", { name: "Would apply: 1" })).toBeInTheDocument();
    expect(screen.getByText("+1d6 to the roll", { exact: false })).toBeInTheDocument();
    expect(onTrace).toHaveBeenLastCalledWith(expect.objectContaining({ nodes: expect.objectContaining({ fire: "passed" }) }));
  });

  it("fires both pins of a critical hit", async () => {
    const host = simulator();
    renderWithServices(<SimulatorPanel blueprint={blueprint} simulator={host} onTrace={vi.fn()} onFocus={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(host.requests.at(-1)?.pins).toEqual(["hit", "crit"]);
  });

  it("explains the first failure and focuses its node", async () => {
    const onFocus = vi.fn();
    renderWithServices(<SimulatorPanel blueprint={blueprint} simulator={simulator()} onTrace={vi.fn()} onFocus={onFocus} />);
    await userEvent.selectOptions(screen.getByLabelText("Target"), "Token.bandit");
    expect(screen.getByRole("heading", { name: "Nothing would apply" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Why not?" }));
    expect(onFocus).toHaveBeenCalledWith("undead");
  });

  it("shows host notes and a failed run", () => {
    renderWithServices(
      <SimulatorPanel
        blueprint={blueprint}
        simulator={simulator({ run: () => { throw new Error("boom"); } })}
        onTrace={vi.fn()}
        onFocus={vi.fn()}
      />
    );
    expect(screen.getByText("The test could not run: boom")).toBeInTheDocument();
  });

  it("asks for the outcome of a demanded save and passes it on", async () => {
    const withSave = createBlueprint({
      id: "aB3dE5gH7jK9mN1q",
      nodes: [makeNode("event", "afterAttack", "ev"), makeNode("result", "demandSave", "save")],
      edges: [makeEdge("ev", "hit", "save")]
    });
    const host = simulator();
    renderWithServices(<SimulatorPanel blueprint={withSave} simulator={host} onTrace={vi.fn()} onFocus={vi.fn()} />);
    expect(host.requests.at(-1)?.saveOutcome).toBe("failed");
    await userEvent.click(within(screen.getByRole("group", { name: "Demanded save" })).getByRole("button", { name: "Succeeded" }));
    expect(host.requests.at(-1)?.saveOutcome).toBe("succeeded");
  });

  it("asks nothing about saves when the blueprint demands none", () => {
    renderWithServices(<SimulatorPanel blueprint={blueprint} simulator={simulator()} onTrace={vi.fn()} onFocus={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Demanded save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Roll advantage" })).not.toBeInTheDocument();
  });

  it("shows a roll advantage selector when testing a blueprint with a rollModes check", async () => {
    const withRollMode = createBlueprint({
      id: "aB3dE5gH7jK9mN1s",
      nodes: [
        makeNode("event", "damageRoll", "ev"),
        makeCondition("adv", [{ id: "c1", type: "rollModes", data: { values: ["advantage"] } }]),
        makeNode("result", "rollBonus", "sneak", { formula: "1d6" })
      ],
      edges: [makeEdge("ev", "out", "adv"), makeEdge("adv", "yes", "sneak")]
    });
    const host = simulator({
      run: (source, request) => {
        host.requests.push(request);
        return {
          run: runBlueprint(source, { event: request.event, pins: request.pins }, rollFacts({
            event: request.event,
            roll: rollDetails({ rollMode: request.rollMode ?? null })
          }), env),
          notes: []
        };
      }
    });
    renderWithServices(<SimulatorPanel blueprint={withRollMode} simulator={host} onTrace={vi.fn()} onFocus={vi.fn()} />);
    expect(host.requests.at(-1)?.rollMode).toBe("normal");
    expect(screen.getByRole("heading", { name: "Nothing would apply" })).toBeInTheDocument();
    expect(screen.getAllByText(/Normal is not one of: Advantage/)).not.toHaveLength(0);

    await userEvent.click(within(screen.getByRole("group", { name: "Roll advantage" })).getByRole("button", { name: "Advantage" }));
    expect(host.requests.at(-1)?.rollMode).toBe("advantage");
    expect(screen.getByRole("heading", { name: "Would apply: 1" })).toBeInTheDocument();
  });

  it("takes counter values for the run, starting from the actor's", async () => {
    const withCounter = createBlueprint({
      id: "aB3dE5gH7jK9mN1r",
      nodes: [
        makeNode("event", "afterAttack", "ev"),
        makeNode("result", "counter", "add", { name: "rage", scope: "actor", action: "add", amount: "1", who: "self" })
      ],
      edges: [makeEdge("ev", "hit", "add")]
    });
    const host = simulator({ counterValues: () => [{ name: "rage", scope: "actor", value: 2 }] });
    renderWithServices(<SimulatorPanel blueprint={withCounter} simulator={host} onTrace={vi.fn()} onFocus={vi.fn()} />);
    expect(host.requests.at(-1)?.counters).toEqual({ "actor:rage": 2 });
    const input = screen.getByLabelText("rage");
    await userEvent.clear(input);
    await userEvent.type(input, "3");
    expect(host.requests.at(-1)?.counters).toEqual({ "actor:rage": 3 });
  });

  it("groups who rolls by the scene and refreshes the subject lists when the host says so", async () => {
    let listener: (() => void) | null = null;
    let revision = 0;
    let tokens = [{ value: "Token.lich", label: "Lich" }];
    const host = simulator({
      actors: () => [
        ...tokens.map(token => ({ ...token, value: `${token.value}.Actor`, group: "On the scene" })),
        { value: "Actor.aria", label: "Aria", group: "Other actors" }
      ],
      targets: () => tokens,
      revision: () => revision,
      subscribe: next => {
        listener = next;
        return () => { listener = null; };
      }
    });
    renderWithServices(<SimulatorPanel blueprint={blueprint} simulator={host} onTrace={vi.fn()} onFocus={vi.fn()} />);
    const who = screen.getByLabelText("Who rolls");
    expect(within(who).getByRole("group", { name: "On the scene" })).toBeInTheDocument();
    expect(within(who).getByRole("group", { name: "Other actors" })).toBeInTheDocument();
    tokens = [...tokens, { value: "Token.bandit", label: "Bandit" }];
    revision++;
    await act(async () => listener?.());
    expect(within(screen.getByLabelText("Target")).getByRole("option", { name: "Bandit" })).toBeInTheDocument();
    expect(within(who).getByRole("option", { name: "Bandit" })).toBeInTheDocument();
  });

  it("asks for an actor when the world has none", () => {
    renderWithServices(
      <SimulatorPanel blueprint={blueprint} simulator={simulator({ actors: () => [], defaults: () => ({ actorUuid: null, itemUuid: null, targetUuid: null }) })} onTrace={vi.fn()} onFocus={vi.fn()} />
    );
    expect(screen.getByText("Add an actor to the world to test with.")).toBeInTheDocument();
  });
});

describe("simulator helpers", () => {
  it("lists outcome pins per reaction event and extracts unique events & signals", () => {
    expect(outcomeOptions("afterAttack")).toEqual([
      { id: "hit", pins: ["hit"] }, { id: "crit", pins: ["hit", "crit"] }, { id: "miss", pins: ["miss"] }, { id: "fumble", pins: ["miss", "fumble"] }
    ]);
    expect(outcomeOptions("afterDamage").map(option => option.pins)).toEqual([["dealt"], ["dealt", "dropped"]]);
    expect(outcomeOptions("afterTargetSave").map(option => option.id)).toEqual(["failed", "succeeded"]);
    expect(outcomeOptions("afterCheck").map(option => option.id)).toEqual(["success", "failure"]);
    expect(outcomeOptions("damageRoll")).toEqual([]);
    expect(outcomeOptions("signal")).toEqual([]);

    const source = createBlueprint({
      nodes: [
        makeNode("event", "damageRoll", "a"),
        makeNode("event", "damageRoll", "b"),
        makeNode("event", "signal", "s1", { name: "smite" }),
        makeNode("event", "signal", "s2", { name: "smite" }),
        makeNode("event", "signal", "s3", { name: "" }),
        makeNode("result", "rollBonus", "r")
      ]
    });
    expect(eventOptions(source)).toEqual([
      { key: "damageRoll", event: "damageRoll", signal: null },
      { key: "signal:smite", event: "signal", signal: "smite" }
    ]);
  });

  it("caches subject lists by host revision and delegates subscriptions", () => {
    let revision = 0;
    const actors = vi.fn(() => [{ value: "Actor.aria", label: "Aria" }]);
    const targets = vi.fn(() => [{ value: "Token.lich", label: "Lich" }]);
    const simHost: SimulatorHost = {
      actors, items: () => [], targets,
      defaults: () => ({ actorUuid: null, itemUuid: null, targetUuid: null }), run: () => null,
      revision: () => revision
    };
    const store = subjectStore(simHost);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    revision = 1;
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(actors).toHaveBeenCalledTimes(2);
    expect(targets).toHaveBeenCalledTimes(2);

    const noRev = simulator();
    const noRevStore = subjectStore(noRev);
    expect(noRevStore.getSnapshot()).toBe(noRevStore.getSnapshot());
    const unsub = vi.fn();
    const subscribe = vi.fn(() => unsub);
    subjectStore(simulator({ subscribe })).subscribe(vi.fn())();
    expect(unsub).toHaveBeenCalled();
  });

  it("summarizes steps in reading order and reports disabled, outOfReach, and check failures", () => {
    const at = <T extends { position: { x: number; y: number } }>(node: T, x: number, y = 0): T => ({ ...node, position: { x, y } });
    const source: BlueprintSource = createBlueprint({
      id: "aB3dE5gH7jK9mN1p",
      nodes: [
        at(makeNode("result", "rollBonus", "fire", { formula: "1d6" }), 600),
        at(makeCondition("undead", [{ id: "c1", type: "thisItem", data: {} }, { id: "c2", type: "creatureTypes", data: { values: ["undead"] } }]), 300),
        at(makeNode("event", "damageRoll", "ev"), 0),
        at(makeNode("result", "rollBonus", "unused"), 600, 200)
      ],
      edges: [makeEdge("ev", "out", "undead"), makeEdge("undead", "yes", "fire")]
    });
    const okRun = runBlueprint(source, { event: "damageRoll", pins: ["out"] }, rollFacts({ target: creatureFacts({ creatureTypes: ["undead"] }) }), env);
    const okSummary = summarizeRun(source, okRun);
    expect(okSummary.steps.map(s => [s.nodeId, s.status])).toEqual([["ev", "passed"], ["undead", "passed"], ["fire", "passed"]]);
    expect(okSummary.trace.nodes).toEqual({ ev: "passed", undead: "passed", fire: "passed", unused: "skipped" });
    expect([...okSummary.trace.edges].sort()).toEqual(["ev-out-undead", "undead-yes-fire"]);
    expect(okSummary.firstFailure).toBeNull();

    const failSummary = summarizeRun(source, runBlueprint(source, { event: "damageRoll", pins: ["out"] }, rollFacts(), env));
    expect(failSummary.firstFailure).toEqual({ nodeId: "undead", checkId: "c2", reason: { code: "notMatched", values: expect.any(Object) as unknown } });

    const off = { ...source, enabled: false };
    expect(summarizeRun(off, runBlueprint(off, { event: "damageRoll", pins: ["out"] }, rollFacts(), env)).firstFailure)
      .toEqual({ nodeId: null, checkId: null, reason: { code: "disabled" } });

    const far = { ...env, reach: () => ({ pass: false, reason: { code: "outOfReach" as const, values: { actual: "30 ft" } } }) };
    expect(summarizeRun(source, runBlueprint(source, { event: "damageRoll", pins: ["out"] }, rollFacts(), far)).firstFailure)
      .toEqual({ nodeId: "ev", checkId: null, reason: { code: "outOfReach", values: { actual: "30 ft" } } });
  });

  it("formats failure reasons with choice labels and leaves activeEffects/attackModes raw", () => {
    const translator = createTranslator(en);
    const t = (key: string, data?: Record<string, string | number>) => translator.t(key, data);
    const fmt = createPhraseFormatter(translator, {
      choices: () => [{ value: "humanoid", label: "Humanoid" }, { value: "undead", label: "Undead" }, { value: "fiend", label: "Fiend" }]
    });
    expect(reasonText({ code: "notMatched", values: { actual: "humanoid", expected: "undead, fiend" } }, t, fmt, checkChoices("creatureTypes")))
      .toBe("Humanoid is not one of: Undead, Fiend.");
    expect(reasonText({ code: "notMatched", values: { actual: "—", expected: "undead" } }, t, fmt, null)).toBe("— is not one of: undead.");
    expect(reasonText({ code: "noTarget" }, t)).toBe("There is no target.");
    expect(checkChoices("creatureTypes")).not.toBeNull();
    expect(checkChoices("actorActiveEffects")).toBeNull();
    expect(checkChoices("attackModes")).toBeNull();
    expect(checkChoices("customScripts")).toBeNull();
    expect(checkChoices("unknown")).toBeNull();
  });
});
