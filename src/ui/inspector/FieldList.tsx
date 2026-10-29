import { createContext, type ReactNode, useContext, useId, useState } from "react";
import { STATIC } from "../../core/registry/choices";
import type { EventType } from "../../core/registry/constants";
import { asNumber, asRecord, asString, asStrings } from "../../core/registry/data";
import { defaultsFor, isFieldVisible, type ChoiceSpec, type FieldSpec } from "../../core/registry/fields";
import { getResult } from "../../core/registry/index";
import { Icon } from "../icons";
import { useT } from "../services";
import { FormulaInput } from "./FormulaInput";
import { slugify } from "./slug";
import { useChoiceOptions } from "./useChoiceOptions";

type FieldPath = readonly string[];

export interface FieldListProps {
  fields: readonly FieldSpec[];
  data: Readonly<Record<string, unknown>>;
  path: FieldPath;
  /** Events wired into the node; empty when unknown, which shows every field. */
  upstream: readonly EventType[];
  onChange(path: FieldPath, value: unknown): void;
}

/** Counter names text fields with `suggest: "counters"` offer; provided by the Inspector. */
export const CounterNames = createContext<readonly string[]>([]);

/** Chip lists longer than this get a filter box. */
const FILTER_THRESHOLD = 12;

function isShown(field: FieldSpec, data: Readonly<Record<string, unknown>>, upstream: readonly EventType[]): boolean {
  if (!isFieldVisible(field, data)) return false;
  if (field.onlyFor && upstream.length) return field.onlyFor.some(event => upstream.includes(event));
  return true;
}

export function FieldList({ fields, data, path, upstream, onChange }: FieldListProps) {
  return (
    <div className="bna-fields">
      {fields.map((field, index) => isShown(field, data, upstream) ? (
        <FieldControl
          key={`${field.key}:${index}`}
          field={field}
          value={data[field.key]}
          path={[...path, field.key]}
          upstream={upstream}
          onChange={onChange}
        />
      ) : null)}
    </div>
  );
}

interface ShellProps {
  id: string;
  label: string;
  hint: string | null;
  inline?: boolean;
  group?: boolean;
  children: ReactNode;
}

function Shell({ id, label, hint, inline = false, group = false, children }: ShellProps) {
  return (
    <div className={inline ? "bna-field bna-field--inline" : "bna-field"}>
      {group
        ? <span id={`${id}-label`} className="bna-field__label">{label}</span>
        : <label id={`${id}-label`} htmlFor={id} className="bna-field__label">{label}</label>}
      {children}
      {hint ? <p id={`${id}-hint`} className="bna-field__hint">{hint}</p> : null}
    </div>
  );
}

interface ControlProps {
  field: FieldSpec;
  value: unknown;
  path: FieldPath;
  upstream: readonly EventType[];
  onChange(path: FieldPath, value: unknown): void;
}

function FieldControl({ field, value, path, upstream, onChange }: ControlProps) {
  const counterNames = useContext(CounterNames);
  const t = useT();
  const id = useId();
  const label = t(field.label);
  const hint = field.hint ? t(field.hint) : null;
  const describedBy = hint ? `${id}-hint` : undefined;
  const set = (next: unknown) => onChange(path, next);

  switch (field.kind) {
    case "formula":
      return (
        <Shell id={id} label={label} hint={hint}>
          <FormulaInput id={id} value={asString(value)} describedBy={describedBy} onChange={set} />
        </Shell>
      );
    case "text":
      return (
        <Shell id={id} label={label} hint={hint}>
          {field.multiline
            ? <textarea id={id} className="bna-textarea" value={asString(value)} aria-describedby={describedBy} onChange={event => set(event.target.value)} />
            : (
              <input
                id={id} className="bna-input" value={asString(value)} aria-describedby={describedBy}
                list={(field.suggest === "counters") && counterNames.length ? `${id}-names` : undefined}
                onChange={event => set(event.target.value)}
              />
            )}
          {((field.suggest === "counters") && counterNames.length)
            ? <datalist id={`${id}-names`}>{counterNames.map(name => <option key={name} value={name} />)}</datalist>
            : null}
        </Shell>
      );
    case "script":
      return (
        <Shell id={id} label={label} hint={hint}>
          <textarea
            id={id} className="bna-textarea bna-textarea--mono" rows={6} spellCheck={false} value={asString(value)}
            aria-describedby={describedBy} onChange={event => set(event.target.value)}
          />
        </Shell>
      );
    case "number":
      return (
        <Shell id={id} label={label} hint={hint}>
          <input
            id={id} className="bna-input" type="number" min={field.min} max={field.max} step={field.step}
            value={asNumber(value) ?? ""} aria-describedby={describedBy}
            onChange={event => set((event.target.value === "") ? null : Number(event.target.value))}
          />
        </Shell>
      );
    case "toggle":
      return (
        <Shell id={id} label={label} hint={hint} inline>
          <button
            id={id} type="button" role="switch" aria-checked={value === true} aria-describedby={describedBy}
            className="bna-switch" onClick={() => set(value !== true)}
          >
            <span />
          </button>
        </Shell>
      );
    case "select":
      return (
        <Shell id={id} label={label} hint={hint}>
          <SelectControl id={id} spec={field.choices} value={asString(value)} describedBy={describedBy} onChange={set} />
        </Shell>
      );
    case "multiselect":
      return (
        <Shell id={id} label={label} hint={hint} group>
          <ChipSelect labelId={`${id}-label`} spec={field.choices} value={asStrings(value)} exclusion={field.exclusion === true} onChange={set} />
        </Shell>
      );
    case "tags":
      return (
        <Shell id={id} label={label} hint={hint}>
          <TagInput id={id} value={asStrings(value)} onChange={set} />
        </Shell>
      );
    case "comparisons":
      return (
        <Shell id={id} label={label} hint={hint} group>
          <Comparisons value={value} onChange={set} />
        </Shell>
      );
    case "embeddedResult":
      return (
        <Shell id={id} label={label} hint={hint}>
          <EmbeddedResult id={id} allowed={field.allowed} value={value} path={path} onChange={onChange} />
        </Shell>
      );
    case "group":
      return (
        <fieldset className="bna-group">
          <legend className="bna-group__legend">{label}</legend>
          {hint ? <p className="bna-field__hint">{hint}</p> : null}
          <FieldList fields={field.fields} data={asRecord(value)} path={path} upstream={upstream} onChange={onChange} />
        </fieldset>
      );
  }
}

function SelectControl({ id, spec, value, describedBy, onChange }: {
  id: string; spec: ChoiceSpec; value: string; describedBy: string | undefined; onChange(value: string): void;
}) {
  const t = useT();
  const options = useChoiceOptions(spec);
  const known = options.some(option => option.value === value);
  return (
    <select id={id} className="bna-select" value={value} aria-describedby={describedBy} onChange={event => onChange(event.target.value)}>
      {known ? null : <option value={value}>{value || t("BNA.UI.Field.none")}</option>}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

type ChipState = "off" | "included" | "excluded";

function ChipSelect({ labelId, spec, value, exclusion, onChange }: {
  labelId: string; spec: ChoiceSpec; value: readonly string[]; exclusion: boolean; onChange(value: string[]): void;
}) {
  const t = useT();
  const options = useChoiceOptions(spec);
  const [filter, setFilter] = useState("");
  const stateOf = (option: string): ChipState => {
    if (value.includes(option)) return "included";
    return value.includes(`!${option}`) ? "excluded" : "off";
  };
  const cycle = (option: string) => {
    const state = stateOf(option);
    const rest = value.filter(entry => (entry !== option) && (entry !== `!${option}`));
    if (state === "off") onChange([...rest, option]);
    else if ((state === "included") && exclusion) onChange([...rest, `!${option}`]);
    else onChange(rest);
  };
  const needle = filter.trim().toLocaleLowerCase();
  const visible = needle ? options.filter(option => option.label.toLocaleLowerCase().includes(needle)) : options;

  return (
    <>
      {(options.length > FILTER_THRESHOLD) ? (
        <input className="bna-input" aria-label={t("BNA.UI.Field.filter")} placeholder={t("BNA.UI.Field.filter")} value={filter} onChange={event => setFilter(event.target.value)} />
      ) : null}
      <div className="bna-chips" role="group" aria-labelledby={labelId}>
        {visible.map(option => {
          const state = stateOf(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className="bna-chip"
              data-state={state}
              aria-pressed={(state === "off") ? false : ((state === "included") ? true : "mixed")}
              title={(state === "excluded") ? t("BNA.UI.Field.exclude") : ((state === "included") ? t("BNA.UI.Field.include") : undefined)}
              onClick={() => cycle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function TagInput({ id, value, onChange }: { id: string; value: readonly string[]; onChange(value: string[]): void }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const commit = () => {
    const slug = slugify(draft);
    if (slug && !value.includes(slug)) onChange([...value, slug]);
    setDraft("");
  };
  return (
    <div className="bna-tags">
      {value.map(tag => (
        <span key={tag} className="bna-tag">
          {tag}
          <button type="button" aria-label={t("BNA.UI.Field.removeTag", { value: tag })} onClick={() => onChange(value.filter(entry => entry !== tag))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        className="bna-input bna-input--mono"
        value={draft}
        placeholder={t("BNA.UI.Field.tagPlaceholder")}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => { if (draft.trim()) commit(); }}
        onKeyDown={event => {
          if ((event.key === "Enter") || (event.key === ",")) {
            event.preventDefault();
            commit();
          }
        }}
      />
    </div>
  );
}

function Comparisons({ value, onChange }: { value: unknown; onChange(value: unknown[]): void }) {
  const t = useT();
  const rows = Array.isArray(value) ? value.map(asRecord) : [];
  const update = (index: number, key: string, next: string) => {
    onChange(rows.map((row, i) => (i === index) ? { ...row, [key]: next } : row));
  };
  return (
    <div className="bna-fields">
      {rows.map((row, index) => (
        <div key={index} className="bna-comparison">
          <input className="bna-input bna-input--mono" aria-label={t("BNA.UI.Field.one")} value={asString(row.one)} onChange={event => update(index, "one", event.target.value)} />
          <select className="bna-select" aria-label={t("BNA.UI.Field.operator")} value={asString(row.operator, "EQ")} onChange={event => update(index, "operator", event.target.value)}>
            {STATIC.comparisonOperator.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
          </select>
          <input className="bna-input bna-input--mono" aria-label={t("BNA.UI.Field.other")} value={asString(row.other)} onChange={event => update(index, "other", event.target.value)} />
          <button type="button" className="bna-iconbtn" aria-label={t("BNA.UI.Field.removeComparison")} onClick={() => onChange(rows.filter((_, i) => i !== index))}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <button type="button" className="bna-button" onClick={() => onChange([...rows, { one: "", operator: "EQ", other: "" }])}>
        <Icon name="plus" />
        {t("BNA.UI.Field.addComparison")}
      </button>
    </div>
  );
}

function EmbeddedResult({ id, allowed, value, path, onChange }: {
  id: string; allowed: readonly string[]; value: unknown; path: FieldPath; onChange(path: FieldPath, value: unknown): void;
}) {
  const t = useT();
  const current = asRecord(value);
  const type = asString(current.type);
  const definition = getResult(type);
  return (
    <>
      <select
        id={id}
        className="bna-select"
        value={type}
        onChange={event => {
          const next = getResult(event.target.value);
          onChange(path, next ? { type: next.type, data: defaultsFor(next.fields) } : null);
        }}
      >
        <option value="">{t("BNA.UI.Field.embeddedNone")}</option>
        {allowed.map(option => <option key={option} value={option}>{t(`BNA.Result.${option}.Label`)}</option>)}
      </select>
      {definition ? (
        <FieldList fields={definition.fields} data={asRecord(current.data)} path={[...path, "data"]} upstream={[]} onChange={onChange} />
      ) : null}
    </>
  );
}
