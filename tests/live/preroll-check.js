// Live parity check for the Build-n-Action pre-roll runtime (Plan 4). Run as GM in a dnd5e 5.3.3
// world with the module enabled; it creates "BNA Live" documents, rolls without chat messages,
// deletes everything it made and returns [{name, pass, detail}].
(async () => {
  const SCOPE = "build-n-action";
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const cleanup = [];

  async function fromPacks(name, type) {
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const index = await pack.getIndex({ fields: ["type"] });
      const entry = index.find(row => (row.name === name) && (!type || (row.type === type)));
      if (entry) return (await pack.getDocument(entry._id)).toObject();
    }
    throw new Error(`No compendium item "${name}"`);
  }

  const legacy = (id, type, bonuses, extra = {}) => ({
    id, type, name: `BNA Live ${id}`, enabled: true, bonuses, filters: {}, aura: { enabled: false }, ...extra
  });
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const node = (id, kind, type, data = {}) => ({ id, kind, type, position: { x: 0, y: 0 }, data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const blueprint = (id, name, nodes, edges, extra = {}) => ({
    id, schemaVersion: 2, name, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, nodes, edges, flags: {}, ...extra
  });
  const bonusOn = (id, event, formula, reach, extra = {}) => blueprint(id, `BNA Live ${id}`, [
    node("ev", "event", event, { reach }),
    node("bonus", "result", "rollBonus", { formula, damageTypes: [], common })
  ], [edge("ev", "out", "bonus")], extra);
  const firstRoll = result => (Array.isArray(result) ? result[0] : result);

  try {
    const [sword, dagger, flame, fighter] = await Promise.all([
      fromPacks("Longsword", "weapon"), fromPacks("Dagger", "weapon"), fromPacks("Sacred Flame", "spell"), fromPacks("Fighter", "class")
    ]);
    sword.flags = { [SCOPE]: { bonuses: [
      legacy("LiveAttack000001", "attack", { bonus: "1d4", criticalRange: "1", fumbleRange: "" }),
      legacy("LiveDamage000001", "damage", { bonus: "2", damageType: ["fire"] })
    ] } };
    dagger.flags = { [SCOPE]: { bonuses: [legacy("LiveExclusive001", "attack", { bonus: "97" }, { exclusive: true })] } };
    flame.flags = { [SCOPE]: { bonuses: [legacy("LiveSaveDc000001", "save", { bonus: "2" })] } };
    fighter.system.levels = 1;
    // Unequipped weapons suppress their bonuses (as in v1), so the sword is equipped.
    sword.system.equipped = true;

    const sender = blueprint("LiveSender000001", "BNA Live sender", [
      node("ev", "event", "damageRoll", { reach: { mode: "self" } }),
      node("if", "condition", "condition", { mode: "all", checks: [{ id: "c1", type: "itemTypes", data: { values: ["weapon"] } }] }),
      node("send", "result", "signal", { name: "live-ping", scope: "actor", common })
    ], [edge("ev", "out", "if"), edge("if", "yes", "send")]);
    const receiver = blueprint("LiveReceiver0001", "BNA Live receiver", [
      node("sig", "event", "signal", { name: "live-ping" }),
      node("bonus", "result", "rollBonus", { formula: "33", damageTypes: [], common })
    ], [edge("sig", "out", "bonus")]);

    const hero = await Actor.implementation.create({
      name: "BNA Live Hero", type: "character",
      prototypeToken: { disposition: 1, actorLink: true },
      flags: { [SCOPE]: {
        bonuses: [
          legacy("LiveThrow0000001", "throw", { bonus: "41" }, { filters: { throwTypes: ["dex"] } }),
          legacy("LiveTest00000001", "test", { bonus: "61" }, { filters: { skillIds: ["ste"] } }),
          legacy("LiveHitDie000001", "hitdie", { bonus: "", modifiers: { minimum: { enabled: true, value: "", maximize: true } } })
        ],
        blueprints: [sender, receiver, bonusOn("LiveDisabled0001", "attackRoll", "100", { mode: "self" }, { enabled: false })]
      } },
      items: [sword, dagger, flame, fighter]
    });
    cleanup.push(() => hero.delete());

    const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const attackRoll = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
    check("v1 attack bonus", attackRoll?.formula.includes("1d4"), attackRoll?.formula);
    check("v1 critical range", attackRoll?.options.criticalSuccess === 19, attackRoll?.options.criticalSuccess);
    check("disabled blueprint does nothing", !attackRoll?.formula.includes("100"), attackRoll?.formula);
    check("exclusive bonus stays on its item", !attackRoll?.formula.includes("97"), attackRoll?.formula);

    const damage = await attack.rollDamage({}, { configure: false }, { create: false }) ?? [];
    check("v1 typed damage bonus", damage.some(roll => (roll.options.type === "fire") && roll.formula.includes("2")), damage.map(roll => roll.formula).join(" | "));
    check("signal chain adds its bonus", damage.some(roll => roll.formula.includes("33")), damage.map(roll => roll.formula).join(" | "));

    const save = firstRoll(await hero.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false }));
    check("v1 saving throw bonus", save?.formula.includes("41"), save?.formula);
    const wisSave = firstRoll(await hero.rollSavingThrow({ ability: "wis" }, { configure: false }, { create: false }));
    check("saving throw filter", !wisSave?.formula.includes("41"), wisSave?.formula);

    const skill = firstRoll(await hero.rollSkill({ skill: "ste" }, { configure: false }, { create: false }));
    check("v1 skill bonus", skill?.formula.includes("61"), skill?.formula);

    const hitDie = firstRoll(await hero.rollHitDie({ denomination: "d10", modifyHitDice: false, modifyHitPoints: false }, { configure: false }, { create: false }));
    check("v1 hit die modifiers", hitDie?.formula.includes("min10"), hitDie?.formula);

    // The hook receives the activity used for this activation; the DC the chat card uses is read
    // when the usage message is prepared.
    const flameItem = hero.items.getName("Sacred Flame");
    const before = flameItem.system.activities.getByType("save")[0].save.dc.value;
    const seen = [];
    const hook = Hooks.on("dnd5e.preCreateUsageMessage", activity => seen.push(activity.save.dc.value));
    for (let use = 0; use < 2; use++) {
      await flameItem.system.activities.getByType("save")[0].use({ consume: false, subsequentActions: false }, { configure: false }, { create: false });
    }
    Hooks.off("dnd5e.preCreateUsageMessage", hook);
    check("v1 save DC bonus, not stacked", (seen.length === 2) && seen.every(dc => dc === before + 2), `${before} → ${seen.join(", ")}`);

    const templateData = {};
    const flameActivity = flameItem.system.activities.getByType("save")[0];
    Hooks.call("dnd5e.preCreateActivityTemplate", flameActivity, templateData);
    check("no template copy without template blueprints", !templateData.flags, JSON.stringify(templateData.flags ?? null));
    await BuildNAction.blueprints.save(flameItem, bonusOn("LiveTemplCopy001", "damageRoll", "5", { mode: "template", disposition: "2", includeSelf: true }));
    Hooks.call("dnd5e.preCreateActivityTemplate", flameActivity, templateData);
    const copied = templateData.flags?.[SCOPE];
    check("template copies template blueprints", (copied?.blueprints?.length === 1) && (copied.templateDisposition === 1), JSON.stringify(copied ?? null));

    const scene = canvas.ready ? canvas.scene : null;
    if (!scene) {
      check("canvas checks", true, "skipped: no active scene");
    } else {
      const size = canvas.dimensions.size;
      const ally = await Actor.implementation.create({
        name: "BNA Live Ally", type: "npc", prototypeToken: { disposition: 1 },
        flags: { [SCOPE]: { blueprints: [bonusOn("LiveAura00000001", "attackRoll", "71", {
          mode: "aura", range: "30", disposition: "1", includeSelf: false, blockers: [], require: { sight: false, move: false, sound: false, light: false }
        })] } }
      });
      cleanup.push(() => ally.delete());
      // Created tokens do not always come back in the order given, so they are matched by actor.
      const created = await scene.createEmbeddedDocuments("Token", [
        (await hero.getTokenDocument({ x: size * 4, y: size * 4 })).toObject(),
        (await ally.getTokenDocument({ x: size * 5, y: size * 4 })).toObject()
      ]);
      const heroToken = created.find(token => token.actorId === hero.id);
      const allyToken = created.find(token => token.actorId === ally.id);
      cleanup.unshift(() => scene.deleteEmbeddedDocuments("Token", [heroToken.id, allyToken.id]));
      await wait(500);
      const near = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
      check("ally aura within range", near?.formula.includes("71"), near?.formula);
      await allyToken.update({ x: size * 20 }, { animate: false });
      await wait(500);
      const far = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
      check("ally aura out of range", !far?.formula.includes("71"), far?.formula);

      const [template] = await scene.createEmbeddedDocuments("MeasuredTemplate", [{
        t: "circle", x: size * 4.5, y: size * 4.5, distance: 10,
        flags: { [SCOPE]: { blueprints: [bonusOn("LiveTemplate0001", "attackRoll", "81", { mode: "template", disposition: "2", includeSelf: true })], templateDisposition: 1 } }
      }]);
      cleanup.unshift(() => scene.deleteEmbeddedDocuments("MeasuredTemplate", [template.id]));
      await wait(500);
      const inside = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
      check("template bonus", inside?.formula.includes("81"), inside?.formula);

      try {
        const [region] = await scene.createEmbeddedDocuments("Region", [{
          name: "BNA Live Region",
          shapes: [{ type: "rectangle", x: size * 3, y: size * 3, width: size * 3, height: size * 3, rotation: 0, hole: false }],
          flags: { [SCOPE]: { blueprints: [bonusOn("LiveRegion000001", "attackRoll", "91", { mode: "region" })] } }
        }]);
        cleanup.unshift(() => scene.deleteEmbeddedDocuments("Region", [region.id]));
        await wait(500);
        const inRegion = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
        check("region bonus", inRegion?.formula.includes("91"), inRegion?.formula);
      } catch (error) {
        check("region bonus", false, `could not create a region: ${error.message}`);
      }
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
