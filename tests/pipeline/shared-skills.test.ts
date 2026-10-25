// The copy of what the library shares (ADR 0024 of phmilk/reforged-ts): the
// Upstream skills with their lock, the Skill variants that work issues on the
// board and the session-start hook with its registration, which the library's
// .claude/shared.json names. The library is their one source: the Template
// carries a copy and its record of origin, .claude/shared.lock.json, which
// holds the library commit and each file's sha256. This test fails when the
// copy is edited here, since a fix belongs in the library, where the next copy
// would otherwise undo it. Template maintenance, deleted with the copy (see
// AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { getFileInfo } from "prettier";
import { describe, expect, it } from "vitest";
import {
  copiedSkills,
  readCopies,
  readRecord,
  SKILLS_FOLDER,
} from "../../scripts/detach.ts";
import { git, ROOT, sha256 } from "./helpers.ts";

/** The record of the copy, the one copy `template-maintenance.json` lists. */
const RECORD_FILE = ".claude/shared.lock.json";
const record = readRecord(ROOT, RECORD_FILE);
const COPIED = Object.keys(record.files).sort();

/** What a failure tells the one who edited the copy. */
const FIX_IN_LIBRARY = `a shared file is never edited in the Template: undo the edit and make the fix in ${record.repository}, whose .claude/shared.json names what is shared; the copy follows it (AGENTS.md, Template maintenance)`;

/** The shared skills: the folders of the skills folder the record names a file of. */
const SHARED_SKILLS = copiedSkills(ROOT);

/** A file a second shared hook would add, which the folder rules cover already. */
const NEXT_HOOK = ".claude/hooks/next-hook.mjs";

/** The Seeds: every other folder of the skills folder. */
const SEEDS = fs
  .readdirSync(path.join(ROOT, SKILLS_FOLDER), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !SHARED_SKILLS.includes(entry.name))
  .map((entry) => entry.name)
  .sort();

/**
 * The folders the copy owns whole: each shared skill's, and the folder of
 * any other copied file below `.claude/` (the hooks').
 */
const OWNED_FOLDERS = [
  ...new Set([
    ...SHARED_SKILLS.map((name) => `${SKILLS_FOLDER}/${name}`),
    ...COPIED.filter((rel) => !rel.startsWith(`${SKILLS_FOLDER}/`))
      .map((rel) => path.posix.dirname(rel))
      .filter((folder) => folder !== "." && folder !== ".claude"),
  ]),
].sort();

/** Every file under `folder`, relative to the root with forward slashes. */
const filesUnder = (folder: string): string[] =>
  fs
    .readdirSync(path.join(ROOT, folder), { recursive: true, encoding: "utf8" })
    .map((rel) => `${folder}/${rel.split(path.sep).join("/")}`)
    .filter((rel) => fs.statSync(path.join(ROOT, rel)).isFile());

/** The `name` of a SKILL.md's frontmatter, or undefined without one. */
const frontmatterName = (rel: string): string | undefined =>
  /^---\r?\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(
    fs.readFileSync(path.join(ROOT, rel), "utf8"),
  )?.[1];

describe("the record of the copy", () => {
  it("is the one copy template-maintenance.json lists, from a commit of the library", () => {
    expect(readCopies(ROOT)).toEqual([RECORD_FILE]);
    expect(record.repository).toBe("phmilk/reforged-ts");
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("names the lock, every Upstream skill it names, write-spec, the hook and its registration", () => {
    const lock = JSON.parse(
      fs.readFileSync(path.join(ROOT, "skills-lock.json"), "utf8"),
    ) as { skills: Record<string, unknown> };
    expect(COPIED).toEqual(
      expect.arrayContaining([
        "skills-lock.json",
        ".claude/hooks/shadowed-skills.mjs",
        ".claude/settings.json",
      ]),
    );
    // The library's list may name more Skill variants: write-spec is the first.
    expect(SHARED_SKILLS).toEqual(
      expect.arrayContaining([...Object.keys(lock.skills), "write-spec"]),
    );
    for (const name of SHARED_SKILLS)
      expect(COPIED).toContain(`${SKILLS_FOLDER}/${name}/SKILL.md`);
  });

  it("registers the hook in the shared project settings", () => {
    const settings = fs.readFileSync(
      path.join(ROOT, ".claude/settings.json"),
      "utf8",
    );
    expect(settings).toContain('"SessionStart"');
    expect(settings).toContain(
      "${CLAUDE_PROJECT_DIR}/.claude/hooks/shadowed-skills.mjs",
    );
  });
});

describe("the copy", () => {
  it("has every file the record names, with the bytes the record hashes", () => {
    const problems = COPIED.flatMap((rel) => {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) return [`${rel}: missing`];
      return sha256(fs.readFileSync(file)) === record.files[rel]
        ? []
        : [
            `${rel}: not the bytes of ${record.repository}@${record.commit.slice(0, 8)}`,
          ];
    });
    expect(problems, FIX_IN_LIBRARY).toEqual([]);
  });

  it("has no file the record does not name in the folders it owns", () => {
    const copied = new Set(COPIED);
    const extra = OWNED_FOLDERS.flatMap(filesUnder).filter(
      (rel) => !copied.has(rel),
    );
    expect(extra, FIX_IN_LIBRARY).toEqual([]);
  });

  it("leaves the Seeds map-feature and run-in-game, none with a shared skill's name", () => {
    expect(SEEDS).toEqual(
      expect.arrayContaining(["map-feature", "run-in-game"]),
    );
    const taken = SEEDS.filter((name) => {
      const declared = frontmatterName(`${SKILLS_FOLDER}/${name}/SKILL.md`);
      return declared !== undefined && SHARED_SKILLS.includes(declared);
    });
    expect(
      taken,
      "the Seeds whose SKILL.md takes a shared skill's name",
    ).toEqual([]);
  });
});

describe("the formatters, linters and git", () => {
  const seedFiles = SEEDS.map((name) => `${SKILLS_FOLDER}/${name}/SKILL.md`);

  it("keep every byte of the copy and of any file of its hooks folder, and the Seeds as text", () => {
    const attributes = new Map(
      git(ROOT, "check-attr", "text", "--", ...COPIED, NEXT_HOOK, ...seedFiles)
        .trimEnd()
        .split("\n")
        .map((line) => {
          const [file, , value] = line.split(": ");
          return [file, value];
        }),
    );
    for (const rel of [...COPIED, NEXT_HOOK])
      expect(attributes.get(rel), rel).toBe("unset");
    for (const rel of seedFiles) expect(attributes.get(rel), rel).toBe("auto");
  });

  it("leave the copy and its hooks folder unformatted, and format the Seeds", async () => {
    const ignorePath = path.join(ROOT, ".prettierignore");
    const ignored = async (rel: string) =>
      (await getFileInfo(path.join(ROOT, rel), { ignorePath })).ignored;
    for (const rel of [...COPIED, NEXT_HOOK])
      expect(await ignored(rel), rel).toBe(true);
    for (const rel of seedFiles) expect(await ignored(rel), rel).toBe(false);
  });

  it("leave the copy's scripts and its hooks folder unlinted", async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const scripts = COPIED.filter((file) => /\.[cm]?[jt]s$/.test(file));
    for (const rel of [...scripts, NEXT_HOOK])
      expect(await eslint.isPathIgnored(path.join(ROOT, rel)), rel).toBe(true);
  });
});
