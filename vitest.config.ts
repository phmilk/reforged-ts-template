import { defineConfig } from "vitest/config";

// One project per test seam. `pipeline`: the build pipeline's functions and
// commands, run in Node. Later seams (the Lua harness) add their own project.
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
    ],
  },
});
