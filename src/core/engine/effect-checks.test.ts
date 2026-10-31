import { describe, expect, it } from "vitest";
import { actorFacts, creatureFacts, rollFacts } from "../testing/facts";
import { evaluateCheck, type CheckEnv } from "./evaluators";

const env: CheckEnv = { evaluateNumber: () => null, replaceData: value => value, runScript: () => null, carrierItemUuid: null };
const effect = { name: "Метка охотника (особая)", uuid: "Actor.hero.ActiveEffect.copy", sources: ["Item.bow.ActiveEffect.mark"], active: true };
const facts = rollFacts({ actor: actorFacts({ effects: [effect] }), target: creatureFacts({ effects: [effect] }) });

// These cases catch missing effect checks, source/name conflation and activity/presence inversions.
describe.each(["actorActiveEffects", "targetActiveEffects"])("%s", type => {
  const check = (data: Record<string, unknown>, input = facts) => evaluateCheck(type, data, input, env);
  it("matches a complete Unicode name, ignoring case and surrounding whitespace", () => {
    expect(check({ name: "  МЕТКА ОХОТНИКА (ОСОБАЯ)  " }).pass).toBe(true);
  });
  it("does not match a substring", () => {
    expect(check({ name: "Метка" }).pass).toBe(false);
  });
  it("matches the source of a renamed copy", () => {
    expect(check({ match: "source", source: { uuid: "Item.bow.ActiveEffect.mark", name: "Old name" } }).pass).toBe(true);
  });
  it("does not use a matching name as a substitute for a different source", () => {
    expect(check({ match: "source", source: { uuid: "Item.other.ActiveEffect.mark", name: effect.name } }).pass).toBe(false);
  });
  it("requires absence when requested", () => {
    expect(check({ name: "Другое", presence: "absent" }).pass).toBe(true);
    expect(check({ name: effect.name, presence: "absent" }).pass).toBe(false);
  });
  it("reports the effect in a failed absence check without missing message parameters", () => {
    expect(check({ name: effect.name, presence: "absent" })).toMatchObject({ pass: false, reason: { code: "excluded", values: { actual: effect.name } } });
    expect(check({ name: "Missing" })).toMatchObject({ pass: false, reason: { code: "notMatched", values: { actual: effect.name, expected: "Missing" } } });
  });
  it("ignores inactive effects until explicitly included", () => {
    const inactive = rollFacts({ actor: actorFacts({ effects: [{ ...effect, active: false }] }), target: creatureFacts({ effects: [{ ...effect, active: false }] }) });
    expect(check({ name: effect.name }, inactive).pass).toBe(false);
    expect(check({ name: effect.name, includeInactive: true }, inactive).pass).toBe(true);
  });
  it("leaves an empty check unrestricted", () => {
    expect(check({}).reason.code).toBe("empty");
    expect(check({ match: "source", source: null }).pass).toBe(true);
  });
  it("does not treat a malformed source as an empty unrestricted check", () => {
    expect(check({ match: "source", source: { name: "Lost UUID" } }).pass).toBe(false);
  });
});

it("does not pass an effect absence check without a target", () => {
  expect(evaluateCheck("targetActiveEffects", { name: "Метка", presence: "absent" }, rollFacts({ target: null }), env))
    .toMatchObject({ pass: false, reason: { code: "noTarget" } });
});
