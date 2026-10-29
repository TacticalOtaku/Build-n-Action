// Live check of the world migration (Plan 7). Run as GM. Builds v1-only "BNA Live" documents (an actor's
// weapon, a world item, an item in a temporary locked compendium), migrates only those, checks rolls
// before and after, deletes everything it made and returns [{name, pass, detail}].
(async () => {
  const SCOPE = "build-n-action";
  const api = game.modules.get(SCOPE).api;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const cleanup = [];
  const legacy = (id, type, bonuses, extra = {}) => ({
    id, type, name: `BNA Live ${id}`, enabled: true, bonuses, filters: {}, aura: { enabled: false }, ...extra
  });
  const include = document => [document.name, document.parent?.name].some(name => name?.startsWith("BNA Live"));
  const firstRoll = result => (Array.isArray(result) ? result[0] : result);

  async function fromPacks(name, type) {
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const index = await pack.getIndex({ fields: ["type"] });
      const entry = index.find(row => (row.name === name) && (!type || (row.type === type)));
      if (entry) return (await pack.getDocument(entry._id)).toObject();
    }
    throw new Error(`No compendium item "${name}"`);
  }

  try {
    const sword = await fromPacks("Longsword", "weapon");
    sword.name = "BNA Live Old Sword";
    sword.system.equipped = true;
    sword.flags = { [SCOPE]: { bonuses: [
      legacy("LiveMigAttack001", "attack", { bonus: "1d4" }),
      legacy("LiveMigDamage001", "damage", { bonus: "2", damageType: ["fire"] })
    ] } };
    const hero = await Actor.implementation.create({ name: "BNA Live Veteran", type: "character", items: [sword] });
    cleanup.push(() => hero.delete());
    const charmData = { name: "BNA Live Old Charm", type: "loot", flags: { [SCOPE]: { bonuses: [legacy("LiveMigSave00001", "throw", { bonus: "3" })] } } };
    const charm = await Item.implementation.create(charmData);
    cleanup.push(() => charm.delete());
    const Compendiums = foundry.documents?.collections?.CompendiumCollection ?? CompendiumCollection;
    const pack = await Compendiums.createCompendium({ label: "BNA Live Pack", type: "Item" });
    // A locked compendium cannot be deleted, and the run locks this one again.
    cleanup.push(async () => {
      await pack.configure({ locked: false });
      await pack.deleteCompendium();
    });
    const packed = await Item.implementation.create({ ...charmData, name: "BNA Live Packed Charm" }, { pack: pack.collection });
    await pack.configure({ locked: true });

    const attack = hero.items.getName("BNA Live Old Sword").system.activities.getByType("attack")[0];
    const before = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
    check("v1 bonuses work before the migration", before?.formula.includes("1d4"), before?.formula);

    const options = { packs: [pack.collection], include };
    const scan = await api.migration.scan(options);
    check("the scan finds the three documents and four bonuses", (scan.documents === 3) && (scan.converted === 4), JSON.stringify({ documents: scan.documents, converted: scan.converted }));
    check("the scan changes nothing", hero.items.getName("BNA Live Old Sword").getFlag(SCOPE, "bonuses")?.length === 2, "");

    const run = await api.migration.run(options);
    check("the run converts them without errors", (run.converted === 4) && (run.errors === 0), JSON.stringify({ converted: run.converted, errors: run.errors }));
    const migrated = hero.items.getName("BNA Live Old Sword");
    check("v1 bonuses become stored blueprints", (migrated.getFlag(SCOPE, "bonuses")?.length === 0) && (migrated.getFlag(SCOPE, "blueprints")?.length === 2), "");
    check("the originals are kept as a backup", Object.keys(migrated.getFlag(SCOPE, "legacyBackup") ?? {}).length === 2, "");
    const packedAfter = await pack.getDocument(packed.id);
    check("the compendium item is migrated", packedAfter.getFlag(SCOPE, "blueprints")?.length === 1, "");
    check("the compendium is locked again", pack.locked === true, pack.locked);

    const after = firstRoll(await attack.rollAttack({}, { configure: false }, { create: false }));
    check("the attack bonus still applies", after?.formula.includes("1d4"), after?.formula);
    const damage = await attack.rollDamage({}, { configure: false }, { create: false }) ?? [];
    check("the typed damage bonus still applies", damage.some(roll => (roll.options.type === "fire") && roll.formula.includes("2")), damage.map(roll => roll.formula).join(" | "));

    const again = await api.migration.run(options);
    check("running again converts nothing", again.converted === 0, again.converted);

    const deleted = await api.migration.deleteBackups(options);
    check("backups are deleted on request", (deleted === 3) && !hero.items.getName("BNA Live Old Sword").getFlag(SCOPE, "legacyBackup"), deleted);

    const app = await api.migration.open();
    const scanButton = app.element.querySelector(".bna-migration__primary");
    check("the wizard opens on its first step", !!scanButton, "");
    await app.close();
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const undo of cleanup.reverse()) {
      try {
        await undo();
      } catch (error) {
        console.warn("BNA Live cleanup", error);
      }
    }
  }
  return report;
})();
