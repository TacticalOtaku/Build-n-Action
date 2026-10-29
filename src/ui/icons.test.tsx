import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../core/presets/presets";
import { CHECKS, EVENTS, RESULTS } from "../core/registry/index";
import { ICON_NAMES, Icon } from "./icons";

describe("Icon", () => {
  it("knows every icon the registry uses", () => {
    const used = [...EVENTS, ...CHECKS, ...RESULTS].map(definition => definition.icon);
    expect(used.filter(name => !ICON_NAMES.includes(name))).toEqual([]);
  });

  it("knows every preset icon", () => {
    expect(PRESETS.map(preset => preset.icon).filter(name => !ICON_NAMES.includes(name))).toEqual([]);
  });

  it("renders an aria-hidden svg", () => {
    const { container } = render(<Icon name="flame" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back for unknown names", () => {
    const { container } = render(<Icon name="nope" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
