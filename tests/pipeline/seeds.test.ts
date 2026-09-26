// AGENTS.md and CONTEXT.md as the Template ships them: the sections of
// AGENTS.md and the sync markers of both files, which the library's release
// sync targets. The sync rewrites only the text between a start and an end
// marker. In a generated Map project both files are the author's own: this
// test is Template maintenance, deleted with the rest of it (see AGENTS.md).
import { describe, expect, it } from "vitest";
import { LIBRARY_TERMS } from "../../scripts/sync.ts";
import { markedBlock, readRepoFile } from "./sync-markers.ts";

/** The `## ` headings of a Markdown file, in order, code blocks left out. */
function headings(text: string): string[] {
  let fenced = false;
  return text.split("\n").flatMap((line) => {
    if (line.startsWith("```")) fenced = !fenced;
    return !fenced && line.startsWith("## ") ? [line.slice(3).trim()] : [];
  });
}

/**
 * The sections of AGENTS.md, in order. "Template maintenance" is deleted in a
 * generated Map project; "Your project" is the author's and stays last.
 */
const AGENTS_SECTIONS = [
  "Overview",
  "Commands",
  "Layout",
  "Runtime constraints",
  "Lint",
  "Testing",
  "Domain docs",
  "Library docs",
  "Template maintenance",
  "Your project",
];

/** The cap of spec phmilk/reforged-ts-template#4: an agent loads the whole file on every turn. */
const AGENTS_MAX_LINES = 120;

describe("AGENTS.md", () => {
  const agents = readRepoFile("AGENTS.md");

  it("is what CLAUDE.md imports", () => {
    expect(readRepoFile("CLAUDE.md").trim()).toBe("@AGENTS.md");
  });

  it("has the sections in order, Your project last", () => {
    expect(headings(agents)).toEqual(AGENTS_SECTIONS);
  });

  it("fits in the line cap", () => {
    expect(agents.trimEnd().split("\n").length).toBeLessThanOrEqual(
      AGENTS_MAX_LINES,
    );
  });

  it("holds the llms.txt link between the docs markers, inside Library docs", () => {
    const block = markedBlock(agents, "docs");
    expect(block).toMatch(/\]\(https:\/\/\S+\/llms\.txt\)/);
    const section = agents.slice(
      agents.indexOf("## Library docs"),
      agents.indexOf("## Template maintenance"),
    );
    expect(section).toContain(block);
  });
});

describe("CONTEXT.md", () => {
  const context = readRepoFile("CONTEXT.md");

  it("holds the library terms between the terms markers, then Your map's terms", () => {
    const block = markedBlock(context, "terms");
    // The sync writes them in the library file's order, which may change.
    expect(
      [...block.matchAll(/^\*\*(.+?)\*\*:$/gm)].map(([, term]) => term).sort(),
    ).toEqual([...LIBRARY_TERMS].sort());
    const afterBlock = context.slice(
      context.indexOf("<!-- reforged-ts:terms:end -->"),
    );
    expect(headings(afterBlock)).toEqual(["Your map's terms"]);
  });
});
