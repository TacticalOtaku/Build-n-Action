import test from "node:test";
import assert from "node:assert/strict";
import {registerSettings} from "../scripts/settings.mjs";
import {applyInterfacePreferences} from "../scripts/services/interface-preferences.mjs";

test("effects and motion are independent client settings and apply immediately", () => {
  const registrations = new Map(), body = {dataset: {}};
  const values = {visualEffects: true, interfaceMotion: false};
  const settings = {register(_module, key, config) {registrations.set(key, config);}, get(_module, key) {return values[key];}};
  registerSettings({settings, refreshInterface: () => applyInterfacePreferences({settings, body})});
  for (const key of ["visualEffects", "interfaceMotion"]) {
    assert.equal(registrations.get(key).scope, "client");
    assert.equal(registrations.get(key).default, true);
  }
  applyInterfacePreferences({settings, body});
  assert.deepEqual(body.dataset, {bnaEffects: "on", bnaMotion: "off"});
  values.visualEffects = false; registrations.get("visualEffects").onChange();
  assert.deepEqual(body.dataset, {bnaEffects: "off", bnaMotion: "off"});
});
