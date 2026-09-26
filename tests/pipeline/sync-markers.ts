// The sync markers of the Template's Markdown files (AGENTS.md, CONTEXT.md,
// README.md): the library's release sync rewrites the text between
// `<!-- reforged-ts:<name>:start -->` and its end marker, and nothing else.
// Template maintenance, like the tests that use it (see AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { ROOT } from "./helpers.ts";

/** A file of the repository, with LF line endings. */
export const readRepoFile = (file: string): string =>
  fs.readFileSync(path.join(ROOT, file), "utf8").replaceAll("\r\n", "\n");

/**
 * The text between `<!-- reforged-ts:<name>:start -->` and its end marker.
 * Fails unless each marker appears exactly once, on a line of its own, start
 * before end, and the text is a blank line, the content and a blank line: the
 * shape Prettier keeps, so a sync that writes it leaves `pnpm lint` green.
 */
export function markedBlock(text: string, name: string): string {
  const start = `<!-- reforged-ts:${name}:start -->`;
  const end = `<!-- reforged-ts:${name}:end -->`;
  expect(text.split(start), start).toHaveLength(2);
  expect(text.split(end), end).toHaveLength(2);
  const lines = text.split("\n");
  expect(lines, `${start} on a line of its own`).toContain(start);
  expect(lines, `${end} on a line of its own`).toContain(end);
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end);
  expect(to, `${end} after ${start}`).toBeGreaterThan(from);
  const block = text.slice(from, to);
  expect(block).toMatch(/^\n\n\S[\s\S]*\S\n\n$/);
  return block;
}
