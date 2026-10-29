import "../src/ui/theme/base.css";
import "../src/ui/theme/fonts";
import "../src/ui/theme/tokens.css";
import "../src/ui/theme/editor.css";
import "./playground.css";
import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBlueprint } from "../src/core/blueprint/factory";
import type { BlueprintSource } from "../src/core/blueprint/types";
import { createTranslator } from "../src/core/i18n";
import en from "../src/lang/en.json";
import ru from "../src/lang/ru.json";
import { Editor } from "../src/ui/Editor";
import { FX_LEVELS, nextFxLevel, type FxLevel } from "../src/ui/fx/level";
import { ServicesProvider, createEditorServices } from "../src/ui/services";
import type { ThemeName } from "../src/ui/theme/theme";
import { createPlaygroundHost } from "./host";
import { createMockChoices } from "./mock-choices";
import { createSampleBlueprints } from "./mock-blueprints";

type Language = "en" | "ru";

function readPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? value as T : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); preferences then last for the session only.
  }
}

/** The blueprints on screen, for the host's linter (signals between blueprints); kept outside React state. */
const shown: { blueprints: readonly BlueprintSource[] } = { blueprints: [] };

function App() {
  const [language, setLanguage] = useState<Language>(() => readPreference("bna.lang", ["en", "ru"] as const, "ru"));
  const [theme, setTheme] = useState<ThemeName>(() => readPreference(
    "bna.theme", ["dark", "light"] as const, window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
  ));
  const [fxLevel, setFxLevel] = useState<FxLevel>(() => readPreference("bna.fx", FX_LEVELS, "full"));
  const [blueprints, setBlueprints] = useState<BlueprintSource[]>(() => createSampleBlueprints(language));

  useEffect(() => {
    shown.blueprints = blueprints;
  }, [blueprints]);
  const services = useMemo(
    () => createEditorServices(
      createTranslator((language === "ru") ? ru : en),
      createMockChoices(language),
      createPlaygroundHost(language, () => shown.blueprints)
    ),
    [language]
  );

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.documentElement.lang = language;
  }, [theme, language]);

  const onSave = useCallback((blueprint: BlueprintSource) => {
    setBlueprints(list => list.map(entry => (entry.id === blueprint.id) ? blueprint : entry));
  }, []);

  const onCreate = useCallback((source?: BlueprintSource) => {
    const blueprint = source ?? createBlueprint();
    setBlueprints(list => [...list, blueprint]);
    return blueprint;
  }, []);

  const onDelete = useCallback((id: string) => {
    setBlueprints(list => list.filter(entry => entry.id !== id));
  }, []);

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    writePreference("bna.lang", next);
  };

  return (
    <div className="playground">
      <header className="playground__bar">
        <strong>Build-n-Action</strong>
        <span>{(language === "ru") ? "Песочница редактора. ПКМ по холсту или Пробел добавляют узел." : "Editor playground. Right-click the canvas or press Space to add a node."}</span>
        <div className="playground__langs">
          {(["ru", "en"] as const).map(option => (
            <button key={option} type="button" aria-pressed={language === option} onClick={() => chooseLanguage(option)}>
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <ServicesProvider services={services}>
        <Editor
          key={language}
          document={{ label: (language === "ru") ? "Длинный меч «Ария»" : "Longsword “Aria”", blueprints, itemCarrier: true }}
          theme={theme}
          onToggleTheme={() => {
            const next = (theme === "dark") ? "light" : "dark";
            setTheme(next);
            writePreference("bna.theme", next);
          }}
          fxLevel={fxLevel}
          onCycleFx={() => {
            const next = nextFxLevel(fxLevel);
            setFxLevel(next);
            writePreference("bna.fx", next);
          }}
          onSave={onSave}
          onCreate={onCreate}
          onDelete={onDelete}
        />
      </ServicesProvider>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
