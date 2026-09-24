import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { BuildError } from "./errors.ts";

/** What the root configuration file default-exports. Paths are relative to the repository root. */
export interface Config {
  /** The map folder saved by the World Editor, extension included (`maps/my-map.w3x`). */
  mapFolder: string;
  /** Holds the staged map folder, the Lua bundle and the archive. Cleaned on every build. Default `dist`. */
  outputFolder?: string;
  /** File name of the packed archive. Default: the map folder's name. */
  archiveName?: string;
  /** `dev` turns the library's runtime Guards on, `release` turns them off. Default `dev`; `--mode` overrides it. */
  mode?: Mode;
}

/** Which build the pipeline produces. The only thing it changes is the generated env file's `devMode`. */
export type Mode = "dev" | "release";
export const MODES: readonly Mode[] = ["dev", "release"];

/** What the command line may override. Every pipeline script accepts `--mode dev|release`. */
export interface CommandLineOptions {
  mode?: Mode;
}

/** The configuration with defaults applied and every path absolute. */
export interface ResolvedConfig {
  root: string;
  mapFolder: string;
  outputFolder: string;
  archiveName: string;
  /** The effective mode: the `--mode` flag, else the file's `mode`, else `dev`. */
  mode: Mode;
  /** `src/generated`: the files the pipeline writes for the source to import (ignored by version control). */
  generatedFolder: string;
  /** The tstl project compiled into the bundle. */
  tsconfig: string;
}

export const CONFIG_FILE = "reforged.config.ts";

/** Applies the defaults and resolves every path against `root`. */
export function resolveConfig(config: Config, root: string, overrides: CommandLineOptions = {}): ResolvedConfig {
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
  if (config.mode !== undefined && !isMode(config.mode)) {
    throw new BuildError(`${CONFIG_FILE}: \`mode\` must be ${MODES.map((m) => `"${m}"`).join(" or ")}, got ${JSON.stringify(config.mode)}.`);
  }
  const mode = overrides.mode ?? config.mode ?? "dev";
  return {
    root,
    mapFolder,
    outputFolder,
    archiveName,
    mode,
    generatedFolder: path.join(root, "src", "generated"),
    tsconfig: path.join(root, "tsconfig.json"),
  };
}

const isMode = (value: unknown): value is Mode => MODES.includes(value as Mode);

/** Parses a pipeline script's arguments (`process.argv.slice(2)`). Unknown flags and bad values are a BuildError. */
export function parseCommandLine(argv: readonly string[]): CommandLineOptions {
  let values: { mode?: string };
  try {
    ({ values } = parseArgs({ args: [...argv], options: { mode: { type: "string" } }, strict: true, allowPositionals: false }));
  } catch (error) {
    throw new BuildError(`${(error as Error).message}. Usage: --mode dev|release`);
  }
  if (values.mode === undefined) return {};
  if (!isMode(values.mode)) {
    throw new BuildError(`--mode must be ${MODES.join(" or ")}, got ${JSON.stringify(values.mode)}.`);
  }
  return { mode: values.mode };
}

/**
 * Imports the configuration file (TypeScript, run by Node's type stripping),
 * applies the command line (`argv` without the node and script paths; the
 * flags win over the file) and resolves every path against the file's folder.
 */
export async function loadConfig(configPath: string, argv: readonly string[] = []): Promise<ResolvedConfig> {
  const overrides = parseCommandLine(argv);
  const file = path.resolve(configPath);
  const module = (await import(pathToFileURL(file).href)) as { default: Config };
  return resolveConfig(module.default, path.dirname(file), overrides);
}
