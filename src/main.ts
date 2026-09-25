import { Reforged } from "reforged-ts";
import { devMode } from "./generated/env";

// First statement: the mode decides whether the library's runtime Guards run.
// `pnpm build` generates devMode = true, `pnpm build --mode release` false.
Reforged.configure({ devMode });

print("reforged-ts-template: map script loaded");
