import type { LintIssue, LintLevel } from "../../core/engine/lint";
import type { Translator } from "../../core/i18n";

export const LINT_LEVELS: readonly LintLevel[] = ["error", "warning", "info"];

/** What a node card shows: its worst finding's level and every message about it. */
export interface NodeLint {
  level: LintLevel;
  messages: readonly string[];
}

const RANK: Record<LintLevel, number> = { error: 0, warning: 1, info: 2 };

export function lintMessage(issue: LintIssue, t: Translator["t"]): string {
  const values: Record<string, string> | undefined = issue.values ? { ...issue.values } : undefined;
  // Events are stored by id; the message names them by their label.
  if (values?.event) values.event = t(`BNA.Event.${values.event}.Label`);
  return t(`BNA.Lint.${issue.code}`, values);
}

/** Errors first, then warnings, then notes; stable within a level. */
export function sortIssues(issues: readonly LintIssue[]): LintIssue[] {
  return [...issues].sort((a, b) => RANK[a.level] - RANK[b.level]);
}

export function nodeLints(issues: readonly LintIssue[], t: Translator["t"]): Record<string, NodeLint> {
  const byNode: Record<string, { level: LintLevel; messages: string[] }> = {};
  for (const issue of sortIssues(issues)) {
    if (!issue.nodeId) continue;
    const entry = byNode[issue.nodeId] ??= { level: issue.level, messages: [] };
    entry.messages.push(lintMessage(issue, t));
  }
  return byNode;
}

export function lintCounts(issues: readonly LintIssue[]): Record<LintLevel, number> {
  const counts: Record<LintLevel, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.level]++;
  return counts;
}
