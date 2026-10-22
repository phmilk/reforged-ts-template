// The git diff driver of Object data, set on install (`prepare`): the map
// folder's Object data files are binary, and `.gitattributes` gives them
// `diff=reforged-object-data`, whose command lives in each clone's local git
// configuration, since git never takes a command from a repository's files.
// The command is reforged-map's textconv driver, which prints the file as
// text, one line per object and per modification.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { runAsEntry } from "./cli.ts";
import { printWarning, type Warn } from "./generate.ts";

/** The diff driver `.gitattributes` names on the Object data files. */
export const DIFF_DRIVER = "reforged-object-data";

/** reforged-map's command, relative to the Map project's root. */
const CLI = "node_modules/reforged-map/dist/cli.js";

/** A path as a shell word: quoted when it holds more than letters, digits and `_./-`. */
const shellWord = (word: string): string =>
  /^[\w./-]+$/.test(word) ? word : `"${word}"`;

/**
 * The driver's command for a Map project at `prefix` in its work tree (`""`
 * at the top, `sub/` in a subfolder): git runs it from the work tree's top.
 * It runs the project's own installation with Node, without a package
 * manager's start-up for each file.
 */
export function textconvCommand(prefix: string): string {
  return `node ${shellWord(`${prefix}${CLI}`)} textconv`;
}

/** Runs git in `cwd`; `error` is set when git could not start. */
function runGit(cwd: string, args: string[]) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Sets the driver's keys in the local git configuration of the work tree
 * holding `root`, each only when it differs, and returns those it wrote. Never
 * throws: outside a work tree, without git, or when a key cannot be written,
 * it says so through `warn`, so the install goes on.
 */
export function configureDiffDriver(
  root: string,
  warn: Warn = printWarning,
): string[] {
  const later = `git diff shows the map's Object data as binary until \`pnpm install\` runs again.`;
  const prefix = runGit(root, ["rev-parse", "--show-prefix"]);
  if (prefix.error) {
    warn(`git could not be run (${prefix.error.message}): ${later}`);
    return [];
  }
  if (prefix.status !== 0) {
    warn(`${path.resolve(root)} is not a git work tree: ${later}`);
    return [];
  }
  const keys: [string, string][] = [
    [`diff.${DIFF_DRIVER}.textconv`, textconvCommand(prefix.stdout.trim())],
    [`diff.${DIFF_DRIVER}.cachetextconv`, "true"],
  ];
  const written: string[] = [];
  for (const [key, value] of keys) {
    const current = runGit(root, ["config", "--local", "--get", key]);
    if (current.status === 0 && current.stdout.trim() === value) continue;
    const set = runGit(root, ["config", "--local", key, value]);
    if (set.status !== 0) {
      warn(
        `git could not set ${key} (${set.stderr.trim() || `exit ${String(set.status)}`}): ${later}`,
      );
      return written;
    }
    written.push(key);
  }
  return written;
}

/** Command line: `node scripts/diff-driver.ts` (part of the `prepare` script), run from the project root. */
await runAsEntry(import.meta.url, "Diff driver", () => {
  const written = configureDiffDriver(process.cwd());
  if (written.length > 0)
    console.log(`Set git's diff driver of Object data: ${written.join(", ")}`);
});
