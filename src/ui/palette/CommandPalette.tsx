import { motion } from "motion/react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { BlueprintSource } from "../../core/blueprint/types";
import { resultEvents } from "../../core/graph/upstream";
import type { PaletteRequest } from "../canvas/BlueprintCanvas";
import { Icon } from "../icons";
import { useT } from "../services";
import { PALETTE_ITEMS, filterPaletteItems, type PaletteContext, type PaletteItem } from "./palette-items";

const WIDTH = 360;
const MAX_HEIGHT = 440;
const MARGIN = 12;

export interface CommandPaletteProps {
  request: PaletteRequest;
  blueprint: BlueprintSource;
  onPick(item: PaletteItem): void;
  onClose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function CommandPalette({ request, blueprint, onPick, onClose }: CommandPaletteProps) {
  const t = useT();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const context = useMemo<PaletteContext>(() => {
    const sourceId = request.from?.source;
    const source = sourceId ? blueprint.nodes.find(node => node.id === sourceId) : undefined;
    return source ? { from: source.kind, upstream: resultEvents(blueprint, source.id, request.from?.sourcePin) } : { from: null, upstream: [] };
  }, [blueprint, request.from]);

  const items = useMemo(() => filterPaletteItems(PALETTE_ITEMS, query, context, t), [context, query, t]);
  const current = Math.min(active, Math.max(0, items.length - 1));
  const grouped = !query.trim();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = Math.max(1, items.length);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current - 1 + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[current];
      if (item) onPick(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const optionId = (item: PaletteItem) => `${listId}-${item.key}`;
  const activeItem = items[current];

  return (
    <motion.div
      ref={rootRef}
      className="bna-palette"
      role="dialog"
      aria-label={t("BNA.UI.Palette.label")}
      style={{
        left: clamp(request.screen.x, MARGIN, request.bounds.width - WIDTH - MARGIN),
        top: clamp(request.screen.y, MARGIN, request.bounds.height - MAX_HEIGHT - MARGIN)
      }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.14, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="bna-palette__search">
        <Icon name="search" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
          aria-label={t("BNA.UI.Palette.search")}
          placeholder={t("BNA.UI.Palette.placeholder")}
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {request.from ? <p className="bna-palette__hint">{t("BNA.UI.Palette.fromHint")}</p> : null}
      <ul id={listId} className="bna-palette__list" role="listbox" aria-label={t("BNA.UI.Palette.label")}>
        {items.map((item, index) => {
          const heading = grouped && ((index === 0) || (items[index - 1]?.groupKey !== item.groupKey));
          return (
            <Fragment key={item.key}>
              {heading ? <li role="presentation" className="bna-palette__group">{t(item.groupKey)}</li> : null}
              <li
                id={optionId(item)}
                role="option"
                aria-selected={index === current}
                data-kind={item.kind}
                className="bna-palette__item"
                onPointerEnter={() => setActive(index)}
                onClick={() => onPick(item)}
              >
                <span className="bna-palette__icon"><Icon name={item.icon} /></span>
                <span>
                  <span className="bna-palette__label">{t(item.labelKey)}</span>
                  <span className="bna-palette__summary">{t(item.summaryKey)}</span>
                </span>
              </li>
            </Fragment>
          );
        })}
      </ul>
      {items.length ? null : <p className="bna-palette__empty">{t("BNA.UI.Palette.empty", { query: query.trim() })}</p>}
    </motion.div>
  );
}
