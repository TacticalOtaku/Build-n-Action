// Live check of the 2.3.0 fixes that run on one client. Run as GM after reactions-shared.js, while the pilot is the
// active GM or alone: a cancelled roll spends neither a limited bonus nor a rider, and a player's script in an aura
// does not run on the GM's roll while the GM's own one does.
(async () => {
  const { SCOPE, fromPacks, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const cleanup = [];
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const node = (id, kind, type, data = {}) => ({ id, kind, type, position: { x: 0, y: 0 }, data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const blueprint = (id, nodes, edges) => ({
    id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, nodes, edges, flags: {}
  });
  const aura = { mode: "aura", range: "30", disposition: "2", includeSelf: false, blockers: [], require: { sight: false, move: false, sound: false, light: false } };
  const scripted = (id, flag, formula) => blueprint(id, [
    node("ev", "event", "attackRoll", { reach: aura }),
    node("if", "condition", "condition", { mode: "all", thisItem: false, checks: [{ id: "s1", type: "customScripts", data: { script: `globalThis.${flag} = true; return true;` } }] }),
    node("bonus", "result", "rollBonus", { formula, damageTypes: [], common })
  ], [edge("ev", "out", "if"), edge("if", "yes", "bonus")]);
  const formulaOf = result => (Array.isArray(result) ? result[0] : result)?.formula ?? "";

  // Opens the roll dialog, closes it (a cancelled roll) and returns what the roll gave.
  async function cancelledRoll(activity) {
    const before = new Set(foundry.applications.instances.keys());
    const pending = activity.rollAttack({}, { configure: true }, { create: false });
    let dialog = null;
    for (let i = 0; (i < 40) && !dialog; i++) {
      await wait(100);
      dialog = [...foundry.applications.instances.values()].find(app => !before.has(app.id) && /RollConfiguration/.test(app.constructor.name));
    }
    await dialog?.close();
    return { dialog: dialog?.constructor.name ?? null, rolls: await pending };
  }

  try {
    const size = canvas.dimensions.size;
    const sword = await fromPacks("Longsword", "weapon");
    sword.system.equipped = true;
    const limited = blueprint("LiveLimited00001", [
      node("ev", "event", "attackRoll", { reach: { mode: "self" } }),
      node("bonus", "result", "rollBonus", { formula: "7", damageTypes: [], common: { ...common, limit: "longRest" } })
    ], [edge("ev", "out", "bonus")]);
    const rider = {
      id: "LiveRider0000001", created: Date.now(), effect: { type: "rollBonus", data: { formula: "9", damageTypes: [] } },
      scope: "nextRoll", roll: "attackRoll", activation: null, uses: 1, until: null,
      source: { name: "BNA Live rider", origin: null, blueprintId: "LiveRider0000001", nodeId: "effect" }
    };
    const hero = await Actor.implementation.create({
      name: "BNA Live Hero", type: "character", prototypeToken: { disposition: 1, actorLink: true }, items: [sword],
      flags: { [SCOPE]: { blueprints: [limited], riders: { [rider.id]: rider } } }
    });
    cleanup.push(() => hero.delete());
    const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];

    // 1. A cancelled roll spends nothing.
    const cancelled = await cancelledRoll(attack);
    await wait(800);
    check("the roll dialog opened and was closed", cancelled.dialog && !(cancelled.rolls?.length), `${cancelled.dialog} → ${cancelled.rolls?.length ?? "none"}`);
    check("a cancelled roll keeps the limited bonus", !hero.getFlag(SCOPE, "usage"), JSON.stringify(hero.getFlag(SCOPE, "usage") ?? {}));
    check("a cancelled roll keeps the rider", hero.getFlag(SCOPE, `riders.${rider.id}`)?.uses === 1, JSON.stringify(hero.getFlag(SCOPE, "riders")));
    const first = formulaOf(await attack.rollAttack({}, { configure: false }, { create: false }));
    await wait(1000);
    check("the roll that goes ahead gets both bonuses", first.includes("7") && first.includes("9"), first);
    check("…and spends them", !!hero.getFlag(SCOPE, "usage") && !Object.keys(hero.getFlag(SCOPE, "riders") ?? {}).length,
      `${JSON.stringify(hero.getFlag(SCOPE, "usage"))} ${JSON.stringify(hero.getFlag(SCOPE, "riders"))}`);
    const second = formulaOf(await attack.rollAttack({}, { configure: false }, { create: false }));
    check("the next roll gets neither", !second.includes("7") && !second.includes("9"), second);

    // 2. Scripts in auras: a player's does not run on the GM's roll, the GM's own does.
    const player = game.users.find(user => !user.isGM);
    const playerAlly = await Actor.implementation.create({
      name: "BNA Live Player Ally", type: "character", ownership: { [player.id]: 3 },
      flags: { [SCOPE]: { blueprints: [scripted("LivePlayerScr001", "bnaPlayerScriptRan", "11")] } }
    });
    cleanup.push(() => playerAlly.delete());
    const gmAlly = await Actor.implementation.create({
      name: "BNA Live GM Ally", type: "npc",
      flags: { [SCOPE]: { blueprints: [scripted("LiveGmScript0001", "bnaGmScriptRan", "13")] } }
    });
    cleanup.push(() => gmAlly.delete());
    const foe = await Actor.implementation.create({ name: "BNA Live Foe", type: "npc", items: [sword], prototypeToken: { disposition: -1, actorLink: true } });
    cleanup.push(() => foe.delete());
    const tokens = await canvas.scene.createEmbeddedDocuments("Token", [
      (await playerAlly.getTokenDocument({ x: size * 4, y: size * 4 })).toObject(),
      (await gmAlly.getTokenDocument({ x: size * 4, y: size * 6 })).toObject(),
      (await foe.getTokenDocument({ x: size * 5, y: size * 5 })).toObject()
    ]);
    cleanup.unshift(() => canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(token => token.id).filter(id => canvas.scene.tokens.has(id))));
    await wait(500);
    globalThis.bnaPlayerScriptRan = false;
    globalThis.bnaGmScriptRan = false;
    const foeAttack = foe.items.getName("Longsword").system.activities.getByType("attack")[0];
    const foeRoll = formulaOf(await foeAttack.rollAttack({}, { configure: false }, { create: false }));
    check("the GM's aura script runs on the GM's roll", globalThis.bnaGmScriptRan && foeRoll.includes("13"), foeRoll);
    check("a player's aura script does not run on the GM's roll", !globalThis.bnaPlayerScriptRan && !foeRoll.includes("11"), foeRoll);
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    delete globalThis.bnaPlayerScriptRan;
    delete globalThis.bnaGmScriptRan;
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
  }
  return report;
})();
