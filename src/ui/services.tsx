import { createContext, useContext, type ReactNode } from "react";
import type { Translator } from "../core/i18n";
import { createPhraseFormatter, type ChoiceProvider } from "../core/phrase/formatter";
import type { PhraseFormatter } from "../core/registry/types";
import type { EditorHost } from "./host";

/** Host-provided services; the playground and Foundry supply different implementations. */
export interface EditorServices {
  translator: Translator;
  choices: ChoiceProvider;
  fmt: PhraseFormatter;
  host: EditorHost;
}

export function createEditorServices(translator: Translator, choices: ChoiceProvider, host: EditorHost = {}): EditorServices {
  return { translator, choices, fmt: createPhraseFormatter(translator, choices), host };
}

const ServicesContext = createContext<EditorServices | null>(null);

export function ServicesProvider({ services, children }: { services: EditorServices; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

export function useServices(): EditorServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("Build-n-Action editor rendered without EditorServices.");
  return services;
}

export function useT(): Translator["t"] {
  return useServices().translator.t;
}

export function useHost(): EditorHost {
  return useServices().host;
}
