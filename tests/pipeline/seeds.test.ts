// AGENTS.md, CONTEXT.md and the Agent skills as the Template ships them: the
// sections of AGENTS.md, the skills it lists, and the sync markers of both
// files, which the library's release sync targets. The sync rewrites only the
// text between a start and an end marker. In a generated Map project these
// files are the author's own: this test is Template maintenance, deleted with
// the rest of it (see AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";
import { markedBlock, readRepoFile } from "./sync-markers.ts";

/** The `## ` headings of a Markdown file, in order, code blocks left out. */
function headings(text: string): string[] {
  let fenced = false;
  return text.split("\n").flatMap((line) => {
    if (line.startsWith("```")) fenced = !fenced;
    return !fenced && line.startsWith("## ") ? [line.slice(3).trim()] : [];
  });
}

/** The text of the `## <heading>` section, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, `## ${heading}`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
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
  "Agent skills",
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
    expect(section(agents, "Library docs")).toContain(block);
  });
});

/** Every Agent skill under Claude Code's skills folder, one folder each. */
const SKILLS = fs
  .readdirSync(path.join(ROOT, ".claude", "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("the Agent skills", () => {
  const agents = readRepoFile("AGENTS.md");

  it("include the two the Template ships", () => {
    expect(SKILLS).toEqual(
      expect.arrayContaining(["map-feature", "run-in-game"]),
    );
  });

  it.each(SKILLS)(
    "%s has frontmatter with its name and a description, then numbered steps",
    (name) => {
      const skill = readRepoFile(`.claude/skills/${name}/SKILL.md`);
      const frontmatter = /^---\n([\s\S]+?)\n---\n/.exec(skill);
      expect(frontmatter, "frontmatter between --- lines").not.toBeNull();
      const fields = frontmatter?.[1].split("\n") ?? [];
      expect(fields).toContain(`name: ${name}`);
      expect(fields.some((field) => /^description: \S/.test(field))).toBe(true);
      expect(skill).toMatch(/^1\. \S/m);
    },
  );

  it.each(SKILLS)("%s is listed in AGENTS.md by its path", (name) => {
    expect(section(agents, "Agent skills")).toContain(
      `.claude/skills/${name}/SKILL.md`,
    );
  });
});

describe("CONTEXT.md", () => {
  const context = readRepoFile("CONTEXT.md");

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
