// Live check of Plan 11 demanded saves rolled by the GM (no player owns the savers). Run as the active GM after
// reactions-shared.js, on a scene with the canvas ready. Returns [{name, pass, detail}] and deletes what it made.
(async () => {
  const { SCOPE, setup, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const until = async (test, timeout = 6000) => {
    const started = performance.now();
    while ((performance.now() - started) < timeout) {
      if (await test()) return true;
      await wait(100);
    }
    return false;
  };
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: false };
  const node = (id, kind, type, data = {}) => ({ id, kind, type, position: { x: 0, y: 0 }, data: (kind === "result") ? { ...data, common } : data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const blueprint = (id, nodes, edges) => ({
    id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, nodes, edges, flags: {}
  });
  const save = (extra = {}) => ({ ability: "con", dcMode: "formula", dc: "30", who: "target", range: "10", disposition: "-1", includeSelf: false, advantage: "normal", ...extra });
  const status = (status, who = "target") => ({ source: "status", status, who });
  const heal = amount => ({ action: "restore", resource: "hp", amount, who: "self" });
  const self = { reach: { mode: "self" } };
  const blueprints = [
    blueprint("LiveSaveCheck001", [
      node("ev", "event", "afterCheck", self), node("save", "result", "demandSave", save({ who: "aura", range: "30" })),
      node("poison", "result", "applyEffect", status("poisoned")), node("heal", "result", "resource", heal("1"))
    ], [edge("ev", "success", "save"), edge("save", "failed", "poison"), edge("save", "succeeded", "heal")]),
    blueprint("LiveSaveEasy0001", [
      node("ev", "event", "afterCheck", self), node("save", "result", "demandSave", save({ dc: "1", who: "aura", range: "30" })), node("heal", "result", "resource", heal("2"))
    ], [edge("ev", "success", "save"), edge("save", "succeeded", "heal")]),
    blueprint("LiveSaveRest0001", [
      node("ev", "event", "shortRest", {}),
      node("save", "result", "demandSave", save({ ability: "wis", who: "aura", range: "30", disposition: "2" })),
      node("fear", "result", "applyEffect", status("frightened"))
    ], [edge("ev", "out", "save"), edge("save", "failed", "fear")]),
    blueprint("LiveSaveHit00001", [
      node("ev", "event", "afterAttack", self), node("save", "result", "demandSave", save()), node("hold", "result", "applyEffect", status("restrained"))
    ], [edge("ev", "hit", "save"), edge("save", "failed", "hold")])
  ];

  const since = Date.now();
  const saveCards = actor => game.messages.filter(message => (message.timestamp >= since)
    && (message.speaker?.actor === actor.id) && (message.getFlag("dnd5e", "roll.type") === "save")).length;
  const cleanup = [];
  try {
    const { hero, foe, foeToken } = await setup(blueprints, cleanup);
    // Only the check blueprints take part in the first checks.
    const enable = async ids => hero.setFlag(SCOPE, "blueprints", hero.getFlag(SCOPE, "blueprints").map(entry => ({ ...entry, enabled: ids.includes(entry.id) })));
    await foe.update({ "system.attributes.ac.flat": 1, "system.attributes.hp.value": 30 });
    canvas.tokens.setTargets([foeToken.id]);
    cleanup.unshift(() => canvas.tokens.setTargets([]));
    const hp = () => hero.system.attributes.hp.value;

    // 1. A check succeeds; the GM rolls both saves for the NPC (an enemy in my aura: checks have no target) without a dialog.
    await enable(["LiveSaveCheck001", "LiveSaveEasy0001"]);
    await hero.rollSkill({ skill: "ath", target: 1 }, { configure: false }, { create: false });
    check("DC 30 save fails → the foe is poisoned", await until(() => foe.statuses.has("poisoned")), [...foe.statuses].join(","));
    check("DC 1 save succeeds → I restore 2 HP", await until(() => hp() === 7), hp());
    check("two save cards in chat for the foe", await until(() => saveCards(foe) === 2), saveCards(foe));

    // 2. Exactly once.
    await wait(2000);
    check("nothing ran twice", (hp() === 7) && (saveCards(foe) === 2), `HP ${hp()}, cards ${saveCards(foe)}`);

    // 3. An aura on a rest: the foe in range saves, I do not.
    await enable(["LiveSaveRest0001"]);
    await hero.shortRest({ dialog: false, chat: false });
    check("rest → aura save fails → the foe is frightened", await until(() => foe.statuses.has("frightened")), [...foe.statuses].join(","));
    check("the aura left me out", saveCards(hero) === 0, saveCards(hero));

    // 4. Midi: an attack hit demands a save.
    await enable(["LiveSaveHit00001"]);
    if (globalThis.MidiQOL?.completeActivityUse) {
      const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
      const workflow = await MidiQOL.completeActivityUse(attack, { midiOptions: {
        targetUuids: [foeToken.uuid],
        workflowOptions: { autoRollAttack: true, autoFastAttack: true, autoRollDamage: "always", fastForwardDamage: true }
      } }, { configure: false }, {});
      await wait(1500);
      const hit = (workflow?.isFumble !== true) && ((workflow?.attackTotal ?? 0) >= 1);
      check("Midi hit → save fails → the foe is restrained", !hit || await until(() => foe.statuses.has("restrained")),
        `attack ${workflow?.attackTotal}, ${[...foe.statuses].join(",")}`);
    } else {
      check("Midi QOL is active", false, "skipped the Midi check");
    }
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
  }
  return report;
})();
