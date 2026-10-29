import type { NodeProps } from "@xyflow/react";
import type { ConditionCheck } from "../../../core/blueprint/types";
import { STATIC } from "../../../core/registry/choices";
import { asString } from "../../../core/registry/data";
import { getCheck } from "../../../core/registry/index";
import { Icon } from "../../icons";
import { useServices, useT } from "../../services";
import type { BnaFlowNode } from "../flow-mapping";
import { nodeTitle } from "../node-title";
import { NodeFrame } from "./NodeFrame";
import { OutputPins } from "./OutputPins";

/** Checks listed on the card before collapsing into "and N more". */
const LISTED_CHECKS = 3;

export function ConditionNode({ data, selected }: NodeProps<BnaFlowNode>) {
  const t = useT();
  const { fmt } = useServices();
  const checks = Array.isArray(data.node.data.checks) ? data.node.data.checks as ConditionCheck[] : [];
  const title = nodeTitle(data.node, t);
  const onlyThisItem = data.node.data.thisItem === true;

  return (
    <NodeFrame kind="condition" title={title} icon="split" status={data.status} lint={data.lint} selected={selected}>
      {onlyThisItem ? (
        <p className="bna-node__line bna-node__only-item">
          <Icon name="pin" size={12} />
          {t("BNA.Check.thisItem.Phrase")}
        </p>
      ) : null}
      {checks.length ? (
        <ul className="bna-node__checks">
          {checks.slice(0, LISTED_CHECKS).map(check => {
            const definition = getCheck(check.type);
            return <li key={check.id}>{definition ? definition.phrase(check.data, fmt) : check.type}</li>;
          })}
          {(checks.length > LISTED_CHECKS)
            ? <li>{t("BNA.UI.Node.moreChecks", { count: checks.length - LISTED_CHECKS })}</li>
            : null}
        </ul>
      ) : (onlyThisItem ? null : <p className="bna-node__line">{t("BNA.UI.Node.noChecks")}</p>)}
      {(checks.length > 1)
        ? <p className="bna-node__line">{fmt.choice(asString(data.node.data.mode, "all"), { static: STATIC.conditionMode })}</p>
        : null}
      <OutputPins pins={["yes", "no"]} />
    </NodeFrame>
  );
}
