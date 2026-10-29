import { render, type RenderOptions } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { ReactElement, ReactNode } from "react";
import { createTranslator } from "../../core/i18n";
import type { ChoiceProvider } from "../../core/phrase/formatter";
import type { Choice, DynamicChoiceSource } from "../../core/registry/fields";
import en from "../../lang/en.json";
import ru from "../../lang/ru.json";
import type { EditorHost } from "../host";
import { ServicesProvider, createEditorServices, type EditorServices } from "../services";

const CHOICES: Partial<Record<DynamicChoiceSource, Choice[]>> = {
  creatureTypes: [{ value: "undead", label: "Undead" }, { value: "fiend", label: "Fiend" }],
  statusEffects: [{ value: "prone", label: "Prone" }, { value: "poisoned", label: "Poisoned" }],
  damageAndHealingTypes: [{ value: "fire", label: "Fire" }, { value: "slashing", label: "Slashing" }],
  currencies: [{ value: "gp", label: "Gold" }],
  abilities: [{ value: "str", label: "Strength" }, { value: "dex", label: "Dexterity" }],
  skills: [{ value: "ste", label: "Stealth" }]
};

const provider: ChoiceProvider = { choices: source => CHOICES[source] ?? [] };

export function testServices(language: "en" | "ru" = "en", host: EditorHost = {}): EditorServices {
  return createEditorServices(createTranslator(language === "ru" ? ru : en, { strict: true }), provider, host);
}

export function renderWithServices(
  ui: ReactElement,
  options: RenderOptions & { language?: "en" | "ru"; host?: EditorHost } = {}
) {
  const services = testServices(options.language, options.host);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </ServicesProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
