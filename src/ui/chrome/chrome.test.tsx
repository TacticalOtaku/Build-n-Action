import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { makeEdge, makeNode } from "../../core/testing/graph";
import { renderWithServices } from "../testing/render";
import { BlueprintList } from "./BlueprintList";
import { TitleBlock } from "./TitleBlock";
import { Toolbar } from "./Toolbar";

const wired = createBlueprint({
  id: "aB3dE5gH7jK9mN1p",
  name: "Flame tongue",
  nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "r", { formula: "1d6" })],
  edges: [makeEdge("ev", "out", "r")]
});
const empty = createBlueprint({ id: "zZ3dE5gH7jK9mN1p", name: "", enabled: false });
const NO_LINT = { error: 0, warning: 0, info: 0 };

describe("BlueprintList", () => {
  it("lists blueprints with their first sentence and state", async () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    renderWithServices(<BlueprintList blueprints={[wired, empty]} activeId={wired.id} onSelect={onSelect} onCreate={onCreate} onDuplicate={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} onOpenPicker={vi.fn()} hasLibrary={false} onDragRow={vi.fn()} onDropData={vi.fn()} />);
    expect(screen.getByText("When I roll damage: +1d6 to the roll.")).toBeInTheDocument();
    expect(screen.getByText("Untitled blueprint")).toBeInTheDocument();
    expect(screen.getByText("Not connected yet")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Flame tongue/ })).toHaveAttribute("aria-current", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Untitled blueprint/ }));
    expect(onSelect).toHaveBeenCalledWith(empty.id);
    await userEvent.click(screen.getByRole("button", { name: "New blueprint" }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("duplicates, toggles and deletes after confirmation", async () => {
    const onDuplicate = vi.fn();
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    renderWithServices(
      <BlueprintList blueprints={[wired]} activeId={wired.id} onSelect={vi.fn()} onCreate={vi.fn()} onDuplicate={onDuplicate} onToggle={onToggle} onDelete={onDelete} onOpenPicker={vi.fn()} hasLibrary={false} onDragRow={vi.fn()} onDropData={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "More actions for “Flame tongue”" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Duplicate “Flame tongue”" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onDuplicate).toHaveBeenCalledWith(wired.id);
    await userEvent.click(screen.getByRole("button", { name: "Turn off “Flame tongue”" }));
    expect(onToggle).toHaveBeenCalledWith(wired.id);
    await userEvent.click(screen.getByRole("button", { name: "Delete “Flame tongue”…" }));
    expect(screen.getByText("Delete “Flame tongue”? This cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete “Flame tongue”…" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(wired.id);
  });

  it("filters rows, saves to the library and accepts drops", async () => {
    const onSaveToLibrary = vi.fn();
    const onDropData = vi.fn();
    renderWithServices(
      <BlueprintList
        blueprints={[wired, empty]} activeId={wired.id} onSelect={vi.fn()} onCreate={vi.fn()} onDuplicate={vi.fn()}
        onToggle={vi.fn()} onDelete={vi.fn()} onOpenPicker={vi.fn()} hasLibrary onSaveToLibrary={onSaveToLibrary}
        onDragRow={vi.fn()} onDropData={onDropData}
      />
    );
    await userEvent.type(screen.getByRole("searchbox", { name: "Search blueprints" }), "flame");
    expect(screen.queryByRole("button", { name: /^Untitled blueprint/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More actions for “Flame tongue”" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save “Flame tongue” to the library" }));
    expect(onSaveToLibrary).toHaveBeenCalledWith(wired.id);
    expect(screen.getByRole("button", { name: "Saved to the library" })).toBeInTheDocument();
    const rail = screen.getByRole("navigation");
    const dataTransfer = { types: ["text/plain"], getData: () => JSON.stringify({ type: "Blueprint", uuid: "Item.x.Blueprint.y" }) };
    fireEvent.drop(rail, { dataTransfer });
    expect(onDropData).toHaveBeenCalledWith({ type: "Blueprint", uuid: "Item.x.Blueprint.y" });
  });

  it("keeps three actions in the row and works the menu with the keyboard", async () => {
    renderWithServices(
      <BlueprintList
        blueprints={[wired]} activeId={wired.id} onSelect={vi.fn()} onCreate={vi.fn()} onDuplicate={vi.fn()} onToggle={vi.fn()}
        onDelete={vi.fn()} onOpenPicker={vi.fn()} hasLibrary onSaveToLibrary={vi.fn()} onMoveToEffect={vi.fn()}
        onDragRow={vi.fn()} onDropData={vi.fn()}
      />
    );
    const row = screen.getByRole("button", { name: /^Flame tongue/ }).closest("li");
    expect(row?.querySelectorAll(".bna-rail__actions button")).toHaveLength(3);
    const more = screen.getByRole("button", { name: "More actions for “Flame tongue”" });
    await userEvent.click(more);
    expect(screen.getByRole("menuitem", { name: "Duplicate “Flame tongue”" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Save “Flame tongue” to the library" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Move “Flame tongue” to a new effect" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(more).toHaveFocus();
  });
});

describe("TitleBlock", () => {
  it("renames, toggles and shows the save state", async () => {
    const dispatch = vi.fn();
    renderWithServices(<TitleBlock blueprint={wired} carrier="Longsword" saving lint={NO_LINT} onShowIssues={vi.fn()} dispatch={dispatch} />);
    expect(screen.getByText("When I roll damage: +1d6 to the roll.")).toBeInTheDocument();
    expect(screen.getByText("Longsword")).toBeInTheDocument();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Blueprint name"), "!");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "rename", name: "Flame tongue!" });
    await userEvent.click(screen.getByRole("switch", { name: "This blueprint" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "setEnabled", enabled: false });
  });

  it("explains what to do when nothing is connected", () => {
    renderWithServices(<TitleBlock blueprint={empty} carrier="Longsword" saving={false} lint={NO_LINT} onShowIssues={vi.fn()} dispatch={vi.fn()} />);
    expect(screen.getByText("Connect an event to a result to see what this blueprint does.")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("counts issues and opens them", async () => {
    const onShowIssues = vi.fn();
    renderWithServices(
      <TitleBlock blueprint={wired} carrier="Longsword" saving={false} lint={{ error: 1, warning: 2, info: 0 }} onShowIssues={onShowIssues} dispatch={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Show issues (errors: 1, warnings: 2, notes: 0)" }));
    expect(onShowIssues).toHaveBeenCalled();
  });

  it("says when there are no issues", () => {
    renderWithServices(<TitleBlock blueprint={wired} carrier="Longsword" saving={false} lint={NO_LINT} onShowIssues={vi.fn()} dispatch={vi.fn()} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows the carrying effect's state and DAE rules", async () => {
    const openConfig = vi.fn();
    renderWithServices(
      <TitleBlock
        blueprint={wired} carrier="Rage" saving={false} lint={NO_LINT} onShowIssues={vi.fn()} dispatch={vi.fn()}
        effect={{ state: "disabled", disableCondition: "@attributes.hp.value <= 0", enableCondition: null, specialDurations: ["Zero HP"], openConfig }}
      />
    );
    expect(screen.getByText("Off: the blueprint does not work now")).toBeInTheDocument();
    expect(screen.getByText("Turns off while @attributes.hp.value <= 0")).toBeInTheDocument();
    expect(screen.getByText("Ends on: Zero HP")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Effect settings" }));
    expect(openConfig).toHaveBeenCalled();
  });

  it("says an enabled blueprint waits while its effect is off", () => {
    const effect = { state: "disabled" as const, disableCondition: "@attributes.hp.value <= 0", enableCondition: null, specialDurations: [], openConfig: vi.fn() };
    renderWithServices(<TitleBlock blueprint={wired} carrier="Rage" saving={false} lint={NO_LINT} onShowIssues={vi.fn()} effect={effect} dispatch={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "This blueprint" })).toHaveTextContent("On, waiting");
  });
});

describe("Toolbar", () => {
  function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
    const props = {
      onAdd: vi.fn(), onLayout: vi.fn(), onFit: vi.fn(), onUndo: vi.fn(), onRedo: vi.fn(),
      canUndo: true, canRedo: false, testing: false, theme: "dark" as const, onToggleTheme: vi.fn(),
      fxLevel: "full" as const, onCycleFx: vi.fn(), ...overrides
    };
    renderWithServices(<Toolbar {...props} />);
    return props;
  }

  it("labels every tool and disables what cannot run", async () => {
    const props = renderToolbar();
    await userEvent.click(screen.getByRole("button", { name: "Add node (Space)" }));
    expect(props.onAdd).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Redo (Ctrl+Y)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to the light theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Effects: full" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show a test run" })).not.toBeInTheDocument();
  });

  it("shows the test-run toggle when a host can trace", async () => {
    const onToggleTest = vi.fn();
    renderToolbar({ onToggleTest, testing: true });
    const button = screen.getByRole("button", { name: "Hide the test run" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(onToggleTest).toHaveBeenCalled();
  });

  it("offers the guide when the editor can show it", async () => {
    const onTour = vi.fn();
    renderToolbar({ onTour });
    await userEvent.click(screen.getByRole("button", { name: "Show the guide" }));
    expect(onTour).toHaveBeenCalled();
  });
});
