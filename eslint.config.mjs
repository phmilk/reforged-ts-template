// One flat configuration lints and formats the whole repository: the map's
// source, its Lua tests, the pipeline scripts and their tests. `pnpm lint:fix`
// formats through Prettier, so a save in the editor and a run in CI produce
// the same file. No rule is disabled here: a tolerated finding is disabled
// inline, on its line, with a `--` justification after the rule name.
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import importPlugin from "eslint-plugin-import-x";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import reforged from "eslint-plugin-reforged";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    // The World Editor owns the map folder, its war3map.lua included.
    "maps/**",
    // Build outputs: the staged map and the archive, the compiled Lua tests.
    "dist/**",
    "dist-test/**",
    // Written by the pipeline (install, build, watch).
    "src/generated/**",
    // pnpm use:local's tarballs.
    ".local-packages/**",
    // The lint fixtures break the rules on purpose; the configuration test
    // (tests/pipeline/eslint-config.test.ts) lints them with ignores off.
    "tests/lint/**",
  ]),
  {
    // A disable comment that silences nothing is an error: it is left over.
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  eslint.configs.recommended,
  // The pnpm hook is a CommonJS module pnpm loads in Node.
  {
    files: ["**/*.cjs"],
    languageOptions: { globals: { __dirname: "readonly" } },
  },
  // Every TypeScript file belongs to one tsconfig; the project service finds
  // it (see the `references` of tsconfig.json for the Node side).
  {
    files: ["**/*.{ts,mts,cts}"],
    extends: [
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // The lint layer of the library's runtime checks, on the code that runs in the game: the map's
  // source and its Lua tests. The pipeline scripts run in Node, where the
  // Warcraft III pitfalls do not apply.
  {
    files: ["src/**/*.ts", "tests/lua/**/*.ts"],
    extends: [reforged.configs.recommended],
  },
  // A disable comment says why: `// eslint-disable-next-line <rule> -- <reason>`.
  comments.recommended,
  {
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
    },
  },
  // Last: Prettier formats, and eslint-config-prettier turns off the rules
  // that would fight it.
  prettierRecommended,
);
