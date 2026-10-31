import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { getCheck } from "../../core/registry/index";
import { evaluateCheck } from "../../core/engine/evaluators";
import { rollFacts } from "../../core/testing/facts";
import type { EffectReference } from "../../core/facts/effects";
import type { EditorHost } from "../host";
import { renderWithServices } from "../testing/render";
import { FieldList } from "./FieldList";

const first = { uuid: "Item.staff.ActiveEffect.first", name: "Особая метка" };
const second = { uuid: "Item.staff.ActiveEffect.second", name: "Другой эффект" };
function Controlled({ changed, initial = first }: { changed: (value: unknown) => void; initial?: unknown }) {
  const [source, setSource] = useState<unknown>(initial);
  return <FieldList fields={getCheck("actorActiveEffects")!.fields} data={{ match: "source", source }} path={[]} upstream={[]} onChange={(_path, value) => { changed(value); setSource(value); }} />;
}
const host: EditorHost = { effectSelection: { choices: () => [first, second], resolve: async uuid => [first, second].find(ref => ref.uuid === uuid) ?? null } };
function setup(selection = host, initial: unknown = first) {
  const changed = vi.fn();
  const view = renderWithServices(<Controlled changed={changed} initial={initial} />, { host: selection });
  return { changed, ...view };
}
const input = () => screen.getByRole("textbox", { name: "Effect UUID" });
async function enter(uuid: string) {
  await userEvent.clear(input());
  await userEvent.type(input(), uuid);
  await userEvent.click(screen.getByRole("button", { name: "Use UUID" }));
}
function drop(data: unknown) {
  fireEvent.drop(screen.getByRole("group", { name: "Effect source" }), { dataTransfer: { getData: () => typeof data === "string" ? data : JSON.stringify(data) } });
}

describe("effect reference field", () => {
  it("selects a source without turning its Unicode name into a slug", async () => {
    const { changed } = setup();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Choose an effect" }), second.uuid);
    await waitFor(() => expect(changed).toHaveBeenLastCalledWith(second));
    expect(screen.getByLabelText("Selected effect")).toHaveTextContent("Другой эффект");
  });
  it("accepts a UUID and ActiveEffect drops", async () => {
    const { changed } = setup();
    await enter(second.uuid);
    await waitFor(() => expect(changed).toHaveBeenLastCalledWith(second));
    drop({ type: "ActiveEffect", uuid: first.uuid });
    await waitFor(() => expect(changed).toHaveBeenLastCalledWith(first));
  });
  it("preserves a previous source on invalid input or a wrong document drop", async () => {
    const { changed } = setup();
    await enter("Item.staff");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    drop({ type: "Item", uuid: second.uuid });
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Selected effect")).toHaveTextContent(first.name);
  });
  it("records an explicitly invalid UUID instead of leaving a new check unrestricted", async () => {
    const { changed } = setup(host, null);
    await enter("Item.staff");
    expect(changed).toHaveBeenLastCalledWith({ uuid: "Item.staff", name: "", invalid: true });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
  it("records a malformed ActiveEffect drop on a new check as invalid", async () => {
    const { changed } = setup(host, null);
    drop({ type: "ActiveEffect", uuid: "Item.staff" });
    expect(changed).toHaveBeenLastCalledWith({ uuid: "Item.staff", name: "", invalid: true });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(evaluateCheck("actorActiveEffects", { match: "source", source: changed.mock.calls.at(-1)?.[0] }, rollFacts(), {
      evaluateNumber: () => null, replaceData: text => text, runScript: () => null, carrierItemUuid: null
    }).pass).toBe(false);
  });
  it("keeps the last request when lookups finish out of order", async () => {
    const pending = new Map<string, (value: EffectReference | null) => void>();
    const { changed } = setup({ effectSelection: { choices: () => [first, second], resolve: uuid => new Promise(resolve => pending.set(uuid, resolve)) } }, null);
    await enter(first.uuid);
    await enter(second.uuid);
    await act(async () => pending.get(second.uuid)!(second));
    await act(async () => pending.get(first.uuid)!(first));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(second);
  });
  it("does not commit a result after the field has unmounted", async () => {
    let finish: (value: EffectReference | null) => void = () => {};
    const { changed, unmount } = setup({ effectSelection: { choices: () => [], resolve: () => new Promise(resolve => { finish = resolve; }) } });
    await enter(second.uuid);
    unmount();
    await act(async () => finish(second));
    expect(changed).not.toHaveBeenCalled();
  });
  it("reports host failures without clearing the current selection", async () => {
    const { changed } = setup({ effectSelection: { choices: () => [], resolve: async () => { throw new Error("offline"); } } });
    await enter(second.uuid);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
  it("makes unavailable host selection explicit", () => {
    setup({});
    expect(screen.getByText("Effect selection is unavailable in this host.")).toBeInTheDocument();
  });
});
