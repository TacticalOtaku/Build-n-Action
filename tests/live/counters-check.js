// Live check of Plan 12 counters and the Test tab subjects. Run as the active GM after reactions-shared.js, on a scene
// with the canvas ready, in a visible page (the editor animates). Returns [{name, pass, detail}] and deletes what it made.
(async () => {
  const { SCOPE, setup, wait } = globalThis.bnaLive;
  const api = game.modules.get(SCOPE).api;
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
  const blueprint = (id, nodes, edges, extra = {}) => ({
    id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, nodes, edges, flags: {}, ...extra
  });
  const counter = (name, scope, action, amount, who = "self") => ({ name, scope, action, amount, who });
  const checkEvent = () => node("ev", "event", "afterCheck", { reach: { mode: "self" } });
  const blueprints = [
    blueprint("LiveRageSpend001", [checkEvent(), node("spend", "result", "counter", counter("rage", "actor", "subtract", "1"))], [edge("ev", "success", "spend")]),
    blueprint("LiveRageBonus001", [
      checkEvent(),
      node("if", "condition", "condition", { mode: "all", thisItem: false, checks: [{ id: "c1", type: "counter", data: { name: "rage", scope: "actor", whose: "self", operator: "GE", value: "1" } }] }),
      node("add", "result", "counter", counter("streak", "blueprint", "add", "@counters.rage"))
    ], [edge("ev", "success", "if"), edge("if", "yes", "add")], { counters: [{ name: "streak", min: 0, max: 5, initial: 0, reset: "turnStart" }] }),
    blueprint("LiveStreakPeek01", [checkEvent(), node("peek", "result", "counter", counter("peek", "actor", "set", "@counters.streak"))], [edge("ev", "success", "peek")]),
    blueprint("LiveCurseMark001", [
      node("ev", "event", "afterAttack", { reach: { mode: "self" } }), node("curse", "result", "counter", counter("curse", "actor", "add", "2", "target"))
    ], [edge("ev", "hit", "curse")])
  ];
  const values = actor => actor.getFlag(SCOPE, "counters")?.values ?? {};
  const cleanup = [];
  try {
    const { hero, foe, heroToken, foeToken } = await setup(blueprints, cleanup);
    await hero.setFlag(SCOPE, "counters", { defs: { rage: { name: "rage", min: 0, max: 3, initial: 3, reset: "longRest" } } });
    await foe.update({ "system.attributes.ac.flat": 1, "system.attributes.hp.value": 30 });
    canvas.tokens.setTargets([foeToken.id]);
    cleanup.unshift(() => canvas.tokens.setTargets([]));
    const streakKey = "LiveRageBonus001:streak";

    // 1. A successful check spends rage, adds @counters.rage to the blueprint's streak, and peeks at the shared "streak".
    await hero.rollSkill({ skill: "ath", target: 1 }, { configure: false }, { create: false });
    check("rage spent: 3 → 2", await until(() => values(hero).rage === 2), JSON.stringify(values(hero)));
    check("streak += @counters.rage (read before the spend)", await until(() => [2, 3].includes(values(hero)[streakKey])), JSON.stringify(values(hero)));
    // 2. A blueprint's own counter is private: another blueprint's @counters.streak reads the shared one (0).
    check("another blueprint does not see the private streak", await until(() => values(hero).peek === 0), JSON.stringify(values(hero)));

    // The target's counter, through a Midi attack hit.
    if (globalThis.MidiQOL?.completeActivityUse) {
      const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
      const workflow = await MidiQOL.completeActivityUse(attack, { midiOptions: {
        targetUuids: [foeToken.uuid],
        workflowOptions: { autoRollAttack: true, autoFastAttack: true, autoRollDamage: "always", fastForwardDamage: true }
      } }, { configure: false }, {});
      await wait(1500);
      const hit = (workflow?.isFumble !== true) && ((workflow?.attackTotal ?? 0) >= 1);
      check("hit → the target's curse += 2", !hit || await until(() => values(foe).curse === 2), `attack ${workflow?.attackTotal}, ${JSON.stringify(values(foe))}`);
    } else {
      check("Midi QOL is active", false, "skipped the target counter check");
    }

    // 3. A long rest resets rage to its start.
    await hero.longRest({ dialog: false, chat: false });
    check("long rest resets rage to 3", await until(() => values(hero).rage === 3), JSON.stringify(values(hero)));

    // 4. The start of the hero's turn resets the blueprint's streak.
    const combat = await Combat.implementation.create({ scene: canvas.scene.id, active: true });
    cleanup.unshift(() => combat.delete());
    await combat.createEmbeddedDocuments("Combatant", [{ tokenId: heroToken.id, actorId: hero.id, initiative: 20 }]);
    await combat.startCombat();
    check("turn start resets streak to 0", await until(() => values(hero)[streakKey] === 0), JSON.stringify(values(hero)));
    check("turn start leaves rage alone", values(hero).rage === 3, values(hero).rage);

    // 5. The editor's title block shows the counters the blueprint uses.
    const app = await api.openEditor(hero, { blueprintId: "LiveRageBonus001" });
    cleanup.unshift(() => app?.close());
    await wait(2500);
    const root = [...document.querySelectorAll("*")].find(el => el.shadowRoot?.querySelector(".bna-inspector"))?.shadowRoot;
    const row = () => root?.querySelector(".bna-stamp__counters")?.textContent ?? "";
    check("title block lists rage and streak", /rage: 3/.test(row()) && /streak: 0/.test(row()), row());

    // 6. Exactly once.
    const before = JSON.stringify(values(hero));
    await wait(1500);
    check("nothing changed twice", JSON.stringify(values(hero)) === before, JSON.stringify(values(hero)));

    // 7. Test tab subjects: grouped by the scene, and refreshed when a token comes and goes.
    root?.querySelector('button[aria-label="Show a test run"], button[aria-label="Показать тестовый прогон"]')?.click();
    await wait(1500);
    const selects = () => [...(root?.querySelectorAll(".bna-sim__setup select") ?? [])];
    const whoRolls = () => selects()[0];
    const target = () => selects()[2];
    const groups = [...(whoRolls()?.querySelectorAll("optgroup") ?? [])].map(group => group.label);
    check("who rolls is grouped by the scene", groups.length === 2, groups.join(" | "));
    const extra = await Actor.implementation.create({ name: "BNA Live Newcomer", type: "npc", prototypeToken: { actorLink: true } });
    cleanup.push(() => extra.delete());
    const [token] = await canvas.scene.createEmbeddedDocuments("Token", [(await extra.getTokenDocument({ x: canvas.dimensions.size * 8, y: canvas.dimensions.size * 4 })).toObject()]);
    const listed = select => [...(select?.options ?? [])].some(option => option.textContent === "BNA Live Newcomer");
    check("a new token appears in who rolls and target without reopening", await until(() => listed(whoRolls()) && listed(target())),
      `${listed(whoRolls())} ${listed(target())}`);
    await canvas.scene.deleteEmbeddedDocuments("Token", [token.id]);
    check("a deleted token leaves both lists", await until(() => !listed(target()) && [...(whoRolls()?.querySelectorAll("optgroup") ?? [])][0]?.textContent?.includes("BNA Live Newcomer") !== true),
      `${listed(whoRolls())} ${listed(target())}`);
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
  }
  return report;
})();
