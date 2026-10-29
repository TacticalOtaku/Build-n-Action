import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    "dist/**",
    "tests/**"
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended]
  },
  {
    files: ["eslint.config.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
  }
]);
