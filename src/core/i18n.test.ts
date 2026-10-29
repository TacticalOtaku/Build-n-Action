import { describe, expect, it } from "vitest";
import { createTranslator } from "./i18n";

const dictionary = { BNA: { Hello: "Hello, {name}!", Plain: "Plain", Nested: { Deep: "deep" } } };

describe("createTranslator", () => {
  const translator = createTranslator(dictionary);

  it("looks up nested keys", () => {
    expect(translator.t("BNA.Nested.Deep")).toBe("deep");
  });

  it("interpolates placeholders", () => {
    expect(translator.t("BNA.Hello", { name: "Ada" })).toBe("Hello, Ada!");
  });

  it("leaves unknown placeholders intact", () => {
    expect(translator.t("BNA.Hello")).toBe("Hello, {name}!");
    expect(translator.t("BNA.Hello", { other: 1 })).toBe("Hello, {name}!");
  });

  it("returns the key when a translation is missing", () => {
    expect(translator.t("BNA.Missing")).toBe("BNA.Missing");
  });

  it("throws on missing keys in strict mode", () => {
    expect(() => createTranslator(dictionary, { strict: true }).t("BNA.Missing")).toThrow(/BNA\.Missing/);
  });

  it("only reports leaves as present", () => {
    expect(translator.has("BNA.Plain")).toBe(true);
    expect(translator.has("BNA.Nested")).toBe(false);
  });
});
