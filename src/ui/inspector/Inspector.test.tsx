import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { makeCondition, makeEdge, makeNode } from "../../core/testing/graph";
import { renderWithServices } from "../testing/render";
import { Inspector } from "./Inspector";

const blueprint = createBlueprint({
  nodes: [
    makeNode("event", "damageRoll", "ev"),
    makeCondition("if", [{ id: "c1", type: "skillIds", data: { values: [] } }]),
    makeNode("result", "rollBonus", "bonus"),
    makeNode("result", "dcBonus", "dc")
  ],
  edges: [makeEdge("ev", "out", "if"), makeEdge("if", "yes", "bonus")]
});

function renderInspector(selection: string[], itemCarrier = false, source = blueprint) {
  const dispatch = vi.fn();
  renderWithServices(<Inspector blueprint={source} selection={selection} dispatch={dispatch} itemCarrier={itemCarrier} />);
  return dispatch;
}

describe("Inspector", () => {
  it("invites a selection when nothing is selected", () => {
    renderInspector([]);
    expect(screen.getByText("Select a node")).toBeInTheDocument();
  });

  it("edits a result and shows its damage type after a damage roll", async () => {
    const dispatch = renderInspector(["bonus"]);
    expect(screen.getByRole("heading", { name: "Roll bonus" })).toBeInTheDocument();
    expect(screen.getByText("Damage type")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Bonus"), "3");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setNodeData", id: "bonus", path: ["formula"], value: "3" });
  });

  it("offers player choice only where the result supports it", () => {
    renderInspector(["dc"]);
    expect(screen.queryByText("Ask the player")).not.toBeInTheDocument();
    expect(screen.getByLabelText("At most")).toBeInTheDocument();
  });

  it("offers \"And then\" on every result, including those without player choice", async () => {
    const dispatch = renderInspector(["dc"]);
    await userEvent.click(screen.getByRole("switch", { name: "“And then” output" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setNodeData", id: "dc", path: ["common", "then"], value: true });
  });

  it("offers no \"And then\" on a result with its own outputs", () => {
    const withSave = createBlueprint({ nodes: [makeNode("result", "demandSave", "save")], edges: [] });
    renderInspector(["save"], false, withSave);
    expect(screen.queryByRole("switch", { name: "“And then” output" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("At most")).toBeInTheDocument();
  });

  it("writes common properties under data.common", async () => {
    const dispatch = renderInspector(["bonus"]);
    await userEvent.click(screen.getByRole("switch", { name: "Ask the player" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setNodeData", id: "bonus", path: ["common", "optional"], value: true });
  });

  it("shows help on demand", async () => {
    renderInspector(["ev"]);
    await userEvent.click(screen.getByRole("button", { name: "Show help" }));
    expect(screen.getByText(/Example: \+1d6 fire damage/)).toBeInTheDocument();
  });

  it("warns about checks that cannot pass after the wired events", () => {
    renderInspector(["if"]);
    expect(screen.getByText("This check never passes after the events wired into this node.")).toBeInTheDocument();
  });

  it("adds checks from the picker", async () => {
    const dispatch = renderInspector(["if"]);
    await userEvent.click(screen.getByRole("button", { name: "Add check" }));
    await userEvent.type(screen.getByLabelText("Search checks"), "creature");
    await userEvent.click(screen.getByRole("button", { name: /Target creature type/ }));
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "addCheck", nodeId: "if", check: expect.objectContaining({ type: "creatureTypes" })
    }));
  });

  it("offers \"only this item\" as a tick on blueprints that live on an item, not as a check", async () => {
    const dispatch = renderInspector(["if"], true);
    await userEvent.click(screen.getByRole("switch", { name: "Only rolls with this item" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setNodeData", id: "if", path: ["thisItem"], value: true });
    await userEvent.click(screen.getByRole("button", { name: "Add check" }));
    await userEvent.type(screen.getByLabelText("Search checks"), "this item");
    expect(screen.queryByRole("button", { name: /This item only/ })).toBeNull();
  });

  it("hides the tick elsewhere unless it is already on", () => {
    renderInspector(["if"], false);
    expect(screen.queryByRole("switch", { name: "Only rolls with this item" })).toBeNull();
  });

  it("still shows a tick that is on, so it can be turned off", () => {
    const ticked = { ...blueprint, nodes: blueprint.nodes.map(node => (node.id === "if") ? { ...node, data: { ...node.data, thisItem: true } } : node) };
    renderInspector(["if"], false, ticked);
    expect(screen.getByRole("switch", { name: "Only rolls with this item" })).toHaveAttribute("aria-checked", "true");
  });

  it("deletes the node", async () => {
    const dispatch = renderInspector(["ev"]);
    await userEvent.click(screen.getByRole("button", { name: "Delete node" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "removeNodes", ids: ["ev"] });
  });
});
