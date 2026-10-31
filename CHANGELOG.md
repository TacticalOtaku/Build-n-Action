# Changelog

## 2.3.2

### Added
- **My effects** and **Target effects** condition checks, including custom Active Effects created by the GM.
- Match an effect by its full name (case-insensitive) or by its source: choose an available effect, drag an Active Effect into the field, or enter its UUID.
- Require an effect to be **Present** or **Absent**. Effects must be active by default; **Include inactive effects** also counts disabled and suppressed applicable effects. Transferred item effects are included.

### Improved
- Effects copied by **Apply effect** retain their source identity, including through repeated copies. Source checks distinguish effects with identical names. For older or third-party copies without a retained source link, use name matching.
- Source selection preserves the previous choice on invalid input and ignores outdated asynchronous lookup results. Explicitly invalid references on new checks fail instead of leaving the check unrestricted.

## 2.3.1

### Added
- **"Target hit points" check.** Like "My hit points", for the target: at most or at least a percentage of its hit points (temporary hit points not counted). Without a target the check fails.

### Fixed
- **A broken bonus formula no longer cancels the roll.** A formula such as `2d +` in one blueprint made the whole roll fail, with every other bonus. It is now skipped, the console says so once, and the editor marks it as before.
- **"After the target's save" works under Midi QOL when Midi does not roll saves.** With Midi's "Auto check saves" set to none, the targets roll from the save buttons on the card; those saves now start the reaction, as without Midi.
- **No more `senses.*` deprecation warnings from `@target`.** The target's roll data now carries plain sense values; formulas such as `@target.attributes.senses.darkvision` still work, and the target's actor is left untouched.
- **Aura previews and wall checks use the current Foundry canvas classes**, not globals that Foundry v15 removes.

### Development
- `tests/live/edge-check.js`: limits in a real combat, unlinked tokens, broken formulas and throwing scripts, rollers without a token, and target hit points after damage.

## 2.3.0

### Security
- **A script check runs only where no other player can edit it.** Before, a player's script ran in the GM's browser with the GM's rights whenever the GM evaluated that blueprint: at the start of the player's turn, or through an aura on an NPC's roll. Now the GM runs scripts only on documents no player owns, and a player runs only their own. Elsewhere the check fails, and the Test tab says why.
- **The GM checks who asked for a change.** A change a player's reaction sends to the GM must touch something that player owns, or a creature on the scene they are looking at. The sender now comes from Foundry, not from the message. Each field of the change is checked before it is used. Rest triggers run only for the player's own actors. Demanded-save answers are accepted only from the player who was asked.

### Fixed
- **Counter changes add up.** Two results changing the same counter on one roll (for example, two "+1 combo" blueprints) used to count once. With a GM connected, counter changes are made one at a time from the stored value.
- **A cancelled roll spends nothing.** Closing the roll dialog no longer uses up a limited bonus ("once per turn") or a rider. The `build-n-action.applyResult` hook now fires for a roll's results once the roll actually goes ahead.
- **Riders no longer overwrite each other.** A rider added by one client while another client uses a different one is kept. Riders are now stored by id; a list stored by an earlier version is converted the first time it changes.

### Development
- `npm run release` works right after a version bump: every build writes the root `module.json`, and `npm run check` builds before it tests.
- Removed unused code: `PRE_ROLL_EVENTS` and `getIn`.

## 2.2.1

### Fixed
- **The template picker no longer breaks the editor.** In a world whose blueprint library had never been saved, the "Templates" and "Library" buttons crashed the editor with React error #185 and left the window blank.

## 2.2.0

### Added
- **Debug logging** client setting: detailed diagnostics in the browser console, off by default.

### Development
- One logger (`src/core/log.ts`) replaces direct console calls; every message keeps the `Build-n-Action |` prefix.
- `npm run check` (typecheck, lint, tests, build), `npm run watch` (was `dev`), `npm run deploy`; `npm run release`
  runs the check first and never replaces an existing archive. Prettier with the shared configuration.
- Architecture notes in `docs/architecture.md`.

## 2.1.1

### Fixed
- **No Foundry v14 deprecation warnings** when saving counters or deleting migration backups. The module now uses v14 update operators instead of the old `-=` keys, which Foundry will stop accepting.
- **Attack reactions without Midi QOL** now listen to `dnd5e.rollAttack`, the hook dnd5e documents, not the `dnd5e.rollAttackV2` alias that newer dnd5e versions no longer call.
- **Test tab:** the "Who rolls" and "Target" lists are no longer rebuilt on every redraw or when a token moves. They refresh when a token is placed, removed, renamed, hidden or given another actor, or when an actor is created, deleted or renamed.

## 2.1.0

### New
- **Events without a roll:** turn start and end (in combat), a token entering or leaving a region, short and long rests. They run on the GM's side. Blueprints using them cannot be read by 2.0.x.
  - After updating, restart the world once: Foundry registers the module's region behavior only when a world starts.
- **Counters:** named numbers on an actor that blueprints change, check and use in formulas (`@counters.name`), shared on the actor or private to a blueprint, reset by hand, on rests or at the start of a turn. Blueprints using them cannot be read by 2.0.x.
- **Demanded saving throws:** a result that makes the target, you or your aura roll a save and continues on success or failure. The owner rolls; the GM rolls after 30 seconds. Blueprints using it cannot be read by 2.0.x.
- **"And then" output on every result:** continue the chain once the result has really been applied (chosen, within its limit, not vetoed). Blueprints with wires from results cannot be read by 2.0.x.

### Changed
- **"Only this item" is now a tick on the condition** (*Only rolls with this item*), shown for blueprints on items.
  - It is required on top of the other checks, even when the condition passes on any one of them.
  - The node card and the blueprint's sentence show it.
  - The linter notes it on a blueprint that is not on an item, where it has no effect.
- **Old blueprints keep working.** An "only this item" check in an all-of condition is read as the tick. v1 "exclusive" bonuses convert to it.

### Fixed
- Lint messages named events by their internal id (e.g. "damageRoll") instead of their label.
- The `build-n-action.applyResult` hook no longer reports reaction results that could not be applied.
- The palette's "Reminder" summary now says that without a roll dialog the note goes to chat.
- **Test tab:** "Who rolls" lists the scene's tokens first, like "Target", and both lists update when tokens are placed or removed; the window no longer has to be reopened.

## 2.0.1

### Fixed
- **Migration and v1 bonuses no longer gain a "My hit points ≤ 50%" check.** v1 stored every filter with default values, and a filter counted only once its type was chosen. 2.0.0 read the stored hit-point and token-size filters as turned on, so v1 bonuses stopped working above 50% hit points. This hit bonuses read directly and bonuses converted by "Migrate the world" alike.
- **Repair a migrated world:** run *Settings → Build-n-Action → Migrate the world* again.
  - The scan reports how many blueprints it will repair.
  - The repair removes the wrong checks, and a condition left empty goes too.
  - It works from the v1 originals kept as backups, so worlds whose backups were already deleted cannot be repaired this way.
  - Checks you changed yourself are left as they are.

### Changed
- **The sheet header control is called "Build-n-Action" again.**
- **Its icon lights up** while the document carries a blueprint that works now, as v1 marked documents with bonuses.

## 2.0.0

Build-n-Action 2.0 replaces contextual bonuses with **blueprints**: small graphs that read *When → If → Then*. A blueprint changes a roll before it is made, or reacts to its outcome. Everything a v1 bonus did can be built as a blueprint, and existing v1 bonuses keep working.

### New
- **Blueprint editor.** It opens from every actor, item, effect and region sheet (header menu, or a title-bar button with the setting on). It provides:
  - a node canvas with a palette, an inspector and a title block;
  - a sentence describing each blueprint;
  - light and dark themes, and effects per damage type.
- **Events:**
  - before a roll: attack roll, damage roll, save DC, saving throw, ability check, hit die;
  - after a roll: after an attack, after a target's save, after damage, after a check;
  - a signal sent by another blueprint.
- **Results:**
  - roll bonus, save DC bonus, dice modifiers, critical range, critical damage, save thresholds, reminder;
  - a bonus to a later roll;
  - apply or remove an effect, resources;
  - send a signal.
- **Checks:** 32 checks on the item, the roll, me and the target, plus value comparisons and custom scripts.
- **Test tab.** It runs a blueprint against a chosen actor, item and target without rolling, and explains every step.
- **Issues tab.** It lists problems while you edit, with a fix where there is one.
- **Optional results** ("Ask the player"), with costs and limits, appear in the roll dialog.
- **Reactions** work with and without Midi QOL; changes to other players' documents go through the GM.
- **Effects and DAE.** A blueprint on an Active Effect works exactly while the effect is active, so:
  - DAE's conditions and special durations switch it, and so does equipping;
  - the editor shows the effect's state and rules;
  - a blueprint moves onto a new effect in one step.
- **14 presets:** Bless, Bane, Hex, Hunter's Mark, Sneak Attack, Great Weapon Fighting, Archery Fighting Style, Brutal Critical, Lucky, Aura of Protection, Divine Smite, Colossus Slayer, Poisoned Blade and Vampiric Strike.
- **A world library.** Save blueprints to it and apply copies. Import and export JSON, and drag blueprints between documents.
- **"Migrate the world"** (GM settings menu) converts every v1 bonus in the world and chosen compendiums:
  - it starts with a dry run, then shows a report;
  - the v1 originals are kept as backups until you delete them.
- **"Show aura ranges"** draws each aura a roll checks.

### Upgrading from 1.x
- **Nothing breaks when you update.** v1 bonuses are read as blueprints until you migrate them.
- **Old links keep working:**
  - old UUIDs `…ContextualBonus.<id>` resolve;
  - dragging a v1 bonus still works;
  - `buildNAction.hotbarToggle(uuid)` macros still switch them.
- **Migrate when you are ready.** Run *Settings → Build-n-Action → Migrate the world*, check the report, then delete the backups.
- **Unlinked tokens are not migrated.** Their synthetic actors keep their v1 bonuses, which still work.

### Removed
- **The `@BNA[uuid]` text enricher.** Existing links render as plain text. Switch blueprints through Active Effects and DAE instead.
- **Creating hotbar macros by dragging a bonus.** Existing macros keep working.
- **v1 windows, replaced by the editor and the roll-dialog panel:**
  - the bonus workshop, bonus sheet, keys dialog, optional-bonus selector and applied-bonuses overview;
  - the character-sheet tab, which may return in a later version. Its setting is kept.
- **API:** `applyMarkers`, `createBonus`, `duplicateBonus`, `embedBonus`, `findEmbeddedDocumentsWithBonuses`, `getCollection`, `openBonusWorkshop`, `abstract` and `filters`. See the README for the 2.0 API.
- **Hooks:**
  - removed: `build-n-action.preInitializeRollHooks`, `initializeRollHooks`, `preFilterBonuses`, `filterBonuses` and `applyOptionalBonus`;
  - new: `preEvaluate`, `evaluate`, `preApplyResult` and `applyResult`;
  - `build-n-action.ready` now receives only the API.

### Requirements
Foundry VTT 14.367 and dnd5e 5.3.3. Midi QOL 14.0.12 and DAE 14.0.14 are optional.

## 1.0.6

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

## 1.0.5

- verified for Foundry VTT 14.367 and midi-qol 14.0.11;
- preserves midi-qol workflow targets for BnA filters and `@target` roll data;
- opens the roll configuration only when an optional BnA bonus needs a choice, including midi-qol fast-forward rolls;
- restores editable effect-bonus images with immediate preview and a safe fallback for broken paths;
- keeps the dnd5e 5.3.3 character-sheet tab on public render and tab APIs.
