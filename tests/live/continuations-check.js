// Live check of Plan 10 "And then" continuations. Run as the active GM after reactions-shared.js, on a scene with the canvas ready.
// Builds "BNA Live" actors with chained blueprints, rolls, answers roll dialogs, runs a Midi workflow and a rest,
// reads the results, deletes everything it made and returns [{name, pass, detail}].
(async () => {
  const { SCOPE, setup, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const until = async (test, timeout = 4000) => {
    const started = performance.now();
    while ((performance.now() - started) < timeout) {
      if (await test()) return true;
      await wait(50);
    }
    return false;
  };
  const common = (extra = {}) => ({ optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: false, ...extra });
  const node = (id, kind, type, data = {}) => ({ id, kind, type, position: { x: 0, y: 0 }, data });
  const result = (id, type, data, extra) => node(id, "result", type, { ...data, common: common(extra) });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const blueprint = (id, nodes, edges) => ({
    id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, nodes, edges, flags: {}
  });
  const self = { reach: { mode: "self" } };
  const VETO = "LiveVetoThen0001";
  const SMITE = "LiveSmiteThen001";
  const blueprints = [
    blueprint("LiveThenBonus001", [
      node("ev", "event", "damageRoll", self),
      result("bonus", "rollBonus", { formula: "7", damageTypes: [] }, { then: true }),
      result("send", "signal", { name: "LiveThen", scope: "actor" })
    ], [edge("ev", "out", "bonus"), edge("bonus", "then", "send")]),
    blueprint("LiveThenHear0001", [
      node("sig", "event", "signal", { name: "LiveThen" }),
      result("res", "resource", { action: "restore", resource: "hp", amount: "2", who: "self" })
    ], [edge("sig", "out", "res")]),
    blueprint(SMITE, [
      node("ev", "event", "damageRoll", self),
      result("smite", "rollBonus", { formula: "2d8", damageTypes: ["radiant"] }, { optional: true, then: true }),
      result("blind", "applyEffect", { source: "status", status: "blinded", who: "target" })
    ], [edge("ev", "out", "smite"), edge("smite", "then", "blind")]),
    blueprint("LiveHitThen00001", [
      node("ev", "event", "afterAttack", self),
      result("prone", "applyEffect", { source: "status", status: "prone", who: "target" }, { then: true }),
      result("res", "resource", { action: "restore", resource: "hp", amount: "3", who: "self" })
    ], [edge("ev", "hit", "prone"), edge("prone", "then", "res")]),
    blueprint("LiveRestThen0001", [
      node("ev", "event", "shortRest", self),
      result("res", "resource", { action: "restore", resource: "hp", amount: "1", who: "self" }, { then: true }),
      result("hide", "applyEffect", { source: "status", status: "invisible", who: "self" })
    ], [edge("ev", "out", "res"), edge("res", "then", "hide")]),
    blueprint(VETO, [
      node("ev", "event", "damageRoll", self),
      result("bonus", "rollBonus", { formula: "1", damageTypes: [] }, { then: true }),
      result("temp", "resource", { action: "restore", resource: "tempHp", amount: "50", who: "self" })
    ], [edge("ev", "out", "bonus"), edge("bonus", "then", "temp")])
  ];

  const cleanup = [];
  try {
    const vetoHook = Hooks.on(`${SCOPE}.preApplyResult`, intent => intent.blueprintId !== VETO);
    cleanup.push(() => Hooks.off(`${SCOPE}.preApplyResult`, vetoHook));
    const { hero, foe, foeToken } = await setup(blueprints, cleanup);
    canvas.tokens.setTargets([foeToken.id]);
    cleanup.unshift(() => canvas.tokens.setTargets([]));
    const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const hp = () => hero.system.attributes.hp.value;
    const reset = async () => {
      await hero.update({ "system.attributes.hp.value": 5, "system.attributes.hp.temp": 0 });
      for (const status of ["blinded", "prone"]) if (foe.statuses.has(status)) await foe.toggleStatusEffect(status, { active: false });
      if (hero.statuses.has("invisible")) await hero.toggleStatusEffect("invisible", { active: false });
    };
    const setEnabled = async (id, enabled) => {
      const list = hero.getFlag(SCOPE, "blueprints").map(entry => (entry.id === id) ? { ...entry, enabled } : entry);
      await hero.setFlag(SCOPE, "blueprints", list);
    };
    const openDialog = async () => {
      const rolled = attack.rollDamage({}, {}, { create: false });
      let app = null;
      await until(() => {
        app = [...foundry.applications.instances.values()].find(entry => entry.element?.querySelector?.(".bna-panel")) ?? null;
        return !!app;
      });
      return { rolled, app };
    };

    // 1. A mandatory result continues when the roll is made (plain dnd5e).
    await setEnabled(SMITE, false);
    await reset();
    await attack.rollDamage({}, { configure: false }, { create: false });
    check("mandatory bonus → «Затем» → signal → restore 2 HP", await until(() => hp() === 7), hp());

    // 2. A closed dialog runs nothing.
    await setEnabled(SMITE, true);
    await reset();
    {
      const { rolled, app } = await openDialog();
      check("the roll dialog offers the smite", !!app, app?.constructor.name);
      await app?.close();
      await rolled;
      await wait(700);
      check("closed dialog: the foe is not blinded", !foe.statuses.has("blinded"), [...foe.statuses].join(","));
      check("closed dialog: the mandatory «Затем» does not run", hp() === 5, hp());
    }

    // 3. The choice not taken: only the mandatory continuation runs.
    await reset();
    {
      const { rolled, app } = await openDialog();
      app?.element.querySelector('button[data-action="normal"]')?.click();
      await rolled;
      check("choice not taken: the mandatory «Затем» runs", await until(() => hp() === 7), hp());
      await wait(500);
      check("choice not taken: the foe is not blinded", !foe.statuses.has("blinded"), [...foe.statuses].join(","));
    }

    // 4. The choice taken: its continuation blinds the foe once the roll is made.
    await reset();
    {
      const { rolled, app } = await openDialog();
      app?.element.querySelector(".bna-choice__apply")?.click();
      await until(() => !!app?.element.querySelector(".bna-choice.is-applied"));
      check("smite applied in the dialog", !!app?.element.querySelector(".bna-choice.is-applied"), "");
      await wait(300);
      check("applied but not rolled yet: the foe is not blinded", !foe.statuses.has("blinded"), [...foe.statuses].join(","));
      app?.element.querySelector('button[data-action="normal"]')?.click();
      const rolls = await rolled;
      check("smite dice in the roll", (rolls ?? []).some(roll => /2d8/.test(roll.formula)), (rolls ?? []).map(roll => roll.formula).join(" | "));
      check("choice taken: the foe is blinded", await until(() => foe.statuses.has("blinded")), [...foe.statuses].join(","));
    }

    // 5. A vetoed result does not continue (checked on every roll above; temp HP must stay 0).
    check("vetoed bonus does not continue", !hero.system.attributes.hp.temp, hero.system.attributes.hp.temp);

    // 6–7. Midi: a hit reaction continues, and the pre-roll continuation fires under Midi too.
    await setEnabled(SMITE, false);
    await reset();
    await foe.update({ "system.attributes.hp.value": 30 });
    if (globalThis.MidiQOL?.completeActivityUse) {
      const workflow = await MidiQOL.completeActivityUse(attack, { midiOptions: {
        targetUuids: [foeToken.uuid],
        workflowOptions: { autoRollAttack: true, autoFastAttack: true, autoRollDamage: "always", fastForwardDamage: true }
      } }, { configure: false }, {});
      await wait(1500);
      const damaged = (workflow?.damageRolls ?? []).length > 0;
      check("Midi attack ran", !!workflow, workflow ? `attack ${workflow.attackTotal}, damage rolled ${damaged}` : "no workflow");
      // Midi rolls damage "always" here, hit or miss; the hit reaction is decided by this module (Midi's hit check is off).
      const prone = foe.statuses.has("prone");
      const expected = 5 + (damaged ? 2 : 0) + (prone ? 3 : 0);
      check("under Midi: the damage roll's «Затем» (+2) and, on a hit, prone → «Затем» (+3)", damaged && await until(() => hp() === expected),
        `HP ${hp()}, expected ${expected}, prone ${prone}`);
    } else {
      check("Midi QOL is active", false, "skipped the Midi checks");
    }

    // 8. A trigger continues: a short rest restores 1 HP and then turns the hero invisible.
    await reset();
    await hero.shortRest({ dialog: false, chat: false });
    check("short rest → restore 1 HP → «Затем» → invisible", await until(() => (hp() === 6) && hero.statuses.has("invisible")), `${hp()} ${[...hero.statuses].join(",")}`);

    // 9. Exactly once: nothing ran twice while we waited.
    await wait(1000);
    check("each continuation ran once", (hp() === 6) && !hero.system.attributes.hp.temp, `${hp()} temp ${hero.system.attributes.hp.temp}`);
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
  }
  return report;
})();
