import fs from "node:fs";
import path from "node:path";
import { build, builtMessage } from "./build.ts";
import { printFailure, runAsEntry } from "./cli.ts";
import { CONFIG_FILE, isInside, loadConfig, type ResolvedConfig } from "./config.ts";

/** Quiet time after the last change before the build runs: an editor save writes many files. */
export const DEBOUNCE_MS = 300;

/** The timer functions the debounce uses; injectable so a test can drive a fake clock. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/** Wraps `run` so a burst of calls runs it once, `ms` after the last call. */
export function debounce(run: () => void, ms: number, timers: Timers = realTimers): { (): void; cancel(): void } {
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
  /** Folders (absolute) whose changes are dropped, wherever they sit. */
  ignore: string[];
  /** Called once per burst of changes, after `debounceMs` of quiet. */
  onChange(): void;
  debounceMs?: number;
  timers?: Timers;
}

/**
 * Node's built-in recursive watch over `folders`, debounced. Changes under an
 * ignored folder never trigger; a change whose file name the platform does not
 * report does.
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
  const trigger = debounce(options.onChange, options.debounceMs ?? DEBOUNCE_MS, options.timers);
  const ignored = (file: string) => options.ignore.some((folder) => isInside(file, folder));
  const closers = options.folders.map((folder) => {
    let inner: fs.FSWatcher | undefined;
    const arm = () => {
      inner?.close();
      inner = undefined;
      if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) return;
      inner = fs
        .watch(folder, { recursive: true }, (_event, filename) => {
          if (filename !== null && ignored(path.resolve(folder, filename))) return;
          trigger();
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
        trigger();
      })
      .on("error", (error) => console.error(`Watch error on ${path.dirname(folder)}:`, error));
    arm();
    return () => {
      parent.close();
      inner?.close();
    };
  });
  return {
    close() {
      trigger.cancel();
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

/**
 * The dev loop: watch the source folder and the map folder, build once, then
 * rebuild after every burst of changes. The generated folder and the output
 * folder are the build's own writes and are ignored, so a build never
 * retriggers itself.
 */
export function startDev(config: ResolvedConfig, debounceMs = DEBOUNCE_MS): { close(): void } {
  const { sourceFolder } = config;
  const watcher = watchFolders({
    folders: [sourceFolder, config.mapFolder],
    ignore: [config.generatedFolder, config.outputFolder],
    debounceMs,
    onChange: () => {
      console.log("Change detected, rebuilding...");
      buildAndReport(config);
    },
  });
  buildAndReport(config);
  const shown = (folder: string) => path.relative(config.root, folder) || ".";
  console.log(`Watching ${shown(sourceFolder)} and ${shown(config.mapFolder)} for changes (Ctrl+C to stop)`);
  return watcher;
}

/** Command line: `node scripts/dev.ts [--mode dev|release]`, run from the repository root. Runs until interrupted. */
await runAsEntry(import.meta.url, "Build", async () => {
  startDev(await loadConfig(path.resolve(CONFIG_FILE), process.argv.slice(2)));
});
