import type { NodeProps } from "@xyflow/react";
import type { BlueprintNode } from "../../../core/blueprint/types";
import type { Translator } from "../../../core/i18n";
import { STATIC } from "../../../core/registry/choices";
import { asRecord, asString } from "../../../core/registry/data";
import { getEvent } from "../../../core/registry/index";
import type { FieldSpec } from "../../../core/registry/fields";
import type { PhraseFormatter } from "../../../core/registry/types";
import { useServices, useT } from "../../services";
import type { BnaFlowNode } from "../flow-mapping";
import { nodeTitle } from "../node-title";
import { NodeFrame } from "./NodeFrame";
import { OutputPins } from "./OutputPins";

/** The card's line under the title: whose roll or turn, which tokens, or the signal; "" when the event has no setting. */
function describeReach(node: BlueprintNode, fields: readonly FieldSpec[], fmt: PhraseFormatter, t: Translator["t"]): string {
  if (node.type === "signal") {
    return t("BNA.UI.Node.signal", { name: asString(node.data.name).trim() || t("BNA.Phrase.Unset") });
  }
  const tokens = fields.find(field => field.key === "tokens");
  if (tokens) return `${t(tokens.label)}: ${fmt.choice(asString(node.data.tokens, "any"), { static: STATIC.regionTokens })}`;
  const reachField = fields.find(field => field.key === "reach");
  if (!reachField) return "";
  const reach = asRecord(node.data.reach);
  const mode = asString(reach.mode, "self");
  let value = fmt.choice(mode, { static: STATIC.reachMode });
  const range = asString(reach.range).trim();
  if ((mode === "aura") && (range !== "-1")) value = `${value}, ${t("BNA.UI.Node.feet", { value: range || "0" })}`;
  return `${t(reachField.label)}: ${value}`;
}

export function EventNode({ data, selected }: NodeProps<BnaFlowNode>) {
  const t = useT();
  const { fmt } = useServices();
  const definition = getEvent(data.node.type);
  if (!definition) {
    return <NodeFrame kind="event" title={t("BNA.UI.Node.unknown")} icon="circle" status={data.status} selected={selected} />;
  }
  const line = describeReach(data.node, definition.fields, fmt, t);
  return (
    <NodeFrame kind="event" title={nodeTitle(data.node, t)} icon={definition.icon} status={data.status} lint={data.lint} selected={selected}>
      {line ? <p className="bna-node__line">{line}</p> : null}
      <OutputPins pins={definition.pins} />
    </NodeFrame>
  );
}
