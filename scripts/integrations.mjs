import {MODULE} from "./constants.mjs";

const SUPPORTED_INTEGRATIONS = Object.freeze({
  "midi-qol": Object.freeze({label: "Midi QOL", minimum: "14.0.10"}),
  dae: Object.freeze({label: "DAE", minimum: "14.0.12"})
});

/**
 * Report the runtime state of optional automation integrations.
 * @returns {Record<string, {active: boolean, compatible: boolean, minimum: string, version: string|null}>}
 */
export function getIntegrationStatus() {
  return Object.fromEntries(Object.entries(SUPPORTED_INTEGRATIONS).map(([id, support]) => {
    const module = game.modules.get(id);
    const version = module?.version ?? null;
    const compatible = !module?.active || !version || !foundry.utils.isNewerVersion(support.minimum, version);
    return [id, {
      active: module?.active === true,
      compatible,
      minimum: support.minimum,
      version
    }];
  }));
}

/** Validate active integrations without making either module mandatory. */
export function validateIntegrations() {
  const status = getIntegrationStatus();
  for (const [id, state] of Object.entries(status)) {
    if (!state.active || state.compatible) continue;
    const {label} = SUPPORTED_INTEGRATIONS[id];
    console.warn(`${MODULE.NAME} | ${label} ${state.version} is older than supported ${state.minimum}.`);
  }
  return status;
}

export {SUPPORTED_INTEGRATIONS};
