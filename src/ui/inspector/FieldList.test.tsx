import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { defaultsFor, type FieldSpec } from "../../core/registry/fields";
import { getCheck, getEvent, getResult } from "../../core/registry/index";
import { renderWithServices } from "../testing/render";
import { FieldList } from "./FieldList";

function renderFields(fields: readonly FieldSpec[], data: Record<string, unknown>, upstream: string[] = []) {
  const onChange = vi.fn();
  renderWithServices(<FieldList fields={fields} data={data} path={[]} upstream={upstream as never} onChange={onChange} />);
  return onChange;
}

function Controlled({ onChange }: { onChange(path: readonly string[], value: unknown): void }) {
  const result = getResult("rollBonus")!;
  const [data, setData] = useState<Record<string, unknown>>({ formula: "", damageTypes: [] });
  return (
    <FieldList
      fields={result.fields}
      data={data}
      path={[]}
      upstream={[]}
      onChange={(path, value) => {
        onChange(path, value);
        setData(previous => ({ ...previous, [String(path[0])]: value }));
      }}
    />
  );
}

describe("FieldList", () => {
  it("renders a formula input and reports edits with the field path", async () => {
    const result = getResult("rollBonus")!;
    const onChange = renderFields(result.fields, { formula: "", damageTypes: [] });
    await userEvent.type(screen.getByLabelText("Bonus"), "2");
    expect(onChange).toHaveBeenLastCalledWith(["formula"], "2");
    expect(screen.getByText("A number, dice or roll data, e.g. 1d4 or @abilities.cha.mod.")).toBeInTheDocument();
  });

  it("hides fields meant for other events", () => {
    const result = getResult("rollBonus")!;
    renderFields(result.fields, defaultsFor(result.fields), ["attackRoll"]);
    expect(screen.queryByText("Damage type")).not.toBeInTheDocument();
  });

  it("shows fields for the matching event", () => {
    const result = getResult("rollBonus")!;
    renderFields(result.fields, defaultsFor(result.fields), ["damageRoll"]);
    expect(screen.getByText("Damage type")).toBeInTheDocument();
  });

  it("reveals dependent fields through visibleWhen and nests groups", async () => {
    const event = getEvent("attackRoll")!;
    const data = defaultsFor(event.fields);
    const onChange = renderFields(event.fields, data);
    expect(screen.queryByLabelText("Aura radius (ft)")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Source"), "aura");
    expect(onChange).toHaveBeenLastCalledWith(["reach", "mode"], "aura");
  });

  it("shows aura options once the mode is aura", () => {
    const event = getEvent("attackRoll")!;
    const data = defaultsFor(event.fields);
    renderFields(event.fields, { reach: { ...(data.reach as object), mode: "aura" } });
    expect(screen.getByLabelText("Aura radius (ft)")).toHaveValue("10");
    expect(screen.getByText("Blocked by walls that block")).toBeInTheDocument();
  });

  it("cycles chips through match and exclusion", async () => {
    const check = getCheck("creatureTypes")!;
    const first = renderFields(check.fields, { values: [] });
    await userEvent.click(screen.getByRole("button", { name: "Undead" }));
    expect(first).toHaveBeenLastCalledWith(["values"], ["undead"]);
  });

  it("marks an included chip and turns it into an exclusion", async () => {
    const check = getCheck("creatureTypes")!;
    const onChange = renderFields(check.fields, { values: ["undead"] });
    const chip = screen.getByRole("button", { name: "Undead" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith(["values"], ["!undead"]);
  });

  it("clears an excluded chip", async () => {
    const check = getCheck("creatureTypes")!;
    const onChange = renderFields(check.fields, { values: ["!undead"] });
    await userEvent.click(screen.getByRole("button", { name: "Undead" }));
    expect(onChange).toHaveBeenLastCalledWith(["values"], []);
  });

  it("adds slugged tags with Enter and removes them", async () => {
    const check = getCheck("identifiers")!;
    const onChange = renderFields(check.fields, { values: ["dagger"] });
    await userEvent.type(screen.getByLabelText("Values"), "Long Sword{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["values"], ["dagger", "long-sword"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove dagger" }));
    expect(onChange).toHaveBeenLastCalledWith(["values"], []);
  });

  it("toggles switches", async () => {
    const check = getCheck("tokenSizes")!;
    const onChange = renderFields(check.fields, defaultsFor(check.fields));
    await userEvent.click(screen.getByRole("switch", { name: "Compare with my size" }));
    expect(onChange).toHaveBeenLastCalledWith(["self"], true);
  });

  it("edits comparisons", async () => {
    const check = getCheck("arbitraryComparisons")!;
    const onChange = renderFields(check.fields, { comparisons: [] });
    await userEvent.click(screen.getByRole("button", { name: "Add comparison" }));
    expect(onChange).toHaveBeenLastCalledWith(["comparisons"], [{ one: "", operator: "EQ", other: "" }]);
  });

  it("picks the change a rider carries and shows its fields", async () => {
    const rider = getResult("rider")!;
    const onChange = renderFields(rider.fields, defaultsFor(rider.fields));
    await userEvent.selectOptions(screen.getByLabelText("Change"), "rollBonus");
    expect(onChange).toHaveBeenLastCalledWith(["effect"], { type: "rollBonus", data: { formula: "", damageTypes: [] } });
  });

  it("suggests roll-data paths and previews the formula", async () => {
    const onChange = vi.fn();
    renderWithServices(<Controlled onChange={onChange} />, {
      host: { formula: { paths: () => ["@abilities.cha.mod", "@prof"], preview: formula => `${formula}=` } }
    });
    const field = screen.getByRole("combobox", { name: "Bonus" });
    await userEvent.type(field, "@pr");
    expect(screen.getByRole("option", { name: "@prof" })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["formula"], "@prof");
    expect(screen.getByText("= @prof=")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("works as a plain field without formula help", async () => {
    const onChange = vi.fn();
    renderWithServices(<Controlled onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Bonus"), "@pr");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(["formula"], "@pr");
  });
});
