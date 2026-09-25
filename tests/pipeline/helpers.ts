import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
/** The blank map folder saved by the 3.0 World Editor, committed as the fixture. */
export const FIXTURE_MAP = path.join(ROOT, "maps", "reforged-ts-template.w3m");

/**
 * The entry's module in the bundle, whatever the starter says: typescript-to-lua
 * bundles src/main.ts as the module "main".
 */
export const ENTRY_MODULE = '["main"] = function(...)';

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export function makeTempDir(prefix = "reforged-template-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** sha256 of every file under `folder`, keyed by relative path with forward slashes. */
export function hashTree(folder: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(folder, { recursive: true, encoding: "utf8" })) {
    const file = path.join(folder, rel);
    if (fs.statSync(file).isFile()) out[rel.split(path.sep).join("/")] = sha256(fs.readFileSync(file));
  }
  return out;
}

/**
 * A throwaway copy of the Template (manifest, tsconfigs, config, vitest
 * config, source, maps, scripts, tests) with the real node_modules linked in, so a command runs end to end
 * without touching the repository.
 */
export function copyProject(): string {
  const dir = makeTempDir();
  for (const name of ["package.json", "tsconfig.json", "tsconfig.base.json", "reforged.config.ts", "vitest.config.ts", "src", "maps", "scripts", "tests"]) {
    fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "junction");
  return dir;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a pipeline script with Node from `cwd`, the way the package scripts do. */
export function runScript(cwd: string, script: string, args: string[] = []): CommandResult {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs git in `cwd` with a throwaway identity and no line-ending conversion; throws on failure. Returns its stdout. */
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}
