import { useState, type Dispatch } from "react";
import type { BlueprintSource, CounterDef, CounterReset } from "../../core/blueprint/types";
import { COUNTER_RESETS, counterName, DEFAULT_COUNTER } from "../../core/counters/counters";
import type { CountersHost } from "../host";
import { Icon } from "../icons";
import { useT } from "../services";
import type { EditorAction } from "../state/editor-state";

interface CountersDialogProps {
  blueprint: BlueprintSource;
  counters: CountersHost;
  dispatch: Dispatch<EditorAction>;
  onClose(): void;
}

interface Draft {
  name: string;
  min: string;
  max: string;
  initial: string;
  reset: CounterReset;
}

function toDraft(def: CounterDef): Draft {
  return { name: def.name, min: String(def.min), max: (def.max === null) ? "" : String(def.max), initial: String(def.initial), reset: def.reset };
}

function whole(text: string, fallback: number): number {
  const value = Number(text);
  return (text.trim() && Number.isFinite(value)) ? Math.trunc(value) : fallback;
}

function toDef(draft: Draft): CounterDef | null {
  const name = counterName(draft.name);
  if (!name) return null;
  const min = whole(draft.min, DEFAULT_COUNTER.min);
  return {
    name,
    min,
    max: draft.max.trim() ? Math.max(min, whole(draft.max, min)) : null,
    initial: whole(draft.initial, DEFAULT_COUNTER.initial),
    reset: draft.reset
  };
}

function blank(): Draft {
  return toDraft({ name: "", ...DEFAULT_COUNTER });
}

function Section({ title, add, drafts, onChange }: { title: string; add: string; drafts: Draft[]; onChange(next: Draft[]): void }) {
  const t = useT();
  const set = (index: number, patch: Partial<Draft>) => onChange(drafts.map((draft, at) => (at === index) ? { ...draft, ...patch } : draft));
  return (
    <section className="bna-counters__section">
      <h3 className="bna-inspector__section-title">{title}</h3>
      {drafts.map((draft, index) => (
        <div key={index} className="bna-counters__row">
          <label className="bna-counters__cell">
            <span>{t("BNA.UI.Counters.name")}</span>
            <input className="bna-input" value={draft.name} onChange={event => set(index, { name: event.target.value })} />
          </label>
          <label className="bna-counters__cell">
            <span>{t("BNA.UI.Counters.min")}</span>
            <input className="bna-input" inputMode="numeric" value={draft.min} onChange={event => set(index, { min: event.target.value })} />
          </label>
          <label className="bna-counters__cell">
            <span>{t("BNA.UI.Counters.max")}</span>
            <input className="bna-input" inputMode="numeric" placeholder="—" value={draft.max} onChange={event => set(index, { max: event.target.value })} />
          </label>
          <label className="bna-counters__cell">
            <span>{t("BNA.UI.Counters.initial")}</span>
            <input className="bna-input" inputMode="numeric" value={draft.initial} onChange={event => set(index, { initial: event.target.value })} />
          </label>
          <label className="bna-counters__cell">
            <span>{t("BNA.UI.Counters.resetOn")}</span>
            <select className="bna-select" value={draft.reset} onChange={event => set(index, { reset: event.target.value as CounterReset })}>
              {COUNTER_RESETS.map(reset => <option key={reset} value={reset}>{t(`BNA.Choice.counterReset.${reset}`)}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="bna-iconbtn"
            aria-label={t("BNA.UI.Counters.remove", { name: draft.name || "—" })}
            title={t("BNA.UI.Counters.remove", { name: draft.name || "—" })}
            onClick={() => onChange(drafts.filter((_draft, at) => at !== index))}
          >
            <Icon name="trash-2" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="bna-button bna-button--ghost" onClick={() => onChange([...drafts, blank()])}>
        <Icon name="plus" size={14} />
        {add}
      </button>
    </section>
  );
}

/** Set up the owner's shared counters and this blueprint's own; nothing is written until "Save". */
export function CountersDialog({ blueprint, counters, dispatch, onClose }: CountersDialogProps) {
  const t = useT();
  const [shared] = useState(() => counters.actorDefs());
  const [own, setOwn] = useState<Draft[]>(() => (blueprint.counters ?? []).map(toDraft));
  const [actor, setActor] = useState<Draft[]>(() => (shared ?? []).map(toDraft));
  const save = () => {
    dispatch({ type: "setCounters", counters: own.flatMap(draft => toDef(draft) ?? []) });
    if (shared) void counters.saveActorDefs(actor.flatMap(draft => toDef(draft) ?? []));
    onClose();
  };
  return (
    <div className="bna-picker-scrim" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className="bna-picker bna-counters"
        role="dialog"
        aria-modal="true"
        aria-label={t("BNA.UI.Counters.title")}
        onKeyDown={event => { if (event.key === "Escape") onClose(); }}
      >
        <header className="bna-picker__head">
          <h2 className="bna-counters__title">{t("BNA.UI.Counters.title")}</h2>
        </header>
        <div className="bna-counters__body">
          {shared
            ? <Section title={t("BNA.UI.Counters.shared")} add={t("BNA.UI.Counters.addShared")} drafts={actor} onChange={setActor} />
            : <p className="bna-counters__note">{t("BNA.UI.Counters.noOwner")}</p>}
          <Section title={t("BNA.UI.Counters.own")} add={t("BNA.UI.Counters.addOwn")} drafts={own} onChange={setOwn} />
        </div>
        <footer className="bna-counters__footer">
          <button type="button" className="bna-button bna-button--ghost" onClick={onClose}>{t("BNA.UI.Counters.cancel")}</button>
          <button type="button" className="bna-button" onClick={save}>{t("BNA.UI.Counters.save")}</button>
        </footer>
      </section>
    </div>
  );
}
