import fs from "node:fs";
import path from "node:path";
import { compileBundle, luaBundleFile } from "./compile.ts";
import { composeMapScript } from "./compose.ts";
import {
  CONFIG_FILE,
  isInside,
  loadConfig,
  type ResolvedConfig,
} from "./config.ts";
import { AuthorError } from "./errors.ts";
import { runAsEntry } from "./cli.ts";
import { packMapFolder } from "./pack.ts";
import { generate } from "./generate.ts";
import {
  EDITOR_SCRIPT,
  cleanOutputFolder,
  readEditorScript,
  stageMapFolder,
  stagingFolderFor,
} from "./stage.ts";

export interface BuildResult {
  /** The staged copy of the map folder, holding the composed script. */
  stagingFolder: string;
  /** The Lua bundle typescript-to-lua wrote: the tsconfig's `luaBundle`. */
  bundleFile: string;
  /** The packed archive. */
  archive: string;
  /** Its size in bytes. */
  size: number;
}

/**
 * Runs the pipeline once: read the editor script and find the tsconfig's
 * bundle file (a map folder without the script, or a bundle outside the
 * output folder, fails before anything is written), clean the output folder, stage the map
 * folder, regenerate the generated folder (every writer in `GENERATORS`: the
 * env file for the effective mode, the editor-globals typings and stub),
 * compile the bundle, compose the map script into the staging folder, pack
 * the staging folder and write the archive. The map folder and the tsconfig
 * are only read.
 */
export function build(config: ResolvedConfig): BuildResult {
  // Fail on a map folder without the editor script before touching the output folder.
  const editorScript = readEditorScript(config.mapFolder);
  const bundleFile = bundleFileIn(config);

  cleanOutputFolder(config.outputFolder);
  const stagingFolder = stagingFolderFor(config.outputFolder, config.mapFolder);
  stageMapFolder(config.mapFolder, stagingFolder);

  // Before compiling: the source imports the generated files. Warnings go to stderr.
  generate(config);

  const bundle = compileBundle(config.tsconfig, bundleFile);

  fs.writeFileSync(
    path.join(stagingFolder, EDITOR_SCRIPT),
    composeMapScript(editorScript, bundle),
  );

  const archiveBytes = packMapFolder(stagingFolder);
  const archive = path.join(config.outputFolder, config.archiveName);
  fs.writeFileSync(archive, archiveBytes);
  return { stagingFolder, bundleFile, archive, size: archiveBytes.byteLength };
}

/**
 * The tsconfig's `luaBundle`, which must be a file of its own in the output
 * folder: the clean step removes it with the rest of the build, and it may be
 * neither the archive nor inside the staging folder (it would be packed).
 */
function bundleFileIn(config: ResolvedConfig): string {
  const bundleFile = luaBundleFile(config.tsconfig);
  const stagingRoot = path.dirname(
    stagingFolderFor(config.outputFolder, config.mapFolder),
  );
  const archive = path.join(config.outputFolder, config.archiveName);
  if (
    !isInside(bundleFile, config.outputFolder) ||
    bundleFile === config.outputFolder ||
    isInside(bundleFile, stagingRoot) ||
    bundleFile === archive
  ) {
    const shown = (file: string) =>
      path.relative(config.root, file).split(path.sep).join("/");
    throw new AuthorError(
      `${path.basename(config.tsconfig)}: \`tstl.luaBundle\` resolves to ${shown(bundleFile)}, which is not a file of its own in the output folder ${shown(config.outputFolder)} (\`outputFolder\` in ${CONFIG_FILE}). ` +
        `Set it to a file there, e.g. "${path.relative(path.dirname(config.tsconfig), path.join(config.outputFolder, "bundle.lua")).split(path.sep).join("/")}".`,
    );
  }
  return bundleFile;
}

/** The line every command prints after a build: `Built <archive, relative to the root> (<n> bytes, mode <mode>)`. */
export function builtMessage(
  config: ResolvedConfig,
  result: BuildResult,
): string {
  return `Built ${path.relative(config.root, result.archive)} (${String(result.size)} bytes, mode ${config.mode})`;
}

/** Command line: `node scripts/build.ts [--mode dev|release]`, run from the repository root. Exits non-zero on any failure. */
await runAsEntry(import.meta.url, "Build", async () => {
  const config = await loadConfig(
    path.resolve(CONFIG_FILE),
    process.argv.slice(2),
  );
  console.log(builtMessage(config, build(config)));
});
