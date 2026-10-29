import { screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { makeCondition, makeNode } from "../../../core/testing/graph";
import type { BlueprintNode } from "../../../core/blueprint/types";
import { renderWithServices } from "../../testing/render";
import type { BnaFlowNode } from "../flow-mapping";
import type { NodeLint } from "../../lint/lint-view";
import type { NodeRunStatus } from "../trace";
import { ConditionNode } from "./ConditionNode";
import { EventNode } from "./EventNode";
import { ResultNode } from "./ResultNode";

function props(node: BlueprintNode, selected = false, status: NodeRunStatus | null = null, lint: NodeLint | null = null): NodeProps<BnaFlowNode> {
  return {
    id: node.id,
    type: node.kind,
    data: { node, status, lint },
    selected,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0
  } as NodeProps<BnaFlowNode>;
}

describe("EventNode", () => {
  it("shows the event, whose roll and outcome pins", () => {
    renderWithServices(<EventNode {...props(makeNode("event", "afterAttack", "ev", {
      reach: { mode: "aura", range: "10", disposition: "1", includeSelf: true, blockers: [], require: {} }
    }))} />);
    expect(screen.getByText("After an attack")).toBeInTheDocument();
    expect(screen.getByText("Whose roll: My aura, 10 ft")).toBeInTheDocument();
    expect(screen.getByText("Hit")).toBeInTheDocument();
    expect(screen.getByText("Fumble")).toBeInTheDocument();
  });

  it("shows the signal name for signal events", () => {
    renderWithServices(<EventNode {...props(makeNode("event", "signal", "sig", { name: "smite" }))} />);
    expect(screen.getByText("Signal “smite”")).toBeInTheDocument();
  });

  it("shows a revision mark with the node's lint messages", () => {
    const lint = { level: "warning" as const, messages: ["This event does not lead to any result."] };
    renderWithServices(<EventNode {...props(makeNode("event", "damageRoll", "ev"), false, null, lint)} />);
    expect(screen.getByRole("img", { name: "This event does not lead to any result." })).toHaveTextContent("1");
  });
});

describe("EventNode without a roll", () => {
  it("names whose turn, which tokens, or nothing for rests", () => {
    const { unmount } = renderWithServices(<EventNode {...props(makeNode("event", "turnStart", "ev", {
      reach: { mode: "aura", range: "30", disposition: "1", includeSelf: true, blockers: [], require: {} }
    }))} />);
    expect(screen.getByText("Whose turn: My aura, 30 ft")).toBeInTheDocument();
    unmount();
    const region = renderWithServices(<EventNode {...props(makeNode("event", "regionEnter", "ev", { tokens: "hostile" }))} />);
    expect(screen.getByText("Which tokens: Hostile tokens")).toBeInTheDocument();
    region.unmount();
    renderWithServices(<EventNode {...props(makeNode("event", "longRest", "ev"))} />);
    expect(screen.queryByText(/Whose/)).toBeNull();
  });
});

describe("ConditionNode", () => {
  it("lists its checks as phrases", () => {
    const node = makeCondition("if", [
      { id: "a", type: "creatureTypes", data: { values: ["undead"] } },
      { id: "b", type: "targetEffects", data: { values: ["prone"] } }
    ], "any");
    renderWithServices(<ConditionNode {...props(node)} />);
    expect(screen.getByText("Target creature type +1")).toBeInTheDocument();
    expect(screen.getByText("the target is Undead")).toBeInTheDocument();
    expect(screen.getByText("Any check passes")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Otherwise")).toBeInTheDocument();
  });

  it("says it always passes without checks", () => {
    renderWithServices(<ConditionNode {...props(makeCondition("if", []))} />);
    expect(screen.getByText("No checks yet")).toBeInTheDocument();
    expect(screen.getByText("Always passes")).toBeInTheDocument();
  });
});

describe("ConditionNode with \"only this item\"", () => {
  it("shows the tick above the checks instead of \"always passes\"", () => {
    const ticked = makeCondition("if", []);
    renderWithServices(<ConditionNode {...props({ ...ticked, data: { ...ticked.data, thisItem: true } })} />);
    expect(screen.getByText("the roll uses this very item")).toBeInTheDocument();
    expect(screen.queryByText(/always passes/i)).toBeNull();
  });
});

describe("ResultNode", () => {
  it("shows the phrase and property badges", () => {
    const node = makeNode("result", "rollBonus", "r", {
      formula: "1d6",
      damageTypes: ["fire"],
      common: { optional: true, choiceGroup: "", cost: { type: "slots" }, limit: "turn" }
    });
    const { container } = renderWithServices(<ResultNode {...props(node, true, "passed")} />);
    expect(screen.getByText("Roll bonus")).toBeInTheDocument();
    expect(screen.getByText("+1d6 Fire damage")).toBeInTheDocument();
    expect(screen.getByText("Player's choice")).toBeInTheDocument();
    expect(screen.getByText("Spell slots")).toBeInTheDocument();
    expect(screen.getByText("Once per turn")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    const card = container.querySelector(".bna-node");
    expect(card).toHaveAttribute("data-kind", "result");
    expect(card).toHaveAttribute("data-selected");
    expect(container.querySelector(".bna-fx")).toHaveAttribute("data-flavor", "fire");
  });

  it("shows the \"And then\" output only when it is on", () => {
    const node = makeNode("result", "applyEffect", "blind", { source: "status", status: "blinded", who: "target" });
    const { unmount } = renderWithServices(<ResultNode {...props(node)} />);
    expect(screen.queryByText("And then")).not.toBeInTheDocument();
    unmount();
    renderWithServices(<ResultNode {...props({ ...node, data: { ...node.data, common: { ...(node.data.common as object), then: true } } })} />);
    expect(screen.getByText("And then")).toBeInTheDocument();
  });

  it("shows a demanded save's outcome outputs", () => {
    renderWithServices(<ResultNode {...props(makeNode("result", "demandSave", "save"))} />);
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("And then")).not.toBeInTheDocument();
  });

  it("renders a plain result without badges", () => {
    renderWithServices(<ResultNode {...props(makeNode("result", "rollBonus", "r"), false)} />);
    expect(screen.getByText("Roll bonus")).toBeInTheDocument();
  });
});
