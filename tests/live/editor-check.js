// Live check of the blueprint editor window (Plan 6). Run as GM in the dnd5e test world with the module enabled.
// It creates "BNA Live" documents, drives the editor through its shadow root, restores the settings it touches,
// deletes what it made and returns [{name, pass, detail}].
(async () => {
  const SCOPE = "build-n-action";
  const api = game.modules.get(SCOPE).api;
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
  const saved = Object.fromEntries(["allowPlayers", "headerLabel", "editorTheme", "editorEffects", "coachSeen"]
    .map(key => [key, game.settings.get(SCOPE, key)]));

  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none" };
  const node = (id, kind, type, x, data = {}) => ({ id, kind, type, position: { x, y: 0 }, data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const setValue = (input, value) => {
    const prototype = (input instanceof HTMLSelectElement) ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event((input instanceof HTMLSelectElement) ? "change" : "input", { bubbles: true }));
  };
  const key = (target, init) => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, cancelable: true, ...init }));
  const stored = (item, id) => api.blueprints.get(item).find(entry => entry.id === id);

  async function fromPacks(name, type) {
    for (const pack of game.packs.filter(entry => entry.documentName === "Item")) {
      const index = await pack.getIndex({ fields: ["type"] });
      const entry = index.find(row => (row.name === name) && (!type || (row.type === type)));
      if (entry) return (await pack.getDocument(entry._id)).toObject();
    }
    throw new Error(`No compendium item "${name}"`);
  }

  let app = null;
  try {
    // The Test panel starts from the controlled token; with none, it starts from the carrier's owner.
    canvas.tokens.releaseAll();
    await game.settings.set(SCOPE, "coachSeen", true);
    await game.settings.set(SCOPE, "editorTheme", "dark");

    const sword = await fromPacks("Longsword", "weapon");
    sword.system.equipped = true;
    const hero = await Actor.implementation.create({ name: "BNA Live Hero", type: "character", items: [sword] });
    cleanup.push(() => hero.delete());
    const lich = await Actor.implementation.create({ name: "BNA Live Lich", type: "npc", system: { details: { type: { value: "undead" } } } });
    cleanup.push(() => lich.delete());
    const [lichToken] = await canvas.scene.createEmbeddedDocuments("Token", [{ ...(await lich.getTokenDocument()).toObject(), x: 0, y: 0 }]);
    cleanup.push(() => lichToken.delete());

    const item = hero.items.find(entry => entry.type === "weapon");
    const flame = {
      id: "LiveEditor000001", schemaVersion: 2, name: "BNA Live flame", img: "icons/svg/fire.svg", description: "",
      enabled: true, sort: 0, flags: {},
      nodes: [
        node("ev", "event", "damageRoll", 0, { reach: { mode: "self" } }),
        node("undead", "condition", "condition", 324, { mode: "all", checks: [{ id: "c1", type: "creatureTypes", data: { values: ["undead"] } }] }),
        node("fire", "result", "rollBonus", 648, { formula: "1d6 + @abilities.str.mod", damageTypes: ["fire"], common }),
        node("loose", "result", "rollBonus", 648, { formula: "2", damageTypes: [], common })
      ],
      edges: [edge("ev", "out", "undead"), edge("undead", "yes", "fire")]
    };
    flame.nodes[3].position.y = 234;
    await api.blueprints.save(item, flame);

    // Foundry fills the resource-timing buffer while loading, so make room to see the chunk arrive.
    performance.setResourceTimingBufferSize(2000);
    performance.clearResourceTimings();

    // Opening
    let started = performance.now();
    app = await api.openEditor(item);
    const firstOpen = performance.now() - started;
    let shadow = app?.element.querySelector(".bna-editor-host")?.shadowRoot;
    check("the editor opens inside a shadow root", shadow?.querySelector(".bna-app"), `${Math.round(firstOpen)} ms`);
    check("the window is titled after the item", app.element.querySelector(".window-title")?.textContent.includes(item.name), app.element.querySelector(".window-title")?.textContent);
    check("the editor chunk loaded lazily", performance.getEntriesByType("resource").some(entry => /chunks\/editor-[\w-]+\.mjs/.test(entry.name)), "");
    check("fonts are declared once on the page", document.querySelectorAll("#bna-editor-fonts").length === 1, "");
    check("Geologica loads", (await document.fonts.load("16px 'Geologica Variable'")).length > 0, "");
    const nameField = shadow.querySelector(".bna-stamp__name");
    check("the editor keeps its own fonts", getComputedStyle(nameField).fontFamily.includes("Geologica"), getComputedStyle(nameField).fontFamily);
    check("the open blueprint is the stored one", nameField.value === "BNA Live flame", nameField.value);

    // Keyboard: the editor has the keys, the game does not
    const stage = shadow.querySelector(".bna-stage");
    stage.focus();
    check("Foundry treats the editor as a focused input", game.keyboard.hasFocus === true, "");
    const paused = game.paused;
    key(stage, { key: " ", code: "Space" });
    const palette = await until(() => shadow.querySelector(".bna-palette"));
    check("Space opens the palette", palette, "");
    check("Space does not pause the game", game.paused === paused, `paused: ${game.paused}`);
    if (palette) key(palette.querySelector("input"), { key: "Escape", code: "Escape" });
    check("Escape closes the palette", await until(() => !shadow.querySelector(".bna-palette")), "");

    // Autosave
    setValue(nameField, "BNA Live renamed");
    check("renaming saves to the item", await until(() => stored(item, flame.id)?.name === "BNA Live renamed"), stored(item, flame.id)?.name);

    // Lint
    check("the loose result carries a warning mark",
      await until(() => shadow.querySelector('.react-flow__node[data-id="loose"] .bna-lintmark[data-level="warning"]')), "");
    shadow.querySelector(".bna-stamp__marks")?.click();
    const issueRow = await until(() => shadow.querySelector("button.bna-issues__row"));
    check("the Issues tab lists the finding", issueRow, issueRow?.textContent);
    issueRow?.click();
    check("a finding selects its node", await until(() => shadow.querySelector('.react-flow__node[data-id="loose"].selected')), "");

    // Formula help (the selected node is the loose "+2" bonus)
    const formula = await until(() => shadow.querySelector('.bna-inspector input[role="combobox"]'));
    check("the formula previews on the actor", formula && shadow.querySelector(".bna-formula__preview")?.textContent.startsWith("="),
      shadow.querySelector(".bna-formula__preview")?.textContent);
    formula.focus();
    setValue(formula, "@abil");
    const option = await until(() => shadow.querySelector('.bna-formula__list [role="option"]'));
    check("typing @ suggests roll data", option?.textContent.startsWith("@abilities."), option?.textContent);
    setValue(formula, "2");
    formula.blur();

    // Ctrl+D and undo
    stage.focus();
    key(stage, { key: "d", code: "KeyD", ctrlKey: true });
    check("Ctrl+D duplicates the selected node", await until(() => stored(item, flame.id)?.nodes.length === 5), stored(item, flame.id)?.nodes.length);
    stage.focus();
    key(stage, { key: "z", code: "KeyZ", ctrlKey: true });
    check("Ctrl+Z undoes it", await until(() => stored(item, flame.id)?.nodes.length === 4), stored(item, flame.id)?.nodes.length);

    // Test panel
    shadow.querySelector('[data-coach="test"]')?.click();
    const setup = await until(() => shadow.querySelector(".bna-sim__setup"));
    check("▶ opens the Test tab", setup, "");
    const [, itemSelect, targetSelect] = setup.querySelectorAll("select");
    check("the test starts on the carrier item", itemSelect.value.startsWith(item.uuid), itemSelect.value);
    setValue(targetSelect, lichToken.uuid);
    check("against the lich the fire bonus would apply",
      await until(() => shadow.querySelector('.bna-sim__verdict[data-verdict="applies"]')), "");
    check("the canvas traces the path",
      await until(() => shadow.querySelector('.react-flow__node[data-id="fire"] .bna-node[data-status="passed"]')), "");
    setValue(targetSelect, "");
    const whyNot = await until(() => shadow.querySelector('.bna-sim__verdict[data-verdict="nothing"] button'));
    check("without a target nothing applies, and the panel says why", whyNot, shadow.querySelector(".bna-sim__verdict")?.textContent);
    whyNot?.click();
    check("“Why not?” selects the failing condition", await until(() => shadow.querySelector('.react-flow__node[data-id="undead"].selected')), "");

    const simulated = api.blueprints.simulate(stored(item, flame.id), {
      document: item, actorUuid: hero.uuid, itemUuid: item.uuid, activityId: item.system.activities.contents[0]?.id ?? null,
      targetUuid: lichToken.uuid, event: "damageRoll"
    });
    check("api.blueprints.simulate matches the panel", simulated?.run.intents.some(intent => intent.nodeId === "fire"),
      simulated?.run.intents.map(intent => intent.nodeId).join(","));

    // List actions
    // Row actions by their label; extra actions sit in the row's "More" menu.
    const action = async (row, key) => {
      const label = game.i18n.format(key, { name: row?.querySelector(".bna-rail__name")?.textContent ?? "" });
      const find = () => [...(row?.querySelectorAll("button") ?? [])].find(node => node.getAttribute("aria-label") === label);
      if (!find()) row?.querySelector("[aria-haspopup='menu']")?.click();
      return until(find);
    };
    const firstRow = () => shadow.querySelectorAll(".bna-rail__row")[0];
    (await action(firstRow(), "BNA.UI.Rail.duplicate"))?.click();
    check("duplicating stores a copy", await until(() => api.blueprints.get(item).length === 2), api.blueprints.get(item).length);
    const copyRow = await until(() => shadow.querySelectorAll(".bna-rail__row")[1]);
    (await action(copyRow, "BNA.UI.Rail.remove"))?.click();
    (await until(() => shadow.querySelector(".bna-rail__confirm .bna-button--danger")))?.click();
    check("deleting after confirmation removes it", await until(() => api.blueprints.get(item).length === 1), api.blueprints.get(item).length);
    (await action(firstRow(), "BNA.UI.Rail.turnOff"))?.click();
    check("the list switches a blueprint off", await until(() => stored(item, flame.id)?.enabled === false), "");
    (await action(firstRow(), "BNA.UI.Rail.turnOn"))?.click();
    check("and on again", await until(() => stored(item, flame.id)?.enabled === true), "");

    // Changes from elsewhere
    const external = await api.blueprints.create(item, { name: "BNA Live external" });
    check("a blueprint added elsewhere appears in the list", await until(() => shadow.querySelectorAll(".bna-rail__row").length === 2), "");
    await api.blueprints.delete(item, external.id);
    check("and disappears when deleted", await until(() => shadow.querySelectorAll(".bna-rail__row").length === 1), "");

    // Theme
    shadow.querySelector(".bna-toolbar button:has(svg.lucide-sun)")?.click();
    check("the theme button switches to light and remembers it",
      await until(() => (shadow.querySelector(".bna-app")?.dataset.theme === "light") && (game.settings.get(SCOPE, "editorTheme") === "light")), "");

    // Header control and title-bar button
    const controls = [];
    Hooks.callAll("getHeaderControlsApplicationV2", item.sheet, controls);
    check("sheets offer “Blueprints (1)” in the header menu", controls[0]?.action === "bnaOpenEditor" && controls[0].label.includes("1"), controls[0]?.label);
    await game.settings.set(SCOPE, "headerLabel", true);
    await item.sheet.render({ force: true });
    const titleButton = await until(() => item.sheet.element?.querySelector(".bna-header-button"));
    check("the title-bar button appears when the setting is on", titleButton, "");
    titleButton?.click();
    check("it brings the same editor forward", await until(() => app.rendered), "");
    await item.sheet.close();
    await game.settings.set(SCOPE, "headerLabel", saved.headerLabel);

    // Reopen speed and the first-run guide
    await app.close();
    await game.settings.set(SCOPE, "coachSeen", false);
    started = performance.now();
    app = await api.openEditor(item);
    check("reopening is quick", (performance.now() - started) < 1000, `${Math.round(performance.now() - started)} ms`);
    shadow = app.element.querySelector(".bna-editor-host").shadowRoot;
    const coach = await until(() => shadow.querySelector(".bna-coach__card"));
    check("the guide greets a first-time user", coach, coach?.querySelector("h2")?.textContent);
    coach?.querySelector(".bna-coach__skip")?.click();
    check("skipping the guide remembers it", await until(() => game.settings.get(SCOPE, "coachSeen") === true), "");

    // Deleting the carrier closes the window
    await item.delete();
    check("deleting the item closes its editor", await until(() => !app.rendered), "");
    app = null;
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    if (app?.rendered) await app.close();
    for (const [name, value] of Object.entries(saved)) await game.settings.set(SCOPE, name, value);
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
