import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../../core/blueprint/factory";
import type { LintIssue } from "../../core/engine/lint";
import { makeNode } from "../../core/testing/graph";
import { renderWithServices } from "../testing/render";
import { Drawer } from "./Drawer";
import { IssuesPanel } from "./IssuesPanel";

const blueprint = createBlueprint({
  nodes: [makeNode("event", "damageRoll", "ev"), makeNode("result", "rollBonus", "r")]
});

const issues: LintIssue[] = [
  { code: "orphan-node", level: "warning", nodeId: "r" },
  { code: "migrated", level: "info" },
  { code: "cost-without-optional", level: "error", nodeId: "r" }
];

describe("IssuesPanel", () => {
  it("lists findings, errors first, and focuses their node", async () => {
    const onFocus = vi.fn();
    renderWithServices(<IssuesPanel blueprint={blueprint} issues={issues} onFocus={onFocus} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("A cost needs “Ask the player” turned on.");
    expect(rows[2]).toHaveTextContent("Whole blueprint");
    await userEvent.click(screen.getByRole("button", { name: /Nothing leads into this node/ }));
    expect(onFocus).toHaveBeenCalledWith("r");
  });

  it("says when there is nothing to fix", () => {
    renderWithServices(<IssuesPanel blueprint={blueprint} issues={[]} onFocus={vi.fn()} />);
    expect(screen.getByText(/No issues/)).toBeInTheDocument();
  });
});

describe("Drawer", () => {
  it("switches tabs and closes", async () => {
    const onTab = vi.fn();
    const onClose = vi.fn();
    renderWithServices(
      <Drawer tab="issues" onTab={onTab} onClose={onClose} issueCount={3} test={<p>test body</p>} issues={<p>issues body</p>} />
    );
    expect(screen.getByRole("tab", { name: /Issues/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("issues body");
    await userEvent.click(screen.getByRole("tab", { name: "Test" }));
    expect(onTab).toHaveBeenCalledWith("test");
    await userEvent.click(screen.getByRole("button", { name: "Close the panel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides the Test tab without a simulator", () => {
    renderWithServices(<Drawer tab="issues" onTab={vi.fn()} onClose={vi.fn()} issueCount={0} issues={<p>issues body</p>} />);
    expect(screen.queryByRole("tab", { name: "Test" })).toBeNull();
  });
});
