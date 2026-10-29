import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import type { BlueprintSource } from "../../core/blueprint/types";
import type { LibraryHost } from "../host";
import { renderWithServices } from "../testing/render";
import { TemplatePicker } from "./TemplatePicker";

const saved = createBlueprint({ id: "LiBr5gH7jK9mN1p0", name: "Table favourite" });

function library(canEdit: boolean, entries: BlueprintSource[] = [saved]): LibraryHost & { removed: string[]; imported: string[] } {
  const removed: string[] = [];
  const imported: string[] = [];
  return {
    removed,
    imported,
    entries: () => entries,
    canEdit: () => canEdit,
    add: vi.fn(() => Promise.resolve()),
    remove: id => {
      removed.push(id);
      return Promise.resolve();
    },
    import: text => {
      imported.push(text);
      return Promise.resolve({ blueprints: [saved], rejected: 0, error: null });
    },
    download: vi.fn(),
    subscribe: () => () => {}
  };
}

describe("TemplatePicker", () => {
  it("lists the presets, filters them and adds a fresh copy", async () => {
    const onPick = vi.fn();
    renderWithServices(<TemplatePicker initialTab="presets" onPick={onPick} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Start from a template" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    await userEvent.type(screen.getByRole("searchbox"), "smite");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Divine Smite/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Divine Smite" }));
    expect((onPick.mock.calls[0]?.[0] as BlueprintSource).id).not.toBe("PresetDivSmite01");
  });

  it("offers library entries and hides the library tab without a library", async () => {
    const onPick = vi.fn();
    const { unmount } = renderWithServices(<TemplatePicker initialTab="library" onPick={onPick} onClose={vi.fn()} />, { host: { library: library(false) } });
    await userEvent.click(screen.getByRole("button", { name: /Table favourite/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ name: "Table favourite" }));
    expect(screen.queryByRole("button", { name: "Import JSON…" })).toBeNull();
    unmount();
    renderWithServices(<TemplatePicker initialTab="library" onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Library" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Templates" })).toHaveAttribute("aria-selected", "true");
  });

  it("lets the GM remove, export and import", async () => {
    const host = library(true);
    renderWithServices(<TemplatePicker initialTab="library" onPick={vi.fn()} onClose={vi.fn()} />, { host: { library: host } });
    await userEvent.click(screen.getByRole("button", { name: "Remove “Table favourite” from the library" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove for good" }));
    expect(host.removed).toEqual([saved.id]);
    await userEvent.click(screen.getByRole("button", { name: "Export the library" }));
    expect(host.download).toHaveBeenCalledWith([saved]);
    const file = new File([JSON.stringify(saved)], "blueprints.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("Import JSON…"), file);
    await waitFor(() => expect(host.imported).toHaveLength(1));
    expect(await screen.findByText("Imported 1 blueprint(s).")).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    renderWithServices(<TemplatePicker initialTab="presets" onPick={vi.fn()} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
