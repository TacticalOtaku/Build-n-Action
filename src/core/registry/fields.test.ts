import { describe, expect, it } from "vitest";
import { defaultsFor, isFieldVisible, walkFields, type FieldSpec } from "./fields";

describe("defaultsFor", () => {
  it("builds nested defaults", () => {
    const fields: FieldSpec[] = [
      { key: "formula", kind: "formula", label: "l", default: "1d4" },
      { key: "group", kind: "group", label: "l", fields: [{ key: "on", kind: "toggle", label: "l", default: true }] },
      { key: "list", kind: "multiselect", label: "l", default: ["a"], choices: { source: "abilities" } },
      { key: "effect", kind: "embeddedResult", label: "l", allowed: ["rollBonus"] },
      { key: "rules", kind: "comparisons", label: "l", default: [{ one: "1", operator: "EQ", other: "1" }] }
    ];
    expect(defaultsFor(fields)).toEqual({
      formula: "1d4",
      group: { on: true },
      list: ["a"],
      effect: null,
      rules: [{ one: "1", operator: "EQ", other: "1" }]
    });
  });

  it("copies array and object defaults so node data never shares them", () => {
    const tags: FieldSpec = { key: "list", kind: "tags", label: "l", default: [] };
    const rules: FieldSpec = { key: "rules", kind: "comparisons", label: "l", default: [{ one: "a", operator: "LT", other: "b" }] };
    const first = defaultsFor([tags, rules]);
    const second = defaultsFor([tags, rules]);
    expect(first.list).not.toBe(second.list);
    expect((first.rules as unknown[])[0]).not.toBe((second.rules as unknown[])[0]);
  });

  it("keeps the first default when two specs share a key", () => {
    const fields: FieldSpec[] = [
      { key: "subtype", kind: "select", label: "l", default: "gp", choices: { source: "currencies" } },
      { key: "subtype", kind: "select", label: "l", default: "d6", choices: { static: [] } }
    ];
    expect(defaultsFor(fields)).toEqual({ subtype: "gp" });
  });
});

describe("isFieldVisible", () => {
  const field: FieldSpec = {
    key: "range", kind: "formula", label: "l", default: "", visibleWhen: { key: "mode", in: ["aura"] }
  };

  it("shows a field whose rule matches", () => {
    expect(isFieldVisible(field, { mode: "aura" })).toBe(true);
  });

  it("hides a field whose rule does not match", () => {
    expect(isFieldVisible(field, { mode: "self" })).toBe(false);
  });

  it("shows fields without a rule", () => {
    expect(isFieldVisible({ key: "x", kind: "toggle", label: "l", default: false }, {})).toBe(true);
  });
});

describe("walkFields", () => {
  it("visits nested fields depth-first", () => {
    const keys: string[] = [];
    walkFields([
      { key: "a", kind: "group", label: "l", fields: [{ key: "b", kind: "toggle", label: "l", default: false }] },
      { key: "c", kind: "toggle", label: "l", default: false }
    ], field => keys.push(field.key));
    expect(keys).toEqual(["a", "b", "c"]);
  });
});
