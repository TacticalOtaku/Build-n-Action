export type TranslationData = Record<string, string | number>;

/** The slice of localization the core needs; Foundry's game.i18n is adapted to it in Plan 4. */
export interface Translator {
  t(key: string, data?: TranslationData): string;
  has(key: string): boolean;
}

export interface TranslatorOptions {
  /** Throw on a missing key instead of returning it; used by contract tests. */
  strict?: boolean;
}

export function createTranslator(dictionary: unknown, { strict = false }: TranslatorOptions = {}): Translator {
  const lookup = (key: string): unknown => key.split(".").reduce<unknown>((node, part) => {
    return (node && (typeof node === "object")) ? (node as Record<string, unknown>)[part] : undefined;
  }, dictionary);

  return {
    has: key => typeof lookup(key) === "string",
    t(key, data) {
      const template = lookup(key);
      if (typeof template !== "string") {
        if (strict) throw new Error(`Missing translation: ${key}`);
        return key;
      }
      if (!data) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in data ? String(data[name]) : match));
    }
  };
}
