import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { useT } from "../services";

export type CoachAnchor = "canvas" | "inspector" | "stamp" | "test";

const STEPS: Record<CoachAnchor, { title: string; body: string }> = {
  canvas: { title: "BNA.UI.Coach.canvasTitle", body: "BNA.UI.Coach.canvasBody" },
  inspector: { title: "BNA.UI.Coach.inspectorTitle", body: "BNA.UI.Coach.inspectorBody" },
  stamp: { title: "BNA.UI.Coach.stampTitle", body: "BNA.UI.Coach.stampBody" },
  test: { title: "BNA.UI.Coach.testTitle", body: "BNA.UI.Coach.testBody" }
};

const CARD_WIDTH = 300;
const MARGIN = 12;

type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

interface Layout {
  ring: Box;
  card: CSSProperties;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Where the ring and the card go for an anchor, in the editor's own coordinates. */
function place(root: HTMLElement, anchor: HTMLElement): Layout {
  const outer = root.getBoundingClientRect();
  const inner = anchor.getBoundingClientRect();
  const ring = { left: inner.left - outer.left, top: inner.top - outer.top, width: inner.width, height: inner.height };
  const maxLeft = Math.max(MARGIN, outer.width - CARD_WIDTH - MARGIN);
  if (ring.height > outer.height / 2) {
    return { ring, card: { left: clamp(ring.left + ((ring.width - CARD_WIDTH) / 2), MARGIN, maxLeft), top: ring.top + 72 } };
  }
  if ((ring.top + ring.height + 200) < outer.height) {
    return { ring, card: { left: clamp(ring.left, MARGIN, maxLeft), top: ring.top + ring.height + MARGIN } };
  }
  return { ring, card: { left: clamp(ring.left + ring.width - CARD_WIDTH, MARGIN, maxLeft), bottom: outer.height - ring.top + MARGIN } };
}

export interface CoachMarksProps {
  /** The editor's root element; anchors are looked up inside it. */
  root: RefObject<HTMLElement | null>;
  /** The parts to introduce, in order. */
  anchors: readonly CoachAnchor[];
  onDone(): void;
}

export function CoachMarks({ root, anchors, onDone }: CoachMarksProps) {
  const t = useT();
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const anchor = anchors[Math.min(index, anchors.length - 1)] ?? "canvas";
  const step = STEPS[anchor];
  const last = index >= anchors.length - 1;

  // The root's ref is attached after this child's layout effect runs, so the lookup waits for the next frame.
  useLayoutEffect(() => {
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const element = root.current;
      const target = element?.querySelector<HTMLElement>(`[data-coach="${anchor}"]`);
      setLayout((element && target) ? place(element, target) : null);
    };
    const frame = window.requestAnimationFrame(() => {
      measure();
      if (!root.current) return;
      observer = new ResizeObserver(measure);
      observer.observe(root.current);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [root, anchor]);

  useEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, [index]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onDone();
  };

  // Motion owns the card's transform (its entrance), so placement uses offsets only.
  const card: CSSProperties = layout?.card ?? { left: `calc(50% - ${CARD_WIDTH / 2}px)`, top: "30%" };

  return (
    <div className="bna-coach">
      {layout ? (
        <motion.div
          className="bna-coach__ring"
          aria-hidden="true"
          initial={false}
          animate={layout.ring}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
        />
      ) : null}
      <AnimatePresence mode="wait">
        <motion.section
          key={anchor}
          className="bna-coach__card"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          style={{ ...card, width: CARD_WIDTH }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onKeyDown={onKeyDown}
        >
          <span className="bna-coach__balloon" aria-hidden="true">{index + 1}</span>
          <h2 id={titleId}>{t(step.title)}</h2>
          <p>{t(step.body)}</p>
          <div className="bna-coach__actions">
            <button type="button" className="bna-coach__skip" onClick={onDone}>{t("BNA.UI.Coach.skip")}</button>
            <span className="bna-coach__count">{t("BNA.UI.Coach.count", { step: index + 1, total: anchors.length })}</span>
            <button ref={next} type="button" className="bna-button" onClick={() => (last ? onDone() : setIndex(index + 1))}>
              {last ? t("BNA.UI.Coach.done") : t("BNA.UI.Coach.next")}
            </button>
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
