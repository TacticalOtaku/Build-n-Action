# Build-n-Action

Build-n-Action is a contextual bonus engine for Foundry Virtual Tabletop and the `dnd5e` system.

## Supported environment

- Foundry VTT `14.367`
- dnd5e `5.3.3`
- midi-qol `14.0.11`
- DAE `14.0.12`

midi-qol and DAE are optional integrations. Build-n-Action works with native dnd5e rolls when they are disabled.

## Version 1.0.7

- adds visual condition blueprints with named ports, branches, Boolean gates, validation, trial runs, undo and redo;
- expands condition help with examples and context requirements;
- updates the interface and fixes resizing of the bonus editor and item bonus workshop;
- adds texture-driven fire, distinct elemental animations and HP threshold effects, with independent effects and motion settings;
- preserves readable node content, reduced-motion support and idle renderer cleanup.

## Version 1.0.6

- applies bonuses again for actors whose token is on the active scene: the bonus collector
  read `Token#shape`, which Foundry v14 only assigns while a placeable is being drawn, and
  the resulting error aborted the roll hook before any bonus was collected;
- keeps dice modifiers on hit-die rolls and on any formula wrapped in a function or
  parentheses, which dnd5e uses for `max(1, ...)`;
- lets optional bonuses be applied at all, and only once per roll, instead of stacking a
  duplicate selector on every dialog rebuild;
- resolves roll data for bonuses stored on an active effect from the document the effect is
  embedded in, so formulas no longer evaluate to zero on effects with no origin;
- honours the multiply mode of the dice amount and size modifiers;
- fixes the explosive-dice toggle, which was decided by the unrelated maximum field;
- filters the character-sheet tab from its search box;
- restores window minimizing, the applied-bonuses overview, and the removal of the last
  repeat of a filter;
- localizes the spell-slot and healing labels that rendered as raw keys under dnd5e 5.3.3.

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

## Condition blueprints

Open an Actor, Item, Active Effect or Region's Build-n-Action workshop, edit a bonus,
then choose **Open blueprint**. Existing filters become an AND chain; bonuses without
an enabled graph retain their original behavior.

- Add conditions from the searchable library and combine them with AND, OR and NOT.
  Click an output dot, then an input dot to connect nodes. Select a node to edit its
  parameters, read an example or remove a connection. Each filter type has one
  configuration; repeatable comparisons stay grouped within that condition.
- Branch has one input and two named boolean outputs: Yes repeats its input, No
  inverts it. Unknown remains unknown on both. Each output can feed multiple nodes;
  these are boolean signals, not sequential execution paths. XOR, NAND and NOR have
  separate A/B inputs and one output. XOR accepts exactly one true input, NAND rejects
  only two true inputs, and NOR accepts only two false inputs. Named ports survive save
  and reload, and replacing A leaves B connected.
- Context conditions include Combat has started, Target is present and Item is present.
  They read the current roll context; the trial uses its selected item and target.
  The combat check uses the active encounter and does not test whose turn it is.
- Drag nodes to arrange them, drag the background to pan, scroll to zoom, or use Fit
  graph. Ctrl/Cmd+Z undoes changes; Ctrl/Cmd+Shift+Z redoes them. Focused nodes move
  with arrow keys (Shift for larger steps), Enter selects and Delete removes.
- Check graph identifies cycles, disconnected nodes, missing parameters and invalid
  connections. Invalid graphs cannot be saved and do not grant bonuses at runtime.
  Save blueprint persists the detached draft; closing an unsaved draft asks before
  discarding it. Editing requires ownership of the bonus document.
- Trial run evaluates conditions against a selected actor, item, activity and target.
  It reports pass, fail or unknown for each evaluated node without applying damage or
  spending resources. Scripts and dice/formula comparisons are skipped. It does not
  validate aura range, suppression or every possible roll context.
- Game Settings → Build-n-Action has separate **Elemental interface effects** and
  **Interface animations** switches, stored for this client. The interface also
  respects reduced-motion preferences. Dark and light Foundry themes are supported.
  Elemental effects use a clipped Canvas layer: fire and embers, drifting ice crystals,
  electric arcs, acid/poison bubbles, radiant motes and necrotic wisps. They activate on
  hover or keyboard focus and fade out afterward. Text and ports stay unobstructed.
  Motion disabled uses a subdued still frame; effects disabled removes the layer.
  The animation scheduler stops when idle, hidden or closed.

Changing filters in the regular sheet after saving a blueprint may require updating
the graph; open it again and resolve its diagnostics before using that bonus.

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

### Node effects

Ship `assets/vfx/fire-bed-v1.png` with the module. Fire uses a shared, lazy WebGL renderer with Canvas fallback. Lightning uses branching discharges; cold grows faceted ice; acid bubbles, poison vapour, radiant glints, necrotic wisps, force and thunder waves have distinct motion. Configured HP conditions display a red or green heartbeat according to their comparison, including while editing their threshold. This is a condition cue, not a live actor-health display.

Effects remain client-toggleable. Motion can be disabled separately; reduced-motion preferences produce a static, subdued frame. Renderers stop while idle or the document is hidden and release resources when the editor closes.
