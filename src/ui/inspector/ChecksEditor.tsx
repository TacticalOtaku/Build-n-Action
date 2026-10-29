import { useState, type Dispatch } from "react";
import { createCheck } from "../../core/blueprint/factory";
import type { BlueprintNode, ConditionCheck } from "../../core/blueprint/types";
import type { EventType } from "../../core/registry/constants";
import { CHECKS, CONDITION_NODE_FIELDS, getCheck } from "../../core/registry/index";
import { CHECK_CATEGORIES, type CheckDefinition } from "../../core/registry/types";
import { Icon } from "../icons";
import { useServices, useT } from "../services";
import type { EditorAction } from "../state/editor-state";
import { FieldList } from "./FieldList";

function normalize(text: string): string {
  return text.toLocaleLowerCase().replaceAll("ё", "е");
}

/** Checks offered in the picker: "only this item" is the condition's own tick now; old blueprints keep the check. */
const PICKABLE = CHECKS.filter(definition => definition.type !== "thisItem");

export function ChecksEditor({ node, upstream, dispatch, itemCarrier }: {
  node: BlueprintNode; upstream: readonly EventType[]; dispatch: Dispatch<EditorAction>; itemCarrier: boolean;
}) {
  const t = useT();
  const { fmt } = useServices();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const checks = Array.isArray(node.data.checks) ? node.data.checks as ConditionCheck[] : [];
  const relevant = (definition: CheckDefinition) => !upstream.length || definition.relevantTo.some(event => upstream.includes(event));
  const needle = normalize(query.trim());
  const candidates = PICKABLE.filter(definition => !needle
    || normalize(t(`BNA.Check.${definition.type}.Label`)).includes(needle)
    || normalize(t(`BNA.Check.${definition.type}.Summary`)).includes(needle));

  const add = (definition: CheckDefinition) => {
    dispatch({ type: "addCheck", nodeId: node.id, check: createCheck(definition.type) });
    setPicking(false);
    setQuery("");
  };

  return (
    <section className="bna-inspector__section">
      <h3 className="bna-inspector__section-title">{t("BNA.UI.Inspector.checks")}</h3>
      <FieldList
        fields={(itemCarrier || (node.data.thisItem === true)) ? CONDITION_NODE_FIELDS : CONDITION_NODE_FIELDS.filter(field => field.key !== "thisItem")}
        data={node.data}
        path={[]}
        upstream={upstream}
        onChange={(path, value) => dispatch({ type: "setNodeData", id: node.id, path, value })}
      />
      {checks.length ? null : <p className="bna-field__hint">{t("BNA.UI.Inspector.noChecks")}</p>}
      <div>
        {checks.map(check => {
          const definition = getCheck(check.type);
          if (!definition) return null;
          const label = t(`BNA.Check.${definition.type}.Label`);
          return (
            <section key={check.id} className="bna-check" aria-label={label}>
              <div className="bna-check__head">
                <Icon name={definition.icon} />
                <h4 className="bna-check__title">{label}</h4>
                <button
                  type="button"
                  className="bna-iconbtn"
                  aria-label={t("BNA.UI.Inspector.removeCheck")}
                  title={t("BNA.UI.Inspector.removeCheck")}
                  onClick={() => dispatch({ type: "removeCheck", nodeId: node.id, checkId: check.id })}
                >
                  <Icon name="trash-2" />
                </button>
              </div>
              <p className="bna-check__summary">{definition.phrase(check.data, fmt)}</p>
              {relevant(definition) ? null : <p className="bna-check__warning">{t("BNA.UI.Inspector.irrelevantCheck")}</p>}
              <FieldList
                fields={definition.fields}
                data={check.data}
                path={[]}
                upstream={upstream}
                onChange={(path, value) => dispatch({ type: "setCheckData", nodeId: node.id, checkId: check.id, path, value })}
              />
            </section>
          );
        })}
      </div>
      {picking ? (
        <div className="bna-check-picker">
          <input
            autoFocus
            aria-label={t("BNA.UI.Inspector.searchChecks")}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => { if (event.key === "Escape") setPicking(false); }}
          />
          <ul className="bna-check-picker__list">
            {CHECK_CATEGORIES.map(category => {
              const list = candidates.filter(definition => definition.category === category);
              if (!list.length) return null;
              return (
                <li key={category}>
                  <div className="bna-palette__group">{t(`BNA.Category.Check.${category}`)}</div>
                  <ul>
                    {list.map(definition => (
                      <li key={definition.type}>
                        <button type="button" className="bna-check-picker__item" data-relevant={relevant(definition)} onClick={() => add(definition)}>
                          <span className="bna-palette__label">{t(`BNA.Check.${definition.type}.Label`)}</span>
                          <span className="bna-palette__summary">{t(`BNA.Check.${definition.type}.Summary`)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p>
          <button type="button" className="bna-button" onClick={() => setPicking(true)}>
            <Icon name="plus" />
            {t("BNA.UI.Inspector.addCheck")}
          </button>
        </p>
      )}
    </section>
  );
}
