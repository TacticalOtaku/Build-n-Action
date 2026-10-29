import { modifyDie, type DieLike, type ModifierSpec } from "../runtime/dice";

/** A formula's total with roll data, or null when it is not a deterministic number (dice throw here, as in v1). */
export function evaluateNumber(formula: string, data: Record<string, unknown>): number | null {
  try {
    const total = Number(Roll.create(Roll.replaceFormulaData(formula, data)).evaluateSync().total);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/** dnd5e's simplifyBonus as a number, or null when it fails; used where v1 used simplifyBonus. */
export function simplifyNumber(formula: string, data: Record<string, unknown>): number | null {
  try {
    const value = dnd5e.utils.simplifyBonus(formula, data);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function replaceData(text: string, data: Record<string, unknown>): string {
  return Roll.replaceFormulaData(text, data);
}

/** Resolve roll-data references against a blueprint's origin; missing values become 0 (v1). */
export function resolveForeign(formula: string, data: Record<string, unknown>): string {
  return Roll.replaceFormulaData(formula, data, { missing: 0 });
}

/**
 * The formula of an optional bonus paid `scale` steps above its minimum (v1 _scaleOptionalBonus):
 * the base formula plus the scaling formula multiplied by the scale.
 */
export function scaledFormula(formula: string, scaleFormula: string, data: Record<string, unknown>, scale: number): string {
  const base = scale ? (scaleFormula || formula) : formula;
  const roll = new CONFIG.Dice.DamageRoll(base, data);
  if (!scale) return roll.formula;
  const scaled = roll.alter(scale, 0, { multiplyNumeric: true }).formula;
  const resolved = Roll.replaceFormulaData(formula, data);
  return dnd5e.dice.simplifyRollFormula(`${resolved} + ${scaled}`, { preserveFlavor: true });
}

function isRoll(value: unknown): value is RollLike {
  return value instanceof Roll;
}

function applyToDie(die: DieTermLike, spec: ModifierSpec): void {
  if (isRoll(die._number) && die._number.isDeterministic) die._number = die._number.evaluateSync().total;
  if (isRoll(die._faces) && die._faces.isDeterministic) die._faces = die._faces.evaluateSync().total;
  const view: DieLike = {
    number: (typeof die._number === "number") ? die._number : null,
    faces: (typeof die._faces === "number") ? die._faces : ((typeof die.faces === "number") ? die.faces : null),
    modifiers: die.modifiers
  };
  modifyDie(view, spec);
  if ((typeof die._number === "number") && (view.number !== null)) die._number = view.number;
  if ((typeof die._faces === "number") && (view.faces !== null)) die._faces = view.faces;
}

/**
 * Serialize terms after their dice changed. Function and parenthetical terms serialize from a cached
 * copy of their inner formula, so nested dice (dnd5e wraps hit dice in max(1, …)) are rebuilt first.
 */
function rebuildFormula(terms: unknown[]): string {
  const { FunctionTerm, ParentheticalTerm } = foundry.dice.terms;
  for (const term of terms) {
    if (term instanceof FunctionTerm) {
      term.rolls.forEach((roll, index) => {
        term.terms[index] = rebuildFormula(roll.terms);
      });
    } else if ((term instanceof ParentheticalTerm) && term.roll) {
      term.term = rebuildFormula(term.roll.terms);
    }
  }
  return Roll.fromTerms(terms).formula;
}

/**
 * Apply a modifier spec to every die in `parts` (mutated in place). Returns true when a
 * "first die only" modifier has been used and must not apply again.
 */
export function modifyFormulaParts(parts: unknown[], data: Record<string, unknown>, spec: ModifierSpec): boolean {
  for (let index = 0; index < parts.length; index++) {
    const roll = new CONFIG.Dice.DamageRoll(String(parts[index]), data);
    if (!roll.dice.length) continue;
    for (const die of roll.dice) {
      applyToDie(die, spec);
      if (spec.firstOnly) break;
    }
    parts[index] = rebuildFormula(roll.terms);
    if (spec.firstOnly) return true;
  }
  return false;
}
