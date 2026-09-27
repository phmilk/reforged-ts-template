import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIST_FILE,
  LOCAL_FOLDER,
  LIBRARY_PACKAGES,
  pnpmCommand,
  resetLocal,
  type Pnpm,
} from "../../scripts/use-local.ts";
import { git, makeTempDir, ROOT, runScript } from "./helpers.ts";

const PNPMFILE = ".pnpmfile.cjs";

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/** Loads a fresh copy of the committed pnpm hook from `root`, as pnpm would at install time. */
function loadHook(root: string): (manifest: Manifest) => Manifest {
  const file = path.join(root, PNPMFILE);
  fs.copyFileSync(path.join(ROOT, PNPMFILE), file);
  const hooks = createRequire(import.meta.url)(file) as {
    hooks: { readPackage: (manifest: Manifest) => Manifest };
  };
  return hooks.hooks.readPackage;
}

const manifest = (): Manifest => ({
  name: "map",
  dependencies: {
    "reforged-ts": "^1.0.0",
    "reforged-types": "^1.0.0",
    other: "^2.0.0",
  },
  devDependencies: { "reforged-test": "^1.0.0" },
  peerDependencies: { "reforged-types": "^1.0.0" },
});

describe("the pnpm hook", () => {
  it("leaves every manifest alone when no local tarballs are listed", () => {
    expect(loadHook(makeTempDir())(manifest())).toEqual(manifest());
  });

  it("points the listed packages at their tarballs, its own and its dependencies', never peers", () => {
    const root = makeTempDir();
    fs.mkdirSync(path.join(root, LOCAL_FOLDER));
    fs.writeFileSync(
      path.join(root, LOCAL_FOLDER, LIST_FILE),
      JSON.stringify({ "reforged-ts": "ts.tgz", "reforged-test": "test.tgz" }),
    );
    const tarball = (name: string) =>
      `file:${path.join(root, LOCAL_FOLDER, name).split(path.sep).join("/")}`;
    expect(loadHook(root)(manifest())).toEqual({
      name: "map",
      dependencies: {
        "reforged-ts": tarball("ts.tgz"),
        "reforged-types": "^1.0.0",
        other: "^2.0.0",
      },
      devDependencies: { "reforged-test": tarball("test.tgz") },
      peerDependencies: { "reforged-types": "^1.0.0" },
    });
    // A listed package's own dependencies on another listed one go to the tarball too, not to the registry.
    expect(
      loadHook(root)({
        name: "reforged-ts",
        dependencies: { "reforged-test": "^1.0.0" },
      }).dependencies,
    ).toEqual({ "reforged-test": tarball("test.tgz") });
  });
});

/**
 * A committed Map project reduced to what `use:local` touches: a manifest on
 * the four library packages (and nothing else, so installing needs no
 * registry) with the Template's pnpm pin, the ignore file, the pnpm settings,
 * the pnpm hook and the scripts.
 */
function makeMapProject(): string {
  const dir = makeTempDir();
  const { packageManager } = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  ) as { packageManager: string };
  const pkg = {
    name: "map",
    private: true,
    type: "module",
    packageManager,
    dependencies: { "reforged-ts": "^1.0.0", "reforged-types": "^1.0.0" },
    devDependencies: {
      "reforged-test": "^1.0.0",
      "eslint-plugin-reforged": "^1.0.0",
    },
  };
  fs.writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  for (const name of [".gitignore", PNPMFILE, "scripts"])
    fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  // As committed: the release's Template gate adds overrides to the checkout's copy.
  fs.writeFileSync(
    path.join(dir, "pnpm-workspace.yaml"),
    git(ROOT, "show", "HEAD:pnpm-workspace.yaml"),
  );
  git(dir, "init", "-q");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  return dir;
}

/**
 * A checkout shaped like phmilk/reforged-ts: a workspace whose four packages
 * build `dist.txt` from `src.txt` and ship only the built file.
 */
function makeCheckout(): string {
  const dir = makeTempDir("reforged-checkout-");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "workspace", private: true }),
  );
  fs.writeFileSync(
    path.join(dir, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n",
  );
  for (const name of LIBRARY_PACKAGES) {
    const pkg = path.join(dir, "packages", name);
    fs.mkdirSync(pkg, { recursive: true });
    const build =
      "node -e \"require('fs').copyFileSync('src.txt','dist.txt')\"";
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        files: ["dist.txt"],
        scripts: { build },
      }),
    );
    fs.writeFileSync(path.join(pkg, "src.txt"), `${name} v1\n`);
  }
  return dir;
}

const runUseLocal = (cwd: string, ...args: string[]) =>
  runScript(cwd, "scripts/use-local.ts", args);

describe("pnpm use:local", () => {
  it("fails on a path that is not a library checkout, naming the missing packages, without a stack trace", () => {
    const project = makeMapProject();
    const checkout = makeCheckout();
    fs.rmSync(path.join(checkout, "packages", "reforged-test"), {
      recursive: true,
    });
    fs.rmSync(path.join(checkout, "packages", "reforged-types"), {
      recursive: true,
    });
    const result = runUseLocal(project, checkout);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /^use:local failed: .*reforged-types, reforged-test/,
    );
    expect(result.stderr).not.toMatch(/\n\s+at /);
    expect(fs.existsSync(path.join(project, LOCAL_FOLDER))).toBe(false);
  });

  it("fails without a path, with the usage", () => {
    const result = runUseLocal(makeMapProject());
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /^use:local failed: Usage: pnpm use:local <path to a reforged-ts checkout> \| --reset/,
    );
  });

  it("builds, packs and installs the checkout's packages, picks up a change on rerun, and changes nothing committed", () => {
    const project = makeMapProject();
    const checkout = makeCheckout();
    const installed = (name: string) =>
      fs.readFileSync(
        path.join(project, "node_modules", name, "dist.txt"),
        "utf8",
      );

    const first = runUseLocal(project, path.relative(project, checkout));
    expect(first.stderr).not.toMatch(/failed/);
    expect(first.status).toBe(0);
    for (const name of LIBRARY_PACKAGES)
      expect(installed(name)).toBe(`${name} v1\n`);
    expect(git(project, "status", "--porcelain", "--untracked-files=all")).toBe(
      "",
    );

    fs.writeFileSync(
      path.join(checkout, "packages", "reforged-ts", "src.txt"),
      "reforged-ts v2\n",
    );
    expect(runUseLocal(project, checkout).status).toBe(0);
    expect(installed("reforged-ts")).toBe("reforged-ts v2\n");
    // One tarball per package: the previous run's are gone.
    expect(fs.readdirSync(path.join(project, LOCAL_FOLDER))).toHaveLength(
      LIBRARY_PACKAGES.length + 1,
    );
    expect(git(project, "status", "--porcelain", "--untracked-files=all")).toBe(
      "",
    );
  }, 120_000);
});

describe("pnpmCommand", () => {
  const node = process.execPath;
  // Relative paths: an absolute one in a committed file fails absolute-paths.test.ts.
  const pnpmFolder = ["pnpm", "node_modules", "pnpm"];

  it("runs pnpm 12's native binary, which `pnpm <script>` names in npm_execpath, directly", () => {
    const exe = [...pnpmFolder, "pnpm.exe"].join("\\");
    expect(pnpmCommand(exe, "win32")).toEqual({
      command: exe,
      args: [],
      shell: false,
    });
    const binary = [...pnpmFolder, "pnpm"].join("/");
    expect(pnpmCommand(binary, "linux")).toEqual({
      command: binary,
      args: [],
      shell: false,
    });
  });

  it("runs a JavaScript pnpm through node", () => {
    const script = [...pnpmFolder, "bin", "pnpm.cjs"].join("/");
    expect(pnpmCommand(script, "win32")).toEqual({
      command: node,
      args: [script],
      shell: false,
    });
  });

  it("falls back to the pnpm on the PATH, through the shell on Windows, when npm_execpath is not pnpm's", () => {
    for (const execPath of [undefined, "npm/bin/npm-cli.js"]) {
      expect(pnpmCommand(execPath, "win32")).toEqual({
        command: "pnpm",
        args: [],
        shell: true,
      });
      expect(pnpmCommand(execPath, "linux")).toEqual({
        command: "pnpm",
        args: [],
        shell: false,
      });
    }
  });
});

describe("resetLocal", () => {
  /** Records the pnpm calls instead of running them: going back to the registry needs the network. */
  const recorder = () => {
    const calls: string[][] = [];
    const pnpm: Pnpm = (args) => void calls.push(args);
    return { calls, pnpm };
  };

  it("removes the local tarballs and reinstalls without writing a lockfile when none is committed", () => {
    const project = makeMapProject();
    fs.mkdirSync(path.join(project, LOCAL_FOLDER));
    fs.writeFileSync(path.join(project, LOCAL_FOLDER, LIST_FILE), "{}");
    const { calls, pnpm } = recorder();
    resetLocal(project, pnpm);
    expect(fs.existsSync(path.join(project, LOCAL_FOLDER))).toBe(false);
    expect(calls).toEqual([
      [
        "install",
        "--config.confirm-modules-purge=false",
        "--config.optimistic-repeat-install=false",
        "--no-lockfile",
      ],
    ]);
    expect(git(project, "status", "--porcelain", "--untracked-files=all")).toBe(
      "",
    );
  });

  it("reinstalls from the committed lockfile when there is one", () => {
    const project = makeMapProject();
    fs.writeFileSync(
      path.join(project, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    git(project, "add", ".");
    git(project, "commit", "-q", "-m", "lockfile");
    const { calls, pnpm } = recorder();
    resetLocal(project, pnpm);
    expect(calls).toEqual([
      [
        "install",
        "--config.confirm-modules-purge=false",
        "--config.optimistic-repeat-install=false",
        "--frozen-lockfile",
      ],
    ]);
  });
});
