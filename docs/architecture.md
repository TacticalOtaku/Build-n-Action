# Build-n-Action architecture

A map of the code for anyone extending it. Supported platform: Foundry VTT 14.367, dnd5e 5.3.3; Midi QOL and DAE
optional. The public API and hooks are listed in the README.

## Layers

```text
src/
  module.ts          composition root: settings, library, migration menu, region behavior, header controls,
                     then (at ready) socket, saves, roll hooks, choice panel, reactions, triggers, api.ready
  core/              pure logic — no Foundry globals, unit tested with Vitest
    blueprint/         blueprint types, factory, normalisation, validation, ids
    registry/          node, event and field definitions
    engine/            compile, interpreter, evaluators, lint, reasons
    graph/  phrase/  counters/  presets/  facts/
    storage/           flag layout (repository) and the library format; legacy/ reads v1 bonuses
    i18n.ts, log.ts    the localisation slice the core needs; the module's only console writer
  runtime/           pure roll-time logic: dice, saves, riders, limits, outcomes, triggers, continuations, and the
                     Operation objects that describe document changes
  foundry/           everything that touches Foundry and dnd5e: roll and reaction hooks, triggers, saves, socket,
                     document reads and writes (operations.ts executes runtime Operations), settings, migration,
                     region behavior, library, api; editor/ mounts the React editor in an ApplicationV2 window
  ui/                the React editor (canvas, inspector, palette, library, test tab, lint, effects); it talks to
                     Foundry only through the EditorHost interface in ui/host.ts
  build/             module.json generation (manifest.ts) and the zip writer
  lang/              en.json, ru.json — copied to lang/ in the package
playground/          the editor alone on mock data (EditorHost implemented with fixtures)
```

The dependency direction is one-way: `ui` → `runtime` / `core`; `foundry` → `runtime` → `core`. Anything with a Foundry global
belongs in `foundry/`. The UI never imports from `foundry/`; new host capabilities are added to `EditorHost`.

## Data

Blueprints are stored in `flags.build-n-action.blueprints` on actors, items, active effects and regions; v1 bonuses
(`flags.build-n-action.bonuses`) are still read and converted by the migration wizard, which keeps the originals as
backups until the GM deletes them. The world library is the `library` world setting; only the GM changes it.

## Changes on other clients

Document changes a player's client may not make run on the GM: `foundry/socket.ts` sends the Operation over
`module.build-n-action` and waits up to 15 s for the reply. Turn, region and rest triggers and demanded saves need a
connected GM. Incoming messages are type-checked before use, and the GM refuses changes outside the sender's reach: what they own and creatures on the scene they look at.

## Checks

`npm run check` runs `tsc`, ESLint, the module build and Vitest. `tests/live/` holds scripts that exercise a running
Foundry world from the browser console. `npm run playground` serves the editor alone at http://localhost:5188.
