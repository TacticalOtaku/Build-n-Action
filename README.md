# Build-n-Action

Blueprints for Foundry VTT and dnd5e: small graphs that read **When → If → Then**. A blueprint changes a roll before it is made (a bonus, a better critical range, a higher save DC). It can also react to the outcome: knock a target prone on a hit, restore hit points when a foe drops, or set up a bonus for the next roll.

## Requirements

| Package | Version |
|---|---|
| Foundry VTT | 14.367 |
| dnd5e | 5.3.3 |
| Midi QOL (optional) | 14.0.12 |
| DAE (optional) | 14.0.14 |

Everything works with plain dnd5e rolls. With Midi QOL, reactions follow its workflows. With DAE, blueprints on effects follow its conditions and special durations.

Install from the manifest URL:
`https://raw.githubusercontent.com/TacticalOtaku/Build-n-Action/main/module.json`

## Quick start

1. **Open the editor.** Open an actor, item, effect or region sheet, and choose **Blueprints** in its header menu. The setting *Show the Blueprints button in the title bar* adds a button to the title bar.
2. **Create a blueprint.** Choose **From a template** for one of the 14 presets, or **New blueprint** for an empty one.
3. **Build the chain.**
   - Press **Space** on the canvas to add a node.
   - Drag from a pin to wire it.
   - An event (*When*) leads through optional conditions (*If*) to results (*Then*).
   - The title block reads the chain back as a sentence.
4. **Try it.** Press **▶ Test** to run the blueprint on an actor, item and target without rolling. The Test tab shows which step passed or stopped, and why.

## Where blueprints live

| Carrier | Works for |
|---|---|
| Actor | that actor's rolls |
| Item | its owner's rolls; checks can require "this item only" |
| Active Effect | its actor's rolls, while the effect is active |
| Region | creatures in the region |

The event's *reach* also lets a blueprint act on others:
- *Aura*: creatures within a range, optionally blocked by walls;
- *Template*: creatures inside my measured templates.

## Effects and DAE

A blueprint on an Active Effect works exactly while the effect is active. Anything that switches the effect switches the blueprint:
- DAE's *disable condition* (for example `@attributes.hp.value <= 0`);
- special durations such as *0 HP*;
- equipping the item that carries the effect.

In the editor, the title block shows the effect's state and its DAE rules. **More → Move to a new effect** moves a blueprint from an actor or item onto a new effect.

## Library

The world library keeps blueprints to reuse:
- **More → Save to the library** stores a copy;
- **Library** in the list applies a copy to the open document.

The GM can import and export JSON, a single blueprint or the whole library. Blueprints can also be dragged from one editor's list to another.

## Upgrading from 1.x

Nothing breaks when you update.
- v1 bonuses keep working; they are read as blueprints.
- Old UUIDs and `buildNAction.hotbarToggle(uuid)` macros still work.

When you are ready, open *Settings → Build-n-Action → Migrate the world*:
1. **Scan.** A dry run lists what will convert and changes nothing. Optionally include Actor and Item compendiums; locked ones are unlocked for the run and locked again.
2. **Migrate.** The converted bonuses become blueprints; the originals are kept as backups.
3. **Delete backups** once you have checked the result.

Running it again converts nothing twice. The `@BNA[…]` enricher and the character-sheet tab are gone in 2.0; see the [CHANGELOG](CHANGELOG.md).

## Settings

| Setting | What it does |
|---|---|
| Let players edit blueprints | Players can open the editor on documents they own. |
| Show the Blueprints button in the title bar | Adds a title-bar button besides the header-menu entry. |
| Turn off script checks | Script checks pass without running their code. |
| Allow removing fumbles | Blueprints may lower the fumble range below 1. |
| Measure auras from the token's edge | On gridless scenes, add half the source token's size to aura ranges. |
| Show aura ranges | Draw each aura a roll checks. |
| Migrate the world | The migration wizard (GM). |

## API

```js
const api = game.modules.get("build-n-action").api; // also globalThis.BuildNAction and buildNAction

api.blueprints.get(document);                 // stored blueprints, v1 bonuses included
api.blueprints.create(document, data);        // new blueprint, returns it
api.blueprints.save(document, blueprint);
api.blueprints.delete(document, id);
api.blueprints.uuid(document, id);            // "<document uuid>.Blueprint.<id>"
api.blueprints.toggle(uuid);
api.blueprints.duplicate(uuid);
api.blueprints.fromUuid(uuid);                // a blueprint UUID or a v1 "…ContextualBonus.<id>"
api.blueprints.compile(blueprint);
api.blueprints.simulate(blueprint, context);  // the Test tab's dry run
api.openEditor(document, { blueprintId });
api.library.list(); api.library.add(blueprint); api.library.apply(id, document);
api.library.export(ids); api.library.import(json); api.library.remove(id);
api.migration.scan(options); api.migration.run(options); api.migration.deleteBackups(options); api.migration.open();
api.getIntegrationStatus();                   // Midi QOL and DAE: active, version, compatible
api.hotbarToggle(uuid);                       // v1 macros
```

## Hooks

```js
Hooks.on("build-n-action.ready", api => {});
Hooks.on("build-n-action.preEvaluate", (event, context) => {});        // return false to skip
Hooks.on("build-n-action.evaluate", (event, context, results) => {});
Hooks.on("build-n-action.preApplyResult", (result, context) => {});    // return false to drop one result
Hooks.on("build-n-action.applyResult", (result, context) => {});
```

## Development

```sh
npm install
npm test            # Vitest: core, runtime and editor
npm run typecheck
npm run lint
npm run playground  # the editor alone, at http://localhost:5188
npm run build       # dist/module, with source maps
npm run release     # dist/build-n-action-v<version>.zip and the root module.json
```

Link `dist/module` into Foundry's `Data/modules/build-n-action` to run the development build. `tests/live/` holds scripts that check a running Foundry world from the browser console.
