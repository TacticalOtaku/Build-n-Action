// Live check of the 2.1.1 fixes. Run as GM after reactions-shared.js: a counter removed in the set-up dialog is gone
// (v14 ForcedReplacement, no deprecation warning), and the Test tab re-reads its subject lists only when they change.
(async () => {
  const { SCOPE, setup, blueprints, wait } = globalThis.bnaLive;
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const cleanup = [];
  const until = async (test, ms = 3000) => {
    for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (test()) return true;
    return test();
  };
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" "));
    warn.apply(console, args);
  };
  // One read of the lists localizes the group name once per token in a single burst; count the bursts.
  let reads = 0;
  let last = 0;
  const localize = game.i18n.localize;
  game.i18n.localize = function (key, ...rest) {
    if (key === "BNA.UI.Sim.onScene") {
      if (performance.now() - last > 50) reads++;
      last = performance.now();
    }
    return localize.call(this, key, ...rest);
  };
  cleanup.push(() => {
    console.warn = warn;
    game.i18n.localize = localize;
  });
  try {
    const { hero, heroToken } = await setup(blueprints().slice(0, 1), cleanup);
    await hero.setFlag(SCOPE, "counters", { defs: {
      rage: { name: "rage", min: 0, max: 3, initial: 3, reset: "longRest" },
      focus: { name: "focus", min: 0, max: null, initial: 1, reset: "never" }
    } });
    const app = await game.modules.get(SCOPE).api.openEditor(hero, { blueprintId: "LiveHitBonus0001" });
    cleanup.unshift(() => app?.close());
    await wait(2500);
    const root = [...document.querySelectorAll("*")].find(el => el.shadowRoot?.querySelector(".bna-inspector"))?.shadowRoot;

    // 1. Remove "focus" in the set-up dialog and save.
    root?.querySelector(".bna-stamp__counters .bna-stamp__effect-open")?.click();
    await until(() => root?.querySelector(".bna-counters"));
    const dialog = root?.querySelector(".bna-counters");
    const focusRow = [...(dialog?.querySelectorAll(".bna-counters__row") ?? [])].find(row => row.querySelector("input")?.value === "focus");
    focusRow?.querySelector("button.bna-iconbtn")?.click();
    await wait(200);
    [...(dialog?.querySelectorAll(".bna-counters__footer button") ?? [])].at(-1)?.click();
    const defs = () => Object.keys(hero.getFlag(SCOPE, "counters")?.defs ?? {}).sort().join(",");
    check("a removed shared counter is gone after saving", await until(() => defs() === "rage"), defs());
    check("the kept counter keeps its settings", hero.getFlag(SCOPE, "counters")?.defs?.rage?.max === 3, JSON.stringify(hero.getFlag(SCOPE, "counters")?.defs));
    const ours = warnings.filter(text => /-=|==|ForcedDeletion|ForcedReplacement|rollAttackV2/.test(text));
    check("no deprecation warning from the update", ours.length === 0, ours.join(" | "));

    // 2. The Test tab reads its lists on a change, not on every render or a token move.
    root?.querySelector('button[aria-label="Show a test run"], button[aria-label="Показать тестовый прогон"]')?.click();
    await wait(1500);
    const whoRolls = () => root?.querySelector(".bna-sim__setup select");
    check("the Test tab lists the hero", [...(whoRolls()?.options ?? [])].some(option => option.textContent === "BNA Live Hero"), "");
    reads = 0;
    const size = canvas.dimensions.size;
    await heroToken.update({ x: size * 6 });
    await wait(300);
    await heroToken.update({ x: size * 7 });
    await wait(500);
    check("moving a token does not re-read the lists", reads === 0, reads);
    await heroToken.update({ name: "BNA Live Renamed" });
    const renamed = () => [...(whoRolls()?.options ?? [])].some(option => option.textContent === "BNA Live Renamed");
    check("renaming a token refreshes the lists", await until(renamed), reads);
    check("one change is read once", reads === 1, reads);
  } catch (error) {
    check("live check ran to the end", false, error.stack ?? error.message);
  } finally {
    for (const undo of cleanup) {
      try { await undo(); } catch (error) { report.push({ name: "cleanup", pass: false, detail: error.message }); }
    }
  }
  return report;
})();
