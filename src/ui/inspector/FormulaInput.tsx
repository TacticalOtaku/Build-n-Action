import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useHost, useT } from "../services";
import { insertPath, matchPaths, tokenAt } from "./formula-tokens";

export interface FormulaInputProps {
  id: string;
  value: string;
  describedBy?: string;
  onChange(value: string): void;
}

/** A formula field: suggests @ roll-data paths while typing and previews the value on the test actor. */
export function FormulaInput({ id, value, describedBy, onChange }: FormulaInputProps) {
  const t = useT();
  const { formula } = useHost();
  const listId = useId();
  const previewId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const token = (formula && (caret !== null)) ? tokenAt(value, caret) : null;
  const suggestions = (formula && token) ? matchPaths(formula.paths(), token.query) : [];
  const open = !dismissed && (suggestions.length > 0);
  const preview = useMemo(() => ((formula && value.trim()) ? formula.preview(value) : null), [formula, value]);

  const accept = (path: string) => {
    if (!token) return;
    const next = insertPath(value, token, path);
    onChange(next.text);
    setCaret(next.caret);
    setDismissed(true);
    window.requestAnimationFrame(() => input.current?.setSelectionRange(next.caret, next.caret));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(index => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(index => (index - 1 + suggestions.length) % suggestions.length);
    } else if ((event.key === "Enter") || (event.key === "Tab")) {
      const path = suggestions[Math.min(active, suggestions.length - 1)];
      if (path) {
        event.preventDefault();
        accept(path);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
    }
  };

  const describedByIds = [describedBy, formula ? previewId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div className="bna-formula">
      <input
        ref={input}
        id={id}
        className="bna-input bna-input--mono"
        value={value}
        spellCheck={false}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${Math.min(active, suggestions.length - 1)}` : undefined}
        aria-describedby={describedByIds}
        onChange={event => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart);
          setActive(0);
          setDismissed(false);
        }}
        onSelect={event => setCaret(event.currentTarget.selectionStart)}
        onBlur={() => setDismissed(true)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul className="bna-formula__list" id={listId} role="listbox" aria-label={t("BNA.UI.Formula.suggestions")}>
          {suggestions.map((path, index) => (
            <li
              key={path}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onPointerDown={event => {
                event.preventDefault();
                accept(path);
              }}
            >
              {path}
            </li>
          ))}
        </ul>
      ) : null}
      {formula ? (
        <p className="bna-formula__preview" id={previewId} aria-live="polite">
          {!value.trim() ? null : (preview === null) ? t("BNA.UI.Formula.invalid") : t("BNA.UI.Formula.preview", { value: preview })}
        </p>
      ) : null}
    </div>
  );
}
