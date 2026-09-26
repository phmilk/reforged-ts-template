// The Seeds as the Template ships them: the fixed sections of AGENTS.md and
// the sync markers of AGENTS.md and CONTEXT.md, which the library's release
// sync targets. Only the text between the markers is ever rewritten by it.
// In a generated Map project the Seeds are the author's own: delete this test
// with sync.yml when they diverge from the Template's shape.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

const read = (file: string): string =>
  fs.readFileSync(path.join(ROOT, file), "utf8").replaceAll("\r\n", "\n");

/** The `## ` headings of a Markdown file, in order, code blocks left out. */
function headings(text: string): string[] {
  let fenced = false;
  return text.split("\n").flatMap((line) => {
    if (line.startsWith("```")) fenced = !fenced;
    return !fenced && line.startsWith("## ") ? [line.slice(3).trim()] : [];
  });
}

/**
 * The text between `<!-- reforged-ts:<name>:start -->` and its end marker;
 * fails unless each marker appears exactly once, start before end.
 */
function markedBlock(text: string, name: string): string {
  const start = `<!-- reforged-ts:${name}:start -->`;
  const end = `<!-- reforged-ts:${name}:end -->`;
  expect(text.split(start), start).toHaveLength(2);
  expect(text.split(end), end).toHaveLength(2);
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end);
  expect(to, `${end} after ${start}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

/** The fixed sections of AGENTS.md, in order; "Your project" is the author's. */
const AGENTS_SECTIONS = [
  "Overview",
  "Commands",
  "Layout",
  "Runtime constraints",
  "Lint",
  "Testing",
  "Domain docs",
  "Library docs",
  "Your project",
];

describe("AGENTS.md", () => {
  const agents = read("AGENTS.md");

  it("is what CLAUDE.md imports", () => {
    expect(read("CLAUDE.md").trim()).toBe("@AGENTS.md");
  });

  it("has the fixed sections in order, Your project last among them", () => {
    const found = headings(agents).filter((heading) =>
      AGENTS_SECTIONS.includes(heading),
    );
    expect(found).toEqual(AGENTS_SECTIONS);
  });

  it("fits its fixed sections in 120 lines", () => {
    const lines = agents.split("\n");
    const yourProject = lines.indexOf("## Your project");
    expect(yourProject).toBeGreaterThan(0);
    expect(lines.slice(0, yourProject + 1).length).toBeLessThanOrEqual(120);
  });

  it("holds the llms.txt link between the docs markers, inside Library docs", () => {
    const block = markedBlock(agents, "docs");
    expect(block).toMatch(/\]\(https:\/\/\S+\/llms\.txt\)/);
    const section = agents.slice(
      agents.indexOf("## Library docs"),
      agents.indexOf("## Your project"),
    );
    expect(section).toContain(block);
  });
});

describe("CONTEXT.md", () => {
  const context = read("CONTEXT.md");

  it("holds the eleven library terms between the terms markers, then Your map's terms", () => {
    const block = markedBlock(context, "terms");
    expect(
      [...block.matchAll(/^\*\*(.+?)\*\*:$/gm)].map(([, term]) => term),
    ).toEqual([
      "Native",
      "Handle",
      "Wrapper",
      "System",
      "Init stage",
      "Event descriptor",
      "Subscription",
      "Map project",
      "Template",
      "Toolchain",
      "Patch",
    ]);
    const afterBlock = context.slice(
      context.indexOf("<!-- reforged-ts:terms:end -->"),
    );
    expect(headings(afterBlock)).toEqual(["Your map's terms"]);
  });
});
