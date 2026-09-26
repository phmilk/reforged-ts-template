// Hands the compiled Lua tests to the reforged-test glue: one vitest describe
// per tests/lua/*.test.ts file, one vitest test per `it`. The global setup
// (compile.ts) has generated, compiled and listed the stubs.

import { runLuaTests } from "reforged-test";
import { inject } from "vitest";

const compileErrors = inject("compileErrors");
if (compileErrors !== "")
  throw new Error(`The Lua tests did not compile:\n${compileErrors}`);

runLuaTests({ outDir: inject("outDir"), stubs: inject("stubs") });
