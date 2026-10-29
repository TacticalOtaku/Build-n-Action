// Live reactions through Midi QOL workflows (Plan 5, Task 8). Run as GM after reactions-shared.js.
(async () => {
  // With globalThis.bnaLiveUseWorldAutomation set, Midi runs on the world's own automation settings (full automation check).
  const forced = globalThis.bnaLiveUseWorldAutomation ? {} : { workflowOptions: { autoRollAttack: true, autoFastAttack: true, autoRollDamage: "always", fastForwardDamage: true } };
  const { SCOPE, setup, blueprints, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const cleanup = [];
  try {
    if (!globalThis.MidiQOL?.completeActivityUse) throw new Error("Midi QOL is not active");
    const { hero, foe, foeToken } = await setup(blueprints(), cleanup);
    // Midi may fall back to the user's current targets, so the foe is targeted explicitly as well.
    canvas.tokens.setTargets([foeToken.id]);
    const midiOptions = { targetUuids: [foeToken.uuid], ...forced };

    const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const workflow = await MidiQOL.completeActivityUse(attack, { midiOptions }, { configure: false }, {});
    await wait(1000);
    const damage = (workflow?.damageRolls ?? []).map(roll => roll.formula).join(" | ");
    const fumbled = workflow?.isFumble === true;
    check("Midi attacked the foe", [...(workflow?.targets ?? [])].some(token => token.document?.uuid === foeToken.uuid), [...(workflow?.targets ?? [])].map(token => token.name).join(","));
    check("attack workflow ran", !!workflow, workflow ? `hit ${workflow.hitTargets?.size ?? 0}, fumble ${fumbled}` : "no workflow");
    check("hit → status on the target", fumbled || foe.statuses.has("prone"), [...foe.statuses].join(","));
    check("same-activation rider on damage", fumbled || /55/.test(damage), damage);
    check("dropped → restore my HP", fumbled || (hero.system.attributes.hp.value === 10), hero.system.attributes.hp.value);
    check("same-activation rider used up", Object.keys(hero.getFlag(SCOPE, "riders") ?? {}).length === 0, JSON.stringify(hero.getFlag(SCOPE, "riders") ?? {}));

    await foe.update({ "system.attributes.hp.value": 30 });
    const flame = hero.items.getName("Sacred Flame").system.activities.getByType("save")[0];
    const saveFlow = await MidiQOL.completeActivityUse(flame, { midiOptions: { targetUuids: [foeToken.uuid], ...forced } }, { configure: false }, {});
    await wait(1000);
    if (MidiQOL.configSettings().autoCheckSaves === "none") {
      // Midi leaves the save to the target: roll it as the card's save button does (the card is the originating message).
      const card = document.createElement("div");
      card.dataset.messageId = saveFlow.itemCardUuid.split(".").pop();
      const button = card.appendChild(document.createElement("button"));
      // The blueprint raised the DC by 30, so the foe (Dex 1) fails whatever the card shows.
      await foe.rollSavingThrow({ ability: "dex", target: 40, event: { target: button } }, { configure: false }, {});
      await wait(1000);
    }
    check("failed save → status on the target", foe.statuses.has("blinded"), [...foe.statuses].join(","));

    await hero.rollSkill({ skill: "ath", target: 1 }, { configure: false }, { create: false });
    await wait(500);
    const next = (await attack.rollAttack({}, { configure: false }, { create: false }))?.[0];
    check("check success → rider on my next attack", next?.formula.includes("77"), next?.formula);
    const after = (await attack.rollAttack({}, { configure: false }, { create: false }))?.[0];
    check("next-roll rider used once", !after?.formula.includes("77"), after?.formula);
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    canvas.tokens.setTargets([]);
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
  }
  return report;
})();
