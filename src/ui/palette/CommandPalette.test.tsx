import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import { makeNode } from "../../core/testing/graph";
import type { PaletteRequest } from "../canvas/BlueprintCanvas";
import { renderWithServices } from "../testing/render";
import { CommandPalette } from "./CommandPalette";

const blueprint = createBlueprint({ nodes: [makeNode("event", "afterAttack", "ev")] });

function request(from: PaletteRequest["from"] = null): PaletteRequest {
  return { flow: { x: 0, y: 0 }, screen: { x: 40, y: 40 }, bounds: { width: 1000, height: 800 }, from };
}

describe("CommandPalette", () => {
  it("lists nodes under group headings and focuses the search", () => {
    renderWithServices(<CommandPalette request={request()} blueprint={blueprint} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Search nodes" })).toHaveFocus();
    expect(screen.getByText("Before a roll")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(32);
  });

  it("filters as you type and picks with Enter", async () => {
    const onPick = vi.fn();
    renderWithServices(<CommandPalette request={request()} blueprint={blueprint} onPick={onPick} onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("combobox"), "dam");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Damage roll");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).not.toMatchObject({ type: "damageRoll" });
  });

  it("offers only nodes that can follow a dropped wire", () => {
    renderWithServices(
      <CommandPalette request={request({ source: "ev", sourcePin: "hit" })} blueprint={blueprint} onPick={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("Only nodes that can follow this output are shown.")).toBeInTheDocument();
    expect(screen.queryByText("Attack roll")).not.toBeInTheDocument();
    expect(screen.queryByText("Roll bonus")).not.toBeInTheDocument();
    expect(screen.getByText("Apply effect")).toBeInTheDocument();
  });

  it("explains an empty search", async () => {
    renderWithServices(<CommandPalette request={request()} blueprint={blueprint} onPick={vi.fn()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole("combobox"), "zzqq");
    expect(screen.getByText("No node matches “zzqq”. Try another word.")).toBeInTheDocument();
  });

  it("closes on Escape and on a click outside", async () => {
    const onClose = vi.fn();
    renderWithServices(
      <>
        <button type="button">outside</button>
        <CommandPalette request={request()} blueprint={blueprint} onPick={vi.fn()} onClose={onClose} />
      </>
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
