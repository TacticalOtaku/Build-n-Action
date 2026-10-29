import { setDebugLogging } from "../core/log";
import { MODULE_SCOPE } from "../core/storage/repository";
import { read } from "../runtime/read";

/** World setting keys, unchanged from v1.0.6 so saved values carry over. */
export const SETTINGS = {
  disableScripts: "disableCustomScriptFilter",
  fumbleBelowOne: "allowFumbleNegation",
  padAuraRadius: "padAuraRadius",
  showAuraRanges: "showAuraRanges",
  allowPlayers: "allowPlayers",
  headerLabel: "headerLabel",
  showSheetTab: "showSheetTab"
} as const;

/** Per-user settings the editor keeps; not shown in the settings window. */
export const CLIENT_SETTINGS = {
  editorTheme: "editorTheme",
  editorEffects: "editorEffects",
  coachSeen: "coachSeen",
  debug: "debug"
} as const;

type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];
type ClientSettingKey = (typeof CLIENT_SETTINGS)[keyof typeof CLIENT_SETTINGS];

function register(key: SettingKey, name: string, initial: boolean, config = true, onChange?: () => void): void {
  game.settings.register(MODULE_SCOPE, key, {
    name: `BNA.Setting.${name}.name`,
    hint: `BNA.Setting.${name}.hint`,
    scope: "world",
    config,
    type: Boolean,
    default: initial,
    ...(onChange ? { onChange } : {})
  });
}

/** Re-render open document sheets so header controls follow the settings. */
function refreshSheets(): void {
  for (const application of foundry.applications.instances.values()) {
    if (read(application, "document") && read(application, "rendered")) void (application as ApplicationV2Instance).render();
  }
}

function registerClient(key: ClientSettingKey, type: typeof String | typeof Boolean, initial: string | boolean): void {
  game.settings.register(MODULE_SCOPE, key, { scope: "client", config: false, type, default: initial });
}

export function registerSettings(): void {
  register(SETTINGS.allowPlayers, "allowPlayers", true, true, refreshSheets);
  register(SETTINGS.headerLabel, "headerLabel", false, true, refreshSheets);
  register(SETTINGS.disableScripts, "disableScripts", false);
  register(SETTINGS.fumbleBelowOne, "fumbleBelowOne", false);
  register(SETTINGS.padAuraRadius, "padAuraRadius", true);
  register(SETTINGS.showAuraRanges, "showAuraRanges", false);
  // Kept (hidden) so its v1 value survives until the sheet tab returns in a later version.
  register(SETTINGS.showSheetTab, "showSheetTab", false, false);
  registerClient(CLIENT_SETTINGS.editorTheme, String, "auto");
  registerClient(CLIENT_SETTINGS.editorEffects, String, "full");
  registerClient(CLIENT_SETTINGS.coachSeen, Boolean, false);
  game.settings.register(MODULE_SCOPE, CLIENT_SETTINGS.debug, {
    name: "BNA.Setting.debug.name",
    hint: "BNA.Setting.debug.hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (enabled: unknown) => setDebugLogging(enabled === true)
  });
  setDebugLogging(clientSetting(CLIENT_SETTINGS.debug) === true);
}

export function setting(key: SettingKey): boolean {
  try {
    return game.settings.get(MODULE_SCOPE, key) === true;
  } catch {
    return false;
  }
}

export function clientSetting(key: ClientSettingKey): unknown {
  try {
    return game.settings.get(MODULE_SCOPE, key);
  } catch {
    return undefined;
  }
}

export function setClientSetting(key: ClientSettingKey, value: unknown): Promise<unknown> {
  return game.settings.set(MODULE_SCOPE, key, value);
}

/** The editor's theme: its own choice, else Foundry's application scheme, else the browser's. */
export function resolveEditorTheme(stored: unknown, applications: unknown, prefersLight: boolean): "dark" | "light" {
  if ((stored === "dark") || (stored === "light")) return stored;
  if ((applications === "dark") || (applications === "light")) return applications;
  return prefersLight ? "light" : "dark";
}
