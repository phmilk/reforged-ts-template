// `pnpm template:detach`: removes the Template maintenance from a Map
// project made with GitHub's "Use this template" (#93). The files are those
// template-maintenance.json lists, with every file the record of a copy it
// lists names (the copy of what the library shares, ADR 0024 of
// phmilk/reforged-ts); the sections are AGENTS.md's "Template maintenance"
// and the README's "Deletable in a generated project", and the lines of both
// that name a copy's record (the pointer of AGENTS.md's Agent skills); the
// blocks are those between the template-maintenance markers of .gitattributes
// and eslint.config.mjs (the copy's attributes and ignores). It removes
// itself, its package script and the manifest too, so it runs once.
//
// Template maintenance: a generated Map project deletes it (see AGENTS.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runAsEntry } from "./cli.ts";
import { AuthorError } from "./errors.ts";

/** The manifest of the Template maintenance files, at the project root. */
export const MANIFEST_FILE = "template-maintenance.json";
/** The package script that runs this command. */
export const SCRIPT_NAME = "template:detach";
/** The Template's own repository, where the command refuses to run. */
export const TEMPLATE_REPOSITORY = "phmilk/reforged-ts-template";
/** The `## ` section each file loses, by file. */
export const SECTIONS: Readonly<Record<string, string>> = {
  "AGENTS.md": "Template maintenance",
  "README.md": "Deletable in a generated project",
};
/** The files with a block of Template maintenance between `MARKER` lines. */
export const MARKED_FILES: readonly string[] = [
  ".gitattributes",
  "eslint.config.mjs",
];
/** A block of Template maintenance runs from a line holding `<MARKER>:start` to one holding `<MARKER>:end`. */
export const MARKER = "template-maintenance";
/** Claude Code's skills folder, from the project root. */
export const SKILLS_FOLDER = ".claude/skills";

const USAGE = "Usage: node scripts/detach.ts [--force]";

/**
 * The manifest: `paths`, what the command removes, and `copies`, those of
 * them that are the record of a copy, whose files it removes too.
 */
interface Manifest {
  paths: string[];
  copies?: string[];
}

/**
 * The record of a copy's origin: the repository and the commit its files
 * were copied from, and the sha256 of each file, by its path from the root.
 */
export interface CopyRecord {
  repository: string;
  commit: string;
  files: Record<string, string>;
}

function readManifestFile(root: string): Manifest {
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) return { paths: [] };
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

/** The paths the manifest at `root` lists, relative to `root`. */
export function readManifest(root: string): string[] {
  return readManifestFile(root).paths;
}

/** The records of a copy among the paths the manifest at `root` lists. */
export function readCopies(root: string): string[] {
  return readManifestFile(root).copies ?? [];
}

/** The record of a copy at `rel`, relative to `root`. */
export function readRecord(root: string, rel: string): CopyRecord {
  return JSON.parse(
    fs.readFileSync(path.join(root, rel), "utf8"),
  ) as CopyRecord;
}

/** Every file the records of the copies the manifest at `root` lists name. */
export function copiedFiles(root: string): string[] {
  return readCopies(root)
    .filter((record) => fs.existsSync(path.join(root, record)))
    .flatMap((record) => Object.keys(readRecord(root, record).files));
}

/** The folders of the skills folder a copy holds files of, sorted: the shared skills. */
export function copiedSkills(root: string): string[] {
  const skills = copiedFiles(root).flatMap((rel) =>
    rel.startsWith(`${SKILLS_FOLDER}/`) ? [rel.split("/")[2]] : [],
  );
  return [...new Set(skills)].sort();
}

/** Removes `rel` from `root`, then each folder above it that it leaves empty. */
function remove(root: string, rel: string): void {
  fs.rmSync(path.join(root, rel), { recursive: true });
  for (
    let folder = path.dirname(rel);
    folder !== "." && fs.readdirSync(path.join(root, folder)).length === 0;
    folder = path.dirname(folder)
  )
    fs.rmdirSync(path.join(root, folder));
}

/** `text` without its `## <heading>` section, up to the next `## ` heading. */
export function withoutSection(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return text;
  const next = text.indexOf("\n## ", start + 1);
  return next === -1
    ? `${text.slice(0, start).trimEnd()}\n`
    : text.slice(0, start) + text.slice(next);
}

/** `text` without its lines that name one of `files` in a code span. */
export function withoutLinesNaming(
  text: string,
  files: readonly string[],
): string {
  return text
    .split("\n")
    .filter((line) => !files.some((rel) => line.includes(`\`${rel}\``)))
    .join("\n");
}

/**
 * `text` without its blocks between a `<MARKER>:start` line and a
 * `<MARKER>:end` line, both included, and the blank line before a block.
 */
export function withoutMarkedBlocks(text: string): string {
  const kept: string[] = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (!inside && line.includes(`${MARKER}:start`)) {
      inside = true;
      if (kept.at(-1)?.trim() === "") kept.pop();
    } else if (inside && line.includes(`${MARKER}:end`)) inside = false;
    else if (!inside) kept.push(line);
  }
  return kept.join("\n");
}

/** Whether the `origin` remote of the git checkout at `root` is the Template's own. */
function isTemplateCheckout(root: string): boolean {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: root,
    encoding: "utf8",
  });
  return (
    result.status === 0 &&
    /[/:]phmilk\/reforged-ts-template(\.git)?\/?$/.test(result.stdout.trim())
  );
}

/**
 * Removes the Template maintenance from the project at `root` and returns
 * what it removed: the files of each listed copy, each listed path that
 * exists, each section and the lines naming a copy's record, each marked
 * block, the package script. A folder a removal leaves empty goes with it. A second run removes
 * nothing. Refuses in the Template's own checkout unless `force`.
 */
export function detach(root: string, force = false): string[] {
  if (!force && isTemplateCheckout(root))
    throw new AuthorError(
      `this is ${TEMPLATE_REPOSITORY} itself, whose maintenance files stay. Run it in a Map project made from the Template, or pass --force.`,
    );
  const removed: string[] = [];
  const copies = readCopies(root);
  // A copy's files go before its record, which names them.
  for (const record of copies) {
    if (!fs.existsSync(path.join(root, record))) continue;
    const files = Object.keys(readRecord(root, record).files).filter((rel) =>
      fs.existsSync(path.join(root, rel)),
    );
    for (const rel of files) remove(root, rel);
    if (files.length > 0)
      removed.push(`the ${String(files.length)} files ${record} records`);
  }
  // The manifest goes last: it lists itself.
  const paths = readManifest(root).toSorted(
    (a, b) => Number(a === MANIFEST_FILE) - Number(b === MANIFEST_FILE),
  );
  for (const rel of paths) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    remove(root, rel);
    removed.push(rel);
  }
  for (const [name, heading] of Object.entries(SECTIONS)) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const cut = withoutSection(text, heading);
    if (cut !== text) removed.push(`${name}, section "${heading}"`);
    const next = withoutLinesNaming(cut, copies);
    if (next !== cut)
      removed.push(`${name}, the lines naming ${copies.join(", ")}`);
    if (next !== text) fs.writeFileSync(file, next);
  }
  for (const name of MARKED_FILES) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const next = withoutMarkedBlocks(text);
    if (next === text) continue;
    fs.writeFileSync(file, next);
    removed.push(`${name}, the Template maintenance between its markers`);
  }
  const manifest = path.join(root, "package.json");
  if (fs.existsSync(manifest)) {
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (pkg.scripts?.[SCRIPT_NAME] !== undefined) {
      pkg.scripts = Object.fromEntries(
        Object.entries(pkg.scripts).filter(([name]) => name !== SCRIPT_NAME),
      );
      fs.writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
      removed.push(`package.json, script "${SCRIPT_NAME}"`);
    }
  }
  return removed;
}

await runAsEntry(import.meta.url, SCRIPT_NAME, () => {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--force"))
    throw new AuthorError(USAGE);
  const removed = detach(process.cwd(), args[0] === "--force");
  if (removed.length === 0) {
    console.log("Nothing to remove: the Template maintenance is gone already.");
    return;
  }
  console.log(
    `Removed the Template maintenance:\n${removed.map((r) => `- ${r}`).join("\n")}`,
  );
});
