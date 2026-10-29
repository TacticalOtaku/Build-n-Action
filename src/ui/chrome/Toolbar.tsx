import type { ButtonHTMLAttributes } from "react";
import type { FxLevel } from "../fx/level";
import { Icon } from "../icons";
import { useT } from "../services";
import type { ThemeName } from "../theme/theme";

const FX_LABELS: Record<FxLevel, string> = {
  full: "BNA.UI.Toolbar.fxFull",
  reduced: "BNA.UI.Toolbar.fxReduced",
  off: "BNA.UI.Toolbar.fxOff"
};

export interface ToolbarProps {
  onAdd(): void;
  onLayout(): void;
  onFit(): void;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
  testing: boolean;
  /** Present only when the host can produce a test run. */
  onToggleTest?: () => void;
  theme: ThemeName;
  onToggleTheme(): void;
  fxLevel: FxLevel;
  onCycleFx(): void;
  /** Replays the first-run guide. */
  onTour?: () => void;
}

function Tool({ label, icon, ...rest }: { label: string; icon: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="bna-iconbtn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={17} />
    </button>
  );
}

export function Toolbar(props: ToolbarProps) {
  const t = useT();
  const themeLabel = (props.theme === "dark") ? t("BNA.UI.Toolbar.themeLight") : t("BNA.UI.Toolbar.themeDark");
  return (
    <div className="bna-toolbar" role="toolbar" aria-label={t("BNA.UI.Toolbar.label")}>
      <Tool label={t("BNA.UI.Toolbar.add")} icon="plus" onClick={props.onAdd} />
      <Tool label={t("BNA.UI.Toolbar.layout")} icon="workflow" onClick={props.onLayout} />
      <Tool label={t("BNA.UI.Toolbar.fit")} icon="scan" onClick={props.onFit} />
      <span className="bna-toolbar__sep" aria-hidden="true" />
      <Tool label={t("BNA.UI.Toolbar.undo")} icon="undo-2" onClick={props.onUndo} disabled={!props.canUndo} />
      <Tool label={t("BNA.UI.Toolbar.redo")} icon="redo-2" onClick={props.onRedo} disabled={!props.canRedo} />
      {props.onToggleTest ? (
        <>
          <span className="bna-toolbar__sep" aria-hidden="true" />
          <Tool
            label={props.testing ? t("BNA.UI.Toolbar.testStop") : t("BNA.UI.Toolbar.test")}
            data-coach="test"
            icon="play"
            aria-pressed={props.testing}
            onClick={props.onToggleTest}
          />
        </>
      ) : null}
      <span className="bna-toolbar__sep" aria-hidden="true" />
      <Tool label={themeLabel} icon={(props.theme === "dark") ? "sun" : "moon"} onClick={props.onToggleTheme} />
      <Tool label={t(FX_LABELS[props.fxLevel])} icon="wand-sparkles" aria-pressed={props.fxLevel !== "off"} onClick={props.onCycleFx} />
      {props.onTour ? <Tool label={t("BNA.UI.Toolbar.tour")} icon="circle-help" onClick={props.onTour} /> : null}
    </div>
  );
}
