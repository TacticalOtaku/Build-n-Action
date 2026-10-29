import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type Dispatch } from "react";
import type { BlueprintNode, BlueprintSource } from "../../core/blueprint/types";
import { upstreamEvents } from "../../core/graph/upstream";
import type { EventType, NodeKind } from "../../core/registry/constants";
import { asRecord } from "../../core/registry/data";
import { COMMON_RESULT_FIELDS, getEvent, getResult } from "../../core/registry/index";
import { Icon } from "../icons";
import { useHost, useT } from "../services";
import type { EditorAction } from "../state/editor-state";
import { ChecksEditor } from "./ChecksEditor";
import { CounterNames, FieldList } from "./FieldList";

const KIND_KEYS: Record<NodeKind, string> = {
  event: "BNA.Kind.event",
  condition: "BNA.Kind.condition",
  result: "BNA.Kind.result"
};

/** Results without player choice still have a limit and an "And then" output. */
const WITHOUT_CHOICE = COMMON_RESULT_FIELDS.filter(field => (field.key === "limit") || (field.key === "then"));

interface NodeText {
  label: string;
  summary: string;
  help: string;
}

function textFor(node: BlueprintNode): NodeText | null {
  if (node.kind === "condition") {
    return { label: "BNA.Palette.condition.Label", summary: "BNA.Palette.condition.Summary", help: "BNA.Field.conditionMode.hint" };
  }
  const prefix = (node.kind === "event") ? "BNA.Event" : "BNA.Result";
  const known = (node.kind === "event") ? getEvent(node.type) : getResult(node.type);
  if (!known) return null;
  return { label: `${prefix}.${node.type}.Label`, summary: `${prefix}.${node.type}.Summary`, help: `${prefix}.${node.type}.Help` };
}

export interface InspectorProps {
  blueprint: BlueprintSource;
  selection: readonly string[];
  dispatch: Dispatch<EditorAction>;
  /** Whether the blueprint lives on an item, where "only this item" applies. */
  itemCarrier?: boolean;
}

export function Inspector({ blueprint, selection, dispatch, itemCarrier = false }: InspectorProps) {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(false);
  const node = (selection.length === 1) ? (blueprint.nodes.find(candidate => candidate.id === selection[0]) ?? null) : null;
  const upstream = useMemo(() => (node ? upstreamEvents(blueprint, node.id) : []), [blueprint, node]);
  const { counters } = useHost();
  const counterNames = useMemo(() => counters?.names(blueprint) ?? [], [counters, blueprint]);

  return (
    <CounterNames.Provider value={counterNames}>
    <aside className="bna-inspector" aria-label={t("BNA.UI.Inspector.label")} data-coach="inspector">
      <AnimatePresence mode="wait" initial={false}>
        {node ? (
          <motion.div
            key={node.id}
            className="bna-inspector__body"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <NodeInspector
              node={node}
              upstream={upstream}
              dispatch={dispatch}
              itemCarrier={itemCarrier}
              helpOpen={helpOpen}
              onToggleHelp={() => setHelpOpen(open => !open)}
            />
          </motion.div>
        ) : (
          <motion.div key="empty" className="bna-inspector__empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2>{t("BNA.UI.Inspector.emptyTitle")}</h2>
            <p>{t("BNA.UI.Inspector.emptyBody")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
    </CounterNames.Provider>
  );
}

function NodeInspector({ node, upstream, dispatch, itemCarrier, helpOpen, onToggleHelp }: {
  node: BlueprintNode;
  upstream: readonly EventType[];
  dispatch: Dispatch<EditorAction>;
  itemCarrier: boolean;
  helpOpen: boolean;
  onToggleHelp(): void;
}) {
  const t = useT();
  const text = textFor(node);
  const setData = (path: readonly string[], value: unknown) => dispatch({ type: "setNodeData", id: node.id, path, value });
  const event = (node.kind === "event") ? getEvent(node.type) : undefined;
  const result = (node.kind === "result") ? getResult(node.type) : undefined;

  return (
    <>
      <header className="bna-inspector__head" data-kind={node.kind}>
        <div className="bna-inspector__kind">
          <span>{t(KIND_KEYS[node.kind])}</span>
          {text ? (
            <button
              type="button"
              className="bna-iconbtn"
              aria-expanded={helpOpen}
              aria-label={helpOpen ? t("BNA.UI.Inspector.hideHelp") : t("BNA.UI.Inspector.help")}
              title={helpOpen ? t("BNA.UI.Inspector.hideHelp") : t("BNA.UI.Inspector.help")}
              onClick={onToggleHelp}
            >
              <Icon name="circle-help" />
            </button>
          ) : null}
        </div>
        <h2 className="bna-inspector__title">{text ? t(text.label) : t("BNA.UI.Node.unknown")}</h2>
        <p className="bna-inspector__summary">{text ? t(text.summary) : t("BNA.UI.Inspector.unknown")}</p>
        {(text && helpOpen) ? <p className="bna-inspector__help">{t(text.help)}</p> : null}
      </header>

      {event ? (
        <section className="bna-inspector__section">
          <FieldList fields={event.fields} data={node.data} path={[]} upstream={upstream} onChange={setData} />
        </section>
      ) : null}

      {(node.kind === "condition") ? <ChecksEditor node={node} upstream={upstream} dispatch={dispatch} itemCarrier={itemCarrier} /> : null}

      {result ? (
        <>
          <section className="bna-inspector__section">
            <FieldList fields={result.fields} data={node.data} path={[]} upstream={upstream} onChange={setData} />
          </section>
          <section className="bna-inspector__section">
            <h3 className="bna-inspector__section-title">{t("BNA.UI.Inspector.common")}</h3>
            <FieldList
              fields={(result.supportsOptional ? COMMON_RESULT_FIELDS : WITHOUT_CHOICE).filter(field => !(result.pins?.length && (field.key === "then")))}
              data={asRecord(node.data.common)}
              path={["common"]}
              upstream={upstream}
              onChange={setData}
            />
          </section>
        </>
      ) : null}

      <div className="bna-inspector__footer">
        <button type="button" className="bna-button bna-button--ghost bna-button--danger" onClick={() => dispatch({ type: "removeNodes", ids: [node.id] })}>
          <Icon name="trash-2" />
          {t("BNA.UI.Inspector.delete")}
        </button>
      </div>
    </>
  );
}
