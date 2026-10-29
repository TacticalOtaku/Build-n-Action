import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AURA_COLORS, clearAuraPreviews, previewAura } from "./aura-preview";

class FakeGraphics {
  alpha = 1;
  destroyed = false;
  calls: [string, unknown][] = [];
  lineStyle(style: unknown) { this.calls.push(["lineStyle", style]); return this; }
  beginFill(color: number, alpha: number) { this.calls.push(["beginFill", [color, alpha]]); return this; }
  drawShape(shape: unknown) { this.calls.push(["drawShape", shape]); return this; }
  endFill() { return this; }
  destroy() { this.destroyed = true; }
}

const drawn: FakeGraphics[] = [];
const animate = vi.fn(() => Promise.resolve(true));

beforeEach(() => {
  vi.useFakeTimers();
  drawn.length = 0;
  animate.mockClear();
  vi.stubGlobal("PIXI", { Graphics: FakeGraphics });
  vi.stubGlobal("canvas", { ready: true, interface: { addChild: (child: FakeGraphics) => drawn.push(child) } });
  vi.stubGlobal("foundry", { canvas: { animation: { CanvasAnimation: { animate } } } });
});

afterEach(() => {
  clearAuraPreviews();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const shape = { contains: () => true };

describe("previewAura", () => {
  it("draws the checked shape green inside and coral outside", () => {
    previewAura("a", shape, true);
    previewAura("b", shape, false);
    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.calls).toContainEqual(["beginFill", [AURA_COLORS.inside, expect.any(Number) as unknown]]);
    expect(drawn[1]?.calls).toContainEqual(["beginFill", [AURA_COLORS.outside, expect.any(Number) as unknown]]);
    expect(drawn[0]?.calls).toContainEqual(["drawShape", shape]);
  });

  it("replaces an earlier drawing of the same aura", () => {
    previewAura("a", shape, false);
    previewAura("a", shape, true);
    expect(drawn[0]?.destroyed).toBe(true);
    expect(drawn[1]?.destroyed).toBe(false);
  });

  it("fades out and removes the drawing after a while", async () => {
    previewAura("a", shape, true);
    await vi.advanceTimersByTimeAsync(2500);
    expect(animate).toHaveBeenCalledWith([{ parent: drawn[0], attribute: "alpha", to: 0 }], expect.objectContaining({ name: "bna-aura-a" }));
    expect(drawn[0]?.destroyed).toBe(true);
  });

  it("does nothing while the canvas is not ready", () => {
    vi.stubGlobal("canvas", { ready: false, interface: { addChild: () => {} } });
    previewAura("a", shape, true);
    expect(drawn).toHaveLength(0);
  });
});
