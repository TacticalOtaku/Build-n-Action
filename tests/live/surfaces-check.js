// Live check of the Plan 7 surfaces. Run as GM in the dnd5e test world with the module enabled.
// Creates "BNA Live" documents, restores the library and every setting it touches,
// deletes what it made and returns [{name, pass, detail}].
(async () => {
  const SCOPE = "build-n-action";
  const api = game.modules.get(SCOPE).api;
  const t = key => game.i18n.localize(key);
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (test, timeout = 4000) => {
    const started = performance.now();
    while ((performance.now() - started) < timeout) {
      const value = await test();
      if (value) return value;
      await wait(50);
    }
    return null;
  };
  const cleanup = [];
  const savedSettings = { showAuraRanges: game.settings.get(SCOPE, "showAuraRanges"), coachSeen: game.settings.get(SCOPE, "coachSeen") };
  const savedLibrary = foundry.utils.deepClone(game.settings.get(SCOPE, "library"));
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const shadowOf = app => app?.element.querySelector(".bna-editor-host")?.shadowRoot ?? null;
  // The first open loads the editor chunk, so the window can be shown before its content.
  const button = (shadow, label) => until(() => shadow?.querySelector(`[aria-label="${label}"]`));

  async function fromPacks(name, type) {
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const index = await pack.getIndex({ fields: ["type"] });
      const entry = index.find(row => (row.name === name) && (!type || (row.type === type)));
      if (entry) return (await pack.getDocument(entry._id)).toObject();
    }
    throw new Error(`No compendium item "${name}"`);
  }

  const apps = [];
  try {
    await game.settings.set(SCOPE, "coachSeen", true);
    canvas.tokens.releaseAll();
    const sword = await fromPacks("Longsword", "weapon");
    sword.system.equipped = true;
    const hero = await Actor.implementation.create({
      name: "BNA Live Hero", type: "character", prototypeToken: { actorLink: true, disposition: 1 },
      system: { attributes: { hp: { value: 20, max: 20 } } }, items: [sword]
    });
    cleanup.push(() => hero.delete());
    const item = hero.items.find(entry => entry.type === "weapon");

    // Presets
    const swordApp = await api.openEditor(item);
    apps.push(swordApp);
    const swordShadow = shadowOf(swordApp);
    (await button(swordShadow, t("BNA.UI.Rail.templates")))?.click();
    const blessName = t("BNA.Preset.bless.name");
    const blessRow = await until(() => [...swordShadow.querySelectorAll(".bna-picker__pick")].find(node => node.querySelector(".bna-picker__name")?.textContent === blessName));
    check("the picker lists the presets", swordShadow.querySelectorAll(".bna-picker__pick").length === 14, swordShadow.querySelectorAll(".bna-picker__pick").length);
    blessRow?.click();
    const bless = await until(() => api.blueprints.get(item).find(entry => entry.name === blessName));
    check("a preset becomes a stored blueprint", bless, bless?.id);
    check("the preset opens in the editor", swordShadow.querySelector(".bna-stamp__name")?.value === blessName, swordShadow.querySelector(".bna-stamp__name")?.value);

    // Library
    await api.library.add(bless);
    check("saving to the library", api.library.list().some(entry => entry.id === bless.id), api.library.list().length);
    const exported = api.library.export([bless.id]);
    check("the library exports JSON", JSON.parse(exported).blueprints?.[0]?.id === bless.id, exported.length);
    const heroApp = await api.openEditor(hero);
    apps.push(heroApp);
    const heroShadow = shadowOf(heroApp);
    (await button(heroShadow, t("BNA.UI.Rail.library")))?.click();
    const libraryRow = await until(() => [...heroShadow.querySelectorAll(".bna-picker__pick")].find(node => node.querySelector(".bna-picker__name")?.textContent === blessName));
    libraryRow?.click();
    check("a library entry applies as a copy", await until(() => api.blueprints.get(hero).some(entry => (entry.name === blessName) && (entry.id !== bless.id))), "");

    // Drag and drop between editors
    const before = api.blueprints.get(hero).length;
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", JSON.stringify({ type: "Blueprint", uuid: api.blueprints.uuid(item, bless.id) }));
    heroShadow.querySelector(".bna-rail").dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true, composed: true, cancelable: true }));
    check("dropping a row from another document copies it", await until(() => api.blueprints.get(hero).length === before + 1), api.blueprints.get(hero).length);

    // Active Effects and DAE: clear the hero's own copies first, so only effects add to its saves.
    for (const entry of api.blueprints.get(hero)) await api.blueprints.delete(hero, entry.id);
    const bonusOnSaves = (id, formula) => ({
      id, schemaVersion: 2, name: `BNA Live ${id}`, img: "icons/svg/aura.svg", description: "", enabled: true, sort: 0, flags: {},
      nodes: [
        { id: "ev", kind: "event", type: "savingThrow", position: { x: 0, y: 0 }, data: { reach: { mode: "self", range: "10", disposition: "1", includeSelf: true, blockers: [], require: { sight: false, move: false, sound: false, light: false } } } },
        { id: "bonus", kind: "result", type: "rollBonus", position: { x: 324, y: 0 }, data: { formula, damageTypes: [], common } }
      ],
      edges: [{ id: "e1", source: "ev", sourcePin: "out", target: "bonus", targetPin: "in" }]
    });
    const saveFormula = async () => {
      const result = await hero.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false });
      return (Array.isArray(result) ? result[0] : result)?.formula ?? "";
    };

    const [rage] = await hero.createEmbeddedDocuments("ActiveEffect", [{
      name: "BNA Live Rage", img: "icons/svg/aura.svg", disabled: false, flags: { dae: { disableCondition: "@attributes.hp.value <= 0" } }
    }]);
    await api.blueprints.save(rage, bonusOnSaves("LiveRageBonus001", "11"));
    check("a blueprint on an active effect applies", (await saveFormula()).includes("11"), await saveFormula());
    await rage.update({ disabled: true });
    check("switching the effect off switches the blueprint off", !(await saveFormula()).includes("11"), await saveFormula());
    await rage.update({ disabled: false });

    const rageApp = await api.openEditor(rage);
    apps.push(rageApp);
    const rageShadow = shadowOf(rageApp);
    check("the title block shows the effect as active", await until(() => rageShadow.querySelector('.bna-stamp__effect[data-state="active"]')), "");
    check("and its DAE condition", rageShadow.querySelector(".bna-stamp__effect-rule")?.textContent.includes("@attributes.hp.value <= 0"),
      rageShadow.querySelector(".bna-stamp__effect-rule")?.textContent);

    if (game.modules.get("dae")?.active) {
      await hero.update({ "system.attributes.hp.value": 0 });
      check("DAE turns the effect off at 0 HP", await until(() => hero.effects.get(rage.id)?.disabled === true, 6000), "");
      check("and the blueprint stops", !(await saveFormula()).includes("11"), await saveFormula());
      check("the title block follows DAE", await until(() => rageShadow.querySelector('.bna-stamp__effect[data-state="disabled"]')), "");
      await hero.update({ "system.attributes.hp.value": 20 });
      check("above 0 HP, DAE turns it on again", await until(() => hero.effects.get(rage.id)?.disabled === false, 6000), "");

      const [ward] = await hero.createEmbeddedDocuments("ActiveEffect", [{
        name: "BNA Live Ward", img: "icons/svg/aura.svg", disabled: false, flags: { dae: { specialDuration: ["zeroHP"] } }
      }]);
      await api.blueprints.save(ward, bonusOnSaves("LiveWardBonus001", "13"));
      check("a blueprint on a DAE-timed effect applies", (await saveFormula()).includes("13"), await saveFormula());
      await hero.update({ "system.attributes.hp.value": 0 });
      // Foundry 14 keeps an effect whose duration is over, marked expired, where earlier versions deleted it.
      const ended = () => { const effect = hero.effects.get(ward.id); return !effect || ((effect.active === false) && (effect._source.duration.expired === true)); };
      check("the “0 HP” special duration ends the effect", await until(ended, 6000), hero.effects.get(ward.id) ? "expired" : "deleted");
      check("and its blueprint", !(await saveFormula()).includes("13"), await saveFormula());
      const expired = hero.effects.get(ward.id);
      if (expired) {
        const wardApp = await api.openEditor(expired);
        apps.push(wardApp);
        check("the title block shows the effect as ended", await until(() => shadowOf(wardApp)?.querySelector('.bna-stamp__effect[data-state="expired"]')), "");
      }
      await hero.update({ "system.attributes.hp.value": 20 });
    } else {
      check("DAE checks skipped: DAE is not active in this world", true, "skipped");
    }

    // "Move to an effect" on the sword: the blueprint follows the item's equipped state.
    const moveLabel = game.i18n.format("BNA.UI.Rail.moveToEffect", { name: blessName });
    swordShadow.querySelector(".bna-rail__row [aria-haspopup='menu']")?.click();
    (await until(() => [...swordShadow.querySelectorAll("[role='menuitem']")].find(node => node.getAttribute("aria-label") === moveLabel)))?.click();
    const moved = await until(() => item.effects.find(effect => api.blueprints.get(effect).some(entry => entry.id === bless.id)));
    check("“Move to an effect” creates a transferring effect with the blueprint", moved?.transfer === true, moved?.name);
    check("and removes it from the item", await until(() => !api.blueprints.get(item).some(entry => entry.id === bless.id)), "");
    await moved?.sheet?.close();
    check("the moved blueprint applies while the item is equipped", (await saveFormula()).includes("1d4"), await saveFormula());
    await item.update({ "system.equipped": false });
    check("and stops while it is unequipped", !(await saveFormula()).includes("1d4"), await saveFormula());
    await item.update({ "system.equipped": true });

    // Aura preview
    await game.settings.set(SCOPE, "showAuraRanges", true);
    const paladin = await Actor.implementation.create({
      name: "BNA Live Paladin", type: "character", prototypeToken: { actorLink: true, disposition: 1 },
      flags: { [SCOPE]: { blueprints: [{
        id: "LiveAuraPrev0001", schemaVersion: 2, name: "BNA Live aura", img: "icons/svg/aura.svg", description: "", enabled: true, sort: 0, flags: {},
        nodes: [
          { id: "ev", kind: "event", type: "savingThrow", position: { x: 0, y: 0 }, data: { reach: { mode: "aura", range: "30", disposition: "1", includeSelf: false, blockers: [], require: { sight: false, move: false, sound: false, light: false } } } },
          { id: "bonus", kind: "result", type: "rollBonus", position: { x: 324, y: 0 }, data: { formula: "7", damageTypes: [], common } }
        ],
        edges: [{ id: "e1", source: "ev", sourcePin: "out", target: "bonus", targetPin: "in" }]
      }] } }
    });
    cleanup.push(() => paladin.delete());
    const grid = canvas.grid.size;
    const tokens = await canvas.scene.createEmbeddedDocuments("Token", [
      { ...(await paladin.getTokenDocument()).toObject(), x: grid * 2, y: grid * 2 },
      { ...(await hero.getTokenDocument()).toObject(), x: grid * 3, y: grid * 2 }
    ]);
    cleanup.push(() => canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(token => token.id)));
    await wait(300);
    const drawnBefore = canvas.interface.children.length;
    const save = await hero.rollSavingThrow({ ability: "dex" }, { configure: false }, { create: false });
    const roll = Array.isArray(save) ? save[0] : save;
    check("the aura applies to the ally", roll?.formula.includes("7"), roll?.formula);
    check("and is drawn on the canvas", canvas.interface.children.length > drawnBefore, `${drawnBefore} → ${canvas.interface.children.length}`);
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const app of apps) if (app?.rendered) await app.close();
    await game.settings.set(SCOPE, "library", savedLibrary);
    for (const [name, value] of Object.entries(savedSettings)) await game.settings.set(SCOPE, name, value);
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
