// The sync markers of the Template's Markdown files (AGENTS.md, CONTEXT.md,
// README.md): the library's release sync rewrites the text between
// `<!-- reforged-ts:<name>:start -->` and its end marker, and nothing else.
// Template maintenance, like the tests that use it (see AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { locateBlock } from "../../scripts/sync.ts";
import { ROOT } from "./helpers.ts";

/** A file of the repository, with LF line endings. */
export const readRepoFile = (file: string): string =>
  fs.readFileSync(path.join(ROOT, file), "utf8").replaceAll("\r\n", "\n");

/**
 * The text between `<!-- reforged-ts:<name>:start -->` and its end marker.
 * Fails where the sync would skip the file (a marker missing, repeated, not on
 * a line of its own, or the end before the start: `locateBlock`), and unless
 * the text is a blank line, the content and a blank line: the shape Prettier
 * keeps, so a sync that writes it leaves `pnpm lint` green.
 */
export function markedBlock(text: string, name: string): string {
  const { from, to } = locateBlock(text, name);
  const block = text.slice(from, to);
  expect(block).toMatch(/^\n\n\S[\s\S]*\S\n\n$/);
  return block;
}
