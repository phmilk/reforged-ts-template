import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

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

describe("committed files", () => {
  it("contain no absolute path outside the map folder, except the game's well-known locations", (context) => {
    const listed = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" });
    // Not a git checkout (an unpacked archive): nothing to say about committed files.
    if (listed.status !== 0) context.skip();
    const files = listed.stdout.split("\0").filter((file) => file !== "" && !file.startsWith("maps/") && file !== SELF);
    expect(files.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const file of files) {
      const bytes = fs.readFileSync(path.join(ROOT, file));
      if (bytes.includes(0)) continue; // binary
      hits.push(...findAbsolutePaths(file, bytes.toString("utf8")));
    }
    expect(hits).toEqual([]);
  });
});
