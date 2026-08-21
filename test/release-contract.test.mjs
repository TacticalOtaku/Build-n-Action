import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("release metadata targets version 1.0.4 and Foundry 14.367", async () => {
  const [manifest, packageJson, packageLock] = await Promise.all([
    read("module.json").then(JSON.parse),
    read("package.json").then(JSON.parse),
    read("package-lock.json").then(JSON.parse)
  ]);
  const midi = manifest.relationships.recommends.find(entry => entry.id === "midi-qol");

  assert.equal(manifest.version, "1.0.4");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageLock.version, manifest.version);
  assert.equal(packageLock.packages[""].version, manifest.version);
  assert.equal(manifest.compatibility.maximum, "14.367");
  assert.equal(manifest.compatibility.verified, "14.367");
  assert.equal(midi.compatibility.verified, "14.0.11");
  assert.match(manifest.download, /v1\.0\.4\/build-n-action-v1\.0\.4\.zip$/);

  const referencedFiles = [
    ...manifest.esmodules,
    ...manifest.styles,
    ...manifest.languages.map(language => language.path)
  ];
  await Promise.all(referencedFiles.map(path => access(new URL(`../${path}`, import.meta.url))));
});

test("bonus image form keeps an owner-routed picker and fallback preview", async () => {
  const [description, header] = await Promise.all([
    read("templates/sheet-description.hbs"),
    read("templates/sheet-header.hbs")
  ]);

  assert.match(description, /name="img"/);
  assert.match(description, /data-action="editImage"/);
  assert.match(header, /data-bna-image-preview/);
  assert.match(header, /data-fallback-src="icons\/svg\/dice-target\.svg"/);
});
