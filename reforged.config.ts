import type { Config } from "./scripts/config.ts";

export default {
  mapFolder: "maps/reforged-ts-template.w3m",
  outputFolder: "dist",
  // `dev`: the library's runtime Guards run. `pnpm build --mode release` overrides it for one build.
  mode: "dev",
  // `pnpm test:map` finds the game on its own (WC3_EXECUTABLE, then the Battle.net default folders).
  // This file is committed: a path of your machine only goes in WC3_EXECUTABLE (and WINEPREFIX), never here,
  // or `pnpm test` fails on the absolute path. `gameExecutable` is for a path every machine shares:
  // gameExecutable: "<path to Warcraft III.exe>",
  // extraLaunchArgs: [],
  // winePath: "wine", // Linux: launch through Wine
} satisfies Config;
