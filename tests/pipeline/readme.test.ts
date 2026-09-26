import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

/**
 * The README blocks the sync workflow replaces on a library release, each
 * between `<!-- reforged-ts:<name>:start -->` and `<!-- reforged-ts:<name>:end -->`
 * (the convention of the `terms` block in `CONTEXT.md`).
 */
const SYNC_BLOCKS = ["matrix", "docs"] as const;

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("README.md", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

  it.each(SYNC_BLOCKS)(
    "holds the %s block once, between its sync markers, each on a line of its own",
    (name) => {
      const start = `<!-- reforged-ts:${name}:start -->`;
      const end = `<!-- reforged-ts:${name}:end -->`;
      expect(count(readme, start)).toBe(1);
      expect(count(readme, end)).toBe(1);
      const lines = readme.split("\n");
      const from = lines.indexOf(start);
      const to = lines.indexOf(end);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to).toBeGreaterThan(from + 1);
      expect(
        lines
          .slice(from + 1, to)
          .join("\n")
          .trim(),
      ).not.toBe("");
    },
  );
});
