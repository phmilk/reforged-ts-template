import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { openObjectData } from "reforged-map";
import { describe, expect, it } from "vitest";
import config from "../../reforged.config.ts";
import { resolveConfig } from "../../scripts/config.ts";
import { configureDiffDriver, DIFF_DRIVER } from "../../scripts/diff-driver.ts";
import {
  FIXTURE_OBJECTS_MAP,
  git,
  linkNodeModules,
  makeTempDir,
  ROOT,
  runScript,
} from "./helpers.ts";

const TEXTCONV = `diff.${DIFF_DRIVER}.textconv`;
const CACHE = `diff.${DIFF_DRIVER}.cachetextconv`;
const SCRIPT = path.join(ROOT, "scripts", "diff-driver.ts");

/** A new, empty git repository. */
function gitRepo(): string {
  const dir = makeTempDir();
  git(dir, "init", "--quiet");
  return dir;
}

/** The local value of `key` in the repository at `dir`, undefined when unset. */
function localConfig(dir: string, key: string): string | undefined {
  const result = spawnSync("git", ["config", "--local", "--get", key], {
    cwd: dir,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

describe("configureDiffDriver (the install step)", () => {
  it("sets the driver's command and its cache in the local git configuration", () => {
    const dir = gitRepo();
    const warnings: string[] = [];

    const written = configureDiffDriver(dir, (m) => warnings.push(m));

    expect(warnings).toEqual([]);
    expect(written).toEqual([TEXTCONV, CACHE]);
    expect(localConfig(dir, TEXTCONV)).toBe(
      "node node_modules/reforged-map/dist/cli.js textconv",
    );
    expect(localConfig(dir, CACHE)).toBe("true");
  });

  it("changes nothing on a second run", () => {
    const dir = gitRepo();
    configureDiffDriver(dir);
    const configFile = path.join(dir, ".git", "config");
    const before = fs.readFileSync(configFile, "utf8");
    const mtime = fs.statSync(configFile).mtimeMs;

    expect(configureDiffDriver(dir)).toEqual([]);
    expect(fs.readFileSync(configFile, "utf8")).toBe(before);
    expect(fs.statSync(configFile).mtimeMs).toBe(mtime);
  });

  it("rewrites a key that differs, and only that one", () => {
    const dir = gitRepo();
    configureDiffDriver(dir);
    git(dir, "config", TEXTCONV, "cat");

    expect(configureDiffDriver(dir)).toEqual([TEXTCONV]);
    expect(localConfig(dir, TEXTCONV)).toBe(
      "node node_modules/reforged-map/dist/cli.js textconv",
    );
  });

  it("runs the installation of a Map project in a subfolder of the work tree", () => {
    const dir = gitRepo();
    const project = path.join(dir, "my map");
    fs.mkdirSync(project);

    configureDiffDriver(project);

    expect(localConfig(dir, TEXTCONV)).toBe(
      'node "my map/node_modules/reforged-map/dist/cli.js" textconv',
    );
  });

  it("warns when the configuration cannot be written, and writes nothing", () => {
    const dir = gitRepo();
    // git locks the file with config.lock before it writes it.
    fs.writeFileSync(path.join(dir, ".git", "config.lock"), "");
    const warnings: string[] = [];

    expect(configureDiffDriver(dir, (m) => warnings.push(m))).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(TEXTCONV);
    expect(localConfig(dir, TEXTCONV)).toBeUndefined();
  });
});

describe("node scripts/diff-driver.ts (run by the prepare script)", () => {
  it("says what it set, then nothing on a second run", () => {
    const dir = gitRepo();

    const first = runScript(dir, SCRIPT);
    expect(first.status).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain(TEXTCONV);

    const second = runScript(dir, SCRIPT);
    expect(second.status).toBe(0);
    expect(second.stdout + second.stderr).toBe("");
  });

  it("warns and succeeds outside a git work tree", () => {
    const dir = makeTempDir();

    const result = runScript(dir, SCRIPT, [], {
      GIT_CEILING_DIRECTORIES: path.dirname(dir),
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/^Warning: .*not a git work tree/m);
    expect(fs.existsSync(path.join(dir, ".git"))).toBe(false);
  });

  it("warns and succeeds when git is missing", () => {
    const dir = makeTempDir();

    const result = runScript(dir, SCRIPT, [], { PATH: "", Path: "" });

    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/^Warning: git could not be run/m);
  });

  it("is run by the prepare script", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts.prepare).toContain("node scripts/diff-driver.ts");
  });
});

describe("git diff of the map folder's Object data", () => {
  it("prints the line of the field a change sets", () => {
    const dir = gitRepo();
    linkNodeModules(dir);
    for (const name of [".gitattributes", ".gitignore"])
      fs.copyFileSync(path.join(ROOT, name), path.join(dir, name));
    const mapFolder = resolveConfig(config, dir).mapFolder;
    fs.cpSync(FIXTURE_OBJECTS_MAP, mapFolder, { recursive: true });
    git(dir, "add", ".");
    git(dir, "commit", "--quiet", "-m", "map");
    configureDiffDriver(dir);

    const editor = openObjectData(mapFolder, { projectRoot: ROOT });
    editor.setField({ kind: "unit", rawcode: "h000", field: "umvs" }, 320);
    expect(editor.save(mapFolder, { worldEditorCheck: false }).written).toEqual(
      ["war3map.w3u"],
    );

    const diff = git(dir, "diff", "--", path.join(mapFolder, "war3map.w3u"));
    expect(diff).not.toContain("Binary files");
    // The object's line, then the field's, added under it.
    expect(diff).toMatch(/^ custom h000 from hfoo\n\+ {2}umvs int = 320$/m);
  });
});
