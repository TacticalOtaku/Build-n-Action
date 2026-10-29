import { describe, expect, it, vi } from "vitest";
import { headerControl } from "./header";

vi.hoisted(() => {
  vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: class {} } } });
});

vi.stubGlobal("game", {
  i18n: {
    localize: (key: string) => ({ "BNA.Header.label": "Build-n-Action" }[key] ?? key),
    format: (key: string, data: Record<string, unknown>) => (key === "BNA.Header.labelCount") ? `Build-n-Action (${String(data.count)})` : key
  }
});

const actor = { documentName: "Actor", uuid: "Actor.a", type: "character" } as unknown as FoundryDocument;

describe("headerControl", () => {
  it("names the control and counts the document's blueprints", () => {
    expect(headerControl(actor, 0, false)).toMatchObject({ action: "bnaOpenEditor", icon: "fa-solid fa-diagram-project", label: "Build-n-Action" });
    expect(headerControl(actor, 2, false).label).toBe("Build-n-Action (2)");
  });

  it("marks the icon while one of them works", () => {
    expect(headerControl(actor, 2, true).icon).toBe("fa-solid fa-diagram-project bna-active-marker");
  });
});
