// Live check of Plan 9 triggers. Run as the active GM on a scene with the canvas ready.
// Builds "BNA Live" actors, a region and a combat, fires turns, a region entry and exit and both rests,
// reads the results, deletes everything it made and returns [{name, pass, detail}].
(async () => {
  const SCOPE = "build-n-action";
  const api = game.modules.get(SCOPE).api;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (test, timeout = 4000) => {
    const started = performance.now();
    while ((performance.now() - started) < timeout) {
      if (await test()) return true;
      await wait(50);
    }
    return false;
  };
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const heal = (id, event, amount, data = {}, resource = "hp") => ({
    id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/regen.svg", description: "", enabled: true, sort: 0, flags: {},
    nodes: [
      { id: "ev", kind: "event", type: event, position: { x: 0, y: 0 }, data },
      { id: "res", kind: "result", type: "resource", position: { x: 324, y: 0 }, data: { action: "restore", resource, amount, who: "self", common } }
    ],
    edges: [{ id: "e1", source: "ev", sourcePin: "out", target: "res", targetPin: "in" }]
  });
  const since = Date.now();
  const cleanup = [];
  try {
    const scene = canvas.scene;
    const size = canvas.dimensions.size;
    const troll = await Actor.implementation.create({
      name: "BNA Live Troll", type: "npc", prototypeToken: { actorLink: true, disposition: -1 },
      system: { attributes: { hp: { value: 10, max: 80 } } },
      flags: { [SCOPE]: { blueprints: [
        heal("LiveRegenStart01", "turnStart", "10", { reach: { mode: "self" } }),
        heal("LiveRegenEnd0001", "turnEnd", "1", { reach: { mode: "self" } })
      ] } }
    });
    cleanup.push(() => troll.delete());
    const hero = await Actor.implementation.create({
      name: "BNA Live Hero", type: "character", prototypeToken: { actorLink: true, disposition: 1 },
      system: { attributes: { hp: { value: 5, max: 30 } } },
      flags: { [SCOPE]: { blueprints: [heal("LiveShortRest001", "shortRest", "3"), heal("LiveLongRest0001", "longRest", "4", {}, "tempHp")] } }
    });
    cleanup.push(() => hero.delete());
    const created = await scene.createEmbeddedDocuments("Token", [
      (await troll.getTokenDocument({ x: size * 2, y: size * 2 })).toObject(),
      (await hero.getTokenDocument({ x: size * 10, y: size * 2 })).toObject()
    ]);
    const trollToken = created.find(token => token.actorId === troll.id);
    const heroToken = created.find(token => token.actorId === hero.id);
    cleanup.unshift(() => scene.deleteEmbeddedDocuments("Token", created.map(token => token.id).filter(id => scene.tokens.has(id))));

    // Turns
    const combat = await Combat.implementation.create({ scene: scene.id, active: true });
    cleanup.unshift(() => combat.delete());
    await combat.createEmbeddedDocuments("Combatant", [
      { tokenId: trollToken.id, actorId: troll.id, initiative: 20 },
      { tokenId: heroToken.id, actorId: hero.id, initiative: 10 }
    ]);
    await combat.startCombat();
    check("turn start fires for the first combatant", await until(() => troll.system.attributes.hp.value === 20), troll.system.attributes.hp.value);
    await combat.nextTurn();
    check("turn end fires once when the turn passes", await until(() => troll.system.attributes.hp.value === 21), troll.system.attributes.hp.value);
    await combat.previousTurn();
    await wait(500);
    check("going back fires nothing", troll.system.attributes.hp.value === 21, troll.system.attributes.hp.value);
    await combat.nextTurn();
    await wait(500);
    check("the same turn does not fire twice", troll.system.attributes.hp.value === 21, troll.system.attributes.hp.value);

    // Region
    const [region] = await scene.createEmbeddedDocuments("Region", [{
      name: "BNA Live Cloud",
      shapes: [{ type: "rectangle", x: size * 6, y: size * 6, width: size * 3, height: size * 3, rotation: 0, hole: false }],
      flags: { [SCOPE]: { blueprints: [
        heal("LiveEnterHostil1", "regionEnter", "5", { tokens: "hostile" }),
        heal("LiveExitAny00001", "regionExit", "2", { tokens: "any" })
      ] } }
    }]);
    cleanup.unshift(() => scene.deleteEmbeddedDocuments("Region", [region.id]));
    check("the region gets the module's behavior", await until(() => [...region.behaviors].some(behavior => behavior.type === "build-n-action.blueprints")), [...region.behaviors].map(behavior => behavior.type).join(","));
    const trollBefore = troll.system.attributes.hp.value;
    await trollToken.update({ x: size * 7, y: size * 7 });
    check("a hostile token entering fires the region's blueprint", await until(() => troll.system.attributes.hp.value === trollBefore + 5, 6000), troll.system.attributes.hp.value);
    const heroBefore = hero.system.attributes.hp.value;
    await heroToken.update({ x: size * 7, y: size * 8 });
    await wait(1500);
    check("a friendly token does not pass the hostile filter", hero.system.attributes.hp.value === heroBefore, hero.system.attributes.hp.value);
    await trollToken.update({ x: size * 2, y: size * 2 });
    check("leaving fires the exit blueprint", await until(() => troll.system.attributes.hp.value === trollBefore + 7, 6000), troll.system.attributes.hp.value);
    await region.update({ [`flags.${SCOPE}.blueprints`]: [] });
    check("the behavior goes when no blueprint needs it", await until(() => ![...region.behaviors].some(behavior => behavior.type === "build-n-action.blueprints")), "");

    // Rests
    const beforeRest = hero.system.attributes.hp.value;
    await hero.shortRest({ dialog: false, chat: false });
    check("a short rest fires its blueprint", await until(() => hero.system.attributes.hp.value === beforeRest + 3), hero.system.attributes.hp.value);
    const shortAfter = hero.system.attributes.hp.value;
    await hero.update({ "system.attributes.hp.temp": 0 });
    await hero.longRest({ dialog: false, chat: false, newDay: false });
    check("a long rest fires its blueprint", await until(() => hero.system.attributes.hp.temp === 4, 6000), hero.system.attributes.hp.temp);
    check("and not the short-rest one", hero.system.attributes.hp.value === hero.system.attributes.hp.max, `${shortAfter} → ${hero.system.attributes.hp.value}`);

    // Test tab
    const simulated = api.blueprints.simulate(heal("LiveSimTurn00001", "turnStart", "10"), { document: troll, actorUuid: troll.uuid, event: "turnStart", pins: ["out"] });
    check("the Test tab runs a trigger event and explains it", simulated?.run.intents.length === 1 && simulated.notes.includes("trigger"), JSON.stringify(simulated?.notes));
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const undo of cleanup) {
      try {
        await undo();
      } catch (error) {
        console.warn("BNA Live cleanup", error);
      }
    }
    const ids = game.messages.filter(message => (message.timestamp >= since) && /BNA Live/.test([message.speaker?.alias, message.flavor, message.content].join(" "))).map(message => message.id);
    if (ids.length) await ChatMessage.implementation.deleteDocuments(ids);
  }
  return report;
})();
