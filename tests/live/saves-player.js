// Live check of Plan 11: a demanded save rolled by the owning player. Run as the active GM after reactions-shared.js,
// with a second client joined as a player. Defines globalThis.bnaLiveSaves with steps the GM calls in turn:
//   await bnaLiveSaves.setup()   – the hero, a Ward owned by that player next to him, the Ward targeted;
//   await bnaLiveSaves.demand()  – a successful check demands a DEX save DC 10 from allies in my aura: the Ward (the prompt goes to the player);
//   bnaLiveSaves.state()         – statuses, HP and who rolled the save cards so far;
//   await bnaLiveSaves.cleanup() – deletes everything and restores targets.
(() => {
  const { SCOPE, setup, wait } = globalThis.bnaLive;
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: false };
  const node = (id, kind, type, data = {}) => ({ id, kind, type, position: { x: 0, y: 0 }, data: (kind === "result") ? { ...data, common } : data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const blueprint = {
    id: "LiveSaveWard0001", schemaVersion: 2, name: "BNA Live Ward save", img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, flags: {},
    nodes: [
      node("ev", "event", "afterCheck", { reach: { mode: "self" } }),
      node("save", "result", "demandSave", { ability: "dex", dcMode: "formula", dc: "10", who: "aura", range: "30", disposition: "1", includeSelf: false, advantage: "normal" }),
      node("prone", "result", "applyEffect", { source: "status", status: "prone", who: "target" }),
      node("heal", "result", "resource", { action: "restore", resource: "hp", amount: "3", who: "self" })
    ],
    edges: [edge("ev", "success", "save"), edge("save", "failed", "prone"), edge("save", "succeeded", "heal")]
  };
  const cleanup = [];
  const since = Date.now();
  const state = { hero: null, ward: null };

  globalThis.bnaLiveSaves = {
    async setup() {
      const player = game.users.find(user => !user.isGM && user.active);
      if (!player) throw new Error("No player is connected");
      const { hero, heroToken } = await setup([blueprint], cleanup);
      const ward = await Actor.implementation.create({
        name: "BNA Live Ward", type: "character", ownership: { default: 0, [player.id]: 3 },
        prototypeToken: { disposition: 1, actorLink: true }, system: { abilities: { dex: { value: 10 } } }
      });
      cleanup.push(() => ward.delete());
      const size = canvas.dimensions.size;
      const [token] = await canvas.scene.createEmbeddedDocuments("Token", [(await ward.getTokenDocument({ x: heroToken.x, y: heroToken.y + size })).toObject()]);
      cleanup.unshift(() => canvas.scene.tokens.has(token.id) ? canvas.scene.deleteEmbeddedDocuments("Token", [token.id]) : null);
      canvas.tokens.setTargets([token.id]);
      cleanup.unshift(() => canvas.tokens.setTargets([]));
      Object.assign(state, { hero, ward });
      return { hero: hero.uuid, ward: ward.uuid, player: player.id, playerActive: player.active };
    },
    async demand() {
      await state.hero.rollSkill({ skill: "ath", target: 1 }, { configure: false }, { create: false });
      return Date.now();
    },
    state() {
      const cards = game.messages.filter(message => (message.timestamp >= since) && (message.speaker?.actor === state.ward.id)
        && (message.getFlag("dnd5e", "roll.type") === "save"));
      return {
        heroHp: state.hero.system.attributes.hp.value,
        wardProne: state.ward.statuses.has("prone"),
        cards: cards.map(message => ({ author: message.author?.name, total: message.rolls?.[0]?.total }))
      };
    },
    async cleanup() {
      await wait(500);
      for (const undo of cleanup.splice(0)) {
        try { await undo(); } catch (error) { console.warn("BNA Live cleanup", error); }
      }
      const ids = game.messages.filter(message => (message.timestamp >= since) && /BNA Live/.test([message.speaker?.alias, message.flavor, message.content].join(" "))).map(message => message.id);
      if (ids.length) await ChatMessage.implementation.deleteDocuments(ids);
      delete globalThis.bnaLiveSaves;
    }
  };
})();
