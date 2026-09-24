import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileBundle } from "./compile.ts";
import { composeMapScript } from "./compose.ts";
import { CONFIG_FILE, loadConfig, type ResolvedConfig } from "./config.ts";
import { BuildError } from "./errors.ts";
import { packMapFolder } from "./pack.ts";
import { generate } from "./generate.ts";
import { EDITOR_SCRIPT, cleanOutputFolder, readEditorScript, stageMapFolder, stagingFolderFor } from "./stage.ts";

export interface BuildResult {
  /** The staged copy of the map folder, holding the composed script. */
  stagingFolder: string;
  /** The Lua bundle typescript-to-lua wrote. */
  bundleFile: string;
  /** The packed archive. */
  archive: string;
  /** Its size in bytes. */
  size: number;
}

/**
 * Runs the pipeline once: clean the output folder, stage the map folder,
 * regenerate the generated folder (env file for the effective mode), compile the bundle, compose the map script into the staging folder, pack
 * the staging folder and write the archive. The map folder and the tsconfig
 * are only read.
 */
export function build(config: ResolvedConfig): BuildResult {
  // Fail on a map folder without the editor script before touching the output folder.
  const editorScript = readEditorScript(config.mapFolder);

  cleanOutputFolder(config.outputFolder);
  const stagingFolder = stagingFolderFor(config.outputFolder, config.mapFolder);
  stageMapFolder(config.mapFolder, stagingFolder);

  // Before compiling: the source imports the generated files.
  generate(config);

  const bundleFile = path.join(config.outputFolder, "bundle.lua");
  const bundle = compileBundle(config.tsconfig, bundleFile);

  fs.writeFileSync(path.join(stagingFolder, EDITOR_SCRIPT), composeMapScript(editorScript, bundle));

  const archiveBytes = packMapFolder(stagingFolder);
  const archive = path.join(config.outputFolder, config.archiveName);
  fs.writeFileSync(archive, archiveBytes);
  return { stagingFolder, bundleFile, archive, size: archiveBytes.byteLength };
}

/** Command line: `node scripts/build.ts [--mode dev|release]`, run from the repository root. Exits non-zero on any failure. */
async function main(): Promise<void> {
  try {
    const config = await loadConfig(path.resolve(CONFIG_FILE), process.argv.slice(2));
    const result = build(config);
    console.log(`Built ${path.relative(config.root, result.archive)} (${result.size} bytes, mode ${config.mode})`);
  } catch (error) {
    console.error(error instanceof BuildError ? `Build failed: ${error.message}` : error);
    process.exitCode = 1;
  }
}

// Run only as the entry script (import.meta.main needs Node 24.2; the floor is 24.0).
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
