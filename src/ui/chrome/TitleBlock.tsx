import { useCallback, useMemo, useState, useSyncExternalStore, type Dispatch } from "react";
import { createPortal } from "react-dom";
import type { BlueprintSource } from "../../core/blueprint/types";
import type { LintLevel } from "../../core/engine/lint";
import { describeBlueprint } from "../../core/phrase/describe";
import { LintMark } from "../lint/LintMark";
import { LINT_LEVELS } from "../lint/lint-view";
import type { CounterRow, EffectStatus } from "../host";
import { Icon } from "../icons";
import { useHost, useServices, useT } from "../services";
import { CountersDialog } from "./CountersDialog";
import type { EditorAction } from "../state/editor-state";

export interface TitleBlockProps {
  blueprint: BlueprintSource;
  /** The document that carries the blueprint, e.g. an item name. */
  carrier: string;
  saving: boolean;
  /** Findings per level. */
  lint: Readonly<Record<LintLevel, number>>;
  onShowIssues(): void;
  /** The Active Effect that carries the blueprint, if any. */
  effect?: EffectStatus;
  dispatch: Dispatch<EditorAction>;
}

/** The drafting-sheet title block: what this blueprint is and what it does. */
const EFFECT_STATE_KEYS: Record<EffectStatus["state"], string> = {
  active: "BNA.UI.Stamp.effectActive",
  disabled: "BNA.UI.Stamp.effectDisabled",
  expired: "BNA.UI.Stamp.effectExpired",
  suppressed: "BNA.UI.Stamp.effectSuppressed"
};

export function TitleBlock({ blueprint, carrier, saving, lint, onShowIssues, effect, dispatch }: TitleBlockProps) {
  const t = useT();
  const { fmt } = useServices();
  const sentences = useMemo(() => describeBlueprint(blueprint, fmt), [blueprint, fmt]);
  const { counters } = useHost();
  const subscribe = useCallback((listener: () => void) => counters?.subscribe(listener) ?? (() => undefined), [counters]);
  // A string snapshot compares by value, so unchanged values do not re-render.
  const snapshot = useSyncExternalStore(subscribe, () => JSON.stringify(counters?.rows(blueprint) ?? []));
  const rows = useMemo(() => JSON.parse(snapshot) as CounterRow[], [snapshot]);
  /** The editor root the set-up dialog opens over (the title block itself is a small positioned box). */
  const [setup, setSetup] = useState<Element | null>(null);
  return (
    <section className="bna-stamp" aria-label={t("BNA.UI.Stamp.label")} data-coach="stamp">
      <input
        className="bna-stamp__name"
        aria-label={t("BNA.UI.Stamp.name")}
        placeholder={t("BNA.UI.Stamp.namePlaceholder")}
        value={blueprint.name}
        onChange={event => dispatch({ type: "rename", name: event.target.value })}
      />
      <div className="bna-stamp__phrase" aria-live="polite">
        {sentences.length
          ? sentences.map((sentence, index) => <p key={index}>{sentence}</p>)
          : <p>{t("BNA.UI.Stamp.emptyPhrase")}</p>}
      </div>
      <div className="bna-stamp__issues">
        <span className="bna-stamp__label">{t("BNA.UI.Stamp.issues")}</span>
        {(lint.error + lint.warning + lint.info) ? (
          <button
            type="button"
            className="bna-stamp__marks"
            aria-label={t("BNA.UI.Stamp.showIssues", { errors: lint.error, warnings: lint.warning, notes: lint.info })}
            onClick={onShowIssues}
          >
            {LINT_LEVELS.filter(level => lint[level] > 0).map(level => <LintMark key={level} level={level} count={lint[level]} />)}
          </button>
        ) : <span>{t("BNA.UI.Stamp.noIssues")}</span>}
      </div>
      {counters ? (
        <div className="bna-stamp__counters">
          <span className="bna-stamp__label">{t("BNA.UI.Counters.title")}</span>
          {rows.length ? rows.map(row => (
            <span key={`${row.scope}:${row.name}`} className="bna-stamp__counter">
              <span>{`${row.name}: ${row.value}`}</span>
              <button
                type="button"
                className="bna-iconbtn"
                aria-label={t("BNA.UI.Counters.reset", { name: row.name })}
                title={t("BNA.UI.Counters.reset", { name: row.name })}
                onClick={() => void counters.reset(blueprint, row)}
              >
                <Icon name="undo-2" size={12} />
              </button>
            </span>
          )) : <span>{t("BNA.UI.Counters.none")}</span>}
          <button type="button" className="bna-stamp__effect-open" aria-label={t("BNA.UI.Counters.setup")} onClick={event => setSetup(event.currentTarget.closest(".bna-app") ?? event.currentTarget.ownerDocument.body)}>
            {t("BNA.UI.Counters.setupShort")}
          </button>
        </div>
      ) : null}
      {(counters && setup)
        ? createPortal(<CountersDialog blueprint={blueprint} counters={counters} dispatch={dispatch} onClose={() => setSetup(null)} />, setup)
        : null}
      {effect ? (
        <div className="bna-stamp__effect" data-state={effect.state}>
          <span className="bna-stamp__label">{t("BNA.UI.Stamp.effect")}</span>
          <span className="bna-stamp__effect-state">{t(EFFECT_STATE_KEYS[effect.state])}</span>
          {effect.disableCondition ? <span className="bna-stamp__effect-rule">{t("BNA.UI.Stamp.effectDisableWhen", { condition: effect.disableCondition })}</span> : null}
          {effect.enableCondition ? <span className="bna-stamp__effect-rule">{t("BNA.UI.Stamp.effectRemoveUnless", { condition: effect.enableCondition })}</span> : null}
          {effect.specialDurations.length ? <span className="bna-stamp__effect-rule">{t("BNA.UI.Stamp.effectEndsOn", { list: effect.specialDurations.join(", ") })}</span> : null}
          <button type="button" className="bna-stamp__effect-open" onClick={effect.openConfig}>{t("BNA.UI.Stamp.effectConfig")}</button>
        </div>
      ) : null}
      <div className="bna-stamp__cell">
        <span className="bna-stamp__label">{t("BNA.UI.Stamp.carrier")}</span>
        <span>{carrier}</span>
      </div>
      <div className="bna-stamp__cell">
        <span className="bna-stamp__label">{t("BNA.UI.Stamp.status")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={blueprint.enabled}
          aria-label={t("BNA.UI.Stamp.status")}
          className="bna-stamp__switch"
          onClick={() => dispatch({ type: "setEnabled", enabled: !blueprint.enabled })}
        >
          {blueprint.enabled
            ? t((effect && (effect.state !== "active")) ? "BNA.UI.Stamp.onWaiting" : "BNA.UI.Stamp.on")
            : t("BNA.UI.Stamp.off")}
        </button>
        <span className="bna-stamp__label">{saving ? t("BNA.UI.Stamp.saving") : t("BNA.UI.Stamp.saved")}</span>
      </div>
    </section>
  );
}
