import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n";
import en from "../../lang/en.json";
import ru from "../../lang/ru.json";
import { LINT_CODES } from "./lint";
import { REASON_CODES } from "./reasons";

const MIGRATION_WARNINGS = ["invalidId", "unknownFilter", "unknownType"];

describe.each([["en", en], ["ru", ru]] as const)("%s engine messages", (_language, dictionary) => {
  const translator = createTranslator(dictionary);

  it("explain every reason", () => {
    expect(REASON_CODES.filter(code => !translator.has(`BNA.Reason.${code}`))).toEqual([]);
  });

  it("describe every lint finding", () => {
    expect(LINT_CODES.filter(code => !translator.has(`BNA.Lint.${code}`))).toEqual([]);
  });

  it("describe every migration warning", () => {
    expect(MIGRATION_WARNINGS.filter(code => !translator.has(`BNA.Migration.Warning.${code}`))).toEqual([]);
  });
});
