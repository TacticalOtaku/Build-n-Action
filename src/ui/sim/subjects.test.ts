import { describe, expect, it, vi } from "vitest";
import type { SimulatorHost } from "../host";
import { subjectStore } from "./subjects";

function host(overrides: Partial<SimulatorHost> = {}): SimulatorHost {
  return {
    actors: vi.fn(() => [{ value: "Actor.aria", label: "Aria" }]),
    items: () => [],
    targets: vi.fn(() => [{ value: "Token.lich", label: "Lich" }]),
    defaults: () => ({ actorUuid: null, itemUuid: null, targetUuid: null }),
    run: () => null,
    ...overrides
  };
}

describe("subjectStore", () => {
  it("reads the lists once per revision and returns the same snapshot until it changes", () => {
    let revision = 0;
    const simulator = host({ revision: () => revision });
    const store = subjectStore(simulator);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    expect(store.getSnapshot()).toBe(first);
    expect(simulator.actors).toHaveBeenCalledTimes(1);
    expect(simulator.targets).toHaveBeenCalledTimes(1);
    revision = 1;
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.actors).toEqual([{ value: "Actor.aria", label: "Aria" }]);
    expect(simulator.actors).toHaveBeenCalledTimes(2);
  });

  it("reads the lists once for a host without revisions", () => {
    const simulator = host();
    const store = subjectStore(simulator);
    store.getSnapshot();
    store.getSnapshot();
    expect(simulator.actors).toHaveBeenCalledTimes(1);
  });

  it("passes subscriptions to the host, and does nothing without one", () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const listener = vi.fn();
    subjectStore(host({ subscribe })).subscribe(listener)();
    expect(subscribe).toHaveBeenCalledWith(listener);
    expect(unsubscribe).toHaveBeenCalled();
    expect(() => subjectStore(host()).subscribe(listener)()).not.toThrow();
  });
});
