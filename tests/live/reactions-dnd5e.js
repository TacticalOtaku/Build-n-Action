// Live reactions through plain dnd5e (Plan 5, Task 9). Run as GM with Midi QOL disabled, after reactions-shared.js.
(async () => {
  const { SCOPE, setup, blueprints, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const cleanup = [];
  const started = Date.now();
  try {
    if (game.modules.get("midi-qol")?.active) throw new Error("Disable Midi QOL for this check");
    const { hero, foe, foeToken } = await setup(blueprints(), cleanup);
    canvas.tokens.setTargets([foeToken.id]);

    const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const card = (await attack.use({ consume: false }, { configure: false }, { create: true }))?.message;
    const origin = { "flags.dnd5e.originatingMessage": card?.id };
    const attackRoll = (await attack.rollAttack({}, { configure: false }, { create: false, data: origin }))?.[0];
    await wait(1500);
    const fumbled = attackRoll?.isFumble === true;
    check("hit → status on the target", fumbled || foe.statuses.has("prone"), `${attackRoll?.formula} → ${[...foe.statuses].join(",")}`);

    const damage = await attack.rollDamage({}, { configure: false }, { create: true, data: origin });
    check("same-activation rider on damage", fumbled || damage?.some(roll => roll.formula.includes("55")), damage?.map(roll => roll.formula).join(" | "));
    const damageMessage = game.messages.contents.findLast(message => message.getFlag("dnd5e", "roll.type") === "damage");
    await foe.applyDamage(damage?.reduce((sum, roll) => sum + roll.total, 0) ?? 0, { originatingMessage: damageMessage });
    await wait(800);
    check("dropped → restore my HP", hero.system.attributes.hp.value === 10, hero.system.attributes.hp.value);

    await foe.update({ "system.attributes.hp.value": 30 });
    const flame = hero.items.getName("Sacred Flame").system.activities.getByType("save")[0];
    const flameCard = (await flame.use({ consume: false }, { configure: false }, { create: true }))?.message;
    await foe.rollSavingThrow({ ability: "dex", target: 40 }, { configure: false }, { data: { "flags.dnd5e.originatingMessage": flameCard?.id } });
    await wait(1000);
    check("failed save → status on the target", foe.statuses.has("blinded"), [...foe.statuses].join(","));

    await hero.rollSkill({ skill: "ath", target: 1 }, { configure: false }, { create: false });
    await wait(500);
    const next = (await attack.rollAttack({}, { configure: false }, { create: false }))?.[0];
    check("check success → rider on my next attack", next?.formula.includes("77"), next?.formula);
    await wait(800);
    check("riders cleaned up", Object.keys(hero.getFlag(SCOPE, "riders") ?? {}).length === 0, JSON.stringify(hero.getFlag(SCOPE, "riders") ?? {}));
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    canvas.tokens.setTargets([]);
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
    const made = game.messages.filter(message => (message.timestamp >= started) && /BNA Live/.test(message.speaker?.alias ?? ""));
    if (made.length) await ChatMessage.deleteDocuments(made.map(message => message.id));
  }
  return report;
})();
