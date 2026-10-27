// `pnpm objects:sync`, `pnpm objects:adopt` and `pnpm objects:release`: the
// Object definitions of src/objects/ and the map folder, through reforged-map.
// Sync writes the definitions into the map folder and the Object manifest;
// adoption hands objects of the map folder to the code, as definition files
// formatted with the project's Prettier; release hands them back. Each
// prints reforged-map's report and exits non-zero on a refusal. The build's
// merge (`mergeObjects`) puts the definitions into the staged copy instead,
// writing neither the map folder nor the manifest.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import * as prettier from "prettier";
import {
  adoptObjects,
  MapFolderError,
  mergeObjectDefinitions,
  ObjectDataWriterError,
  ObjectDefinitionsError,
  releaseObjects,
  syncObjectDefinitions,
  type DefinedObject,
  type ObjectAdoptionReport,
  type ObjectDefinitionsMergeResult,
  type ObjectReleaseReport,
  type ObjectSyncReport,
  type RemovedObject,
  type WorldEditorCheckOptions,
  type WorldEditorReloadOptions,
} from "reforged-map";
import { runAsEntry } from "./cli.ts";
import {
  CONFIG_FILE,
  loadObjectsConfig,
  type ObjectsConfig,
  type ResolvedConfig,
} from "./config.ts";
import { AuthorError } from "./errors.ts";
import { definitionsOptions, printWarning, type Warn } from "./generate.ts";

/** The three commands, each run as `pnpm objects:<command>`. */
export const OBJECTS_COMMANDS = ["sync", "adopt", "release"] as const;
export type ObjectsCommand = (typeof OBJECTS_COMMANDS)[number];

/** What the command line asks for. */
export interface ObjectsCommandLine {
  command: ObjectsCommand;
  /** The Rawcodes to adopt or release (`h000`, `buff:B000`), or `"all"` for `adopt --all`; empty for `sync`. */
  rawcodes: string[] | "all";
  /** `--force`: what it overrides is each command's (`reforged-map`'s README). */
  force: boolean;
}

const USAGE = [
  "Usage:",
  "  pnpm objects:sync [--force]",
  "  pnpm objects:adopt <rawcode...> [--force]",
  "  pnpm objects:adopt --all [--force]",
  "  pnpm objects:release <rawcode...> [--force]",
].join("\n");

const isCommand = (value: string | undefined): value is ObjectsCommand =>
  OBJECTS_COMMANDS.includes(value as ObjectsCommand);

/** Parses `node scripts/objects.ts <command> [args]` (`argv` without the node and script paths). A wrong command line is an AuthorError with the usage. */
export function parseObjectsCommandLine(
  argv: readonly string[],
): ObjectsCommandLine {
  const [command, ...rest] = argv;
  if (!isCommand(command)) throw new AuthorError(USAGE);
  let parsed: {
    values: { force?: boolean; all?: boolean };
    positionals: string[];
  };
  try {
    parsed = parseArgs({
      args: rest,
      options: {
        force: { type: "boolean" },
        all: { type: "boolean" },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw new AuthorError(`${(error as Error).message}.\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  const force = values.force ?? false;
  const all = values.all ?? false;
  if (command === "sync") {
    if (positionals.length > 0 || all) throw new AuthorError(USAGE);
    return { command, rawcodes: [], force };
  }
  if (all) {
    if (command !== "adopt" || positionals.length > 0)
      throw new AuthorError(USAGE);
    return { command, rawcodes: "all", force };
  }
  if (positionals.length === 0) throw new AuthorError(USAGE);
  return { command, rawcodes: positionals, force };
}

/** How the commands reach the World Editor: the check of its windows' titles and the reload. The system's when left out; injected by tests. */
export interface WorldEditorSeams {
  worldEditorCheck?: WorldEditorCheckOptions;
  worldEditorReload?: WorldEditorReloadOptions;
}

/** Runs `run`, turning `reforged-map`'s refusals into an AuthorError with its message, which names what to do. */
function refusalsAsAuthorErrors<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (
      error instanceof ObjectDefinitionsError ||
      error instanceof ObjectDataWriterError ||
      error instanceof MapFolderError
    )
      throw new AuthorError(error.message);
    throw error;
  }
}

/**
 * The build's merge: every Object definition into the staged copy of the map
 * folder, after staging and before packing, so the archive holds them
 * without a sync. The map folder and the manifest are only read. Warnings go
 * to `warn`; a collision, an invalid definition or an unreadable manifest is
 * an AuthorError.
 */
export function mergeObjects(
  config: ResolvedConfig,
  stagingFolder: string,
  warn: Warn = printWarning,
): ObjectDefinitionsMergeResult {
  const result = refusalsAsAuthorErrors(() =>
    mergeObjectDefinitions(
      stagingFolder,
      config.root,
      definitionsOptions(config),
    ),
  );
  for (const warning of result.warnings) warn(warning);
  return result;
}

/** Object sync, `pnpm objects:sync`: the definitions into the map folder and the manifest, reloading a World Editor that holds the map. */
export function syncObjects(
  config: ObjectsConfig,
  options: { force?: boolean } & WorldEditorSeams = {},
): ObjectSyncReport {
  return refusalsAsAuthorErrors(() =>
    syncObjectDefinitions(config.mapFolder, config.root, {
      ...definitionsOptions(config),
      force: options.force ?? false,
      ...(config.worldEditorExecutable !== undefined && {
        worldEditorExecutable: config.worldEditorExecutable,
      }),
      ...(options.worldEditorCheck && {
        worldEditorCheck: options.worldEditorCheck,
      }),
      ...(options.worldEditorReload && {
        worldEditorReload: options.worldEditorReload,
      }),
    }),
  );
}

/**
 * Object adoption, `pnpm objects:adopt`: objects of the map folder into
 * definition files under `src/objects/<kind>/`, then each file written
 * formatted with the project's Prettier (`.prettierrc`), so it passes lint
 * as written. The map folder is left as it was.
 */
export async function adoptObjectsIntoCode(
  config: ObjectsConfig,
  rawcodes: readonly string[] | "all",
  options: { force?: boolean } & Pick<
    WorldEditorSeams,
    "worldEditorCheck"
  > = {},
): Promise<ObjectAdoptionReport> {
  const report = refusalsAsAuthorErrors(() =>
    adoptObjects(config.mapFolder, config.root, rawcodes, {
      ...definitionsOptions(config),
      force: options.force ?? false,
      ...(options.worldEditorCheck && {
        worldEditorCheck: options.worldEditorCheck,
      }),
    }),
  );
  for (const file of report.files) await formatFile(file);
  return report;
}

/** Formats `file` in place with the Prettier configuration that applies to it. */
async function formatFile(file: string): Promise<void> {
  const text = fs.readFileSync(file, "utf8");
  const options = (await prettier.resolveConfig(file)) ?? {};
  const formatted = await prettier.format(text, { ...options, filepath: file });
  if (formatted !== text) fs.writeFileSync(file, formatted);
}

/** Object release, `pnpm objects:release`: owned objects back to the map folder as the code last defined them; their definition files and manifest entries go. */
export function releaseObjectsToMap(
  config: ObjectsConfig,
  rawcodes: readonly string[],
  options: { force?: boolean } & WorldEditorSeams = {},
): ObjectReleaseReport {
  return refusalsAsAuthorErrors(() =>
    releaseObjects(config.mapFolder, config.root, rawcodes, {
      ...definitionsOptions(config),
      force: options.force ?? false,
      ...(config.worldEditorExecutable !== undefined && {
        worldEditorExecutable: config.worldEditorExecutable,
      }),
      ...(options.worldEditorCheck && {
        worldEditorCheck: options.worldEditorCheck,
      }),
      ...(options.worldEditorReload && {
        worldEditorReload: options.worldEditorReload,
      }),
    }),
  );
}

/** A path relative to the root, with `/`. */
const shown = (config: ResolvedConfig, file: string): string =>
  path.relative(config.root, file).split(path.sep).join("/");

const defined = (config: ResolvedConfig, object: DefinedObject): string =>
  `${object.kind} ${object.rawcode} (${shown(config, object.file)})`;

const removed = (object: RemovedObject): string =>
  `${object.kind} ${object.rawcode}`;

/** The map folder's files written, and the manifest when written, as report lines. */
function writtenLines(
  config: ResolvedConfig,
  written: readonly string[],
  manifestWritten: boolean,
): string[] {
  const map = shown(config, config.mapFolder);
  return [
    ...(written.length > 0
      ? [`Wrote ${written.map((name) => `${map}/${name}`).join(", ")}`]
      : []),
    ...(manifestWritten
      ? [`Wrote ${shown(config, config.objectManifest)}`]
      : []),
  ];
}

const reloadedLine = (reloaded: boolean): string[] =>
  reloaded ? ["Reloaded the map in the World Editor."] : [];

/** What `pnpm objects:sync` prints of its report, one line each. */
export function syncReportLines(
  config: ResolvedConfig,
  report: ObjectSyncReport,
): string[] {
  const lines = [
    ...report.added.map((object) => `Added ${defined(config, object)}`),
    ...report.changed.map((object) => `Changed ${defined(config, object)}`),
    ...report.removed.map((object) => `Removed ${removed(object)}`),
    ...report.removedAgain.map((object) => `Removed again ${removed(object)}`),
    ...report.leftAlone.map((object) => `Left alone ${removed(object)}`),
    ...writtenLines(config, report.written, report.manifestWritten),
    ...reloadedLine(report.worldEditorReloaded),
  ];
  return lines.length > 0
    ? [`Object sync: ${String(report.objects.length)} defined.`, ...lines]
    : [
        `Object sync: ${String(report.objects.length)} defined, nothing to write: the map folder holds every definition.`,
      ];
}

/** What `pnpm objects:adopt` prints of its report, one line each. */
export function adoptionReportLines(
  config: ResolvedConfig,
  report: ObjectAdoptionReport,
): string[] {
  if (report.adopted.length === 0)
    return ["Object adoption: nothing to adopt."];
  return [
    ...report.adopted.map(
      (object) =>
        `Adopted ${object.kind} ${object.rawcode} into ${shown(config, object.file)}`,
    ),
    ...writtenLines(config, [], report.manifestWritten),
  ];
}

/** What `pnpm objects:release` prints of its report, one line each. */
export function releaseReportLines(
  config: ResolvedConfig,
  report: ObjectReleaseReport,
): string[] {
  return [
    ...report.released.map(
      (object) =>
        `Released ${object.kind} ${object.rawcode}, deleting ${shown(config, object.file)}`,
    ),
    ...writtenLines(config, report.written, report.manifestWritten),
    ...reloadedLine(report.worldEditorReloaded),
  ];
}

/**
 * Runs one command from its command line and prints its report: the lines
 * on stdout, each warning on stderr. A refusal throws an AuthorError, with
 * `reforged-map`'s message.
 */
export async function runObjectsCommand(
  config: ObjectsConfig,
  commandLine: ObjectsCommandLine,
  seams: WorldEditorSeams = {},
  warn: Warn = printWarning,
): Promise<void> {
  const { command, rawcodes, force } = commandLine;
  let lines: string[];
  let warnings: readonly string[];
  if (command === "sync") {
    const report = syncObjects(config, { force, ...seams });
    lines = syncReportLines(config, report);
    warnings = report.warnings;
  } else if (command === "adopt") {
    const report = await adoptObjectsIntoCode(config, rawcodes, {
      force,
      ...(seams.worldEditorCheck && {
        worldEditorCheck: seams.worldEditorCheck,
      }),
    });
    lines = adoptionReportLines(config, report);
    warnings = report.warnings;
  } else {
    const report = releaseObjectsToMap(
      config,
      rawcodes === "all" ? [] : rawcodes,
      { force, ...seams },
    );
    lines = releaseReportLines(config, report);
    warnings = report.warnings;
  }
  for (const warning of warnings) warn(warning);
  for (const line of lines) console.log(line);
}

/** Command line: `node scripts/objects.ts sync|adopt|release [args]` (`pnpm objects:<command>`), run from the repository root. */
await runAsEntry(
  import.meta.url,
  `objects:${process.argv[2] ?? ""}`,
  async () => {
    const commandLine = parseObjectsCommandLine(process.argv.slice(2));
    const config = await loadObjectsConfig(path.resolve(CONFIG_FILE));
    await runObjectsCommand(config, commandLine);
  },
);
