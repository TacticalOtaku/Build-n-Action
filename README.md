# Build-n-Action

Build-n-Action is a contextual bonus engine for Foundry Virtual Tabletop and the `dnd5e` system.

## Supported environment

- Foundry VTT `14.367`
- dnd5e `5.3.3`
- midi-qol `14.0.11`
- DAE `14.0.12`

midi-qol and DAE are optional integrations. Build-n-Action works with native dnd5e rolls when they are disabled.

## Version 1.0.5

- verified for Foundry VTT 14.367 and midi-qol 14.0.11;
- preserves midi-qol workflow targets for BnA filters and `@target` roll data;
- opens the roll configuration only when an optional BnA bonus needs a choice, including midi-qol fast-forward rolls;
- restores editable effect-bonus images with immediate preview and a safe fallback for broken paths;
- keeps the dnd5e 5.3.3 character-sheet tab on public render and tab APIs.

## Features

Bonuses can be attached to Actors, Items, Active Effects, and Scene Regions. Supported roll categories include:

- attack rolls, including critical and fumble thresholds;
- damage rolls and critical damage;
- saving throw DCs;
- saving throws and death saves;
- ability, skill, and tool checks;
- hit-die rolls.

Bonuses can use roll-data formulas such as `@abilities.int.mod` and target data through `@target`. Filters restrict bonuses by item type, activity, spell details, damage type, conditions, creature data, equipment, proficiency, distance, target, and other roll context.

Optional bonuses can consume item uses, quantities, spell slots, hit points, currency, inspiration, or an Active Effect. Auras can affect allies, enemies, or all tokens by range or measured template, with optional sight, movement-path, and status-blocker checks.

## Data ownership

This module intentionally has no migration or compatibility layer for other bonus modules.

- Document data: `flags.build-n-action`
- Settings: `build-n-action.*`
- Hooks: `build-n-action.*`
- Text enricher: `@BNA[uuid]`

## Public API

The canonical API is available from:

```js
const api = game.modules.get("build-n-action").api;
```

For macros, the same API is exposed as `BuildNAction` and `buildNAction`.

Main methods:

```js
api.applyMarkers(document);
api.createBonus(data, parent);
api.duplicateBonus(bonus);
api.embedBonus(document, bonus, options);
api.findEmbeddedDocumentsWithBonuses(document);
api.fromUuid(uuid);
api.fromUuidSync(uuid);
api.getCollection(document);
api.getIntegrationStatus();
api.hotbarToggle(uuid);
api.openBonusWorkshop(document);
```

The API also exposes proficiency helpers, filter functions, data models, field models, and application classes under `api.abstract` and `api.filters`.

## Hooks

```js
Hooks.on("build-n-action.preInitializeRollHooks", () => {});
Hooks.on("build-n-action.initializeRollHooks", () => {});
Hooks.on("build-n-action.ready", (api, integrations) => {});
Hooks.on("build-n-action.preFilterBonuses", (bonuses, subjects, details, rollType) => {});
Hooks.on("build-n-action.filterBonuses", (bonuses, subjects, details, rollType) => {});
Hooks.on("build-n-action.applyOptionalBonus", (bonus, roller, target, config) => {});
```

Returning `false` from `build-n-action.applyOptionalBonus` cancels that optional bonus.

## Development

```sh
npm install
npm test
npm run build
```

The build produces `module.mjs` and `module.css` directly in the project root. Installation scripts do not create links or folders in Foundry's user-data directory.
