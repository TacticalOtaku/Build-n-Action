import { useState, type DragEvent, type FocusEvent, type KeyboardEvent } from "react";
import type { BlueprintSource } from "../../core/blueprint/types";
import { describeBlueprint } from "../../core/phrase/describe";
import { Icon } from "../icons";
import { useServices, useT } from "../services";
import { matchesSearch } from "../text-search";
import { parseDragText } from "../transfer";

export interface BlueprintListProps {
  blueprints: readonly BlueprintSource[];
  activeId: string | null;
  onSelect(id: string): void;
  onCreate(): void;
  onDuplicate(id: string): void;
  onToggle(id: string): void;
  onDelete(id: string): void;
  /** Opens the template picker; `library` only when the host has a library. */
  onOpenPicker(tab: "presets" | "library"): void;
  hasLibrary: boolean;
  /** Present when this user may save to the library. */
  onSaveToLibrary?: (id: string) => void;
  onDragRow(id: string, event: DragEvent<HTMLElement>): void;
  onDropData(data: unknown): void;
  /** Present when the host can move a blueprint onto a new effect. */
  onMoveToEffect?: (id: string) => void;
}

interface RowMenuItem {
  key: string;
  icon: string;
  text: string;
  /** Full name with the blueprint's name, for screen readers and live checks. */
  label: string;
  run(): void;
}

/** A row's extra actions. Arrow keys move, Escape closes and returns focus to the "More" button. */
function RowMenu({ label, items, onClose }: { label: string; items: readonly RowMenuItem[]; onClose(): void }) {
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.parentElement?.querySelector<HTMLElement>("[aria-haspopup='menu']")?.focus();
      onClose();
      return;
    }
    if ((event.key !== "ArrowDown") && (event.key !== "ArrowUp")) return;
    event.preventDefault();
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const step = (event.key === "ArrowDown") ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };
  const blur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    // The "More" button toggles the menu itself; any other focus outside closes it.
    if (next && (event.currentTarget.contains(next) || next.getAttribute("aria-haspopup") === "menu")) return;
    onClose();
  };
  return (
    <div role="menu" aria-label={label} className="bna-rail__menu" onKeyDown={keys} onBlur={blur}>
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          aria-label={item.label}
          autoFocus={index === 0}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          <Icon name={item.icon} size={14} />
          <span>{item.text}</span>
        </button>
      ))}
    </div>
  );
}

export function BlueprintList({
  blueprints, activeId, onSelect, onCreate, onDuplicate, onToggle, onDelete, onOpenPicker, hasLibrary, onSaveToLibrary, onDragRow, onDropData, onMoveToEffect
}: BlueprintListProps) {
  const t = useT();
  const { fmt } = useServices();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [over, setOver] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rows = blueprints.map(blueprint => {
    const name = blueprint.name || t("BNA.UI.Rail.untitled");
    const sentence = describeBlueprint(blueprint, fmt)[0];
    if ((confirming !== blueprint.id) && !matchesSearch(query, name, sentence ?? "")) return null;
    return { blueprint, name, sentence };
  });
  const shown = rows.filter(Boolean).length;
  return (
    <nav
      className="bna-rail"
      aria-label={t("BNA.UI.Rail.label")}
      data-drop={over ? "" : undefined}
      onDragOver={event => {
        if (!event.dataTransfer.types.includes("text/plain")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={event => {
        event.preventDefault();
        setOver(false);
        const data = parseDragText(event.dataTransfer.getData("text/plain"));
        if (data) onDropData(data);
      }}
    >
      <div className="bna-rail__head">
        <h2 className="bna-rail__title">{t("BNA.UI.Rail.title")}</h2>
        <button type="button" className="bna-iconbtn" aria-label={t("BNA.UI.Rail.create")} title={t("BNA.UI.Rail.create")} onClick={onCreate}>
          <Icon name="plus" size={17} />
        </button>
        <button type="button" className="bna-iconbtn" aria-label={t("BNA.UI.Rail.templates")} title={t("BNA.UI.Rail.templates")} onClick={() => onOpenPicker("presets")}>
          <Icon name="layers" size={17} />
        </button>
        {hasLibrary ? (
          <button type="button" className="bna-iconbtn" aria-label={t("BNA.UI.Rail.library")} title={t("BNA.UI.Rail.library")} onClick={() => onOpenPicker("library")}>
            <Icon name="book-marked" size={17} />
          </button>
        ) : null}
      </div>
      <div className="bna-rail__search">
        <Icon name="search" size={14} />
        <input
          type="search"
          aria-label={t("BNA.UI.Rail.search")}
          placeholder={t("BNA.UI.Rail.searchPlaceholder")}
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </div>
      <ul className="bna-rail__list">
        {rows.map(row => {
          if (!row) return null;
          const { blueprint, name, sentence } = row;
          if (confirming === blueprint.id) {
            return (
              <li key={blueprint.id} className="bna-rail__confirm">
                <p>{t("BNA.UI.Rail.confirmDelete", { name })}</p>
                <div>
                  <button
                    type="button"
                    className="bna-button bna-button--danger"
                    onClick={() => {
                      setConfirming(null);
                      onDelete(blueprint.id);
                    }}
                  >
                    {t("BNA.UI.Rail.delete")}
                  </button>
                  {/* Focus lands on the safe answer, so a keyboard user can back out with Enter. */}
                  <button type="button" className="bna-button" autoFocus onClick={() => setConfirming(null)}>
                    {t("BNA.UI.Rail.keep")}
                  </button>
                </div>
              </li>
            );
          }
          const toggleLabel = t(blueprint.enabled ? "BNA.UI.Rail.turnOff" : "BNA.UI.Rail.turnOn", { name });
          return (
            <li key={blueprint.id} className="bna-rail__row">
              <button
                type="button"
                className="bna-rail__item"
                aria-current={(blueprint.id === activeId) ? "true" : undefined}
                draggable
                onDragStart={event => onDragRow(blueprint.id, event)}
                onClick={() => onSelect(blueprint.id)}
              >
                <span className="bna-rail__name">{name}</span>
                <span className="bna-rail__phrase">{sentence ?? t("BNA.UI.Rail.noChain")}</span>
                {blueprint.enabled ? null : <span className="bna-rail__off">{t("BNA.UI.Rail.disabled")}</span>}
              </button>
              <div className="bna-rail__actions">
                <button
                  type="button"
                  className="bna-iconbtn"
                  aria-pressed={blueprint.enabled}
                  aria-label={toggleLabel}
                  title={toggleLabel}
                  onClick={() => onToggle(blueprint.id)}
                >
                  <Icon name="power" size={14} />
                </button>
                <button
                  type="button"
                  className="bna-iconbtn"
                  aria-haspopup="menu"
                  aria-expanded={menuFor === blueprint.id}
                  aria-label={(savedId === blueprint.id) ? t("BNA.UI.Rail.savedToLibrary") : t("BNA.UI.Rail.more", { name })}
                  title={(savedId === blueprint.id) ? t("BNA.UI.Rail.savedToLibrary") : t("BNA.UI.Rail.more", { name })}
                  onClick={() => setMenuFor(current => ((current === blueprint.id) ? null : blueprint.id))}
                >
                  <Icon name={(savedId === blueprint.id) ? "check" : "ellipsis"} size={14} />
                </button>
                <button
                  type="button"
                  className="bna-iconbtn"
                  aria-label={t("BNA.UI.Rail.remove", { name })}
                  title={t("BNA.UI.Rail.remove", { name })}
                  onClick={() => setConfirming(blueprint.id)}
                >
                  <Icon name="trash-2" size={14} />
                </button>
              </div>
              {(menuFor === blueprint.id) ? (
                <RowMenu
                  label={t("BNA.UI.Rail.more", { name })}
                  onClose={() => setMenuFor(null)}
                  items={[
                    { key: "duplicate", icon: "copy", text: t("BNA.UI.Rail.menuDuplicate"), label: t("BNA.UI.Rail.duplicate", { name }), run: () => onDuplicate(blueprint.id) },
                    ...(onSaveToLibrary ? [{
                      key: "save", icon: "book-marked", text: t("BNA.UI.Rail.menuSave"), label: t("BNA.UI.Rail.saveToLibrary", { name }),
                      run: () => {
                        onSaveToLibrary(blueprint.id);
                        setSavedId(blueprint.id);
                        window.setTimeout(() => setSavedId(current => ((current === blueprint.id) ? null : current)), 2000);
                      }
                    }] : []),
                    ...(onMoveToEffect ? [{
                      key: "move", icon: "sparkles", text: t("BNA.UI.Rail.menuMove"), label: t("BNA.UI.Rail.moveToEffect", { name }),
                      run: () => onMoveToEffect(blueprint.id)
                    }] : [])
                  ]}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {(query && !shown) ? <p className="bna-rail__empty">{t("BNA.UI.Rail.searchEmpty")}</p> : null}
    </nav>
  );
}
