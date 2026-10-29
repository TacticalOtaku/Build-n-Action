import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { duplicateBlueprint } from "../../core/blueprint/factory";
import type { BlueprintSource } from "../../core/blueprint/types";
import { describeBlueprint } from "../../core/phrase/describe";
import { PRESETS, instantiatePreset } from "../../core/presets/presets";
import { Icon } from "../icons";
import { useLibrary } from "../library/useLibrary";
import { useHost, useServices, useT } from "../services";
import { matchesSearch } from "../text-search";

export type PickerTab = "presets" | "library";

export interface TemplatePickerProps {
  initialTab: PickerTab;
  /** A new blueprint (fresh id) to add to the document. */
  onPick(blueprint: BlueprintSource): void;
  onClose(): void;
}

interface Row {
  key: string;
  icon: string;
  name: string;
  description: string;
  sentence: string;
  make(): BlueprintSource;
  entry: BlueprintSource | null;
}

export function TemplatePicker({ initialTab, onPick, onClose }: TemplatePickerProps) {
  const t = useT();
  const { fmt } = useServices();
  const { library } = useHost();
  const entries = useLibrary();
  const [tab, setTab] = useState<PickerTab>(library ? initialTab : "presets");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const canEdit = !!library?.canEdit();

  useEffect(() => {
    search.current?.focus();
  }, [tab]);

  const rows = useMemo<Row[]>(() => {
    if (tab === "presets") {
      return PRESETS.map(preset => {
        const built = preset.build(t);
        return {
          key: preset.id, icon: preset.icon, name: built.name, description: built.description,
          sentence: describeBlueprint(built, fmt)[0] ?? "", make: () => instantiatePreset(preset, t), entry: null
        };
      });
    }
    return entries.map(entry => ({
      key: entry.id, icon: "book-marked", name: entry.name || t("BNA.UI.Rail.untitled"), description: entry.description,
      sentence: describeBlueprint(entry, fmt)[0] ?? "", make: () => duplicateBlueprint(entry, entry.name), entry
    }));
  }, [tab, entries, t, fmt]);

  const shown = rows.filter(row => matchesSearch(query, row.name, row.description, row.sentence));

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !library) return;
    const result = await library.import(await file.text());
    setStatus(result.error
      ? t("BNA.UI.Picker.importFailed")
      : t("BNA.UI.Picker.imported", { count: result.blueprints.length, rejected: result.rejected }));
  };

  const tabs: { id: PickerTab; label: string }[] = [
    { id: "presets", label: t("BNA.UI.Picker.presets") },
    ...(library ? [{ id: "library" as const, label: t("BNA.UI.Picker.library") }] : [])
  ];

  return (
    <div className="bna-picker-scrim" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section
        className="bna-picker"
        role="dialog"
        aria-label={t("BNA.UI.Picker.label")}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 36 }}
      >
        <header className="bna-picker__head">
          <div className="bna-drawer__tabs" role="tablist">
            {tabs.map(entry => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === tab}
                className="bna-drawer__tab"
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button type="button" className="bna-iconbtn" aria-label={t("BNA.UI.Picker.close")} title={t("BNA.UI.Picker.close")} onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className="bna-palette__search">
          <Icon name="search" size={15} />
          <input
            ref={search}
            type="search"
            aria-label={t("BNA.UI.Picker.search")}
            placeholder={t("BNA.UI.Picker.searchPlaceholder")}
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </div>
        {shown.length ? (
          <ul className="bna-picker__list">
            {shown.map(row => {
              const entry = row.entry;
              return (
              <li key={row.key} className="bna-picker__row">
                <button type="button" className="bna-picker__pick" onClick={() => onPick(row.make())}>
                  <Icon name={row.icon} size={16} />
                  <span className="bna-picker__name">{row.name}</span>
                  {row.description ? <span className="bna-picker__description">{row.description}</span> : null}
                  {row.sentence ? <span className="bna-picker__sentence">{row.sentence}</span> : null}
                </button>
                {(entry && canEdit) ? (
                  <div className="bna-picker__actions">
                    <button
                      type="button"
                      className="bna-iconbtn"
                      aria-label={t("BNA.UI.Picker.exportOne", { name: row.name })}
                      title={t("BNA.UI.Picker.exportOne", { name: row.name })}
                      onClick={() => library?.download([entry])}
                    >
                      <Icon name="download" size={14} />
                    </button>
                    {(confirming === row.key) ? (
                      <button type="button" className="bna-button bna-button--danger" onClick={() => {
                        setConfirming(null);
                        void library?.remove(row.key);
                      }}>
                        {t("BNA.UI.Picker.confirmRemove")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="bna-iconbtn"
                        aria-label={t("BNA.UI.Picker.remove", { name: row.name })}
                        title={t("BNA.UI.Picker.remove", { name: row.name })}
                        onClick={() => setConfirming(row.key)}
                      >
                        <Icon name="trash-2" size={14} />
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
              );
            })}
          </ul>
        ) : (
          <p className="bna-drawer__empty bna-picker__empty">
            {(tab === "library" && !entries.length) ? t("BNA.UI.Picker.emptyLibrary") : t("BNA.UI.Picker.empty", { query })}
          </p>
        )}
        {((tab === "library") && canEdit) ? (
          <footer className="bna-picker__foot">
            <label className="bna-button">
              <Icon name="upload" size={14} />
              {t("BNA.UI.Picker.import")}
              <input type="file" accept="application/json,.json" className="bna-visually-hidden" onChange={event => void onImport(event)} />
            </label>
            <button type="button" className="bna-button" disabled={!entries.length} onClick={() => library?.download(entries)}>
              <Icon name="download" size={14} />
              {t("BNA.UI.Picker.exportAll")}
            </button>
            <span className="bna-picker__status" aria-live="polite">{status}</span>
          </footer>
        ) : null}
      </motion.section>
    </div>
  );
}
