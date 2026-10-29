import type { NodeProps } from "@xyflow/react";
import { STATIC } from "../../../core/registry/choices";
import { asRecord, asString } from "../../../core/registry/data";
import type { PinId } from "../../../core/registry/constants";
import { getResult } from "../../../core/registry/index";
import { pickFlavor } from "../../fx/flavors";
import { useServices, useT } from "../../services";
import type { BnaFlowNode } from "../flow-mapping";
import { nodeTitle } from "../node-title";
import { NodeFrame } from "./NodeFrame";
import { OutputPins } from "./OutputPins";

export function ResultNode({ data, selected }: NodeProps<BnaFlowNode>) {
  const t = useT();
  const { fmt } = useServices();
  const definition = getResult(data.node.type);
  if (!definition) {
    return <NodeFrame kind="result" title={t("BNA.UI.Node.unknown")} icon="circle" status={data.status} selected={selected} />;
  }

  const common = asRecord(data.node.data.common);
  const optional = definition.supportsOptional && (common.optional === true);
  const badges: string[] = [];
  if (optional) badges.push(t("BNA.UI.Node.optional"));
  const costType = asString(asRecord(common.cost).type, "none");
  if (optional && (costType !== "none")) badges.push(fmt.choice(costType, { static: STATIC.costType }));
  const limit = asString(common.limit, "none");
  const pins: readonly PinId[] = definition.pins?.length ? definition.pins : ((common.then === true) ? ["then"] : []);
  if (limit !== "none") badges.push(fmt.choice(limit, { static: STATIC.limit }));

  return (
    <NodeFrame
      kind="result"
      title={nodeTitle(data.node, t)}
      icon={definition.icon}
      status={data.status}
      lint={data.lint}
      selected={selected}
      flavor={pickFlavor(definition.flavor(data.node.data))}
      seedKey={data.node.id}
    >
      <p className="bna-node__line">{definition.phrase(data.node.data, fmt)}</p>
      {badges.length ? (
        <div className="bna-node__badges">
          {badges.map(badge => <span key={badge} className="bna-badge">{badge}</span>)}
        </div>
      ) : null}
      {pins.length ? <OutputPins pins={pins} /> : null}
    </NodeFrame>
  );
}
