import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "./build.ts";
import { CONFIG_FILE, loadConfig, type ResolvedConfig } from "./config.ts";
import { BuildError } from "./errors.ts";

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

const isInside = (file: string, folder: string): boolean => {
  const rel = path.relative(folder, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/**
 * Node's built-in recursive watch over `folders`, debounced. Changes under an
 * ignored folder never trigger; a change whose file name the platform does not
 * report does.
 */
export function watchFolders(options: WatchOptions): { close(): void } {
  const trigger = debounce(options.onChange, options.debounceMs ?? DEBOUNCE_MS, options.timers);
  const watchers = options.folders.map((folder) =>
    fs
      .watch(folder, { recursive: true }, (_event, filename) => {
        if (filename !== null && options.ignore.some((ignored) => isInside(path.resolve(folder, filename), ignored))) return;
        trigger();
      })
      .on("error", (error) => console.error(`Watch error on ${folder}:`, error)),
  );
  return {
    close() {
      trigger.cancel();
      for (const watcher of watchers) watcher.close();
    },
  };
}

/** Runs the build command's `build` and prints its outcome; never throws, so the watch survives a failing build. */
function buildAndReport(config: ResolvedConfig): void {
  try {
    const result = build(config);
    console.log(`Built ${path.relative(config.root, result.archive)} (${result.size} bytes, mode ${config.mode})`);
  } catch (error) {
    console.error(error instanceof BuildError ? `Build failed: ${error.message}` : error);
  }
}

/**
 * The dev loop: watch the source folder and the map folder, build once, then
 * rebuild after every burst of changes. The generated folder and the output
 * folder are the build's own writes and are ignored, so a build never
 * retriggers itself.
 */
export function startDev(config: ResolvedConfig, debounceMs = DEBOUNCE_MS): { close(): void } {
  const sourceFolder = path.join(config.root, "src");
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
async function main(): Promise<void> {
  let config: ResolvedConfig;
  try {
    config = await loadConfig(path.resolve(CONFIG_FILE), process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof BuildError ? `Build failed: ${error.message}` : error);
    process.exitCode = 1;
    return;
  }
  startDev(config);
}

// Run only as the entry script (import.meta.main needs Node 24.2; the floor is 24.0).
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
