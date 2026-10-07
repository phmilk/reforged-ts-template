// The global setup of the `lua` vitest project. Before the first run and
// before every watch rerun it regenerates the generated folder (so the stub
// of the Editor globals, which reforged-map writes, follows the map folder
// and a fresh clone needs no build), then compiles src and tests/lua with
// typescript-to-lua (tests/lua/tsconfig.json) into an emptied dist-test.
// lua.spec.ts reads the results. A failed compile fails the run with its
// diagnostics.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LUA_STUB_FILE } from "reforged-map";
import { compileLuaProject } from "reforged-test";
import type { TestProject } from "vitest/node";
import { CONFIG_FILE, loadConfig } from "../../scripts/config.ts";
import { generate } from "../../scripts/generate.ts";

declare module "vitest" {
  export interface ProvidedContext {
    /** The output folder of the compile, where the glue finds the tests. */
    outDir: string;
    /** The stub files after the package's own, in load order (absolute). */
    stubs: string[];
    /** The error of the last generate or compile, or "" when none. */
    compileErrors: string;
  }
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const tsconfig = path.join(root, "tests", "lua", "tsconfig.json");
/** The outDir of tests/lua/tsconfig.json. */
const outDir = path.join(root, "dist-test");
/** The map-specific stubs. The package's stubs are never edited. */
const mapStubs = path.join(root, "tests", "stubs");

interface Prepared {
  stubs: string[];
  compileErrors: string;
}

async function prepare(): Promise<Prepared> {
  let generatedStub: string;
  try {
    const config = await loadConfig(path.join(root, CONFIG_FILE));
    generate(config);
    generatedStub = path.join(config.generatedFolder, LUA_STUB_FILE);
  } catch (error) {
    return {
      stubs: [],
      compileErrors: `Generating the Editor globals failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  // The Editor globals first, so a map-specific stub can give a gg_ global a handle.
  const stubs = [generatedStub, ...luaFilesIn(mapStubs)];
  fs.rmSync(outDir, { recursive: true, force: true });
  return { stubs, compileErrors: compileLuaProject(tsconfig) };
}

function luaFilesIn(folder: string): string[] {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".lua"))
    .sort()
    .map((name) => path.join(folder, name));
}

function provide(project: TestProject, prepared: Prepared): void {
  project.provide("stubs", prepared.stubs);
  project.provide("compileErrors", prepared.compileErrors);
}

export default async function setup(project: TestProject): Promise<void> {
  project.provide("outDir", outDir);
  provide(project, await prepare());
  project.onTestsRerun(async (specifications) => {
    if (specifications.some((spec) => spec.project.name === project.name))
      provide(project, await prepare());
  });
}
