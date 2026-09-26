import { defineConfig } from "vitest/config";

// One project per test seam; `pnpm test` runs both.
// - `pipeline`: the build pipeline's functions and commands, run in Node.
// - `lua`: the map's code on the reforged-test harness (Lua 5.3, Natives and
//   editor globals stubbed). The global setup generates the generated folder
//   and compiles src + tests/lua with typescript-to-lua before every run;
//   lua.spec.ts registers one vitest test per `it`. tests/lua holds Lua-side
//   tests only: vitest never loads them as Node modules.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "pipeline",
          include: ["tests/pipeline/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: "lua",
          include: ["tests/harness/*.spec.ts"],
          environment: "node",
          globalSetup: ["tests/harness/compile.ts"],
        },
      },
    ],
    // The Lua tests, the sources and the stubs are not in vitest's module
    // graph: a change to one of them reruns the harness spec (watch mode).
    watchTriggerPatterns: [
      {
        pattern:
          /[\\/](?:src|tests[\\/]lua|tests[\\/]stubs)[\\/].+\.(?:ts|lua)$/,
        testsToRun: () => "tests/harness/lua.spec.ts",
      },
    ],
  },
});
