// Helpers for the Plan 5 live reaction checks. Defines globalThis.bnaLive.
(() => {
  const SCOPE = "build-n-action";
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const node = (id, kind, type, data = {}) => ({ id, kind, type, position: { x: 0, y: 0 }, data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const blueprint = (id, nodes, edges, extra = {}) => ({
    id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, nodes, edges, flags: {}, ...extra
  });
  const on = (id, event, pin, type, data, commonData = {}) => blueprint(id, [
    node("ev", "event", event, { reach: { mode: "self" } }),
    node("res", "result", type, { ...data, common: { ...common, ...commonData } })
  ], [edge("ev", pin, "res")]);

  async function fromPacks(name, type) {
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const row = (await pack.getIndex({ fields: ["type"] })).find(entry => (entry.name === name) && (entry.type === type));
      if (row) return (await pack.getDocument(row._id)).toObject();
    }
    throw new Error(`No compendium ${type} "${name}"`);
  }

  /** The hero (character with a Longsword and Sacred Flame), the foe (npc) and their tokens. */
  async function setup(blueprints, cleanup) {
    if (!canvas.ready || !canvas.scene) throw new Error("An active scene is needed");
    const since = Date.now();
    const size = canvas.dimensions.size;
    const [sword, flame] = await Promise.all([fromPacks("Longsword", "weapon"), fromPacks("Sacred Flame", "spell")]);
    sword.system.equipped = true;
    const hero = await Actor.implementation.create({
      name: "BNA Live Hero", type: "character", prototypeToken: { disposition: 1, actorLink: true },
      system: { attributes: { hp: { value: 5, max: 20 } }, spells: { spell1: { value: 2, override: 2 }, spell2: { value: 1, override: 1 } } },
      items: [sword, flame], flags: { [SCOPE]: { blueprints } }
    });
    cleanup.push(() => hero.delete());
    const foe = await Actor.implementation.create({
      name: "BNA Live Foe", type: "npc", prototypeToken: { disposition: -1, actorLink: true },
      system: { attributes: { hp: { value: 1, max: 30 }, ac: { calc: "flat", flat: 10 } }, abilities: { dex: { value: 1 } } }
    });
    cleanup.push(() => foe.delete());
    // The created tokens do not always come back in the order they were given, so they are matched by actor.
    const created = await canvas.scene.createEmbeddedDocuments("Token", [
      (await hero.getTokenDocument({ x: size * 4, y: size * 4 })).toObject(),
      (await foe.getTokenDocument({ x: size * 5, y: size * 4 })).toObject()
    ]);
    const heroToken = created.find(token => token.actorId === hero.id);
    const foeToken = created.find(token => token.actorId === foe.id);
    cleanup.unshift(() => canvas.scene.deleteEmbeddedDocuments("Token", [heroToken.id, foeToken.id].filter(id => canvas.scene.tokens.has(id))));
    // Midi can post its cards after the check ends; give them a moment, then remove the run's messages.
    cleanup.push(async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const ids = game.messages
        .filter(message => (message.timestamp >= since) && /BNA Live/.test([message.speaker?.alias, message.flavor, message.content].join(" ")))
        .map(message => message.id);
      if (ids.length) await ChatMessage.implementation.deleteDocuments(ids);
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    return { hero, foe, heroToken, foeToken };
  }

  function blueprints() {
    return [
      on("LiveHitBonus0001", "attackRoll", "out", "rollBonus", { formula: "20", damageTypes: [] }),
      on("LiveSaveDcUp0001", "saveDC", "out", "dcBonus", { formula: "30" }),
      on("LiveOnHitProne01", "afterAttack", "hit", "applyEffect", { source: "status", status: "prone", who: "target" }),
      on("LiveOnHitRider01", "afterAttack", "hit", "rider", {
        effect: { type: "rollBonus", data: { formula: "55", damageTypes: [] } }, scope: "sameActivation", roll: "damageRoll", who: "self",
        duration: { unit: "uses", value: 1 }
      }),
      on("LiveOnDropped001", "afterDamage", "dropped", "resource", { action: "restore", resource: "hp", amount: "5", who: "self" }),
      on("LiveOnFailed0001", "afterTargetSave", "failed", "applyEffect", { source: "status", status: "blinded", who: "target" }),
      on("LiveOnCheck00001", "afterCheck", "success", "rider", {
        effect: { type: "rollBonus", data: { formula: "77", damageTypes: [] } }, scope: "nextRoll", roll: "attackRoll", who: "self",
        duration: { unit: "uses", value: 1 }
      })
    ];
  }

  globalThis.bnaLive = { SCOPE, on, setup, blueprints, fromPacks, wait: ms => new Promise(resolve => setTimeout(resolve, ms)) };
})();
