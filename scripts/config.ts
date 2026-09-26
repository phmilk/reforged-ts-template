import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { AuthorError } from "./errors.ts";

/** What the root configuration file default-exports. Paths are relative to the repository root. */
export interface Config {
  /** The map folder saved by the World Editor, extension included (`maps/my-map.w3x`). */
  mapFolder: string;
  /** Holds the staged map folder, the Lua bundle and the archive. Cleaned on every build. Default `dist`. */
  outputFolder?: string;
  /** File name of the packed archive. Default: the map folder's name. */
  archiveName?: string;
  /** `dev` turns the library's runtime checks on, `release` turns them off. Default `dev`; `--mode` overrides it. */
  mode?: Mode;
  /**
   * The game's executable, for `pnpm test:map`. Default: detected (the
   * `WC3_EXECUTABLE` environment variable, then the Battle.net install
   * locations). With `winePath` set, a path Wine understands (e.g. a
   * `C:\...` path inside the prefix). `pnpm build` never needs it.
   * `reforged.config.ts` is committed: a path of one machine belongs in
   * `WC3_EXECUTABLE` instead.
   */
  gameExecutable?: string;
  /** Appended to the launch arguments of `pnpm test:map`. Default none. */
  extraLaunchArgs?: string[];
  /** Launches the game through Wine (`wine`, or a path to it). The map folder is then given as a `Z:` path. */
  winePath?: string;
  /** `WINEPREFIX` for the Wine launch. Default: Wine's own (the `WINEPREFIX` environment variable, where a prefix of one machine belongs). */
  winePrefix?: string;
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
  /** `src`: the map's TypeScript (the tstl project's root folder). */
  sourceFolder: string;
  /** `src/generated`: the files the pipeline writes for the source to import (ignored by version control). */
  generatedFolder: string;
  /** The tstl project compiled into the bundle. */
  tsconfig: string;
}

export const CONFIG_FILE = "reforged.config.ts";

/** Applies the defaults and resolves every path against `root`. */
export function resolveConfig(
  config: Config,
  root: string,
  overrides: CommandLineOptions = {},
): ResolvedConfig {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a config file without a default export gives undefined, whatever the type says
  if (typeof config?.mapFolder !== "string" || config.mapFolder === "") {
    throw new AuthorError(
      `${CONFIG_FILE}: \`mapFolder\` is required (the map folder saved by the World Editor, e.g. "maps/my-map.w3x").`,
    );
  }
  const mapFolder = path.resolve(root, config.mapFolder);
  const outputFolder = path.resolve(root, config.outputFolder ?? "dist");
  const archiveName = config.archiveName ?? path.basename(mapFolder);
  const sourceFolder = path.join(root, "src");
  // The output folder is deleted on every build: never let it cover the repository or the map folder.
  if (
    isInside(root, outputFolder) ||
    isInside(sourceFolder, outputFolder) ||
    isInside(mapFolder, outputFolder) ||
    isInside(outputFolder, mapFolder)
  ) {
    throw new AuthorError(
      `${CONFIG_FILE}: \`outputFolder\` must be a folder of its own, not the repository root, the source folder, or inside or around the map folder.`,
    );
  }
  if (archiveName !== path.basename(archiveName) || archiveName === "") {
    throw new AuthorError(
      `${CONFIG_FILE}: \`archiveName\` must be a file name, not a path.`,
    );
  }
  if (config.mode !== undefined && !isMode(config.mode)) {
    throw new AuthorError(
      `${CONFIG_FILE}: \`mode\` must be ${MODES.map((m) => `"${m}"`).join(" or ")}, got ${JSON.stringify(config.mode)}.`,
    );
  }
  const mode = overrides.mode ?? config.mode ?? "dev";
  return {
    root,
    mapFolder,
    outputFolder,
    archiveName,
    mode,
    sourceFolder,
    generatedFolder: path.join(sourceFolder, "generated"),
    tsconfig: path.join(root, "tsconfig.json"),
  };
}

/** Whether `file` is `folder` itself or somewhere under it (both absolute). */
export function isInside(file: string, folder: string): boolean {
  const rel = path.relative(folder, file);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  );
}

const isMode = (value: unknown): value is Mode => MODES.includes(value as Mode);

/** Parses a pipeline script's arguments (`process.argv.slice(2)`). Unknown flags and bad values are an AuthorError. */
export function parseCommandLine(argv: readonly string[]): CommandLineOptions {
  let values: { mode?: string };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { mode: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new AuthorError(
      `${(error as Error).message}. Usage: --mode dev|release`,
    );
  }
  if (values.mode === undefined) return {};
  if (!isMode(values.mode)) {
    throw new AuthorError(
      `--mode must be ${MODES.join(" or ")}, got ${JSON.stringify(values.mode)}.`,
    );
  }
  return { mode: values.mode };
}

/**
 * Imports the configuration file (TypeScript, run by Node's type stripping),
 * applies the command line (`argv` without the node and script paths; the
 * flags win over the file) and resolves every path against the file's folder.
 */
export async function loadConfig(
  configPath: string,
  argv: readonly string[] = [],
): Promise<ResolvedConfig> {
  const overrides = parseCommandLine(argv);
  const { config, root } = await importConfigFile(configPath);
  return resolveConfig(config, root, overrides);
}

async function importConfigFile(
  configPath: string,
): Promise<{ config: Config; root: string }> {
  const file = path.resolve(configPath);
  const module = (await import(pathToFileURL(file).href)) as {
    default: Config;
  };
  return { config: module.default, root: path.dirname(file) };
}

/**
 * Where the pipeline looks for the game, injected so tests never look at the
 * machine's real locations.
 */
export interface ExecutableProbe {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  /** Whether `file` exists and is a file. */
  exists(file: string): boolean;
}

/** The real machine. */
export const systemProbe: ExecutableProbe = {
  platform: process.platform,
  env: process.env,
  exists: (file) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  },
};

/** Names the game's executable when it is somewhere the well-known locations do not cover. */
export const EXECUTABLE_ENV = "WC3_EXECUTABLE";

/**
 * The default install locations of the game, probed in order. NOT verified
 * against a real 3.0 install: they follow the Battle.net layout since 1.32
 * (`_retail_\x86_64` on Windows; on macOS the inner binary of the `.app`,
 * since the bundle folder itself cannot be executed), as other templates and
 * WurstScript use it.
 */
export function wellKnownExecutables(
  platform: NodeJS.Platform,
  env: ExecutableProbe["env"],
): string[] {
  if (platform === "win32") {
    const programFolders = [
      env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      env.ProgramFiles ?? "C:\\Program Files",
    ];
    return [...new Set(programFolders)].map((folder) =>
      path.win32.join(
        folder,
        "Warcraft III",
        "_retail_",
        "x86_64",
        "Warcraft III.exe",
      ),
    );
  }
  if (platform === "darwin") {
    return [
      "/Applications/Warcraft III/_retail_/x86_64/Warcraft III.app/Contents/MacOS/Warcraft III",
    ];
  }
  return [];
}

/** How `pnpm test:map` starts the game. */
export interface GameLaunch {
  /** The game's executable (absolute, or as given for Wine). */
  executable: string;
  /** From `extraLaunchArgs`. */
  extraArgs: string[];
  winePath?: string;
  /** Absolute. */
  winePrefix?: string;
}

/** A resolved configuration that also knows where the game is: what `pnpm test:map` loads. */
export interface LaunchConfig extends ResolvedConfig {
  game: GameLaunch;
}

/**
 * Finds the game: `gameExecutable` if set, else the `WC3_EXECUTABLE`
 * environment variable, else the first existing well-known location. Nothing
 * found is an AuthorError naming the config field.
 */
export function resolveGameLaunch(
  config: Config,
  root: string,
  probe: ExecutableProbe,
): GameLaunch {
  const optionalString = (
    field: "gameExecutable" | "winePath" | "winePrefix",
  ) => {
    const value = config[field];
    if (value !== undefined && (typeof value !== "string" || value === "")) {
      throw new AuthorError(
        `${CONFIG_FILE}: \`${field}\` must be a non-empty string.`,
      );
    }
    return value;
  };
  const extraArgs = config.extraLaunchArgs ?? [];
  if (
    !Array.isArray(extraArgs) ||
    !extraArgs.every((arg) => typeof arg === "string")
  ) {
    throw new AuthorError(
      `${CONFIG_FILE}: \`extraLaunchArgs\` must be an array of strings.`,
    );
  }
  const winePath = optionalString("winePath");
  const winePrefix = optionalString("winePrefix");
  const override = optionalString("gameExecutable");
  const wine = {
    ...(winePath !== undefined && { winePath }),
    ...(winePrefix !== undefined && {
      winePrefix: path.resolve(root, winePrefix),
    }),
  };

  if (override !== undefined) {
    // Through Wine the path is the Windows side's (`C:\...`): nothing to check here.
    if (winePath !== undefined)
      return { executable: override, extraArgs: [...extraArgs], ...wine };
    const executable = path.resolve(root, override);
    if (!probe.exists(executable)) {
      throw new AuthorError(
        `${CONFIG_FILE}: \`gameExecutable\` is set to "${override}", which does not exist.`,
      );
    }
    return { executable, extraArgs: [...extraArgs], ...wine };
  }

  const fromEnv = probe.env[EXECUTABLE_ENV];
  const candidates = [
    ...(fromEnv ? [fromEnv] : []),
    ...wellKnownExecutables(probe.platform, probe.env),
  ];
  const executable = candidates.find((file) => probe.exists(file));
  if (executable === undefined) {
    const looked =
      candidates.length > 0
        ? ` Looked at: ${candidates.map((c) => `"${c}"`).join(", ")}.`
        : "";
    throw new AuthorError(
      `Warcraft III was not found. Set \`gameExecutable\` in ${CONFIG_FILE} (or the ${EXECUTABLE_ENV} environment variable) to the game's executable.${looked}`,
    );
  }
  return { executable, extraArgs: [...extraArgs], ...wine };
}

/**
 * `loadConfig` plus the game's launch settings, for `pnpm test:map`. Kept apart
 * so `pnpm build` never looks for the game (it runs where no game is installed).
 */
export async function loadLaunchConfig(
  configPath: string,
  argv: readonly string[] = [],
  probe: ExecutableProbe = systemProbe,
): Promise<LaunchConfig> {
  const overrides = parseCommandLine(argv);
  const { config, root } = await importConfigFile(configPath);
  return {
    ...resolveConfig(config, root, overrides),
    game: resolveGameLaunch(config, root, probe),
  };
}
