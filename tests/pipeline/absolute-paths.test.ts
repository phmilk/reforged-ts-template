import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { git, makeTempDir, ROOT } from "./helpers.ts";

/**
 * Absolute paths as they would leak from one machine into the repository:
 * - a drive letter followed by a separator and a name (`C:\Users`, `D:/Games`);
 * - a quoted string starting with a Unix path of two or more segments (`"/games/wc3"`);
 * - a Unix system or home root anywhere, comments and Markdown included (`/home/`, `/Users/`, `/tmp/`).
 */
const ABSOLUTE_PATH_PATTERNS = [
  /(?<![A-Za-z0-9])[A-Za-z]:(?:\\\\|\\|\/)[\w(]/g,
  /(?<=["'`])\/[\w.~-]+(?:\/[\w .~()-]*)+/g,
  /(?<![\w.~/-])\/(?:home|Users|tmp|mnt|var|opt|root|usr|etc|srv|media|private|Volumes|Applications)\//g,
];

/** The game's well-known install locations, which `scripts/config.ts` probes by design (and its tests assert). */
const ALLOWED_PREFIXES = ["C:\\\\Program Files", "C:\\Program Files", "/Applications/Warcraft III/"];

/** `file:line: text` for every line of `text` holding an absolute path. */
function findAbsolutePaths(file: string, text: string): string[] {
  const leaks = (line: string) =>
    ABSOLUTE_PATH_PATTERNS.some((pattern) =>
      [...line.matchAll(pattern)].some((match) => !ALLOWED_PREFIXES.some((prefix) => line.startsWith(prefix, match.index))),
    );
  return text.split("\n").flatMap((line, index) => (leaks(line) ? [`${file}:${index + 1}: ${line.trim()}`] : []));
}

/**
 * Every text file of HEAD, with its content as committed: local edits, staged
 * and untracked files never count. `null` outside a git checkout or before
 * the first commit.
 */
function readCommittedFiles(root: string): { file: string; text: string }[] | null {
  const tree = spawnSync("git", ["ls-tree", "-r", "-z", "HEAD"], { cwd: root, encoding: "utf8" });
  if (tree.status !== 0) return null;
  // `<mode> <type> <object>\t<path>`; submodules (`commit`) have no content here.
  const blobs = tree.stdout
    .split("\0")
    .map((entry) => /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(entry))
    .filter((match) => match !== null)
    .map(([, object, file]) => ({ object, file }));
  const batch = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: blobs.map(({ object }) => `${object}\n`).join(""),
    maxBuffer: 1024 ** 3,
  });
  if (batch.status !== 0) throw new Error(`git cat-file failed: ${batch.stderr}`);
  // Each object comes back as `<object> blob <size>\n<content>\n`.
  const stream = batch.stdout;
  let offset = 0;
  return blobs.flatMap(({ file }) => {
    const headerEnd = stream.indexOf(0x0a, offset);
    const [, , size] = stream.toString("utf8", offset, headerEnd).split(" ").map(Number);
    const bytes = stream.subarray(headerEnd + 1, headerEnd + 1 + size);
    offset = headerEnd + 1 + size + 1;
    return bytes.includes(0) ? [] : [{ file, text: bytes.toString("utf8") }]; // binary files left out
  });
}

/** This file: its own examples below are what the detector must catch. */
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url)).split(path.sep).join("/");

describe("findAbsolutePaths", () => {
  it("catches Windows, quoted Unix and home or system paths, and lets the probe locations and relative paths through", () => {
    for (const leak of [
      '// gameExecutable: "D:/Games/Warcraft III/_retail_/x86_64/Warcraft III.exe",',
      'winePrefix: "/home/me/.wine"',
      "see C:\\Users\\me\\maps",
      'executable: "/games/wc3"',
      "Saved under /Users/me for now.",
    ]) {
      expect(findAbsolutePaths("x", leak), leak).toHaveLength(1);
    }
    for (const fine of [
      'env["ProgramFiles(x86)"] ?? "C:\\\\Program Files (x86)"',
      'return ["/Applications/Warcraft III/_retail_/x86_64/Warcraft III.app/Contents/MacOS/Warcraft III"];',
      '// gameExecutable: "<path to Warcraft III.exe>",',
      'mapFolder: "maps/reforged-ts-template.w3m"',
      "the Windows side's (`C:\\...`) path",
      'args: ["-loadfile", `Z:${folder}`]',
      "See https://example.com/a/b and the `/domain-modeling` skill; // a comment",
      "expect(output).toMatch(/Change detected/);",
    ]) {
      expect(findAbsolutePaths("x", fine), fine).toEqual([]);
    }
  });
});

describe("readCommittedFiles", () => {
  it("reads the files as committed in HEAD, not as they are on disk", () => {
    const repo = makeTempDir();
    git(repo, "init", "-q");
    fs.writeFileSync(path.join(repo, "package.json"), '{ "name": "x" }\n');
    fs.mkdirSync(path.join(repo, "sub"));
    fs.writeFileSync(path.join(repo, "sub", "leak.ts"), 'const game = "D:/Games/wc3";\n');
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    // Local, uncommitted settings: an edit, a staged file and an untracked one.
    fs.writeFileSync(path.join(repo, "package.json"), '{ "pnpm": { "overrides": { "x": "file:/home/me/x.tgz" } } }\n');
    fs.writeFileSync(path.join(repo, "staged.ts"), 'const game = "E:/wc3";\n');
    git(repo, "add", "staged.ts");
    fs.writeFileSync(path.join(repo, "untracked.ts"), 'const game = "F:/wc3";\n');
    fs.rmSync(path.join(repo, "sub", "leak.ts"));

    expect(readCommittedFiles(repo)).toEqual([
      { file: "package.json", text: '{ "name": "x" }\n' },
      { file: "sub/leak.ts", text: 'const game = "D:/Games/wc3";\n' },
    ]);
    // A committed absolute path still fails the check, and only that one.
    expect(readCommittedFiles(repo)?.flatMap(({ file, text }) => findAbsolutePaths(file, text))).toEqual(['sub/leak.ts:1: const game = "D:/Games/wc3";']);
  });

  it("reads nothing before the first commit", () => {
    const repo = makeTempDir();
    git(repo, "init", "-q");
    fs.writeFileSync(path.join(repo, "a.ts"), "x\n");
    git(repo, "add", ".");
    expect(readCommittedFiles(repo)).toBeNull();
  });
});

describe("committed files", () => {
  it("contain no absolute path outside the map folder, except the game's well-known locations", (context) => {
    const committed = readCommittedFiles(ROOT);
    // Not a git checkout (an unpacked archive), or nothing committed yet: nothing to say about committed files.
    if (committed === null) return context.skip();
    const files = committed.filter(({ file }) => !file.startsWith("maps/") && file !== SELF);
    expect(files.length).toBeGreaterThan(10);
    const hits = files.flatMap(({ file, text }) => findAbsolutePaths(file, text));
    expect(hits).toEqual([]);
  });
});
