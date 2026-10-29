// Optional reaction prompt (Plan 5, Task 9). Run as GM with Midi active, after reactions-shared.js; answer the dialog by hand.
(async () => {
  // With globalThis.bnaLiveUseWorldAutomation set, Midi runs on the world's own automation settings (full automation check).
  const forced = globalThis.bnaLiveUseWorldAutomation ? {} : { workflowOptions: { autoRollAttack: true, autoFastAttack: true, autoRollDamage: "always", fastForwardDamage: true } };
  const { on, setup } = globalThis.bnaLive;
  const cleanup = [];
  globalThis.bnaLiveCleanup = cleanup;
  const smite = on("LiveSmiteRider01", "afterAttack", "hit", "rider", {
    effect: { type: "rollBonus", data: { formula: "2d8", damageTypes: ["radiant"] } }, scope: "sameActivation", roll: "damageRoll", who: "self",
    duration: { unit: "uses", value: 1 }
  }, { optional: true, cost: { type: "slots", subtype: "", min: "1", max: "5", step: 1, scales: true, formula: "1d8" } });
  const { hero, foeToken } = await setup([on("LiveHitBonus0001", "attackRoll", "out", "rollBonus", { formula: "20", damageTypes: [] }), smite], cleanup);
  const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
  canvas.tokens.setTargets([foeToken.id]);
  cleanup.unshift(() => canvas.tokens.setTargets([]));
  globalThis.bnaLiveWorkflow = MidiQOL.completeActivityUse(attack, { midiOptions: {
    targetUuids: [foeToken.uuid], ...forced
  } }, { configure: false }, {});
  return hero.uuid;
})();
