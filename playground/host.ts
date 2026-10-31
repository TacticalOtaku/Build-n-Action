import type { BlueprintSource } from "../src/core/blueprint/types";
import { runBlueprint, type BlueprintEnv } from "../src/core/engine/interpreter";
import { blueprintSignals } from "../src/core/engine/lint";
import { passed } from "../src/core/engine/reasons";
import type { ActivityFacts, ActorFacts, CreatureFacts, ItemFacts, RollFacts } from "../src/core/facts/types";
import { exportBlueprints, importBlueprints, readLibrary, withLibraryEntry, withoutLibraryEntry } from "../src/core/storage/library";
import { activityFacts, actorFacts, creatureFacts, itemFacts, rollDetails } from "../src/core/testing/facts";
import { read } from "../src/runtime/read";
import { rollDataPaths } from "../src/runtime/paths";
import type { EditorHost, LibraryHost, SimulationRequest } from "../src/ui/host";

type Language = "en" | "ru";
type Name = readonly [en: string, ru: string];

interface FixtureActivity { id: string; name: Name; facts: ActivityFacts }
interface FixtureItem { uuid: string; name: Name; facts: ItemFacts; activities: readonly FixtureActivity[] }
interface FixtureActor { uuid: string; name: Name; facts: ActorFacts; items: readonly FixtureItem[] }
interface FixtureTarget { uuid: string; name: Name; facts: CreatureFacts }

/** The playground document is Aria's longsword. */
const CARRIER = "Actor.aria.Item.longsword";
const EFFECTS = [
  { uuid: `${CARRIER}.ActiveEffect.blessing`, name: "Особое благословение" },
  { uuid: `${CARRIER}.ActiveEffect.hex`, name: "Custom Hex" }
];

const ACTORS: readonly FixtureActor[] = [
  {
    uuid: "Actor.aria",
    name: ["Aria, fighter", "Ария, воин"],
    facts: actorFacts({ uuid: "Actor.aria", effects: [{ name: "Особое благословение", uuid: "Actor.aria.ActiveEffect.blessingCopy", sources: [`${CARRIER}.ActiveEffect.blessing`], active: true }] }),
    items: [
      {
        uuid: CARRIER,
        name: ["Longsword “Aria”", "Длинный меч «Ария»"],
        facts: itemFacts({ uuid: CARRIER }),
        activities: [{ id: "attack", name: ["Attack", "Атака"], facts: activityFacts() }]
      },
      {
        uuid: "Actor.aria.Item.dagger",
        name: ["Dagger", "Кинжал"],
        facts: itemFacts({ uuid: "Actor.aria.Item.dagger", identifier: "dagger", baseTypes: ["simpleM", "dagger"], properties: ["fin", "lgt", "thr"] }),
        activities: [{ id: "attack", name: ["Attack", "Атака"], facts: activityFacts({ ability: "dex", damageTypes: ["piercing"] }) }]
      }
    ]
  },
  {
    uuid: "Actor.oswin",
    name: ["Brother Oswin, cleric", "Брат Освин, жрец"],
    facts: actorFacts({ uuid: "Actor.oswin", spellSlots: [{ level: 1, value: 2, max: 4 }, { level: 2, value: 1, max: 2 }] }),
    items: [
      {
        uuid: "Actor.oswin.Item.flame",
        name: ["Sacred Flame", "Священное пламя"],
        facts: itemFacts({
          uuid: "Actor.oswin.Item.flame", type: "spell", identifier: "sacred-flame", baseTypes: [], properties: ["vocal", "somatic"],
          spell: { level: 0, school: "evo", method: "spell", sourceClass: "cleric" }
        }),
        activities: [{
          id: "save",
          name: ["Saving throw", "Спасбросок"],
          facts: activityFacts({ type: "save", ability: null, attackType: null, attackClassification: null, damageTypes: ["radiant"], dcAbility: "wis" })
        }]
      }
    ]
  }
];

const TARGETS: readonly FixtureTarget[] = [
  { uuid: "Scene.crypt.Token.lich", name: ["Lich", "Лич"], facts: creatureFacts({ creatureTypes: ["undead"] }) },
  { uuid: "Scene.crypt.Token.bandit", name: ["Bandit", "Разбойник"], facts: creatureFacts({ creatureTypes: ["humanoid"] }) }
];

/** Roll data shared by the fixture actors; formulas and @ suggestions read it. */
const ROLL_DATA = {
  abilities: {
    str: { mod: 3, value: 16 }, dex: { mod: 1, value: 12 }, con: { mod: 2, value: 14 },
    int: { mod: 0, value: 10 }, wis: { mod: 1, value: 13 }, cha: { mod: 2, value: 15 }
  },
  attributes: { prof: 2, hp: { value: 38, max: 44, temp: 0 }, ac: { value: 17 } },
  details: { level: 5 },
  prof: 2
};

const PATHS = rollDataPaths(ROLL_DATA);
const PATH_SET = new Set(PATHS.map(path => path.slice(1)));

function name(value: Name, language: Language): string {
  return (language === "ru") ? value[1] : value[0];
}

/** Replace @paths with fixture values; null when a path is unknown. */
function replacePaths(formula: string): string | null {
  let unknown = false;
  const replaced = formula.replace(/@([A-Za-z_][\w.]*)/g, (_match, path: string) => {
    const value = read(ROLL_DATA, path);
    if ((typeof value !== "number") && (typeof value !== "string")) {
      unknown = true;
      return "0";
    }
    return String(value);
  });
  return unknown ? null : replaced;
}

/** A light stand-in for Roll.validate: allowed characters and balanced parentheses. */
function looksLikeFormula(formula: string): boolean {
  if (!/^[\w\s@.,+\-*/()]+$/.test(formula)) return false;
  let depth = 0;
  for (const char of formula) {
    if (char === "(") depth++;
    if (char === ")" && (--depth < 0)) return false;
  }
  return depth === 0;
}

function run(blueprint: BlueprintSource, request: SimulationRequest) {
  const actor = ACTORS.find(entry => entry.uuid === request.actorUuid);
  if (!actor) return null;
  const item = actor.items.find(entry => entry.uuid === request.itemUuid) ?? null;
  const activity = item ? (item.activities.find(entry => entry.id === request.activityId) ?? item.activities[0] ?? null) : null;
  const target = TARGETS.find(entry => entry.uuid === request.targetUuid) ?? null;
  const save = request.event === "savingThrow";
  const facts: RollFacts = {
    event: request.event,
    actor: actor.facts,
    item: item?.facts ?? null,
    activity: activity?.facts ?? null,
    target: target?.facts ?? null,
    roll: rollDetails({
      abilityId: save ? null : request.abilityId,
      skillId: request.skillId,
      saveAbility: save ? request.abilityId : null,
      proficiency: 1
    })
  };
  const env: BlueprintEnv = {
    evaluateNumber: formula => {
      const replaced = replacePaths(formula);
      const value = (replaced === null) ? Number.NaN : Number(replaced.trim());
      return Number.isFinite(value) ? value : null;
    },
    replaceData: text => replacePaths(text) ?? text,
    runScript: () => null,
    carrierItemUuid: CARRIER,
    reach: () => passed("matched"),
    limitAvailable: () => true
  };
  const trigger = { event: request.event, pins: request.pins, ...(request.signal ? { signal: request.signal } : {}) };
  return { run: runBlueprint(blueprint, trigger, facts, env), notes: [] };
}

const LIBRARY_KEY = "bna.library";

function createLibrary(): LibraryHost {
  const listeners = new Set<() => void>();
  let entries = (() => {
    try {
      return readLibrary(JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]"));
    } catch {
      return [];
    }
  })();
  const store = (next: BlueprintSource[]) => {
    entries = next;
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode); the library then lasts for the session only.
    }
    listeners.forEach(listener => listener());
  };
  return {
    entries: () => entries,
    canEdit: () => true,
    add: blueprint => Promise.resolve(store(withLibraryEntry(entries, blueprint))),
    remove: id => Promise.resolve(store(withoutLibraryEntry(entries, id))),
    import: text => {
      const result = importBlueprints(text);
      store(result.blueprints.reduce(withLibraryEntry, entries));
      return Promise.resolve(result);
    },
    download: blueprints => {
      const url = URL.createObjectURL(new Blob([exportBlueprints(blueprints)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "blueprints.json";
      link.click();
      URL.revokeObjectURL(url);
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/** The playground's host: the real engine on fixture actors, items and targets. */
export function createPlaygroundHost(language: Language, blueprints: () => readonly BlueprintSource[]): EditorHost {
  return {
    effectSelection: { choices: () => EFFECTS, resolve: async uuid => EFFECTS.find(effect => effect.uuid === uuid) ?? null },
    library: createLibrary(),
    lintEnv: blueprint => {
      const { sent, received } = blueprintSignals([...blueprints().filter(entry => entry.id !== blueprint.id), blueprint]);
      return {
        validateFormula: looksLikeFormula,
        hasPath: path => PATH_SET.has(path),
        signalsSent: sent,
        signalsReceived: received
      };
    },
    simulator: {
      actors: () => ACTORS.map(actor => ({ value: actor.uuid, label: name(actor.name, language) })),
      items: actorUuid => (ACTORS.find(actor => actor.uuid === actorUuid)?.items ?? []).map(item => ({
        uuid: item.uuid,
        name: name(item.name, language),
        activities: item.activities.map(activity => ({ value: activity.id, label: name(activity.name, language) }))
      })),
      targets: () => TARGETS.map(target => ({ value: target.uuid, label: name(target.name, language) })),
      defaults: () => ({ actorUuid: "Actor.aria", itemUuid: CARRIER, targetUuid: TARGETS[0]?.uuid ?? null }),
      run
    },
    formula: {
      paths: () => PATHS,
      preview: formula => (looksLikeFormula(formula) ? replacePaths(formula) : null)
    },
    preferences: {
      coachSeen: () => {
        try {
          return localStorage.getItem("bna.coach") === "seen";
        } catch {
          return false;
        }
      },
      markCoachSeen: () => {
        try {
          localStorage.setItem("bna.coach", "seen");
        } catch {
          // Storage can be unavailable (private mode); the guide then shows again next time.
        }
      }
    }
  };
}
