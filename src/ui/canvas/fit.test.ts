import { describe, expect, it } from "vitest";
import { fitOptions } from "./fit";

function stage(height: number, stampHeight: number): HTMLElement {
  const stamp = { offsetHeight: stampHeight };
  return { clientHeight: height, querySelector: () => stamp } as unknown as HTMLElement;
}

describe("fitOptions", () => {
  it("keeps the title block's strip free, measured on the stage", () => {
    expect(fitOptions(stage(740, 176)).padding).toEqual({ top: "72px", right: "48px", bottom: "200px", left: "48px" });
  });

  it("falls back to proportional room on a stage too short for it", () => {
    expect(fitOptions(stage(300, 176)).padding).toEqual({ top: "10%", right: "6%", bottom: "30%", left: "6%" });
    expect(fitOptions(null).padding).toEqual({ top: "10%", right: "6%", bottom: "30%", left: "6%" });
  });

  it("merges extra options", () => {
    expect(fitOptions(null, { duration: 300 })).toMatchObject({ maxZoom: 1, minZoom: 0.7, duration: 300 });
  });
});
