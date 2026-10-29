import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import type { CounterDef } from "../../core/blueprint/types";
import type { CountersHost } from "../host";
import { renderWithServices } from "../testing/render";
import { TitleBlock } from "./TitleBlock";

const blueprint = createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "Rage", counters: [{ name: "hits", min: 0, max: 3, initial: 0, reset: "turnStart" }] });

function host(overrides: Partial<CountersHost> = {}): CountersHost {
  let defs: CounterDef[] = [{ name: "rage", min: 0, max: 3, initial: 3, reset: "longRest" }];
  return {
    rows: () => [{ name: "rage", scope: "actor", value: 2 }, { name: "hits", scope: "blueprint", value: 1 }],
    names: () => ["rage", "hits"],
    reset: vi.fn(async () => undefined),
    actorDefs: () => defs,
    saveActorDefs: vi.fn(async (next: readonly CounterDef[]) => { defs = [...next]; }),
    subscribe: () => () => undefined,
    ...overrides
  };
}

function renderStamp(counters: CountersHost, dispatch = vi.fn()) {
  renderWithServices(
    <TitleBlock blueprint={blueprint} carrier="Barbarian" saving={false} lint={{ error: 0, warning: 0, info: 0 }} onShowIssues={vi.fn()} dispatch={dispatch} />,
    { host: { counters } }
  );
  return dispatch;
}

describe("counters in the title block", () => {
  it("lists the counters the blueprint uses with their values and resets one", async () => {
    const counters = host();
    renderStamp(counters);
    expect(screen.getByText("rage: 2")).toBeInTheDocument();
    expect(screen.getByText("hits: 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset “rage”" }));
    expect(counters.reset).toHaveBeenCalledWith(blueprint, { name: "rage", scope: "actor", value: 2 });
  });

  it("edits shared and blueprint counters in the set-up dialog", async () => {
    const counters = host();
    const dispatch = renderStamp(counters);
    await userEvent.click(screen.getByRole("button", { name: "Set up counters" }));
    expect(screen.getByRole("dialog", { name: "Counters" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a counter to this blueprint" }));
    const names = screen.getAllByLabelText("Name");
    await userEvent.type(names[names.length - 1] as HTMLElement, "Streak");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setCounters",
      counters: [
        { name: "hits", min: 0, max: 3, initial: 0, reset: "turnStart" },
        { name: "streak", min: 0, max: null, initial: 0, reset: "manual" }
      ]
    });
    expect(counters.saveActorDefs).toHaveBeenCalledWith([{ name: "rage", min: 0, max: 3, initial: 3, reset: "longRest" }]);
  });

  it("shows no counters row without a counters host", () => {
    renderWithServices(<TitleBlock blueprint={blueprint} carrier="x" saving={false} lint={{ error: 0, warning: 0, info: 0 }} onShowIssues={vi.fn()} dispatch={vi.fn()} />);
    expect(screen.queryByText("Counters")).not.toBeInTheDocument();
  });
});
