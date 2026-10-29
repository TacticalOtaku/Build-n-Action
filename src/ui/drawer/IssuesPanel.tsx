import { useMemo } from "react";
import type { BlueprintSource } from "../../core/blueprint/types";
import type { LintIssue } from "../../core/engine/lint";
import { nodeTitle } from "../canvas/node-title";
import { LintMark } from "../lint/LintMark";
import { lintMessage, sortIssues } from "../lint/lint-view";
import { useT } from "../services";

export interface IssuesPanelProps {
  blueprint: BlueprintSource;
  issues: readonly LintIssue[];
  /** Select a node and bring it into view. */
  onFocus(nodeId: string): void;
}

export function IssuesPanel({ blueprint, issues, onFocus }: IssuesPanelProps) {
  const t = useT();
  const sorted = useMemo(() => sortIssues(issues), [issues]);
  if (!sorted.length) return <p className="bna-drawer__empty">{t("BNA.UI.Issues.empty")}</p>;
  return (
    <ul className="bna-issues">
      {sorted.map((issue, index) => {
        const node = issue.nodeId ? blueprint.nodes.find(entry => entry.id === issue.nodeId) : undefined;
        const content = (
          <>
            <LintMark level={issue.level} />
            <span className="bna-issues__where">{node ? nodeTitle(node, t) : t("BNA.UI.Issues.blueprint")}</span>
            <span className="bna-issues__text">{lintMessage(issue, t)}</span>
          </>
        );
        return (
          <li key={`${issue.code}:${issue.nodeId ?? ""}:${issue.checkId ?? ""}:${index}`}>
            {node
              ? <button type="button" className="bna-issues__row" onClick={() => onFocus(node.id)}>{content}</button>
              : <div className="bna-issues__row">{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}
