// The README's sync blocks as the Template ships them: the library's release
// sync rewrites the text between each pair of markers and nothing else.
// In a generated Map project the README is the author's own: delete this test
// with sync.yml.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

/**
 * The lines between `<!-- reforged-ts:<name>:start -->` and its end marker
 * (the convention of the `terms` block in `CONTEXT.md`); fails unless each
 * marker appears exactly once, on a line of its own, start before end.
 */
function markedLines(text: string, name: string): string {
  const start = `<!-- reforged-ts:${name}:start -->`;
  const end = `<!-- reforged-ts:${name}:end -->`;
  expect(text.split(start), start).toHaveLength(2);
  expect(text.split(end), end).toHaveLength(2);
  const lines = text.split("\n");
  const from = lines.indexOf(start);
  const to = lines.indexOf(end);
  expect(from, `${start} on a line of its own`).toBeGreaterThanOrEqual(0);
  expect(to, `${end} on a line of its own, after ${start}`).toBeGreaterThan(
    from,
  );
  return lines
    .slice(from + 1, to)
    .join("\n")
    .trim();
}

describe("README.md", () => {
  const readme = fs
    .readFileSync(path.join(ROOT, "README.md"), "utf8")
    .replaceAll("\r\n", "\n");

  it("holds the compatibility matrix between the matrix markers", () => {
    expect(markedLines(readme, "matrix")).not.toBe("");
  });

  it("holds the llms.txt link between the docs markers", () => {
    expect(markedLines(readme, "docs")).toMatch(
      /\]\(https:\/\/\S+\/llms\.txt\)/,
    );
  });
});
