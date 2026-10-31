import { useEffect, useRef, useState } from "react";
import { effectReference, isEffectUuid } from "../../core/facts/effects";
import { asRecord, asString } from "../../core/registry/data";
import { useHost, useT } from "../services";

/** A source reference, kept separate from effect names and system statuses. */
export function EffectReferenceInput({ id, value, describedBy, onChange }: {
  id: string; value: unknown; describedBy?: string; onChange(value: unknown): void;
}) {
  const t = useT();
  const host = useHost().effectSelection;
  const selected = effectReference(value);
  const [draft, setDraft] = useState(() => asString(asRecord(value).uuid));
  const [status, setStatus] = useState<"idle" | "pending" | "invalid">(() => value != null && !selected ? "invalid" : "idle");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);

  const resolve = async (text: string) => {
    const current = ++request.current;
    const uuid = text.trim();
    setStatus("pending");
    try {
      const result = isEffectUuid(uuid) && host ? effectReference(await host.resolve(uuid)) : null;
      if (current !== request.current) return;
      if (!result || result.uuid !== uuid) {
        setStatus("invalid");
        // Preserve an existing choice; an invalid new reference must not act as an empty check.
        if (value == null && uuid) onChange({ uuid, name: "", invalid: true });
        return;
      }
      setDraft(result.uuid);
      setStatus("idle");
      onChange(result);
    } catch {
      if (current !== request.current) return;
      setStatus("invalid");
      if (value == null && uuid) onChange({ uuid, name: "", invalid: true });
    }
  };

  const choices = host?.choices() ?? [];
  return (
    <div
      role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}
      onDragOver={event => { event.preventDefault(); }}
      onDrop={event => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const data = asRecord(JSON.parse(event.dataTransfer.getData("text/plain")));
          if (data.type !== "ActiveEffect" || !isEffectUuid(asString(data.uuid))) {
            request.current++;
            setStatus("invalid");
            if (data.type === "ActiveEffect" && value == null) onChange({ uuid: asString(data.uuid).trim(), name: "", invalid: true });
            return;
          }
          void resolve(asString(data.uuid));
        } catch {
          request.current++;
          setStatus("invalid");
        }
      }}
    >
      {selected ? <p className="bna-field__hint" aria-label={t("BNA.Field.activeEffect.selected")}>{selected.name || selected.uuid}</p> : null}
      {host ? (
        <>
          <select
            id={id} className="bna-select" aria-label={t("BNA.Field.activeEffect.choose")}
            value={selected?.uuid ?? ""} onChange={event => { if (event.target.value) void resolve(event.target.value); }}
          >
            <option value="">{t("BNA.Field.activeEffect.choose")}</option>
            {selected && !choices.some(ref => ref.uuid === selected.uuid) ? <option value={selected.uuid}>{selected.name || selected.uuid}</option> : null}
            {choices.map(ref => <option key={ref.uuid} value={ref.uuid}>{ref.name || ref.uuid}</option>)}
          </select>
          <label className="bna-field__label" htmlFor={`${id}-uuid`}>{t("BNA.Field.activeEffect.uuid")}</label>
          <input
            id={`${id}-uuid`} className="bna-input" value={draft} aria-invalid={status === "invalid"}
            aria-describedby={status === "invalid" ? `${id}-error` : describedBy}
            onChange={event => { request.current++; setDraft(event.target.value); setStatus("idle"); }}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void resolve(draft); } }}
          />
          <button type="button" className="bna-button" onClick={() => { void resolve(draft); }}>{t("BNA.Field.activeEffect.resolve")}</button>
          <p className="bna-field__hint">{t("BNA.Field.activeEffect.dropHint")}</p>
        </>
      ) : <p className="bna-field__hint">{t("BNA.Field.activeEffect.unavailable")}</p>}
      {value != null ? (
        <button type="button" className="bna-button" onClick={() => { request.current++; setDraft(""); setStatus("idle"); onChange(null); }}>{t("BNA.Field.activeEffect.clear")}</button>
      ) : null}
      {status === "pending" ? <p role="status">{t("BNA.Field.activeEffect.pending")}</p> : null}
      {status === "invalid" ? <p id={`${id}-error`} role="alert">{t("BNA.Field.activeEffect.invalid")}</p> : null}
    </div>
  );
}
