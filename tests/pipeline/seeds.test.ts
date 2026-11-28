// AGENTS.md, GLOSSARY.md and the Agent skills as the Template ships them: the
// sections of AGENTS.md, the Seeds it lists, and the sync markers of both
// files, which the library's release sync targets. The sync rewrites only the
// text between a start and an end marker. In a generated Map project these
// files are the author's own: this test is Template maintenance, deleted with
// the rest of it (see AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import {
  CONSTANTS_FILES,
  DECLARATIONS_FILE,
  LUA_STUB_FILE,
  OBJECTS_DECLARATIONS_FILE,
} from "reforged-map";
import { describe, expect, it } from "vitest";
import {
  copiedSkills,
  readCopies,
  readManifest,
} from "../../scripts/detach.ts";
import { ENV_FILE } from "../../scripts/generate.ts";
import { endMarker, LIBRARY_TERMS } from "../../scripts/sync.ts";
import { ROOT, TESTING_GUIDE } from "./helpers.ts";
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
  "Rawcodes",
  "Object definitions",
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

  it("lists every generated file in the Layout bullet of src/generated/", () => {
    const bullet = section(agents, "Layout")
      .split("\n")
      .find((line) => line.startsWith("- `src/generated/`"));
    for (const name of [
      ENV_FILE,
      DECLARATIONS_FILE,
      LUA_STUB_FILE,
      OBJECTS_DECLARATIONS_FILE,
      ...Object.values(CONSTANTS_FILES),
    ])
      expect(bullet, name).toContain(`\`${name}\``);
  });

  it("names Custom objects by their generated constants and Built-in objects by reforged-builtins'", () => {
    const rawcodes = section(agents, "Rawcodes");
    expect(rawcodes).toContain("`CustomUnits.Captain_h000`");
    expect(rawcodes).toContain("`Units.Footman_hfoo`");
    expect(rawcodes).toContain("never cast");
  });

  it("says the TypeScript plugin is for editors only and stays in place", () => {
    const rawcodes = section(agents, "Rawcodes");
    expect(rawcodes).toContain("`reforged-map/typescript-plugin`");
    expect(rawcodes).toContain("changes no build, lint or test");
    expect(rawcodes).toContain("stays in place");
  });

  it("reads Object data with git diff and never edits the map folder's bytes by hand", () => {
    const bullet = section(agents, "Layout")
      .split("\n- ")
      .find((item) => item.startsWith("The map folder"));
    expect(bullet).toContain("Never edit the bytes of its files by hand");
    expect(bullet).toContain("`git diff`");
    expect(bullet).toContain("`TRIGSTR_nnn`");
    expect(bullet).toContain(
      "written here only by the `objects:` commands and the Studio",
    );
    // Object sync (#114) and the Studio (#145): Object data has three ways in, the rest of the map folder one.
    expect(agents).toContain(
      "Object data changes through the World Editor, the Studio, or Object definitions and `pnpm objects:sync`; everything else in the map folder changes only through the World Editor.",
    );
    expect(agents).not.toContain(
      "Files in the map folder change only through the World Editor.",
    );
  });

  it("lists the Object definitions' folder and the Object manifest in the Layout, and the three commands", () => {
    const layout = section(agents, "Layout");
    expect(layout).toMatch(/^- `src\/objects\/`: /m);
    expect(layout).toContain("`src/objects/<kind>/<Name>_<rawcode>.ts`");
    expect(layout).toMatch(/^- `object-manifest\.json`: /m);
    const commands = section(agents, "Commands");
    for (const command of ["objects:sync", "objects:adopt", "objects:release"])
      expect(commands, command).toContain(`\`pnpm ${command}`);
  });

  it("says how to work with Object definitions", () => {
    const objects = section(agents, "Object definitions");
    for (const text of [
      "field id",
      "hover",
      '`FourCC("A001")`',
      "`Custom<Kind>s`",
      "`reforged-builtins`",
      "`pnpm objects:adopt <rawcode>`",
      "`pnpm objects:release <rawcode>`, before deleting its definition",
      "at the next `pnpm objects:sync`, and its placements on the terrain at the World Editor's next save",
      "Never edit `object-manifest.json` by hand",
      "` *]`",
      "a change made outside the code",
      "never forced",
    ])
      expect(objects, text).toContain(text);
  });

  it("says what the Studio does, that an agent leaves it to the author, and names its runtime file (#145)", () => {
    expect(section(agents, "Commands")).toMatch(/^- `pnpm studio`: /m);
    const objects = section(agents, "Object definitions");
    for (const text of [
      "The Studio",
      "through `reforged-map`",
      "takes turns with the World Editor",
      "never runs `pnpm studio` for the author",
      "nor edits through its API without being asked",
      "Object definitions stay the code's",
    ])
      expect(objects, text).toContain(text);
    expect(section(agents, "Layout")).toMatch(
      /^- `\.reforged-studio\.json`: /m,
    );
  });

  it("states how a test is written, on reforged-test/map (#153)", () => {
    const testing = section(agents, "Testing");
    for (const text of [
      "Import from `reforged-test/map`",
      "one `startGame()` per test",
      "Game actions",
      "`game.advanceTime`",
      "`game.fire` only for what they do not cover",
      "what the player observes",
      "A Native without a Stub goes through `stubNative`",
      `(${TESTING_GUIDE})`,
    ])
      expect(testing, text).toContain(text);
    for (const text of ["tests/stubs", "__stub_", "reforged-test/lua"])
      expect(agents, text).not.toContain(text);
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

/** The skills of the copy of what the library shares (tests/pipeline/shared-skills.test.ts checks the copy). */
const SHARED_SKILLS = new Set(copiedSkills(ROOT));

/** The Seeds: every other Agent skill under Claude Code's skills folder, one folder each. */
const SKILLS = fs
  .readdirSync(path.join(ROOT, ".claude", "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !SHARED_SKILLS.has(entry.name))
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

  it("map-feature tests on reforged-test/map, in one line (#153)", () => {
    const skill = readRepoFile(".claude/skills/map-feature/SKILL.md");
    const lines = skill
      .split("\n")
      .filter((line) => line.includes("reforged-test/map"));
    expect(lines).toHaveLength(1);
    for (const text of [
      "`startGame()`",
      "Game actions",
      "`game.advanceTime`",
      "`game.fire`",
      "what the player observes",
      "`stubNative`",
    ])
      expect(lines[0], text).toContain(text);
  });

  it.each(SKILLS)("%s is listed in AGENTS.md by its path", (name) => {
    expect(section(agents, "Agent skills")).toContain(
      `.claude/skills/${name}/SKILL.md`,
    );
  });

  it("are listed in AGENTS.md without the shared ones, for which it points at the copy's record", () => {
    const list = section(agents, "Agent skills");
    expect(
      [...SHARED_SKILLS].filter((name) =>
        list.includes(`.claude/skills/${name}/`),
      ),
    ).toEqual([]);
    for (const record of readCopies(ROOT))
      expect(list).toContain(`\`${record}\``);
  });
});

describe("GLOSSARY.md", () => {
  const glossary = readRepoFile("GLOSSARY.md");

  it("is a Seed: a generated Map project keeps it at the root, where the Domain docs point", () => {
    expect(readManifest(ROOT)).not.toContain("GLOSSARY.md");
    expect(section(readRepoFile("AGENTS.md"), "Domain docs")).toContain(
      "`GLOSSARY.md` at the repo root",
    );
    expect(readRepoFile("docs/agents/domain.md")).toContain(
      "**`GLOSSARY.md`** at the repo root",
    );
  });

  it("carries the Studio (#145)", () => {
    expect(LIBRARY_TERMS).toContain("Studio");
    expect(markedBlock(glossary, "terms")).toContain("\n**Studio**:\n");
  });

  it("carries the terms of Object definitions (#114)", () => {
    const block = markedBlock(glossary, "terms");
    for (const term of [
      "Object definition",
      "Object sync",
      "Object manifest",
      "Object adoption",
      "Object release",
    ]) {
      expect(LIBRARY_TERMS, term).toContain(term);
      expect(block, term).toContain(`\n**${term}**:\n`);
    }
  });

  it("carries the terms of a map's tests, but Test control and Shipped stub (#153)", () => {
    const block = markedBlock(glossary, "terms");
    for (const term of [
      "Test game",
      "Stub",
      "Game action",
      "Event dispatch",
      "Firing context",
      "Dispatching Native",
      "Game clock",
      "Recorded call",
      "Spy",
      "Caught error",
    ]) {
      expect(LIBRARY_TERMS, term).toContain(term);
      expect(block, term).toContain(`\n**${term}**:\n`);
    }
    for (const term of ["Test control", "Shipped stub"]) {
      expect(LIBRARY_TERMS, term).not.toContain(term);
      expect(block, term).not.toContain(`\n**${term}**:\n`);
    }
  });

  it("holds the library terms between the terms markers, then Your map's terms", () => {
    const block = markedBlock(glossary, "terms");
    // The sync writes them in the library file's order, which may change.
    expect(
      [...block.matchAll(/^\*\*(.+?)\*\*:$/gm)].map(([, term]) => term).sort(),
    ).toEqual([...LIBRARY_TERMS].sort());
    const afterBlock = glossary.slice(glossary.indexOf(endMarker("terms")));
    expect(headings(afterBlock)).toEqual(["Your map's terms"]);
  });
});

describe("the Game version the Template names (#147)", () => {
  // The library's minimum Patch is the `reforged.patch` of reforged-types, a
  // Build such as 3.0.1.24370; its Game version is the Build's first three
  // parts. The library ships no Typings for an older one.
  const build = (
    JSON.parse(readRepoFile("node_modules/reforged-types/package.json")) as {
      reforged: { patch: string };
    }
  ).reforged.patch;
  const gameVersion = build.split(".").slice(0, 3).join(".");

  it("types the map with the Typings of the minimum Game version", () => {
    const base = ts.readConfigFile(
      path.join(ROOT, "tsconfig.base.json"),
      (file) => ts.sys.readFile(file),
    ).config as { compilerOptions: { types: string[] } };
    expect(
      base.compilerOptions.types.filter((entry) =>
        entry.startsWith("reforged-types/"),
      ),
    ).toEqual([`reforged-types/${gameVersion}`]);
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          "node_modules",
          "reforged-types",
          `${gameVersion}.d.ts`,
        ),
      ),
    ).toBe(true);
  });

  it.each(["AGENTS.md", "README.md"])(
    "%s names the Typings and Built-in objects of that version",
    (file) => {
      const named = [
        ...readRepoFile(file).matchAll(
          /reforged-(?:types|builtins)\/(\d+\.\d+\.\d+)/g,
        ),
      ].map(([, version]) => version);
      expect(named.length).toBeGreaterThan(0);
      expect(new Set(named)).toEqual(new Set([gameVersion]));
    },
  );
});
