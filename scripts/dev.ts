import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { build, builtMessage } from "./build.ts";
import { printFailure, runAsEntry } from "./cli.ts";
import {
  CONFIG_FILE,
  isInside,
  loadObjectsConfig,
  type ObjectsConfig,
  type ResolvedConfig,
} from "./config.ts";
import { printWarning } from "./generate.ts";
import {
  syncObjects,
  syncReportLines,
  type WorldEditorSeams,
} from "./objects.ts";

/** Quiet time after the last change before the build runs: an editor save writes many files. */
export const DEBOUNCE_MS = 300;

/** The timer functions the debounce uses; injectable so a test can drive a fake clock. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

/** Wraps `run` so a burst of calls runs it once, `ms` after the last call. */
export function debounce(
  run: () => void,
  ms: number,
  timers: Timers = realTimers,
): { (): void; cancel(): void } {
  let pending: unknown;
  const trigger = () => {
    if (pending !== undefined) timers.clearTimeout(pending);
    pending = timers.setTimeout(() => {
      pending = undefined;
      run();
    }, ms);
  };
  trigger.cancel = () => {
    if (pending !== undefined) timers.clearTimeout(pending);
    pending = undefined;
  };
  return trigger;
}

export interface WatchOptions {
  /** Folders watched recursively. */
  folders: string[];
  /**
   * Files watched by name, through their folder without recursion, whether
   * they exist or not. A change the platform reports without a file name is
   * dropped here: the folder (the root, for the Object manifest) also holds
   * what the build writes.
   */
  files?: string[];
  /** Folders (absolute) whose changes are dropped, wherever they sit. */
  ignore: string[];
  /**
   * Called once per burst of changes, after `debounceMs` of quiet, with the
   * absolute paths that changed; undefined when the platform did not name
   * one of them.
   */
  onChange: (changed: readonly string[] | undefined) => void;
  debounceMs?: number;
  timers?: Timers;
}

/**
 * Node's built-in recursive watch over `folders`, debounced. Changes under an
 * ignored folder never trigger; a change whose file name the platform does not
 * report does.
 *
 * A `change` naming a folder inside them is dropped: it is about the folder's
 * own times or attributes (Windows reports a read that updates its last
 * access time, #131), and what changes inside it arrives under its own name.
 * A folder created or deleted is a `rename`, and still triggers.
 *
 * A watched folder may be deleted and created again (an editor saving a map
 * folder that way): on Linux the recursive watch stays on the deleted folder
 * and goes silent. So each folder's parent is also watched, without
 * recursion, for that one name; when it is removed or created the change
 * triggers and the folder's watch is re-armed on whatever is there now (none
 * while the folder is missing). The parent's `change` naming the folder
 * (Windows reports one when a child is created) is about its contents and
 * is left to the folder's own watch, which applies the ignore list.
 */
export function watchFolders(options: WatchOptions): { close(): void } {
  let changed = new Set<string>();
  let unnamed = false;
  const debounced = debounce(
    () => {
      const paths = unnamed ? undefined : [...changed];
      changed = new Set();
      unnamed = false;
      options.onChange(paths);
    },
    options.debounceMs ?? DEBOUNCE_MS,
    options.timers,
  );
  const trigger = (file: string | undefined) => {
    if (file === undefined) unnamed = true;
    else changed.add(file);
    debounced();
  };
  const ignored = (file: string) =>
    options.ignore.some((folder) => isInside(file, folder));
  const closers = options.folders.map((folder) => {
    let inner: fs.FSWatcher | undefined;
    const arm = () => {
      inner?.close();
      inner = undefined;
      if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory())
        return;
      inner = fs
        .watch(folder, { recursive: true }, (event, filename) => {
          if (filename === null) {
            trigger(undefined);
            return;
          }
          const file = path.resolve(folder, filename);
          if (ignored(file)) return;
          if (
            event === "change" &&
            fs.statSync(file, { throwIfNoEntry: false })?.isDirectory()
          )
            return;
          trigger(file);
        })
        .on("error", (error) => {
          console.error(`Watch error on ${folder}:`, error);
          arm();
        });
    };
    const name = path.basename(folder);
    const parent = fs
      .watch(path.dirname(folder), (event, filename) => {
        if (event !== "rename") return;
        if (filename !== null && filename !== name) return;
        if (ignored(folder)) return;
        arm();
        trigger(folder);
      })
      .on("error", (error) => {
        console.error(`Watch error on ${path.dirname(folder)}:`, error);
      });
    arm();
    return () => {
      parent.close();
      inner?.close();
    };
  });
  for (const file of options.files ?? []) {
    const name = path.basename(file);
    const watcher = fs
      .watch(path.dirname(file), (_event, filename) => {
        if (filename === name) trigger(file);
      })
      .on("error", (error) => {
        console.error(`Watch error on ${path.dirname(file)}:`, error);
      });
    closers.push(() => {
      watcher.close();
    });
  }
  return {
    close() {
      debounced.cancel();
      for (const close of closers) close();
    },
  };
}

/** Runs the build command's `build` and prints its outcome; never throws, so the watch survives a failing build. */
function buildAndReport(config: ResolvedConfig): void {
  try {
    console.log(builtMessage(config, build(config)));
  } catch (error) {
    printFailure("Build", error);
  }
}

/** sha256 of a file's bytes; undefined when it is missing. */
function hashOf(file: string): string | undefined {
  try {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return undefined;
  }
}

/**
 * Runs Object sync and prints its report; never throws, so a refused sync
 * is printed and the build still runs. Returns the files it wrote (the map
 * folder's, and the manifest), each with its hash, so the watch can tell the
 * sync's own writes from an author's.
 */
function syncAndReport(
  config: ObjectsConfig,
  seams: WorldEditorSeams,
): Map<string, string | undefined> {
  try {
    const report = syncObjects(config, seams);
    for (const warning of report.warnings) printWarning(warning);
    for (const line of syncReportLines(config, report)) console.log(line);
    const written = [
      ...report.written.map((name) => path.join(config.mapFolder, name)),
      ...(report.manifestWritten ? [config.objectManifest] : []),
    ];
    return new Map(written.map((file) => [file, hashOf(file)]));
  } catch (error) {
    printFailure("objects:sync", error);
    return new Map();
  }
}

export interface DevOptions {
  /** Quiet time before a rebuild: `DEBOUNCE_MS` when left out. */
  debounceMs?: number;
  /** How Object sync reaches the World Editor: the system's when left out. */
  worldEditor?: WorldEditorSeams;
}

/**
 * The dev loop: watch the source folder and the map folder, build once, then
 * rebuild after every burst of changes. The generated folder and the output
 * folder are the build's own writes and are ignored, so a build never
 * retriggers itself.
 *
 * With `devObjectSync`, Object sync runs before each build and the Object
 * manifest is watched too (`src/objects/` is under the source folder). A
 * burst made only of the sync's own writes, each file still as it wrote it,
 * runs nothing, so a sync never retriggers itself either.
 *
 * Every rebuild opens with the "Change detected" line and every build, failed
 * or not, closes with the "Watching" line: the VS Code `dev` task's background
 * patterns (`.vscode/tasks.json`) wait for these two lines.
 */
export function startDev(
  config: ObjectsConfig,
  options: DevOptions = {},
): { close(): void } {
  const { sourceFolder } = config;
  const shown = (file: string) => path.relative(config.root, file) || ".";
  const watchingLine = config.devObjectSync
    ? `Watching ${shown(sourceFolder)}, ${shown(config.mapFolder)} and ${shown(config.objectManifest)} for changes, syncing the Object definitions before each build (Ctrl+C to stop)`
    : `Watching ${shown(sourceFolder)} and ${shown(config.mapFolder)} for changes (Ctrl+C to stop)`;
  let ownWrites = new Map<string, string | undefined>();
  const syncBuildAndAnnounce = () => {
    if (config.devObjectSync)
      ownWrites = syncAndReport(config, options.worldEditor ?? {});
    buildAndReport(config);
    console.log(watchingLine);
  };
  const onlyOwnWrites = (changed: readonly string[] | undefined) =>
    changed !== undefined &&
    changed.length > 0 &&
    changed.every(
      (file) => ownWrites.has(file) && ownWrites.get(file) === hashOf(file),
    );
  const watcher = watchFolders({
    folders: [sourceFolder, config.mapFolder],
    files: config.devObjectSync ? [config.objectManifest] : [],
    ignore: [config.generatedFolder, config.outputFolder],
    debounceMs: options.debounceMs ?? DEBOUNCE_MS,
    onChange: (changed) => {
      if (onlyOwnWrites(changed)) {
        ownWrites = new Map();
        return;
      }
      console.log("Change detected, rebuilding...");
      syncBuildAndAnnounce();
    },
  });
  syncBuildAndAnnounce();
  return watcher;
}

/** Command line: `node scripts/dev.ts [--mode dev|release]`, run from the repository root. Runs until interrupted. */
await runAsEntry(import.meta.url, "Build", async () => {
  startDev(
    await loadObjectsConfig(path.resolve(CONFIG_FILE), process.argv.slice(2)),
  );
});
