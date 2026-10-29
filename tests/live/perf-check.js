// Pre-roll overhead with 50 blueprints (Plan 4, Task 11). Run as GM; cleans up after itself.
(async () => {
  const SCOPE = "build-n-action";
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const events = ["attackRoll", "damageRoll", "savingThrow", "abilityCheck"];
  const id = index => `PerfBlueprint${String(index).padStart(3, "0")}`;
  const make = (index, reach) => ({
    id: id(index), schemaVersion: 2, name: `BNA Live perf ${index}`, img: "icons/svg/dice-target.svg", description: "",
    enabled: true, sort: index, flags: {},
    nodes: [
      { id: "ev", kind: "event", type: events[index % events.length], position: { x: 0, y: 0 }, data: { reach } },
      { id: "if", kind: "condition", type: "condition", position: { x: 0, y: 0 }, data: { mode: "all", checks: [
        { id: "a", type: "itemTypes", data: { values: ["weapon", "spell"] } },
        { id: "b", type: "creatureTypes", data: { values: ["!undead"] } },
        { id: "c", type: "healthPercentages", data: { value: 100, type: "atMost" } }
      ] } },
      { id: "bonus", kind: "result", type: "rollBonus", position: { x: 0, y: 0 }, data: { formula: "0", damageTypes: [], common } }
    ],
    edges: [
      { id: "ev-out-if", source: "ev", sourcePin: "out", target: "if", targetPin: "in" },
      { id: "if-yes-bonus", source: "if", sourcePin: "yes", target: "bonus", targetPin: "in" }
    ]
  });
  const cleanup = [];
  try {
    let sword = null;
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const row = (await pack.getIndex({ fields: ["type"] })).find(item => (item.name === "Longsword") && (item.type === "weapon"));
      if (row) {
        sword = (await pack.getDocument(row._id)).toObject();
        break;
      }
    }
    if (!sword) throw new Error("No compendium Longsword");
    sword.system.equipped = true;
    const hero = await Actor.implementation.create({
      name: "BNA Live Perf", type: "character", prototypeToken: { disposition: 1 },
      flags: { [SCOPE]: { blueprints: Array.from({ length: 40 }, (_, index) => make(index, { mode: "self" })) } },
      items: [sword]
    });
    cleanup.push(() => hero.delete());
    if (canvas.ready && canvas.scene) {
      const size = canvas.dimensions.size;
      const ally = await Actor.implementation.create({
        name: "BNA Live Perf Ally", type: "npc", prototypeToken: { disposition: 1 },
        flags: { [SCOPE]: { blueprints: Array.from({ length: 10 }, (_, index) => make(40 + index, {
          mode: "aura", range: "30", disposition: "1", includeSelf: false, blockers: [], require: { sight: true, move: false, sound: false, light: false }
        })) } }
      });
      cleanup.push(() => ally.delete());
      const tokens = await canvas.scene.createEmbeddedDocuments("Token", [
        (await hero.getTokenDocument({ x: size * 4, y: size * 4 })).toObject(),
        (await ally.getTokenDocument({ x: size * 6, y: size * 4 })).toObject()
      ]);
      cleanup.unshift(() => canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(token => token.id)));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const times = [];
    for (let run = 0; run < 30; run++) {
      await attack.rollAttack({}, { configure: false }, { create: false });
      times.push(BuildNAction.debug.recentRolls()[0].ms);
    }
    const sorted = times.slice(5).sort((a, b) => a - b);
    const at = share => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
    return { runs: sorted.length, median: at(0.5).toFixed(2), p95: at(0.95).toFixed(2), pass: at(0.95) < 5 };
  } finally {
    for (const undo of cleanup) await undo();
  }
})();
