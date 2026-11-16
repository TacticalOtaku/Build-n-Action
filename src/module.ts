import "./foundry/styles.css";
import { MODULE_SCOPE } from "./core/storage/repository";
import { createApi, validateIntegrations } from "./foundry/api";
import { registerHeaderControls } from "./foundry/header";
import { registerAuraPreviews } from "./foundry/aura-preview";
import { registerLibrary } from "./foundry/library";
import { registerMigrationMenu } from "./foundry/migration-app";
import { loadTraitTrees } from "./foundry/collect";
import { receiveTrigger, registerPlayHooks } from "./foundry/play";
import { registerRegionBehavior, registerRegionBehaviorSync } from "./foundry/region-behavior";
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
  registerSocket(receiveTrigger);
  validateIntegrations();
  registerPlayHooks();
  registerRegionBehaviorSync();
  loadTraitTrees().catch(error => log.warn("could not load language and tool trees", error));
  Hooks.callAll(`${MODULE_SCOPE}.ready`, api);
});
