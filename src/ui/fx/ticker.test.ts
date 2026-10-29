import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeTick } from "./ticker";

let queue: FrameRequestCallback[] = [];

beforeEach(() => {
  queue = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => { queue = []; });
});

afterEach(() => vi.unstubAllGlobals());

function frame(now: number): void {
  const callbacks = queue;
  queue = [];
  for (const callback of callbacks) callback(now);
}

describe("subscribeTick", () => {
  it("drives every subscriber from one animation frame", () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = subscribeTick(a);
    const stopB = subscribeTick(b);
    expect(queue).toHaveLength(1);
    frame(1000);
    frame(1016);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenLastCalledWith(1016, 0.016);
    stopA();
    stopB();
  });

  it("stops requesting frames when nobody listens", () => {
    const stop = subscribeTick(vi.fn());
    stop();
    expect(queue).toHaveLength(0);
  });

  it("clamps long pauses", () => {
    const tick = vi.fn();
    const stop = subscribeTick(tick);
    frame(1);
    frame(5000);
    expect(tick).toHaveBeenLastCalledWith(5000, 0.05);
    stop();
  });
});
