// Live check of situations the other scripts do not reach. Run as the active GM after reactions-shared.js, on a scene
// with the canvas ready and no combat running. Returns [{name, pass, detail}] and deletes what it made.
//   - "once per turn / round" limits in a real combat, across turn and round changes;
//   - an unlinked token: the limit is kept on the token's actor, not the base actor, and a short rest resets it;
//   - a broken formula or a throwing script in one blueprint does not stop the others or the roll;
//   - an actor without a token on the scene rolls while auras are around;
//   - "Target hit points" in an after-damage reaction through Midi QOL.
(async () => {
  const { SCOPE, on, setup, fromPacks, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const cleanup = [];
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: false };
  const attackOf = actor => actor.items.getName("Longsword").system.activities.getByType("attack")[0];
  const attack = async actor => (await attackOf(actor).rollAttack({}, { configure: false }, { create: false }))?.[0]?.formula ?? "";
  const damage = async actor => (await attackOf(actor).rollDamage({}, { configure: false }, { create: false }))?.[0]?.formula ?? "";
  const has = (formula, value) => new RegExp(`\\+ ${value}(\\D|$)`).test(formula);
  try {
    if (game.combat) throw new Error("End the running combat first");
    const { hero, foe, heroToken, foeToken } = await setup([
      on("LiveEdgeTurn0001", "attackRoll", "out", "rollBonus", { formula: "13", damageTypes: [] }, { limit: "turn" }),
      on("LiveEdgeRound001", "attackRoll", "out", "rollBonus", { formula: "14", damageTypes: [] }, { limit: "round" }),
      on("LiveEdgeBroken01", "attackRoll", "out", "rollBonus", { formula: "2d +", damageTypes: [] }),
      on("LiveEdgeFine0001", "attackRoll", "out", "rollBonus", { formula: "19", damageTypes: [] }),
      {
        ...on("LiveEdgeScript01", "attackRoll", "out", "rollBonus", { formula: "23", damageTypes: [] }),
        nodes: [
          { id: "ev", kind: "event", type: "attackRoll", position: { x: 0, y: 0 }, data: { reach: { mode: "self" } } },
          { id: "if", kind: "condition", type: "condition", position: { x: 0, y: 0 }, data: { mode: "all", checks: [{ id: "c", type: "customScripts", data: { script: "throw new Error('BNA Live boom');" } }] } },
          { id: "res", kind: "result", type: "rollBonus", position: { x: 0, y: 0 }, data: { formula: "23", damageTypes: [], common } }
        ],
        edges: [
          { id: "ev-out-if", source: "ev", sourcePin: "out", target: "if", targetPin: "in" },
          { id: "if-yes-res", source: "if", sourcePin: "yes", target: "res", targetPin: "in" }
        ]
      },
      {
        ...on("LiveEdgeTgtHp001", "afterDamage", "out", "applyEffect", { source: "status", status: "frightened", who: "target" }),
        nodes: [
          { id: "ev", kind: "event", type: "afterDamage", position: { x: 0, y: 0 }, data: { reach: { mode: "self" } } },
          { id: "if", kind: "condition", type: "condition", position: { x: 0, y: 0 }, data: { mode: "all", checks: [{ id: "c", type: "targetHealthPercentages", data: { value: 50, type: "atMost" } }] } },
          { id: "res", kind: "result", type: "applyEffect", position: { x: 0, y: 0 }, data: { source: "status", status: "frightened", who: "target", common } }
        ],
        edges: [
          { id: "ev-dealt-if", source: "ev", sourcePin: "dealt", target: "if", targetPin: "in" },
          { id: "if-yes-res", source: "if", sourcePin: "yes", target: "res", targetPin: "in" }
        ]
      },
      {
        ...on("LiveEdgeAura0001", "attackRoll", "out", "rollBonus", { formula: "31", damageTypes: [] }),
        nodes: [
          { id: "ev", kind: "event", type: "attackRoll", position: { x: 0, y: 0 }, data: { reach: { mode: "aura", range: "30", disposition: "1", includeSelf: false, blockers: [], require: { sight: true, move: false, sound: false, light: false } } } },
          { id: "res", kind: "result", type: "rollBonus", position: { x: 0, y: 0 }, data: { formula: "31", damageTypes: [], common } }
        ]
      }
    ], cleanup);
    canvas.tokens.setTargets([foeToken.id]);

    // A broken formula and a throwing script: the roll goes on with the other bonuses.
    const first = await attack(hero);
    check("roll made despite a broken formula", !!first, first);
    check("other bonuses still apply", has(first, 19), first);
    check("a throwing script fails its condition", !has(first, 23), first);

    // Limits in a real combat.
    const combat = await Combat.implementation.create({ scene: canvas.scene.id, active: true });
    cleanup.unshift(() => game.combats.has(combat.id) ? combat.delete() : null);
    await combat.createEmbeddedDocuments("Combatant", [
      { tokenId: heroToken.id, sceneId: canvas.scene.id, actorId: hero.id, initiative: 20 },
      { tokenId: foeToken.id, sceneId: canvas.scene.id, actorId: foe.id, initiative: 10 }
    ]);
    await combat.startCombat();
    await wait(300);
    const t1 = await attack(hero); await wait(400);
    const t2 = await attack(hero); await wait(400);
    check("turn limit: first roll of the turn", has(t1, 13) && has(t1, 14), t1);
    check("turn limit: second roll in the same turn", !has(t2, 13) && !has(t2, 14), t2);
    await combat.nextTurn(); await wait(400);
    const t3 = await attack(hero); await wait(400);
    check("turn limit: available again next turn, round limit still spent", has(t3, 13) && !has(t3, 14), t3);
    await combat.nextRound(); await wait(400);
    const t4 = await attack(hero); await wait(400);
    check("round limit: available again next round", has(t4, 14), t4);

    // An unlinked token: its own actor keeps the limit; the base actor stays clean; a short rest resets it.
    const sword = await fromPacks("Longsword", "weapon");
    sword.system.equipped = true;
    const minion = await Actor.implementation.create({
      name: "BNA Live Minion", type: "npc", prototypeToken: { disposition: -1, actorLink: false }, items: [sword],
      flags: { [SCOPE]: { blueprints: [on("LiveEdgeMinion01", "damageRoll", "out", "rollBonus", { formula: "17", damageTypes: [] }, { limit: "shortRest" })] } }
    });
    cleanup.push(() => minion.delete());
    const size = canvas.dimensions.size;
    const [minionToken] = await canvas.scene.createEmbeddedDocuments("Token", [(await minion.getTokenDocument({ x: size * 7, y: size * 4 })).toObject()]);
    cleanup.unshift(() => canvas.scene.tokens.has(minionToken.id) ? canvas.scene.deleteEmbeddedDocuments("Token", [minionToken.id]) : null);
    await wait(400);
    const synthetic = minionToken.actor;
    const m1 = await damage(synthetic); await wait(400);
    const m2 = await damage(synthetic); await wait(400);
    check("unlinked token: limit applies once", has(m1, 17) && !has(m2, 17), `${m1} | ${m2}`);
    check("unlinked token: the base actor holds no usage", !minion.getFlag(SCOPE, "usage"), JSON.stringify(minion.getFlag(SCOPE, "usage") ?? null));
    await synthetic.shortRest({ dialog: false, chat: false }); await wait(600);
    const m3 = await damage(synthetic);
    check("unlinked token: a short rest resets the limit", has(m3, 17), m3);

    // An actor without a token on the scene rolls while the hero's aura is around.
    const loner = await Actor.implementation.create({
      name: "BNA Live Loner", type: "character", items: [sword],
      flags: { [SCOPE]: { blueprints: [on("LiveEdgeLoner001", "attackRoll", "out", "rollBonus", { formula: "29", damageTypes: [] })] } }
    });
    cleanup.push(() => loner.delete());
    const lone = await attack(loner);
    check("an actor without a token rolls with its own blueprint", has(lone, 29) && !has(lone, 31), lone);

    // "Target hit points" after damage through Midi. The foe starts at 10/30, so whether or not Midi applies the
    // damage (its "Auto apply damage" setting) it is at most 50% when the reaction checks.
    if (globalThis.MidiQOL?.completeActivityUse) {
      await combat.delete();
      await foe.update({ "system.attributes.hp.value": 10 });
      const forced = { workflowOptions: { autoRollAttack: true, autoFastAttack: true, autoRollDamage: "always", fastForwardDamage: true } };
      const workflow = await MidiQOL.completeActivityUse(attackOf(hero), { midiOptions: { targetUuids: [foeToken.uuid], ...forced } }, { configure: false }, {});
      await wait(1500);
      const damaged = (workflow?.damageList ?? []).length > 0;
      const hp = foe.system.attributes.hp;
      check("target hit points after damage (Midi)", damaged && foe.statuses.has("frightened"),
        `HP ${hp.value}/${hp.max}, damage rolled ${damaged}, statuses ${[...foe.statuses].join(",")}`);
    }
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
