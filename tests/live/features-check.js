// Live verification for combatStart, rollAdvantage, and reminder audience filters in Foundry 14 / dnd5e 5.3.3.
// Run as GM on a scene with the canvas ready and no active combat; cleans up everything it creates.
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
  const node = (id, kind, type, data = {}, x = 0) => ({ id, kind, type, position: { x, y: 0 }, data });
  const edge = (source, pin, target) => ({ id: `${source}-${pin}-${target}`, source, sourcePin: pin, target, targetPin: "in" });
  const bp = (id, name, nodes, edges) => ({
    id, schemaVersion: 2, name, img: "icons/svg/dice-target.svg", description: "", enabled: true, sort: 0, flags: {}, nodes, edges
  });
  const common = { optional: false, choiceGroup: "", cost: { type: "none" }, limit: "none", then: false };
  const cleanup = [];
  const since = Date.now();

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
    if (game.combat) throw new Error("End the running combat first");
    const scene = canvas.scene;
    const size = canvas.dimensions.size;
    const swordData = await fromPacks("Longsword", "weapon");
    swordData.system.equipped = true;

    const nonGm = game.users.find(user => !user.isGM) ?? null;

    // 1. Editor UI: palette lists combatStart & rollAdvantage; reminder exposes 5 audiences.
    const remEditorBp = bp("LiveRemEditor001", "BNA Live Rem Editor", [
      node("ev", "event", "attackRoll", { reach: { mode: "self" } }, 0),
      node("rem", "result", "reminder", { audience: "auto", text: "Check note", common }, 324)
    ], [edge("ev", "out", "rem")]);
    const editorHero = await Actor.implementation.create({
      name: "BNA Live Editor Hero", type: "character",
      items: [{ ...swordData, flags: { [SCOPE]: { blueprints: [remEditorBp] } } }]
    });
    cleanup.push(() => editorHero.delete());
    const editorItem = editorHero.items.getName("Longsword");
    app = await api.openEditor(editorItem);
    const shadow = await until(() => app?.element?.querySelector(".bna-editor-host")?.shadowRoot);
    const stage = await until(() => shadow?.querySelector(".bna-stage"));
    stage?.focus();
    stage?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, composed: true, cancelable: true }));
    const palette = await until(() => shadow?.querySelector(".bna-palette"));
    const paletteLabels = [...(palette?.querySelectorAll('[role="option"]') ?? [])].map(el => el.textContent ?? "");
    const hasCombatStartItem = paletteLabels.some(text => /Combat start|Начало боя/i.test(text));
    const hasAdvantageItem = paletteLabels.some(text => /Roll advantage|Преимущество \/ помеха/i.test(text));
    check("editor palette lists combatStart and rollAdvantage", hasCombatStartItem && hasAdvantageItem,
      `combatStart=${hasCombatStartItem} rollAdvantage=${hasAdvantageItem}`);
    palette?.querySelector("input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, composed: true }));

    // Select reminder node and inspect audience dropdown options.
    (await until(() => shadow?.querySelector('.react-flow__node[data-id="rem"]')))?.click();
    const audienceSelect = await until(() => [...(shadow?.querySelectorAll(".bna-inspector select") ?? [])]
      .find(sel => [...sel.options].some(opt => opt.value === "target")));
    const audienceValues = [...(audienceSelect?.options ?? [])].map(opt => opt.value);
    check("reminder inspector has 5 audience filter options",
      JSON.stringify(audienceValues) === JSON.stringify(["auto", "self", "gm", "target", "all"]),
      audienceValues.join(","));
    await app.close();
    app = null;

    // 2. combatStart: deduplicates multi-token actor and fires public combatStart reminder once.
    const buddy = await Actor.implementation.create({
      name: "BNA Live Buddy", type: "character",
      prototypeToken: { actorLink: true, disposition: 1 },
      system: { attributes: { hp: { value: 10, max: 30 } } },
      flags: { [SCOPE]: { blueprints: [
        bp("LiveCmbStartA001", "BNA Live Combat Start A", [
          node("ev", "event", "combatStart", {}, 0),
          node("heal", "result", "resource", { action: "restore", resource: "hp", amount: "5", who: "self", common }, 324),
          node("rem", "result", "reminder", { audience: "all", text: "BNA Live Combat Begins", common }, 648)
        ], [edge("ev", "out", "heal"), edge("ev", "out", "rem")])
      ] } }
    });
    cleanup.push(() => buddy.delete());
    const combatTokens = await scene.createEmbeddedDocuments("Token", [
      (await buddy.getTokenDocument({ x: size * 2, y: size * 2 })).toObject(),
      (await buddy.getTokenDocument({ x: size * 3, y: size * 2 })).toObject()
    ]);
    cleanup.unshift(() => scene.deleteEmbeddedDocuments("Token", combatTokens.map(t => t.id).filter(id => scene.tokens.has(id))));
    const combat = await Combat.implementation.create({ scene: scene.id, active: true });
    cleanup.unshift(() => game.combats.has(combat.id) ? combat.delete() : null);
    await combat.createEmbeddedDocuments("Combatant", combatTokens.map((t, i) => ({
      tokenId: t.id, sceneId: scene.id, actorId: buddy.id, initiative: 20 - i
    })));
    await combat.startCombat();
    check("combatStart fires once per distinct actor even with two tokens",
      await until(() => buddy.system.attributes.hp.value === 15) && (await wait(250), buddy.system.attributes.hp.value === 15),
      buddy.system.attributes.hp.value);
    const combatPubMsg = await until(() => game.messages.find(m => (m.timestamp >= since) && m.content.includes("BNA Live Combat Begins")));
    check("combatStart public reminder posts without whispers", !!combatPubMsg && (combatPubMsg.whisper.length === 0),
      `found=${!!combatPubMsg} whisper=${combatPubMsg?.whisper.length}`);
    await combat.delete();

    // 3. rollAdvantage: immediate, mutual cancellation, interactive dialog button & highlight, and next-roll rider.
    const advHero = await Actor.implementation.create({
      name: "BNA Live Adv Hero", type: "character",
      prototypeToken: { actorLink: true, disposition: 1 },
      flags: { [SCOPE]: { blueprints: [
        bp("LiveAdvImm000001", "BNA Live Adv Immediate", [
          node("ev", "event", "attackRoll", { reach: { mode: "self" } }, 0),
          node("adv", "result", "rollAdvantage", { mode: "advantage", common }, 324)
        ], [edge("ev", "out", "adv")]),
        bp("LiveDisCancel001", "BNA Live Dis Cancel", [
          node("ev", "event", "savingThrow", { reach: { mode: "self" } }, 0),
          node("dis", "result", "rollAdvantage", { mode: "disadvantage", common }, 324)
        ], [edge("ev", "out", "dis")]),
        bp("LiveAdvRider0001", "BNA Live Adv Rider", [
          node("ev", "event", "afterAttack", { reach: { mode: "self" } }, 0),
          node("ride", "result", "rider", {
            scope: "nextRoll", who: "self", roll: "abilityCheck", duration: { unit: "uses", value: 1 },
            effect: { type: "rollAdvantage", data: { mode: "advantage" } }, common
          }, 324)
        ], [edge("ev", "hit", "ride")])
      ] } },
      items: [foundry.utils.deepClone(swordData)]
    });
    cleanup.push(() => advHero.delete());

    const atkActivity = advHero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const fastAdvRoll = (await atkActivity.rollAttack({}, { configure: false }, { create: false }))?.[0];
    check("rollAdvantage immediate sets fast-forward attack to 2d20kh",
      (fastAdvRoll?.options.advantageMode === 1) && (fastAdvRoll?.terms[0]?.number === 2),
      `mode=${fastAdvRoll?.options.advantageMode} formula=${fastAdvRoll?.formula}`);

    // Disadvantage result + base advantage on savingThrow -> mutual cancellation -> normal (1d20, mode 0).
    const cancelSave = (await advHero.rollSavingThrow({ ability: "str", advantage: true }, { configure: false }, { create: false }))?.[0];
    check("rollAdvantage disadvantage cancels pre-existing advantage (mode 0)",
      (cancelSave?.options.advantageMode === 0) && (cancelSave?.terms[0]?.number === 1),
      `mode=${cancelSave?.options.advantageMode} formula=${cancelSave?.formula}`);

    // Open a real dialog with ONLY an optional rollAdvantage choice -> clicking Apply highlights Advantage and submits 2d20kh.
    const optHero = await Actor.implementation.create({
      name: "BNA Live Opt Adv Hero", type: "character",
      items: [{
        ...foundry.utils.deepClone(swordData),
        flags: { [SCOPE]: { blueprints: [
          bp("LiveOptAdv000001", "BNA Live Opt Adv", [
            node("ev", "event", "attackRoll", { reach: { mode: "self" } }, 0),
            node("opt", "result", "rollAdvantage", { mode: "advantage", common: { ...common, optional: true } }, 324)
          ], [edge("ev", "out", "opt")])
        ] } }
      }]
    });
    cleanup.push(() => optHero.delete());

    let dialogApp = null;
    const hookId = Hooks.once("renderRollConfigurationDialog", rendered => { dialogApp = rendered; });
    const optAtk = optHero.items.getName("Longsword").system.activities.getByType("attack")[0];
    const rollPromise = optAtk.rollAttack({}, { configure: true }, { create: false });
    await until(() => dialogApp?.element?.querySelector(".bna-panel button"));
    Hooks.off("renderRollConfigurationDialog", hookId);

    const beforeAdvDef = dialogApp?.element?.querySelector('button[data-action="advantage"]')?.hasAttribute("autofocus")
      || (dialogApp?.options?.defaultButton === "advantage");
    dialogApp?.element?.querySelector(".bna-panel .bna-choice__apply")?.click();
    const advAutofocused = await until(() =>
      dialogApp?.element?.querySelector('button[data-action="advantage"]')?.hasAttribute("autofocus")
    );
    const isDefaultMarked = (dialogApp?.options?.defaultButton === "advantage") && !!advAutofocused;
    const defSubmitBtn = dialogApp?.element?.querySelector('button[data-action][autofocus]');
    defSubmitBtn?.click();
    const interactiveRolls = await rollPromise;
    const interactiveRoll = interactiveRolls?.[0];
    check("optional rollAdvantage inside open dialog switches defaultButton and rolls advantage",
      !beforeAdvDef && isDefaultMarked && (interactiveRoll?.options.advantageMode === 1) && (interactiveRoll?.terms[0]?.number === 2),
      `before=${beforeAdvDef} defaultBtn=${dialogApp?.options?.defaultButton} rolled=${interactiveRoll?.formula}`);

    // Rider carrying rollAdvantage applies to next check.
    const advTokenDocs = await scene.createEmbeddedDocuments("Token", [(await advHero.getTokenDocument({ x: size * 5, y: size * 2 })).toObject()]);
    const foeActor = await Actor.implementation.create({
      name: "BNA Live Target", type: "npc",
      ownership: nonGm ? { default: 0, [nonGm.id]: 3 } : { default: 0 },
      prototypeToken: { actorLink: true, disposition: -1 }
    });
    cleanup.push(() => foeActor.delete());
    const [foeTok] = await scene.createEmbeddedDocuments("Token", [(await foeActor.getTokenDocument({ x: size * 6, y: size * 2 })).toObject()]);
    cleanup.unshift(() => scene.deleteEmbeddedDocuments("Token", [advTokenDocs[0].id, foeTok.id].filter(id => scene.tokens.has(id))));
    await advHero.update({
      [`flags.${SCOPE}.riders.LiveAdvRide1`]: {
        id: "LiveAdvRide1", created: Date.now(), scope: "nextRoll", roll: "abilityCheck", activation: null, uses: 1, until: null,
        effect: { type: "rollAdvantage", data: { mode: "advantage" } },
        source: { name: "LiveRider", origin: null, blueprintId: "LiveAdvRider0001", nodeId: "ride" }
      }
    });
    const riderCheck = (await advHero.rollSkill({ skill: "ath" }, { configure: false }, { create: false }))?.[0];
    check("rider carrying rollAdvantage grants advantage to next abilityCheck",
      (riderCheck?.options.advantageMode === 1) && (riderCheck?.terms[0]?.number === 2),
      `mode=${riderCheck?.options.advantageMode} formula=${riderCheck?.formula}`);

    // 4. Reminder audience filters in open dialog, cancelled dialog, submitted dialog, and fast-forward.
    const remActor = await Actor.implementation.create({
      name: "BNA Live Rem Actor", type: "character",
      prototypeToken: { actorLink: true, disposition: 1 },
      flags: { [SCOPE]: { blueprints: [
        bp("LiveRemFilter001", "BNA Live Rem Filters", [
          node("ev", "event", "abilityCheck", { reach: { mode: "self" } }, 0),
          node("rAuto", "result", "reminder", { audience: "auto", text: "BNA Live AutoNote", common }, 324),
          node("rGm", "result", "reminder", { audience: "gm", text: "BNA Live GmNote", common }, 324),
          node("rTarget", "result", "reminder", { audience: "target", text: "BNA Live TargetNote", common }, 324),
          node("rAll", "result", "reminder", { audience: "all", text: "BNA Live AllNote", common }, 324)
        ], [edge("ev", "out", "rAuto"), edge("ev", "out", "rGm"), edge("ev", "out", "rTarget"), edge("ev", "out", "rAll")])
      ] } }
    });
    cleanup.push(() => remActor.delete());
    canvas.tokens.setTargets([foeTok.id]);
    cleanup.unshift(() => canvas.tokens.setTargets([]));

    // Cancel roll dialog -> zero notes posted to chat.
    let cancelDlg = null;
    Hooks.once("renderRollConfigurationDialog", rendered => { cancelDlg = rendered; });
    const cancelPromise = remActor.rollSkill({ skill: "acr" }, { configure: true }, { create: false });
    await until(() => cancelDlg?.element);
    const notesText = [...(cancelDlg?.element?.querySelectorAll(".bna-panel .bna-note") ?? [])].map(el => el.textContent ?? "").join(" | ");
    check("GM roll dialog shows auto and gm notes but not target or all notes",
      notesText.includes("BNA Live AutoNote") && notesText.includes("BNA Live GmNote")
        && !notesText.includes("BNA Live TargetNote") && !notesText.includes("BNA Live AllNote"),
      notesText);
    await cancelDlg.close();
    await cancelPromise;
    await wait(150);
    const afterCancelMsgs = game.messages.filter(m => (m.timestamp >= since) && /BNA Live (Auto|Gm|Target|All)Note/.test(m.content));
    check("cancelling roll dialog posts zero reminder chat messages", afterCancelMsgs.length === 0, afterCancelMsgs.length);

    // Submit roll dialog -> only unshown notes (`target` and `all`) post to chat!
    let subDlg = null;
    Hooks.once("renderRollConfigurationDialog", rendered => { subDlg = rendered; });
    const subPromise = remActor.rollSkill({ skill: "acr" }, { configure: true }, { create: false });
    await until(() => subDlg?.element?.querySelector('button[data-action="normal"]'));
    const submitStart = Date.now();
    subDlg.element.querySelector('button[data-action="normal"]')?.click();
    await subPromise;
    await until(() => game.messages.some(m => (m.timestamp >= submitStart) && m.content.includes("BNA Live AllNote")));
    await wait(150);
    const subMsgs = game.messages.filter(m => (m.timestamp >= submitStart) && /BNA Live (Auto|Gm|Target|All)Note/.test(m.content));
    const pubCard = subMsgs.find(m => m.content.includes("BNA Live AllNote"));
    const tgtCard = subMsgs.find(m => m.content.includes("BNA Live TargetNote"));
    const dupAutoOrGm = subMsgs.some(m => /AutoNote|GmNote/.test(m.content));
    const expectedTgtIds = game.users.filter(u => u.isGM || foeActor.testUserPermission(u, "OWNER")).map(u => u.id).sort();
    check("submitting dialog posts target & public chat without duplicating dialog-shown auto/gm notes",
      !!pubCard && (pubCard.whisper.length === 0) && !!tgtCard && !dupAutoOrGm
        && JSON.stringify([...tgtCard.whisper].sort()) === JSON.stringify(expectedTgtIds),
      `msgs=${subMsgs.length} pubWhisper=${pubCard?.whisper.length} tgtWhisper=${tgtCard?.whisper.join(",")} dup=${dupAutoOrGm}`);

    // Fast-forward (`configure: false`): dialog skipped -> auto & gm whisper too!
    const ffStart = Date.now();
    await remActor.rollSkill({ skill: "acr" }, { configure: false }, { create: false });
    await until(() => game.messages.some(m => (m.timestamp >= ffStart) && m.content.includes("BNA Live GmNote")));
    await wait(150);
    const ffMsgs = game.messages.filter(m => (m.timestamp >= ffStart) && /BNA Live (Auto|Gm|Target|All)Note/.test(m.content));
    const ffGm = ffMsgs.find(m => m.content.includes("BNA Live GmNote"));
    const ffAuto = ffMsgs.find(m => m.content.includes("BNA Live AutoNote"));
    const gmIds = game.users.filter(u => u.isGM).map(u => u.id).sort();
    check("fast-forward (no dialog) posts gm-only and auto whispers as well",
      !!ffGm && !!ffAuto && JSON.stringify([...ffGm.whisper].sort()) === JSON.stringify(gmIds),
      `ffMsgs=${ffMsgs.length} ffGmWhisper=${ffGm?.whisper.join(",")}`);
  } catch (error) {
    check("features live check ran to the end", false, error.stack ?? error.message);
  } finally {
    if (app) try { await app.close(); } catch {}
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { console.warn("BNA Live cleanup", error); }
    }
    const ids = game.messages.filter(m => (m.timestamp >= since) && /BNA Live/.test([m.speaker?.alias, m.flavor, m.content].join(" "))).map(m => m.id);
    if (ids.length) await ChatMessage.implementation.deleteDocuments(ids);
  }
  return report;
})();
