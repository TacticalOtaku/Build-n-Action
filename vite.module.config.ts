/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createManifest, MODULE_VERSION } from "./src/build/manifest.ts";
import { createZip } from "./src/build/zip.ts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const OUT = join(ROOT, "dist", "module");

/** Emit the Foundry manifest and the language files next to the bundle, and the root manifest the update URL serves. */
function foundryPackage(): Plugin {
  return {
    name: "bna-foundry-package",
    generateBundle() {
      const manifest = `${JSON.stringify(createManifest(), null, 2)}\n`;
      this.emitFile({ type: "asset", fileName: "module.json", source: manifest });
      // Every build keeps it in step with the version, so `npm run check` passes right after a version bump.
      writeFileSync(join(ROOT, "module.json"), manifest);
      for (const lang of ["en", "ru"]) {
        this.emitFile({
          type: "asset",
          fileName: `lang/${lang}.json`,
          source: readFileSync(new URL(`./src/lang/${lang}.json`, import.meta.url), "utf8")
        });
      }
    }
  };
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** Release mode: zip the package (no source maps). */
function releasePackage(): Plugin {
  return {
    name: "bna-release",
    apply: (_config, env) => env.mode === "release",
    closeBundle() {
      const entries = filesUnder(OUT)
        .filter(path => !path.endsWith(".map"))
        .map(path => ({ path: relative(OUT, path).split(sep).join("/"), data: readFileSync(path) }))
        .sort((a, b) => a.path.localeCompare(b.path, "en"));
      const zip = join(ROOT, "dist", `build-n-action-v${MODULE_VERSION}.zip`);
      // A released archive is a record of what users downloaded: never replace it by accident.
      if (existsSync(zip) && (process.env.BNA_REPLACE_ARCHIVE !== "1")) {
        throw new Error(`${relative(ROOT, zip)} already exists. Bump the version, or set BNA_REPLACE_ARCHIVE=1 to replace an unreleased archive.`);
      }
      writeFileSync(zip, createZip(entries));
      console.log(`Build-n-Action | ${entries.length} files → ${relative(ROOT, zip)}`);
    }
  };
}

export default defineConfig(({ mode }) => ({
  publicDir: false,
  plugins: [react(), foundryPackage(), releasePackage()],
  // React picks its production build from process.env.NODE_ENV, which library mode leaves untouched.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/module",
    emptyOutDir: true,
    sourcemap: mode !== "release",
    minify: false,
    target: "es2023",
    // Fonts ride inside the editor chunk, so no URL has to resolve under /modules/build-n-action/.
    assetsInlineLimit: () => true,
    lib: { entry: "src/module.ts", formats: ["es"], fileName: () => "module.mjs", cssFileName: "module" },
    rolldownOptions: {
      output: { chunkFileNames: chunk => `chunks/${(chunk.name === "mount") ? "editor" : chunk.name}-[hash].mjs` }
    }
  }
}));
