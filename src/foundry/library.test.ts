import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlueprint } from "../core/blueprint/factory";
import { libraryEntries, registerLibrary } from "./library";

// The api module reaches Foundry classes when it loads; the library only needs it to save to documents.
vi.mock("./api", () => ({ saveBlueprint: vi.fn() }));

const blueprint = createBlueprint({ id: "aB3dE5gH7jK9mN1p", name: "Kept" });

/** game.settings as Foundry 14 has it for a world setting never saved: every get builds a new Setting from the default. */
function settings(value: () => unknown) {
  let onChange: (() => void) | undefined;
  vi.stubGlobal("game", {
    settings: {
      register: (_scope: string, _key: string, config: { onChange?: () => void }) => {
        onChange = config.onChange;
      },
      get: () => value()
    },
    user: { isGM: true }
  });
  registerLibrary();
  return { change: () => onChange?.() };
}

beforeEach(() => settings(() => ({ blueprints: [] })).change());
afterEach(() => vi.unstubAllGlobals());

describe("libraryEntries", () => {
  it("returns the same array while the setting is unchanged, even when each read gives a fresh value", () => {
    settings(() => ({ blueprints: [] })).change();
    const first = libraryEntries();
    expect(libraryEntries()).toBe(first);
    expect(libraryEntries()).toBe(first);
  });

  it("reads the setting again once it changes", () => {
    let stored: unknown[] = [];
    const world = settings(() => ({ blueprints: structuredClone(stored) }));
    world.change();
    expect(libraryEntries()).toEqual([]);
    stored = [blueprint];
    world.change();
    expect(libraryEntries().map(entry => entry.id)).toEqual(["aB3dE5gH7jK9mN1p"]);
  });
});
