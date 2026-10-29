// Live check for roll-dialog choices (Plan 4, Task 10): part 1, set up and open the dialog.
(async () => {
  const SCOPE = "build-n-action";
  async function fromPacks(name, type) {
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const index = await pack.getIndex({ fields: ["type"] });
      const entry = index.find(row => (row.name === name) && (!type || (row.type === type)));
      if (entry) return (await pack.getDocument(entry._id)).toObject();
    }
    throw new Error(`No compendium item "${name}"`);
  }
  const sword = await fromPacks("Longsword", "weapon");
  sword.system.equipped = true;
  sword.flags = { [SCOPE]: { bonuses: [
    {
      id: "LiveSmite0000001", type: "damage", name: "BNA Live Smite", optional: true,
      description: "<p>Radiant damage when you hit.</p>",
      bonuses: { bonus: "2d8", damageType: ["radiant"] },
      consume: { enabled: true, type: "slots", subtype: "", scales: true, formula: "1d8", value: { min: "1", max: "5", step: 1 } }
    },
    {
      id: "LiveReminder0001", type: "damage", name: "BNA Live Reminder", optional: true, reminder: true,
      description: "<p>Undead take extra damage.</p>", bonuses: { bonus: "" }
    }
  ] } };
  const hero = await Actor.implementation.create({
    name: "BNA Live Paladin", type: "character",
    system: { spells: { spell1: { value: 2, override: 2 }, spell2: { value: 1, override: 1 } } },
    items: [sword]
  });
  globalThis.bnaLiveActor = hero;
  const attack = hero.items.getName("Longsword").system.activities.getByType("attack")[0];
  globalThis.bnaLiveRoll = attack.rollDamage({}, {}, { create: false });
  return { actor: hero.uuid };
})();
