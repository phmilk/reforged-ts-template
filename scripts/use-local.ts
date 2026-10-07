import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAsEntry } from "./cli.ts";
import { AuthorError } from "./errors.ts";

/** The ignored folder holding the packed tarballs and their list. The pnpm hook (.pnpmfile.cjs) reads the same names. */
export const LOCAL_FOLDER = ".local-packages";
/** The list the pnpm hook reads: package name to tarball file name. */
export const LIST_FILE = "packages.json";
/**
 * The library packages a Map project installs, each under `packages/<name>` in
 * a reforged-ts checkout: the three the map's code and tests use, the lint
 * plugin `pnpm lint` loads, and the map folder reader the build's generate
 * step calls. `use:local` installs them from a checkout; the sync
 * (scripts/sync.ts) bumps them to each release.
 */
export const LIBRARY_PACKAGES = [
  "reforged-types",
  "reforged-test",
  "reforged-ts",
  "eslint-plugin-reforged",
  "reforged-map",
] as const;

export type LibraryPackage = (typeof LIBRARY_PACKAGES)[number];

/** Runs pnpm with `args` in `cwd`; throws when it fails. */
export type Pnpm = (args: string[], cwd: string) => void;

/**
 * A changed resolution never stops on the question pnpm asks before purging
 * node_modules: a script has no terminal to answer it. And the install always
 * resolves: the manifests do not change when the tarballs do (the pnpm hook
 * swaps them in memory), so pnpm's check that skips a repeated install would
 * keep the previous ones. The settings are spelled in kebab case, the one
 * spelling pnpm 12 reads on the command line.
 */
const INSTALL = [
  "install",
  "--config.confirm-modules-purge=false",
  "--config.optimistic-repeat-install=false",
];
/** Installing never writes the lockfile, so the committed one (if any) stays as it is. */
const INSTALL_WITHOUT_LOCKFILE = [...INSTALL, "--no-lockfile"];

/** Quotes `arg` for cmd.exe, which runs `pnpm.cmd`: paths with spaces or parentheses stay one argument. */
const quoteForCmd = (arg: string) =>
  /^[\w./:=-]+$/.test(arg) ? arg : `"${arg.replaceAll('"', '""')}"`;

/** A pnpm run with `args`, as `spawnSync` takes it. */
export interface PnpmCommand {
  command: string;
  args: string[];
  shell: boolean;
}

/**
 * Runs pnpm with `args`: the pnpm that runs this script, which
 * `pnpm <script>` names in `execPath` (`npm_execpath`; npm's is not used),
 * pnpm 12's native binary directly and a JavaScript pnpm through node. Else
 * the one on the PATH, through the shell on Windows, where it is a `.cmd` or
 * `.exe`, with `args` quoted for it.
 */
export function pnpmCommand(
  args: string[],
  execPath: string | undefined,
  platform: NodeJS.Platform,
): PnpmCommand {
  const name = execPath?.split(/[\\/]/).at(-1);
  if (execPath === undefined || name === undefined) {
    const shell = platform === "win32";
    return {
      command: "pnpm",
      args: shell ? args.map(quoteForCmd) : args,
      shell,
    };
  }
  if (/^pnpm\.[cm]?js$/.test(name))
    return {
      command: process.execPath,
      args: [execPath, ...args],
      shell: false,
    };
  if (/^pnpm(\.exe)?$/.test(name))
    return { command: execPath, args, shell: false };
  return pnpmCommand(args, undefined, platform);
}

/** Runs the pnpm of `pnpmCommand`; its output goes to the terminal. */
const runPnpm: Pnpm = (args, cwd) => {
  const pnpm = pnpmCommand(args, process.env.npm_execpath, process.platform);
  const result = spawnSync(pnpm.command, pnpm.args, {
    cwd,
    stdio: "inherit",
    shell: pnpm.shell,
  });
  const error: NodeJS.ErrnoException | undefined = result.error;
  if (error?.code === "ENOENT")
    throw new AuthorError("pnpm was not found on the PATH.");
  if (error !== undefined) throw error;
  if (result.status !== 0)
    throw new AuthorError(
      `\`pnpm ${args.join(" ")}\` failed in ${cwd} (see its output above).`,
    );
};

/**
 * The folder of each library package in `checkout`. A path that is not a
 * reforged-ts checkout is an AuthorError naming every package it lacks.
 */
function findPackages(checkout: string): Record<LibraryPackage, string> {
  const folder = (name: string) => path.join(checkout, "packages", name);
  const hasPackage = (name: string) => {
    const manifest = path.join(folder(name), "package.json");
    return (
      fs.existsSync(manifest) &&
      (JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string })
        .name === name
    );
  };
  const missing = LIBRARY_PACKAGES.filter((name) => !hasPackage(name));
  if (missing.length > 0) {
    throw new AuthorError(
      `${checkout} is not a reforged-ts checkout: no package ${missing.join(", ")} under ${path.join(checkout, "packages")}.`,
    );
  }
  return Object.fromEntries(
    LIBRARY_PACKAGES.map((name) => [name, folder(name)]),
  ) as Record<LibraryPackage, string>;
}

/**
 * Packs the package in `packageFolder` into `destination` and returns the
 * tarball's file name: pnpm's `<name>-<version>` plus a hash of its content,
 * so a rebuilt package gets a new name and pnpm installs it again instead of
 * reusing the tarball it already knows by that name.
 */
function packInto(
  packageFolder: string,
  destination: string,
  pnpm: Pnpm,
): string {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "reforged-pack-"));
  try {
    pnpm(["pack", "--pack-destination", scratch], packageFolder);
    const packed = fs
      .readdirSync(scratch)
      .find((file) => file.endsWith(".tgz"));
    if (packed === undefined)
      throw new Error(`pnpm pack wrote no tarball for ${packageFolder}.`);
    const bytes = fs.readFileSync(path.join(scratch, packed));
    const file = `${packed.slice(0, -".tgz".length)}-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}.tgz`;
    fs.writeFileSync(path.join(destination, file), bytes);
    return file;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Points the Map project at `root` to a reforged-ts `checkout`: installs the
 * checkout's dependencies if it has none, builds the five packages, packs
 * them into the ignored local folder with their list, then installs them in
 * place of the registry versions through the pnpm hook. No committed file
 * changes. Returns the tarball file names by package.
 */
export function useLocal(
  root: string,
  checkout: string,
  pnpm: Pnpm = runPnpm,
): Record<LibraryPackage, string> {
  const packages = findPackages(checkout);
  if (!fs.existsSync(path.join(checkout, "node_modules")))
    pnpm(["install"], checkout);
  pnpm(
    [...LIBRARY_PACKAGES.flatMap((name) => ["--filter", name]), "run", "build"],
    checkout,
  );

  const folder = path.join(root, LOCAL_FOLDER);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder);
  const tarballs = Object.fromEntries(
    LIBRARY_PACKAGES.map((name) => [
      name,
      packInto(packages[name], folder, pnpm),
    ]),
  ) as Record<LibraryPackage, string>;
  fs.writeFileSync(
    path.join(folder, LIST_FILE),
    `${JSON.stringify(tarballs, null, 2)}\n`,
  );

  pnpm(INSTALL_WITHOUT_LOCKFILE, root);
  return tarballs;
}

/**
 * Goes back to the registry versions: removes the local folder (the pnpm hook
 * turns inert) and reinstalls, from the committed lockfile when there is one,
 * without writing one otherwise.
 */
export function resetLocal(root: string, pnpm: Pnpm = runPnpm): void {
  fs.rmSync(path.join(root, LOCAL_FOLDER), { recursive: true, force: true });
  const lockfile = fs.existsSync(path.join(root, "pnpm-lock.yaml"));
  pnpm(
    lockfile ? [...INSTALL, "--frozen-lockfile"] : INSTALL_WITHOUT_LOCKFILE,
    root,
  );
}

const USAGE =
  "Usage: pnpm use:local <path to a reforged-ts checkout> | --reset";

/**
 * Command line: `node scripts/use-local.ts <checkout> | --reset` (`pnpm use:local`),
 * run from the repository root. Needs only Node: it works on a fresh clone
 * with no node_modules.
 */
await runAsEntry(import.meta.url, "use:local", () => {
  const args = process.argv.slice(2);
  const root = process.cwd();
  if (args.length === 1 && args[0] === "--reset") {
    resetLocal(root);
    console.log(
      `Using the registry versions of ${LIBRARY_PACKAGES.join(", ")}.`,
    );
    return;
  }
  if (args.length !== 1 || args[0].startsWith("-"))
    throw new AuthorError(USAGE);
  const checkout = path.resolve(args[0]);
  const tarballs = useLocal(root, checkout);
  console.log(
    `Using ${Object.values(tarballs).join(", ")} from ${checkout}. \`pnpm use:local --reset\` goes back to the registry.`,
  );
});
