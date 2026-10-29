import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import type { BlueprintSource } from "../core/blueprint/types";
import { makeEdge, makeNode } from "../core/testing/graph";
import { Editor } from "./Editor";
import type { PreferencesHost, SimulatorHost } from "./host";
import { renderWithServices } from "./testing/render";

const first = createBlueprint({
  id: "aB3dE5gH7jK9mN1p",
  name: "Flame tongue",
  nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "r", { formula: "1d6" })],
  edges: [makeEdge("ev", "out", "r")]
});
const second = createBlueprint({ id: "zZ3dE5gH7jK9mN1p", name: "Hex" });

function Harness({ onSave, initial = [first, second], initialActiveId }: {
  onSave(blueprint: BlueprintSource): void;
  initial?: BlueprintSource[];
  initialActiveId?: string;
}) {
  const [blueprints, setBlueprints] = useState(initial);
  return (
    <Editor
      document={{ label: "Longsword", blueprints }}
      theme="dark"
      onToggleTheme={() => {}}
      fxLevel="off"
      initialActiveId={initialActiveId}
      onCycleFx={() => {}}
      onSave={blueprint => {
        onSave(blueprint);
        setBlueprints(list => list.map(entry => (entry.id === blueprint.id) ? blueprint : entry));
      }}
      onCreate={source => {
        const blueprint = source ?? createBlueprint();
        setBlueprints(list => [...list, blueprint]);
        return blueprint;
      }}
      onDelete={id => setBlueprints(list => list.filter(entry => entry.id !== id))}
    />
  );
}

function preferences(seen: boolean): PreferencesHost & { marked: ReturnType<typeof vi.fn> } {
  const marked = vi.fn();
  return { coachSeen: () => seen, markCoachSeen: marked, marked };
}

describe("Editor", () => {
  it("opens the first blueprint and switches between blueprints", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Flame tongue");
    await userEvent.click(screen.getByRole("button", { name: /^Hex/ }));
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Hex");
  });

  it("autosaves edits", async () => {
    const onSave = vi.fn();
    renderWithServices(<Harness onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Blueprint name"), "!");
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Flame tongue!" })));
    expect(screen.getByRole("button", { name: /^Flame tongue!/ })).toBeInTheDocument();
  });

  it("flushes pending edits when switching blueprints", async () => {
    const onSave = vi.fn();
    renderWithServices(<Harness onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Blueprint name"), "?");
    await userEvent.click(screen.getByRole("button", { name: /^Hex/ }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Flame tongue?" }));
  });

  it("undoes with Ctrl+Z on the canvas", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Blueprint name"), "!");
    screen.getByRole("main").focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Flame tongue");
  });

  it("opens the palette with Space on the canvas", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    screen.getByRole("main").focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("dialog", { name: "Add a node" })).toBeInTheDocument();
  });

  it("creates a blueprint from the empty state", async () => {
    renderWithServices(<Harness onSave={vi.fn()} initial={[]} />);
    expect(screen.getByText("Build your first blueprint")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "New blueprint" })[1]!);
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("");
  });

  it("counts lint issues and focuses a node from the Issues panel", async () => {
    const loose = createBlueprint({
      id: "lL3dE5gH7jK9mN1p",
      name: "Loose ends",
      nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "r", { formula: "1d6" })]
    });
    renderWithServices(<Harness onSave={vi.fn()} initial={[loose]} />);
    await userEvent.click(await screen.findByRole("button", { name: "Show issues (errors: 0, warnings: 2, notes: 0)" }));
    const panel = screen.getByRole("tabpanel");
    await userEvent.click(within(panel).getByRole("button", { name: /Nothing leads into this node/ }));
    const inspector = screen.getByRole("complementary", { name: "Node settings" });
    expect(await within(inspector).findByRole("heading", { name: "Roll bonus" })).toBeInTheDocument();
  });

  it("opens the Test tab from the toolbar when the host can simulate", async () => {
    const simulator: SimulatorHost = {
      actors: () => [{ value: "Actor.aria", label: "Aria" }],
      items: () => [],
      targets: () => [],
      defaults: () => ({ actorUuid: "Actor.aria", itemUuid: null, targetUuid: null }),
      run: (_blueprint, request) => ({
        run: { blueprintId: first.id, intents: [], nodes: {}, edges: [], skipped: { code: "disabled" } },
        notes: request.targetUuid ? [] : ["noToken"]
      })
    };
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { simulator } });
    await userEvent.click(screen.getByRole("button", { name: "Show a test run" }));
    expect(screen.getByRole("tab", { name: "Test" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Nothing would apply" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide the test run" }));
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Test" })).toBeNull());
  });

  it("explains in the Test tab where trigger events run in play", async () => {
    const simulator: SimulatorHost = {
      actors: () => [{ value: "Actor.aria", label: "Aria" }],
      items: () => [],
      targets: () => [],
      defaults: () => ({ actorUuid: "Actor.aria", itemUuid: null, targetUuid: null }),
      run: () => ({ run: { blueprintId: first.id, intents: [], nodes: {}, edges: [], skipped: { code: "disabled" } }, notes: ["trigger"] })
    };
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { simulator } });
    await userEvent.click(screen.getByRole("button", { name: "Show a test run" }));
    expect(await screen.findByText(/In play this runs on the GM's side/)).toBeInTheDocument();
  });

  it("says in the Test tab when it assumed the player's choice", async () => {
    const simulator: SimulatorHost = {
      actors: () => [{ value: "Actor.aria", label: "Aria" }],
      items: () => [],
      targets: () => [],
      defaults: () => ({ actorUuid: "Actor.aria", itemUuid: null, targetUuid: null }),
      run: () => ({ run: { blueprintId: first.id, intents: [], nodes: {}, edges: [], skipped: { code: "disabled" } }, notes: ["chosen"] })
    };
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { simulator } });
    await userEvent.click(screen.getByRole("button", { name: "Show a test run" }));
    expect(await screen.findByText(/as if the player chose it/)).toBeInTheDocument();
  });

  it("has no test button without a simulator", () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Show a test run" })).toBeNull();
  });

  it("duplicates the selected node with Ctrl+D", async () => {
    const onSave = vi.fn();
    const loose = createBlueprint({
      id: "lL3dE5gH7jK9mN1p",
      name: "Loose ends",
      nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "r", { formula: "1d6" })]
    });
    renderWithServices(<Harness onSave={onSave} initial={[loose]} />);
    await userEvent.click(await screen.findByRole("button", { name: /Show issues/ }));
    await userEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: /Nothing leads into this node/ }));
    screen.getByRole("main").focus();
    await userEvent.keyboard("{Control>}d{/Control}");
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({
      nodes: expect.arrayContaining([expect.objectContaining({ type: "rollBonus", position: { x: 36, y: 36 } })]) as unknown
    })));
  });

  it("duplicates the open blueprint with its unsaved edits and opens the copy", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Blueprint name"), "!");
    await userEvent.click(screen.getByRole("button", { name: "More actions for “Flame tongue”" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Duplicate “Flame tongue”" }));
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Flame tongue! (copy)");
  });

  it("deletes the open blueprint without saving it again", async () => {
    const onSave = vi.fn();
    renderWithServices(<Harness onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Blueprint name"), "?");
    await userEvent.click(screen.getByRole("button", { name: "Delete “Flame tongue”…" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Hex");
    expect(onSave).not.toHaveBeenCalledWith(expect.objectContaining({ name: "Flame tongue?" }));
    expect(screen.queryByRole("button", { name: /^Flame tongue/ })).toBeNull();
  });

  it("turns the open blueprint off through its history", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Turn off “Flame tongue”" }));
    expect(screen.getByRole("switch", { name: "This blueprint" })).toHaveAttribute("aria-checked", "false");
    screen.getByRole("main").focus();
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(screen.getByRole("switch", { name: "This blueprint" })).toHaveAttribute("aria-checked", "true");
  });

  it("walks a first-time user through the editor and remembers it", async () => {
    const prefs = preferences(false);
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { preferences: prefs } });
    expect(screen.getByRole("dialog", { name: "Build on the canvas" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Set up the selected node" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip the guide" }));
    expect(prefs.marked).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /./ })).toBeNull());
  });

  it("ends the guide with Done on its last step and skips the Test step without a simulator", async () => {
    const prefs = preferences(false);
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { preferences: prefs } });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("dialog", { name: "Set up the selected node" });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog", { name: "Read it back" })).toHaveTextContent("3 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(prefs.marked).toHaveBeenCalled();
  });

  it("replays the guide from the toolbar", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { preferences: preferences(true) } });
    expect(screen.queryByRole("dialog", { name: "Build on the canvas" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show the guide" }));
    expect(screen.getByRole("dialog", { name: "Build on the canvas" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Build on the canvas" })).toBeNull());
  });

  it("opens the requested blueprint first", () => {
    renderWithServices(<Harness onSave={vi.fn()} initialActiveId={second.id} />);
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Hex");
  });

  it("starts a blueprint from a preset and opens it", async () => {
    renderWithServices(<Harness onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "From a template" }));
    await userEvent.click(screen.getByRole("button", { name: /^Bless/ }));
    expect(screen.getByLabelText("Blueprint name")).toHaveValue("Bless");
  });

  it("copies a blueprint dropped from another document", async () => {
    const elsewhere = createBlueprint({ id: "eLsE5gH7jK9mN1p0", name: "From elsewhere" });
    renderWithServices(<Harness onSave={vi.fn()} />);
    fireEvent.drop(screen.getByRole("navigation"), {
      dataTransfer: { types: ["text/plain"], getData: () => JSON.stringify({ type: "Blueprint", data: elsewhere }) }
    });
    await waitFor(() => expect(screen.getByLabelText("Blueprint name")).toHaveValue("From elsewhere"));
  });

  it("moves a blueprint onto a new effect and removes it here", async () => {
    const moved: BlueprintSource[] = [];
    const effects = { moveToEffect: (blueprint: BlueprintSource) => { moved.push(blueprint); return Promise.resolve(); } };
    renderWithServices(<Harness onSave={vi.fn()} />, { host: { effects } });
    await userEvent.click(screen.getByRole("button", { name: "More actions for “Flame tongue”" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move “Flame tongue” to a new effect" }));
    await waitFor(() => expect(screen.getByLabelText("Blueprint name")).toHaveValue("Hex"));
    expect(moved.map(blueprint => blueprint.id)).toEqual([first.id]);
    expect(screen.queryByRole("button", { name: /^Flame tongue/ })).toBeNull();
  });
});
