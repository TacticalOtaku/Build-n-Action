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

1. **Open the editor.** Open an actor, item, effect or region sheet, and choose **Build-n-Action** in its header menu (its icon lights up while a blueprint on the document works). The setting *Show the Build-n-Action button in the title bar* adds a button to the title bar.
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
| Item | its owner's rolls while it is equipped; tick *Only rolls with this item* on a condition to limit it to rolls made with the item |
| Region (enter/leave) | the creature that entered or left |
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

Conditions offer **My effects** and **Target effects** alongside the existing status checks. These support custom Active Effects: match a full name (case-insensitive), or choose an effect source, drop an Active Effect, or enter its UUID. Set **Presence** to **Present** or **Absent**. Each check identifies one effect; combine checks with the condition's existing all/any mode.

Only active effects count by default; **Include inactive effects** also counts disabled and suppressed applicable effects. Transferred item effects are included. Target checks require a target. Source matching requires a retained link to the original effect, which new copies made by **Apply effect** preserve; use name matching for older or third-party copies whose source link is missing.

## Turns, regions and rests

Blueprints can start without a roll: at the start or end of a turn in combat, when a token enters or leaves a region, or after a short or long rest. They run on the GM's side, once each, and use results that do not change a roll: effects, resources, reminders (whispered to the owner and the GM), a bonus to a later roll, or a signal. Region events work on blueprints stored on the region; the module adds its region behavior for you.

## "And then"

Every result has an **"And then"** switch in its settings. Turn it on and the card gets an output: wire conditions and results from it to continue the chain, but only once the result has really been applied:

- a mandatory result, when the roll goes ahead;
- a player's choice, when the player applied it (and paid its cost) and the roll went ahead;
- a limited result, only while its limit allows;
- never when a module vetoed it through `build-n-action.preApplyResult`.

After "And then" come results that leave the roll alone: apply or remove an effect, resources, a bonus to the next roll, a signal or a reminder. They see the same roll, item and target as the result before them. There is no dialog to ask in, so optional results there apply at once and reminders are whispered to the owners and the GM.

## Demanded saves

"Demand a saving throw" makes the target, you, or the creatures in your aura roll a save against a DC (a number, a formula, or your spell save DC). Its **Succeeded** and **Failed** outputs continue the chain once the save is rolled, with the creature that saved as the target.

The player who owns the creature rolls it in their own dialog, so their bonuses apply. If they have not pressed "Roll" within 30 seconds, or no owner is connected, the GM rolls it; a player who pressed "Roll" gets another 30 seconds in the roll dialog. A GM must be connected for demanded saves to roll. Ability checks and events without a roll have no target: demand the save from yourself or your aura there.

## Counters

Counters are named numbers on an actor: rage charges, curse stacks, hits in a row.

- **Change counter** adds, subtracts, sets or resets one; the **Counter** check compares one with a number; formulas read them as `@counters.name` (and the target's as `@target.counters.name`).
- A counter is **shared on the actor** (every blueprint of the actor sees it) or **only this blueprint's**. Set them up with **Set up** in the blueprint's title block: minimum, maximum, starting value, and when it resets (by hand, on a short or long rest, on a long rest, or at the start of the turn). The title block shows the current values, each with a reset button.
- An unknown counter counts as 0 and still works with default settings; the linter points out names nobody set up. Names ignore capitals, and spaces become "_".
- The Test tab takes counter values for the run, starting from the chosen actor's.

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
| Show the Build-n-Action button in the title bar | Adds a title-bar button besides the header-menu entry. |
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
npm run check       # typecheck, ESLint, Vitest, build
npm run playground  # the editor alone, at http://localhost:5188
npm run build       # dist/module, with source maps (npm run watch rebuilds on change)
npm run deploy      # copy dist/module into %LOCALAPPDATA%/FoundryVTT/Data/modules/build-n-action (or FOUNDRY_DATA)
npm run release     # check, then dist/build-n-action-v<version>.zip and the root module.json
```

`npm run release` refuses to replace an existing archive. Instead of deploying you can link `dist/module` into Foundry's `Data/modules/build-n-action`. `tests/live/` holds scripts that check a running Foundry world from the browser console. The *Debug logging* client setting turns on `log.debug` output (`src/core/log.ts`).
