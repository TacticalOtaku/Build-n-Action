import { renderHook } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { libraryHost, registerLibrary } from "./library";

vi.mock("./api", () => ({ saveBlueprint: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe("the library host as a React store", () => {
  it("renders in a world that never saved its library (React error #185 in 2.2.0)", () => {
    let onChange: (() => void) | undefined;
    vi.stubGlobal("game", {
      settings: {
        register: (_scope: string, _key: string, config: { onChange?: () => void }) => {
          onChange = config.onChange;
        },
        // Foundry 14 builds a new value from the default on every read until the setting is first saved.
        get: () => ({ blueprints: [] })
      },
      user: { isGM: true }
    });
    registerLibrary();
    onChange?.();
    const host = libraryHost();
    const { result, rerender } = renderHook(() => useSyncExternalStore(host.subscribe, host.entries));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
