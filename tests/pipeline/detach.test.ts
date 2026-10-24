// `pnpm template:detach` (#93): the manifest of the Template maintenance
// files, which the prose lists of AGENTS.md and the README follow, and the
// command that removes them from a generated Map project, run on a copy.
// Template maintenance, deleted with the rest of it (see AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MANIFEST_FILE,
  readManifest,
  SCRIPT_NAME,
  SECTIONS,
} from "../../scripts/detach.ts";
import {
  git,
  hashTree,
  makeTempDir,
  MAP_FOLDER,
  ROOT,
  runScript,
} from "./helpers.ts";

const MANIFEST = readManifest(ROOT);

/** The text of the `## <heading>` section of `file`, up to the next `## ` heading. */
function section(file: string, heading: string): string {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, `${file}: ## ${heading}`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/** The documents the lists name without deleting them: the Seeds and the README. */
const KEPT = new Set(["AGENTS.md", "GLOSSARY.md", "README.md"]);

/** The code spans of `text` that name a file of the repository, but the `KEPT` ones. */
function namedFiles(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/`([^`\s]+)`/g)]
        .map((match) => match[1])
        .filter(
          (name) => !KEPT.has(name) && fs.existsSync(path.join(ROOT, name)),
        ),
    ),
  ].sort();
}

/** Every `.ts` and `.mjs` file git tracks or would track: ignored output left out. */
function sourceFiles(): string[] {
  return git(ROOT, "ls-files", "--cached", "--others", "--exclude-standard")
    .split("\n")
    .filter((rel) => /\.(ts|mjs)$/.test(rel));
}

describe("the manifest of the Template maintenance", () => {
  it("lists files that exist, itself and the command included", () => {
    expect(
      MANIFEST.filter((rel) => !fs.existsSync(path.join(ROOT, rel))),
    ).toEqual([]);
    expect(MANIFEST).toContain(MANIFEST_FILE);
    expect(MANIFEST).toContain("scripts/detach.ts");
  });

  it("leaves the diff driver of Object data to the Map project", () => {
    expect(MANIFEST).not.toContain("scripts/diff-driver.ts");
    expect(MANIFEST).not.toContain(".gitattributes");
  });

  it("is what AGENTS.md's Template maintenance names in its first paragraph", () => {
    const [, intro] = section("AGENTS.md", SECTIONS["AGENTS.md"]).split("\n\n");
    expect(namedFiles(intro)).toEqual(MANIFEST.toSorted());
  });

  it("is what the README's list of deletable files names", () => {
    expect(namedFiles(section("README.md", SECTIONS["README.md"]))).toEqual(
      MANIFEST.toSorted(),
    );
  });

  it("leaves no file that stays importing one it removes", () => {
    const removed = new Set(MANIFEST);
    const importers = sourceFiles()
      .filter((rel) => !removed.has(rel))
      .flatMap((rel) => {
        const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
        return [...text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)]
          .map((match) => path.posix.join(path.posix.dirname(rel), match[1]))
          .filter((target) => removed.has(target))
          .map((target) => `${rel} imports ${target}`);
      });
    expect(importers).toEqual([]);
  });
});

/**
 * A Map project reduced to what the command touches: the listed files, the
 * two documents it cuts a section from, the package manifest and the
 * scripts the command imports. With `origin`, a git checkout with that remote.
 */
function generatedProject(origin?: string): string {
  const dir = makeTempDir();
  for (const rel of [
    ...MANIFEST,
    "AGENTS.md",
    "README.md",
    "package.json",
    "scripts/cli.ts",
    "scripts/errors.ts",
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  if (origin !== undefined) {
    git(dir, "init", "--quiet");
    git(dir, "remote", "add", "origin", origin);
  }
  return dir;
}

describe("pnpm template:detach", () => {
  it("removes the listed files, the two sections and its package script", () => {
    const dir = generatedProject("git@github.com:someone/my-map.git");
    const before = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    const result = runScript(dir, "scripts/detach.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(
      MANIFEST.filter((rel) => fs.existsSync(path.join(dir, rel))),
    ).toEqual([]);
    const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
    expect(agents).not.toContain("\n## Template maintenance\n");
    expect(agents).toContain("\n## Your project\n");
    expect(agents).toContain("\n## Agent skills\n");
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8");
    expect(readme).not.toContain("\n## Deletable in a generated project\n");
    expect(readme).toContain("\n## Links\n");
    const after = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(after.scripts).toEqual(
      Object.fromEntries(
        Object.entries(before.scripts).filter(([name]) => name !== SCRIPT_NAME),
      ),
    );
    expect(result.stdout).toContain("- scripts/sync.ts\n");
    expect(result.stdout).toContain(
      `- AGENTS.md, section "Template maintenance"\n`,
    );
  });

  it("renames nothing: the map folder and the mapFolder that names it stay as they were", () => {
    const dir = generatedProject("git@github.com:someone/my-map.git");
    for (const rel of [MAP_FOLDER, "reforged.config.ts"]) {
      fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
    }
    const map = hashTree(path.join(dir, MAP_FOLDER));
    const config = fs.readFileSync(
      path.join(dir, "reforged.config.ts"),
      "utf8",
    );

    expect(runScript(dir, "scripts/detach.ts").status).toBe(0);
    expect(hashTree(path.join(dir, MAP_FOLDER))).toEqual(map);
    expect(fs.readFileSync(path.join(dir, "reforged.config.ts"), "utf8")).toBe(
      config,
    );
  });

  it("removes nothing on a second run, and says so", () => {
    const dir = generatedProject();
    runScript(dir, "scripts/detach.ts");
    // The command removed itself: run the copy the first run had.
    fs.cpSync(
      path.join(ROOT, "scripts/detach.ts"),
      path.join(dir, "scripts/detach.ts"),
    );

    const result = runScript(dir, "scripts/detach.ts");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "Nothing to remove: the Template maintenance is gone already.\n",
    );
  });

  it("refuses in the Template's own checkout, unless forced", () => {
    const dir = generatedProject(
      "git@github.com:phmilk/reforged-ts-template.git",
    );

    const refused = runScript(dir, "scripts/detach.ts");

    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(
      /^template:detach failed: this is phmilk\/reforged-ts-template itself/,
    );
    expect(fs.existsSync(path.join(dir, MANIFEST_FILE))).toBe(true);

    const forced = runScript(dir, "scripts/detach.ts", ["--force"]);

    expect(forced.status).toBe(0);
    expect(fs.existsSync(path.join(dir, MANIFEST_FILE))).toBe(false);
  });

  it("refuses an unknown argument", () => {
    const dir = generatedProject();

    const result = runScript(dir, "scripts/detach.ts", ["--dry-run"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^template:detach failed: Usage: /);
    expect(fs.existsSync(path.join(dir, MANIFEST_FILE))).toBe(true);
  });
});
