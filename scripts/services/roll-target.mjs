function firstTarget(targets) {
  if (!targets) return null;
  if (typeof targets.first === "function") return targets.first() ?? null;
  return targets[Symbol.iterator]?.().next().value ?? null;
}

/**
 * Resolve the target used while evaluating a roll.
 * @param {object} rollConfig       Current dnd5e roll configuration.
 * @param {object} [options]
 * @param {boolean} [options.preferHitTargets]  Prefer confirmed Midi hits for damage rolls.
 * @param {Iterable} [options.userTargets]      Current Foundry user targets.
 * @returns {Token|null}
 */
export function resolveRollTarget(rollConfig = {}, {
  preferHitTargets = false,
  userTargets = globalThis.game?.user?.targets
} = {}) {
  const workflow = rollConfig.workflow ?? rollConfig.midiOptions?.workflow;
  const hasWorkflowTargets = workflow && (("targets" in Object(workflow)) || ("hitTargets" in Object(workflow)));
  if (hasWorkflowTargets) {
    if (preferHitTargets) {
      const hitTarget = firstTarget(workflow.hitTargets);
      if (hitTarget) return hitTarget;
    }
    return firstTarget(workflow.targets);
  }
  return firstTarget(userTargets);
}

/**
 * Resolve the target already attached to a filtering subject, falling back to
 * native Foundry targeting only for callers which have no explicit roll context.
 * @param {object} subjects          Filtering subjects.
 * @param {Iterable} userTargets    Current Foundry user targets.
 * @returns {Token|null}
 */
export function resolveSubjectTarget(subjects = {}, userTargets = globalThis.game?.user?.targets) {
  if (Object.hasOwn(subjects, "target")) return subjects.target ?? null;
  return firstTarget(userTargets);
}
