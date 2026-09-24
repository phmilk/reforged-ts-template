import path from "node:path";
import { pathToFileURL } from "node:url";
import { BuildError } from "./errors.ts";

/** What the root configuration file default-exports. Paths are relative to the repository root. */
export interface Config {
  /** The map folder saved by the World Editor, extension included (`maps/my-map.w3x`). */
  mapFolder: string;
  /** Holds the staged map folder, the Lua bundle and the archive. Cleaned on every build. Default `dist`. */
  outputFolder?: string;
  /** File name of the packed archive. Default: the map folder's name. */
  archiveName?: string;
}

/** The configuration with defaults applied and every path absolute. */
export interface ResolvedConfig {
  root: string;
  mapFolder: string;
  outputFolder: string;
  archiveName: string;
  /** The tstl project compiled into the bundle. */
  tsconfig: string;
}

export const CONFIG_FILE = "reforged.config.ts";

/** Applies the defaults and resolves every path against `root`. */
export function resolveConfig(config: Config, root: string): ResolvedConfig {
  if (typeof config?.mapFolder !== "string" || config.mapFolder === "") {
    throw new BuildError(`${CONFIG_FILE}: \`mapFolder\` is required (the map folder saved by the World Editor, e.g. "maps/my-map.w3x").`);
  }
  const mapFolder = path.resolve(root, config.mapFolder);
  const outputFolder = path.resolve(root, config.outputFolder ?? "dist");
  const archiveName = config.archiveName ?? path.basename(mapFolder);
  const inside = (child: string, parent: string) => {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  // The output folder is deleted on every build: never let it cover the repository or the map folder.
  if (inside(root, outputFolder) || inside(path.join(root, "src"), outputFolder) || inside(mapFolder, outputFolder) || inside(outputFolder, mapFolder)) {
    throw new BuildError(`${CONFIG_FILE}: \`outputFolder\` must be a folder of its own, not the repository root, the source folder, or inside or around the map folder.`);
  }
  if (archiveName !== path.basename(archiveName) || archiveName === "") {
    throw new BuildError(`${CONFIG_FILE}: \`archiveName\` must be a file name, not a path.`);
  }
  return { root, mapFolder, outputFolder, archiveName, tsconfig: path.join(root, "tsconfig.json") };
}

/** Imports the configuration file (TypeScript, run by Node's type stripping) and resolves it against its folder. */
export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
  const file = path.resolve(configPath);
  const module = (await import(pathToFileURL(file).href)) as { default: Config };
  return resolveConfig(module.default, path.dirname(file));
}
