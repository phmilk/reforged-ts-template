import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../../reforged.config.ts";
import { resolveConfig } from "../../scripts/config.ts";

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
/**
 * The map folder `reforged.config.ts` names, relative to the project root,
 * with forward slashes: the same in the repository and in a `copyProject()`
 * copy, whatever a Map project names its map folder.
 */
export const MAP_FOLDER = path
  .relative(ROOT, resolveConfig(config, ROOT).mapFolder)
  .split(path.sep)
  .join("/");
/**
 * Map folders the configs that leave a map folder to the World Editor
 * (`.gitattributes`, the editor configs) must match: the project's, and one
 * of either suffix at the root, under `maps/` and deeper.
 */
export const MAP_FOLDERS = [
  MAP_FOLDER,
  "other.w3x",
  "maps/other.w3m",
  "nested/x/other.w3m",
];

/** `text` as a regular expression that matches it literally. */
export const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The pipeline tests' fixture map: a copy of the Template's blank map folder
 * as the 3.0 World Editor saved it (17 files, war3map.w3i version 39),
 * committed with the tests. Every pipeline test reads it, directly or as the
 * map of a `copyProject()` copy, never the project's `mapFolder`, which the
 * World Editor edits. Git (`.gitattributes`) and ESLint leave it byte for
 * byte; nothing edits it in place.
 */
export const FIXTURE_MAP = path.join(
  ROOT,
  "tests",
  "pipeline",
  "fixtures",
  "blank-map.w3m",
);

/**
 * A map folder with Object data, as the 3.0 World Editor saved it: the
 * Template's map with a Custom object and a modified Built-in object of each
 * Object kind, copied from reforged-map's `editor-objects.w3m` fixture (its
 * provenance in `objects-map.md`, next to it). Read only, like `FIXTURE_MAP`.
 */
export const FIXTURE_OBJECTS_MAP = path.join(
  ROOT,
  "tests",
  "pipeline",
  "fixtures",
  "objects-map.w3m",
);

/**
 * The entry's module in the bundle, whatever the starter says: typescript-to-lua
 * bundles src/main.ts as the module "main".
 */
export const ENTRY_MODULE = '["main"] = function(...)';

export const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export function makeTempDir(prefix = "reforged-template-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Links the Template's node_modules into `root`, so a package resolves from it as from a Map project. */
export function linkNodeModules(root: string): void {
  fs.symlinkSync(
    path.join(ROOT, "node_modules"),
    path.join(root, "node_modules"),
    "junction",
  );
}

/** sha256 of every file under `folder`, keyed by relative path with forward slashes. */
export function hashTree(folder: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(folder, {
    recursive: true,
    encoding: "utf8",
  })) {
    const file = path.join(folder, rel);
    if (fs.statSync(file).isFile())
      out[rel.split(path.sep).join("/")] = sha256(fs.readFileSync(file));
  }
  return out;
}

/** The `version` of a `copyProject()` copy's `package.json`, whatever the project's own says. */
export const COPY_VERSION = "1.2.0";

/** Sets the `version` of `<project>/package.json`, or removes it when `undefined`. */
export function setPackageVersion(
  project: string,
  version: string | undefined,
): void {
  const file = path.join(project, "package.json");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  if (version === undefined) delete manifest.version;
  else manifest.version = version;
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * A throwaway copy of the Template (manifest, tsconfigs, config, vitest,
 * ESLint and Prettier configs, source, scripts, tests) with the real
 * node_modules linked in, so a command runs end to end without touching the
 * repository. Its map folder, the `mapFolder` of its `reforged.config.ts`,
 * holds `FIXTURE_MAP`, not the project's map: what the World Editor saves
 * there never changes a command's output, and a test may edit the copy's map.
 * Its `package.json` says `version` `COPY_VERSION`, so the archive's name does
 * not follow the project's version.
 */
export function copyProject(): string {
  const dir = makeTempDir();
  for (const name of [
    "package.json",
    "tsconfig.json",
    "tsconfig.base.json",
    "tsconfig.solution.json",
    "tsconfig.scripts.json",
    "reforged.config.ts",
    "vitest.config.ts",
    "eslint.config.mjs",
    ".prettierrc",
    "src",
    "scripts",
    "tests",
  ]) {
    fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  }
  fs.cpSync(FIXTURE_MAP, resolveConfig(config, dir).mapFolder, {
    recursive: true,
  });
  setPackageVersion(dir, COPY_VERSION);
  fs.symlinkSync(
    path.join(ROOT, "node_modules"),
    path.join(dir, "node_modules"),
    "junction",
  );
  return dir;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs a pipeline script with Node from `cwd`, the way the package scripts do.
 * `env` is added to the environment. `GITHUB_OUTPUT` is unset unless `env`
 * sets it, so a test run inside GitHub Actions never writes its step's outputs.
 */
export function runScript(
  cwd: string,
  script: string,
  args: string[] = [],
  env: NodeJS.ProcessEnv = {},
): CommandResult {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: undefined, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Runs git in `cwd` with a throwaway identity and no line-ending conversion; throws on failure. Returns its stdout. */
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "-c",
      "core.autocrlf=false",
      ...args,
    ],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}
