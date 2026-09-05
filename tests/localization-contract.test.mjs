import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

const readJson = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));

function flatten(object, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && (typeof value === "object") && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

async function collectSources(directory, extensions) {
  const files = [];
  for (const entry of await readdir(new URL(directory, root), {withFileTypes: true})) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await collectSources(path, extensions));
    else if (extensions.some(extension => path.endsWith(extension))) files.push(path);
  }
  return files;
}

test("every localization key referenced in code resolves in lang/en.json", async () => {
  const keys = new Set(Object.keys(flatten(await readJson("lang/en.json"))));
  const prefixes = [...keys];
  const files = [
    ...await collectSources("scripts", [".mjs"]),
    ...await collectSources("templates", [".hbs"])
  ];

  const missing = [];
  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    for (const [key] of source.matchAll(/BUILD_N_ACTION(?:\.[A-Za-z0-9_]+)+/g)) {
      if (keys.has(key)) continue;
      // A localization prefix or a key assembled from a suffix at runtime.
      if (prefixes.some(candidate => candidate.startsWith(`${key}.`) || candidate.startsWith(key))) continue;
      missing.push(`${key} (${file})`);
    }
  }

  assert.deepEqual(missing, []);
});

test("the русский translation covers exactly the English keys", async () => {
  const en = Object.keys(flatten(await readJson("lang/en.json"))).sort();
  const ru = Object.keys(flatten(await readJson("lang/ru.json"))).sort();

  assert.deepEqual(ru, en);
});
