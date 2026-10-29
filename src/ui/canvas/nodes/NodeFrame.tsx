import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { NodeKind } from "../../../core/registry/constants";
import { seedFrom, type FxFlavor } from "../../fx/flavors";
import { FlavorField } from "../../fx/FlavorField";
import { Icon } from "../../icons";
import { LintMark } from "../../lint/LintMark";
import type { NodeLint } from "../../lint/lint-view";
import { useT } from "../../services";
import type { NodeRunStatus } from "../trace";

const KIND_KEYS: Record<NodeKind, string> = {
  event: "BNA.Kind.event",
  condition: "BNA.Kind.condition",
  result: "BNA.Kind.result"
};

const STATUS_KEYS: Record<NodeRunStatus, string> = {
  passed: "BNA.UI.Node.passed",
  failed: "BNA.UI.Node.failed",
  skipped: "BNA.UI.Node.skipped"
};

export interface NodeFrameProps {
  kind: NodeKind;
  title: string;
  icon: string;
  status: NodeRunStatus | null;
  selected: boolean;
  lint?: NodeLint | null;
  flavor?: FxFlavor | null;
  /** Stable key (the node id) so each card animates differently but consistently. */
  seedKey?: string;
  children?: ReactNode;
}

/** The shaped card shared by all node kinds: outline, kind rule, input pin, heading. */
export function NodeFrame({ kind, title, icon, status, selected, lint = null, flavor = null, seedKey = "", children }: NodeFrameProps) {
  const t = useT();
  return (
    <motion.div
      className="bna-node"
      data-kind={kind}
      data-status={status ?? undefined}
      data-lint={lint?.level}
      data-selected={selected ? "" : undefined}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 460, damping: 34 }}
    >
      <span className="bna-node__shape" aria-hidden="true" />
      {flavor ? <FlavorField flavor={flavor} seed={seedFrom(seedKey)} /> : null}
      {selected ? <span className="bna-node__corners" aria-hidden="true"><i /><i /><i /><i /></span> : null}
      {(kind === "event") ? null : <Handle type="target" position={Position.Left} id="in" className="bna-pin bna-pin--in" />}
      <div className="bna-node__head">
        <Icon name={icon} size={14} />
        <span>{t(KIND_KEYS[kind])}</span>
        {lint ? <LintMark level={lint.level} count={lint.messages.length} label={lint.messages.join(" ")} /> : null}
        {status ? <span className="bna-node__status">{t(STATUS_KEYS[status])}</span> : null}
      </div>
      <div className="bna-node__title">{title}</div>
      {children}
    </motion.div>
  );
}
