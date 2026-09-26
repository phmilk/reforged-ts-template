import fs from "node:fs";
import path from "node:path";
import { AuthorError } from "./errors.ts";

/** The script the World Editor writes into a map folder saved with Lua as the script language. */
export const EDITOR_SCRIPT = "war3map.lua";

/** Deletes the output folder and everything in it, then recreates it empty. */
export function cleanOutputFolder(outputFolder: string): void {
  fs.rmSync(outputFolder, { recursive: true, force: true });
  fs.mkdirSync(outputFolder, { recursive: true });
}

/** Where the staged copy of the map folder lives: `<output>/staging/<map folder name>`. */
export function stagingFolderFor(
  outputFolder: string,
  mapFolder: string,
): string {
  return path.join(outputFolder, "staging", path.basename(mapFolder));
}

/**
 * Reads the editor's `war3map.lua` from a map folder. A folder without it was
 * not saved with Lua as the script language, which the pipeline requires.
 */
export function readEditorScript(mapFolder: string): Uint8Array {
  if (!fs.statSync(mapFolder, { throwIfNoEntry: false })?.isDirectory()) {
    throw new AuthorError(
      `Map folder not found: ${mapFolder}. Save the map as a folder from the World Editor (File > Save Map As, "Folder").`,
    );
  }
  const file = path.join(mapFolder, EDITOR_SCRIPT);
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new AuthorError(
      `${path.basename(mapFolder)} has no ${EDITOR_SCRIPT}: the map was not saved with Lua as the script language. ` +
        `In the World Editor, set Scenario > Map Options > Script Language to Lua and save the map again.`,
    );
  }
  return new Uint8Array(fs.readFileSync(file));
}

/** Copies the map folder into the staging folder. The map folder is only read. */
export function stageMapFolder(mapFolder: string, stagingFolder: string): void {
  fs.mkdirSync(path.dirname(stagingFolder), { recursive: true });
  fs.cpSync(mapFolder, stagingFolder, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}
