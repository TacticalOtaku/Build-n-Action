import { describe, expect, it } from "vitest";
import type { LintIssue } from "../../core/engine/lint";
import { createTranslator } from "../../core/i18n";
import en from "../../lang/en.json";
import { lintCounts, lintMessage, nodeLints, sortIssues } from "./lint-view";

const { t } = createTranslator(en, { strict: true });

const issues: LintIssue[] = [
  { code: "orphan-node", level: "warning", nodeId: "r" },
  { code: "migrated", level: "info" },
  { code: "invalid-formula", level: "error", nodeId: "r", values: { formula: "1d" } },
  { code: "dead-event", level: "warning", nodeId: "ev" }
];

describe("lint view", () => {
  it("names the event by its label", () => {
    expect(lintMessage({ code: "incompatible-result", level: "error", nodeId: "x", values: { event: "afterResult" } }, t))
      .toBe("This result cannot follow the “And then” event.");
    expect(lintMessage({ code: "incompatible-result", level: "error", nodeId: "x", values: { event: "afterAttack" } }, t))
      .toBe("This result cannot follow the “After an attack” event.");
  });

  it("fills the message of a finding", () => {
    expect(lintMessage(issues[2]!, t)).toBe("The formula “1d” is not valid.");
  });

  it("sorts errors first and keeps the order within a level", () => {
    expect(sortIssues(issues).map(issue => issue.code)).toEqual(["invalid-formula", "orphan-node", "dead-event", "migrated"]);
  });

  it("gives each node its worst level and all its messages", () => {
    const byNode = nodeLints(issues, t);
    expect(byNode.r).toEqual({ level: "error", messages: ["The formula “1d” is not valid.", t("BNA.Lint.orphan-node")] });
    expect(byNode.ev?.level).toBe("warning");
    expect(Object.keys(byNode).sort()).toEqual(["ev", "r"]);
  });

  it("counts findings per level", () => {
    expect(lintCounts(issues)).toEqual({ error: 1, warning: 2, info: 1 });
    expect(lintCounts([])).toEqual({ error: 0, warning: 0, info: 0 });
  });
});
