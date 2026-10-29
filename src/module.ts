import "./foundry/styles.css";
import { MODULE_SCOPE } from "./core/storage/repository";
import { createApi, validateIntegrations } from "./foundry/api";
import { registerChoicePanel } from "./foundry/choice-panel";
import { registerHeaderControls } from "./foundry/header";
import { registerAuraPreviews } from "./foundry/aura-preview";
import { registerLibrary } from "./foundry/library";
import { registerMigrationMenu } from "./foundry/migration-app";
import { loadTraitTrees } from "./foundry/collect";
import { registerPreRollHooks } from "./foundry/preroll";
import { registerReactionHooks } from "./foundry/reaction-hooks";
import { registerTriggerHooks } from "./foundry/triggers";
import { registerRegionBehavior, registerRegionBehaviorSync } from "./foundry/region-behavior";
import { registerSaves } from "./foundry/saves";
import { registerSettings } from "./foundry/settings";
import { registerSocket } from "./foundry/socket";
import { log } from "./core/log";

const api = createApi();

// v1 hotbar macros call buildNAction.hotbarToggle(uuid); both globals name the same API.
Object.assign(globalThis, { BuildNAction: api, buildNAction: api });

Hooks.once("init", () => {
  registerSettings();
  registerLibrary();
  registerMigrationMenu();
  registerRegionBehavior();
  registerHeaderControls();
  const module = game.modules.get(MODULE_SCOPE);
  if (module) module.api = api;
});

Hooks.once("ready", () => {
  registerAuraPreviews();
  registerSocket();
  registerSaves();
  validateIntegrations();
  registerPreRollHooks();
  registerChoicePanel();
  registerReactionHooks();
  registerTriggerHooks();
  registerRegionBehaviorSync();
  loadTraitTrees().catch(error => log.warn("could not load language and tool trees", error));
  Hooks.callAll(`${MODULE_SCOPE}.ready`, api);
});
