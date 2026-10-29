// Live check for roll-dialog choices (Plan 4, Task 10): part 2, verify and clean up.
(async () => {
  const report = [];
  const check = (name, pass, detail) => report.push({ name, pass: !!pass, detail: String(detail ?? "") });
  const hero = globalThis.bnaLiveActor;
  try {
    const rolls = await globalThis.bnaLiveRoll ?? [];
    const formulas = rolls.map(roll => `${roll.formula} [${roll.options.type}]`).join(" | ");
    check("smite applied with its scaled dice", rolls.some(roll => (roll.options.type === "radiant") && /3d8/.test(roll.formula)), formulas);
    check("level 2 slot spent", hero.system.spells.spell2.value === 0, hero.system.spells.spell2.value);
    check("level 1 slots untouched", hero.system.spells.spell1.value === 2, hero.system.spells.spell1.value);
  } catch (error) {
    check("verification ran", false, error.stack ?? error.message);
  } finally {
    await hero?.delete();
    delete globalThis.bnaLiveRoll;
    delete globalThis.bnaLiveActor;
  }
  return report;
})();
