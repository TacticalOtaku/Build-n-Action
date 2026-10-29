import type { LintLevel } from "../../core/engine/lint";
import { useT } from "../services";

const LABELS: Record<LintLevel, string> = {
  error: "BNA.UI.Lint.error",
  warning: "BNA.UI.Lint.warning",
  info: "BNA.UI.Lint.info"
};

/** A revision mark: a filled triangle for errors, an outlined one for warnings, a circle for notes. */
export function LintMark({ level, count, label }: { level: LintLevel; count?: number; label?: string }) {
  const t = useT();
  const text = label ?? t(LABELS[level]);
  return (
    <span className="bna-lintmark" data-level={level} role="img" aria-label={text} title={text}>
      <svg viewBox="0 0 18 16" aria-hidden="true" focusable="false">
        {(level === "info") ? <circle cx="9" cy="8" r="6.6" /> : <path d="M9 1.4 16.8 14.6H1.2Z" />}
      </svg>
      {(count === undefined) ? null : <span className="bna-lintmark__count">{count}</span>}
    </span>
  );
}
