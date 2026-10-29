import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { runBlueprint, type BlueprintEnv } from "../../core/engine/interpreter";
import { passed } from "../../core/engine/reasons";
import { creatureFacts, rollFacts } from "../../core/testing/facts";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import type { SimulationRequest, SimulatorHost } from "../host";
import { renderWithServices } from "../testing/render";
import { SimulatorPanel } from "./SimulatorPanel";

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
