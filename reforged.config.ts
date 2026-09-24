import type { Config } from "./scripts/config.ts";

export default {
  mapFolder: "maps/reforged-ts-template.w3m",
  outputFolder: "dist",
  // `dev`: the library's runtime Guards run. `pnpm build --mode release` overrides it for one build.
  mode: "dev",
} satisfies Config;
