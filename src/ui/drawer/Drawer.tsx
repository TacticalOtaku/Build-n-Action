import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Icon } from "../icons";
import { useT } from "../services";

export type DrawerTab = "test" | "issues";

/** Height of the open drawer; the canvas row above shrinks by as much. */
export const DRAWER_HEIGHT = 280;

export interface DrawerProps {
  tab: DrawerTab;
  onTab(tab: DrawerTab): void;
  onClose(): void;
  issueCount: number;
  /** The Test tab's content; omitted when the host has no simulator. */
  test?: ReactNode;
  issues: ReactNode;
}

export function Drawer({ tab, onTab, onClose, issueCount, test, issues }: DrawerProps) {
  const t = useT();
  const shown: DrawerTab = (tab === "test" && !test) ? "issues" : tab;
  const tabs: { id: DrawerTab; label: string }[] = [
    ...(test ? [{ id: "test" as const, label: t("BNA.UI.Drawer.test") }] : []),
    { id: "issues", label: issueCount ? t("BNA.UI.Drawer.issuesCount", { count: issueCount }) : t("BNA.UI.Drawer.issues") }
  ];
  return (
    <motion.section
      className="bna-drawer"
      aria-label={t("BNA.UI.Drawer.label")}
      initial={{ height: 0 }}
      animate={{ height: DRAWER_HEIGHT }}
      exit={{ height: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
    >
      <div className="bna-drawer__bar">
        <div className="bna-drawer__tabs" role="tablist">
          {tabs.map(entry => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`bna-drawer-tab-${entry.id}`}
              aria-selected={entry.id === shown}
              aria-controls="bna-drawer-panel"
              className="bna-drawer__tab"
              onClick={() => onTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button type="button" className="bna-iconbtn" aria-label={t("BNA.UI.Drawer.close")} title={t("BNA.UI.Drawer.close")} onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="bna-drawer__body" role="tabpanel" id="bna-drawer-panel" aria-labelledby={`bna-drawer-tab-${shown}`}>
        {(shown === "test") ? test : issues}
      </div>
    </motion.section>
  );
}
