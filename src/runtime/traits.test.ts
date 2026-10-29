import { describe, expect, it } from "vitest";
import { expandTraits, traitDescendants, traitPath, type TraitTree } from "./traits";

const languages: TraitTree = {
  standard: { label: "Standard", children: { common: { label: "Common" }, dwarvish: { label: "Dwarvish" } } },
  exotic: { label: "Exotic", children: { primordial: { label: "Primordial", children: { ignan: { label: "Ignan" } } } } },
  cant: { label: "Thieves' Cant" }
};

describe("trait trees", () => {
  it("finds the path from the root to a key", () => {
    expect(traitPath(languages, "ignan")).toEqual(["exotic", "primordial", "ignan"]);
    expect(traitPath(languages, "cant")).toEqual(["cant"]);
    expect(traitPath(languages, "elvish")).toEqual([]);
    expect(traitPath(undefined, "cant")).toEqual([]);
  });

  it("lists everything below a key", () => {
    expect(traitDescendants(languages, "exotic")).toEqual(["primordial", "ignan"]);
    expect(traitDescendants(languages, "common")).toEqual([]);
  });

  it("expands values with their categories and chosen categories with their members", () => {
    expect(expandTraits(languages, ["dwarvish"]).sort()).toEqual(["dwarvish", "standard"]);
    expect(expandTraits(languages, ["standard"]).sort()).toEqual(["common", "dwarvish", "standard"]);
    expect(expandTraits(null, ["elvish"])).toEqual(["elvish"]);
  });
});
