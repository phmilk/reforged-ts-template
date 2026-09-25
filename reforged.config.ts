import type { Config } from "./scripts/config.ts";

export default {
  mapFolder: "maps/reforged-ts-template.w3m",
  outputFolder: "dist",
  // `dev`: the library's runtime Guards run. `pnpm build --mode release` overrides it for one build.
  mode: "dev",
  // `pnpm test:map` finds the game on its own (WC3_EXECUTABLE, then the Battle.net default folders). Otherwise:
  // gameExecutable: "D:/Games/Warcraft III/_retail_/x86_64/Warcraft III.exe",
  // extraLaunchArgs: [],
  // winePath: "wine", winePrefix: "/home/me/.wine", // Linux: launch through Wine
} satisfies Config;
