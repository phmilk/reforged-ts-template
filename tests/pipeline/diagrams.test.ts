// The convention test of the Mermaid diagrams, after the library's ADR 0019
// (phmilk/reforged-ts, test/conventions/diagrams.test.ts): a diagram is
// hand-written, and this test fails when one cites a name the project no
// longer has. It reads every `mermaid` block of the Markdown files git tracks
// or would track, but the copy of what the library shares (its own text).
// Template maintenance, deleted with the rest of it (see AGENTS.md): a Map
// project keeps its diagrams without the test.
//
// The rules a diagram follows:
//
// 1. Its name: one Mermaid comment `%% diagram: <name>` inside the block, the
//    name in kebab-case and unique across the repository.
// 2. The names it cites, each of which must exist. Only these forms are read,
//    anywhere in the block but its `%%` comment lines; any other text is free:
//    - A root script: `pnpm <script>` (`pnpm build`), a script of the root
//      package.json. pnpm's own commands (`pnpm install`, the list below) are
//      not read as one.
//    - A package: a lower-case word holding `reforged`, `typescript` or
//      `eslint` (`reforged-map`, `typescript-to-lua`), a dependency of the
//      root package.json. A word right after a `/` or followed by `.` and a
//      letter is not read: `reforged.config.ts` is a file.
//    - A path: a word holding a `/`, from the project root (`src/objects/`,
//      `scripts/build.ts`). Under the generated folder, the folder itself or
//      a file the pipeline's writers produce (`GENERATORS` of
//      scripts/generate.ts); under the output folder, the folder itself, its
//      staging folder or the tsconfig's Lua bundle (scripts/build.ts); any
//      other, a file of the repository or a folder holding one.
//    - A file: a bare `<name>.<ext>` of a source or map extension
//      (`tsconfig.json`, `war3map.lua`), a file at the project root or in the
//      map folder.
// 3. Its node ids are read like its labels: give a node an id with
//    underscores (`reforged_map["reforged-map"]`) and quote every label.
// 4. No `click`: the table under the diagram links each node to its section.
//
// A diagram can still draw a wrong edge between two names that exist: the
// test does not see it (the library's ADR 0019, "Consequences").
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { luaBundleFile } from "../../scripts/compile.ts";
import { CONFIG_FILE, loadConfig } from "../../scripts/config.ts";
import { copiedFiles } from "../../scripts/detach.ts";
import { GENERATORS } from "../../scripts/generate.ts";
import { stagingFolderFor } from "../../scripts/stage.ts";
import { git, MAP_FOLDER, ROOT } from "./helpers.ts";

/** What a diagram cites, by kind, each in the order it first appears. */
interface Citations {
  scripts: string[];
  packages: string[];
  paths: string[];
  files: string[];
}

interface Diagram {
  file: string;
  /** The line of the block's opening fence, from 1. */
  line: number;
  /** The text of the heading right above the block, of any level. */
  heading: string | undefined;
  /** The `%% diagram:` names it declares: one, unless it is wrong. */
  names: string[];
  citations: Citations;
  /** Whether a line of it is a `click`. */
  clicks: boolean;
}

/** What a diagram may cite, by kind; a path without its trailing `/`. */
type Repository = { [Kind in keyof Citations]: ReadonlySet<string> };

/** pnpm's own commands, which `pnpm <command>` does not cite as a root script. */
const PNPM_COMMANDS = new Set([
  "add",
  "create",
  "dlx",
  "exec",
  "i",
  "install",
  "remove",
  "update",
  "version",
]);

/** The names a text cites, in the forms of rule 2 above. */
function cite(text: string): Citations {
  const found = {
    scripts: new Set<string>(),
    packages: new Set<string>(),
    paths: new Set<string>(),
    files: new Set<string>(),
  };
  for (const [, script = ""] of text.matchAll(/(?<![\w-])pnpm\s+([\w:.-]+)/g)) {
    const name = script.replace(/[.:]+$/, "");
    if (name !== "" && !name.startsWith("-") && !PNPM_COMMANDS.has(name))
      found.scripts.add(name);
  }
  for (const [name] of text.matchAll(
    /(?<![\w@/.-])[a-z0-9-]*(?:reforged|typescript|eslint)[a-z0-9-]*(?![\w/-]|\.\w)/g,
  ))
    found.packages.add(name);
  for (const [name] of text.matchAll(
    /(?<![\w./<@-])(?:[\w.-]+\/)+[\w.-]*(?<!\.)/g,
  ))
    found.paths.add(name.replace(/\/$/, ""));
  for (const [name] of text.matchAll(
    /(?<![\w./@-])[\w-]+(?:\.[\w-]+)*\.(?:ts|mts|mjs|cjs|js|json|lua|wtg|wts)(?![\w/-]|\.\w)/g,
  ))
    found.files.add(name);
  return {
    scripts: [...found.scripts],
    packages: [...found.packages],
    paths: [...found.paths],
    files: [...found.files],
  };
}

/**
 * The body of each fenced code block of a Markdown file whose info string is
 * `mermaid`, with the line of its opening fence and the heading right above
 * it. Fences follow CommonMark: indented by three spaces at most, closed by a
 * fence of the same character at least as long as the opening one.
 */
function mermaidBlocks(
  markdown: string,
): { line: number; heading: string | undefined; lines: string[] }[] {
  const blocks: {
    line: number;
    heading: string | undefined;
    lines: string[];
  }[] = [];
  let open: { fence: string; mermaid: boolean; line: number } | undefined;
  let heading: string | undefined;
  let body: string[] = [];
  markdown.split(/\r?\n/).forEach((text, index) => {
    if (open === undefined) {
      const opening = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(text);
      if (opening) {
        const [, fence = "", info = ""] = opening;
        open = { fence, mermaid: info === "mermaid", line: index + 1 };
        body = [];
      }
      heading =
        /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(text)?.[1] ?? heading;
      return;
    }
    const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(text)?.[1];
    if (
      closing !== undefined &&
      closing.startsWith(open.fence.charAt(0)) &&
      closing.length >= open.fence.length
    ) {
      if (open.mermaid) blocks.push({ line: open.line, heading, lines: body });
      open = undefined;
      return;
    }
    body.push(text);
  });
  return blocks;
}

/** The diagrams of a Markdown file, given as text: its `mermaid` blocks, each with its name and what it cites. */
function readDiagrams(file: string, markdown: string): Diagram[] {
  return mermaidBlocks(markdown).map(({ line, heading, lines }) => {
    const names = lines.flatMap((text) => {
      const name = /^\s*%%\s*diagram:\s*(.*?)\s*$/.exec(text)?.[1];
      return name === undefined ? [] : [name];
    });
    const shown = lines.filter((text) => !/^\s*%%/.test(text));
    return {
      file,
      line,
      heading,
      names,
      citations: cite(shown.join("\n")),
      clicks: shown.some((text) => /^\s*click\s/.test(text)),
    };
  });
}

const UNKNOWN: { [Kind in keyof Citations]: (name: string) => string } = {
  scripts: (name) =>
    `"pnpm ${name}", and ${name} is not a script of package.json`,
  packages: (name) =>
    `the package ${name}, which is not a dependency of package.json`,
  paths: (name) =>
    `the path ${name}, which is neither in the repository nor written by the pipeline`,
  files: (name) =>
    `the file ${name}, which is neither at the project root nor in the map folder`,
};

const KINDS = Object.keys(UNKNOWN) as (keyof Citations)[];

/**
 * Every way the diagrams break the rules of the header comment, one message
 * each, naming the file, the line of the block and what to update.
 */
function diagramProblems(
  diagrams: readonly Diagram[],
  repository: Repository,
): string[] {
  const named = new Map<string, string[]>();
  const problems = diagrams.flatMap(
    ({ file, line, names, citations, clicks }) => {
      const where = `${file}:${String(line)}`;
      const name = names.at(0);
      const label = `${where}: diagram "${name ?? "(unnamed)"}"`;
      const found: string[] = [];
      if (name === undefined) {
        found.push(
          `${where}: a mermaid block without a name: add "%% diagram: <name>" inside it`,
        );
      } else if (names.length > 1) {
        found.push(`${label} declares ${String(names.length)} names: keep one`);
      } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        found.push(`${label}: its name is not kebab-case`);
      } else {
        named.set(name, [...(named.get(name) ?? []), where]);
      }
      for (const kind of KINDS)
        for (const cited of citations[kind])
          if (!repository[kind].has(cited))
            found.push(
              `${label} cites ${UNKNOWN[kind](cited)}: update the diagram`,
            );
      if (clicks)
        found.push(
          `${label} has a click: link the node from the table under the diagram instead`,
        );
      return found;
    },
  );
  for (const [name, places] of named)
    if (places.length > 1)
      problems.push(
        `diagram "${name}" is declared ${String(places.length)} times: ${places.join(", ")}`,
      );
  return problems;
}

describe("the extraction of a diagram", () => {
  const fixture: Repository = {
    scripts: new Set(["build", "dev", "lint"]),
    packages: new Set(["reforged-map", "typescript-to-lua"]),
    paths: new Set(["src", "src/generated", "scripts/build.ts"]),
    files: new Set(["tsconfig.json", "war3map.lua"]),
  };

  function mermaid(...body: string[]): string {
    return ["# A doc", "", "```mermaid", ...body, "```", ""].join("\n");
  }

  function problems(markdown: string): string[] {
    return diagramProblems(readDiagrams("README.md", markdown), fixture);
  }

  it("reads the names a block cites, and only those", () => {
    const [diagram] = readDiagrams(
      "README.md",
      mermaid(
        "flowchart LR",
        "  %% diagram: a-b",
        "  %% a comment: pnpm nope, reforged-nope and nope/ are not read",
        '  reforged_map["reforged-map, reforged.config.ts"] -->|"pnpm install, pnpm build."| a["src/generated/"]',
        '  b["src/, scripts/build.ts: tsconfig.json"] --> c["typescript-to-lua, ESLint, war3map.lua"]',
        '  d["phmilk/reforged-ts, reforged/no-bj, a <br/> b"]',
      ),
    );
    expect(diagram).toEqual({
      file: "README.md",
      line: 3,
      heading: "A doc",
      names: ["a-b"],
      citations: {
        scripts: ["build"],
        packages: ["reforged-map", "typescript-to-lua"],
        paths: [
          "src/generated",
          "src",
          "scripts/build.ts",
          "phmilk/reforged-ts",
          "reforged/no-bj",
        ],
        files: ["reforged.config.ts", "tsconfig.json", "war3map.lua"],
      },
      clicks: false,
    });
  });

  it("reads only mermaid blocks, not one shown inside a longer fence", () => {
    const markdown = [
      "```sh",
      "pnpm nope",
      "```",
      "",
      "````md",
      "```mermaid",
      "flowchart LR",
      "```",
      "````",
      "",
      "~~~mermaid",
      "flowchart LR",
      "  %% diagram: tilde",
      "~~~",
      "",
    ].join("\n");
    expect(readDiagrams("README.md", markdown).map(({ line }) => line)).toEqual(
      [11],
    );
  });

  it("passes a named block citing what exists", () => {
    expect(
      problems(
        mermaid(
          "flowchart LR",
          "  %% diagram: a-b",
          '  a["src/"] -->|"pnpm build"| b["typescript-to-lua, by tsconfig.json"]',
        ),
      ),
    ).toEqual([]);
  });

  it("fails on a block without a name", () => {
    expect(problems(mermaid("flowchart LR", "  a --> b"))).toEqual([
      expect.stringContaining("README.md:3: a mermaid block without a name"),
    ]);
  });

  it("fails on a name that is not kebab-case", () => {
    expect(
      problems(mermaid("flowchart LR", "  %% diagram: Tool_Chain")),
    ).toEqual([expect.stringContaining("not kebab-case")]);
  });

  it("fails on two diagrams of the same name, naming both", () => {
    const block = mermaid("flowchart LR", "  %% diagram: a-b");
    expect(
      diagramProblems(
        [
          ...readDiagrams("README.md", block),
          ...readDiagrams("docs/b.md", block),
        ],
        fixture,
      ),
    ).toEqual([expect.stringContaining("README.md:3, docs/b.md:3")]);
  });

  it.each([
    ["a root script", '  a["pnpm nope"]', '"pnpm nope"'],
    ["a package", '  a["reforged-nope"]', "the package reforged-nope"],
    ["a path", '  a["scripts/nope.ts"]', "the path scripts/nope.ts"],
    ["a file", '  a["nope.json"]', "the file nope.json"],
  ])(
    "fails on %s that does not exist, saying to update the diagram",
    (_, line, cited) => {
      expect(
        problems(mermaid("flowchart LR", "  %% diagram: a-b", line)),
      ).toEqual([
        expect.stringMatching(
          new RegExp(
            `${cited.replaceAll(/[.*+?^${}()|[\]\\/]/g, "\\$&")}.*: update the diagram$`,
          ),
        ),
      ]);
    },
  );

  it("fails on a click", () => {
    expect(
      problems(
        mermaid(
          "flowchart LR",
          "  %% diagram: a-b",
          "  a --> b",
          '  click a "https://example.com"',
        ),
      ),
    ).toEqual([expect.stringContaining("has a click")]);
  });
});

// The project as the diagrams may cite it.
const config = await loadConfig(path.join(ROOT, CONFIG_FILE));

/** A path of the project, from its root, with forward slashes. */
const relative = (file: string): string =>
  path.relative(ROOT, file).split(path.sep).join("/");

/** The repository's files: committed or new, never ignored. */
const FILES = git(
  ROOT,
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
)
  .split("\n")
  .filter((file) => file !== "" && fs.existsSync(path.join(ROOT, file)));

const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** What the pipeline writes into the generated folder: each writer's files, its warnings dropped. */
const generatedFiles = GENERATORS.flatMap((generator) =>
  generator(config, () => undefined),
).map(({ name }) => `${relative(config.generatedFolder)}/${name}`);

const repository: Repository = {
  scripts: new Set(Object.keys(manifest.scripts)),
  packages: new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]),
  paths: new Set([
    ...FILES,
    // Each folder holding a file of the repository.
    ...FILES.flatMap((file) =>
      file
        .split("/")
        .slice(0, -1)
        .map((_, index, parts) => parts.slice(0, index + 1).join("/")),
    ),
    relative(config.generatedFolder),
    ...generatedFiles,
    relative(config.outputFolder),
    relative(
      path.dirname(stagingFolderFor(config.outputFolder, config.mapFolder)),
    ),
    relative(luaBundleFile(config.tsconfig)),
  ]),
  files: new Set([
    ...FILES.filter((file) => !file.includes("/")),
    ...FILES.flatMap((file) =>
      file.startsWith(`${MAP_FOLDER}/`) ? [path.posix.basename(file)] : [],
    ),
  ]),
};

const COPIED = new Set(copiedFiles(ROOT));

const diagrams = FILES.filter(
  (file) => file.endsWith(".md") && !COPIED.has(file),
)
  .sort()
  .flatMap((file) =>
    readDiagrams(file, fs.readFileSync(path.join(ROOT, file), "utf8")),
  );

describe("the diagrams of the repository", () => {
  it("are each named and cite only what exists", () => {
    expect(
      diagramProblems(diagrams, repository),
      "the mermaid blocks of the Markdown files: follow the rules in the header comment of tests/pipeline/diagrams.test.ts",
    ).toEqual([]);
  });

  it("include the Toolchain, in the README's Toolchain section, citing the build, its stages and reforged-map", () => {
    const toolchain = diagrams.filter(({ names }) =>
      names.includes("toolchain"),
    );
    expect(
      toolchain.map(({ file, heading }) => `${file}, ${String(heading)}`),
    ).toEqual(["README.md, Toolchain"]);
    const [{ citations } = { citations: cite("") }] = toolchain;
    expect(citations.scripts).toEqual(
      expect.arrayContaining(["build", "dev", "lint"]),
    );
    expect(citations.packages).toEqual(
      expect.arrayContaining([
        "reforged-map",
        "typescript-to-lua",
        "eslint-plugin-reforged",
      ]),
    );
    expect(citations.paths).toEqual(
      expect.arrayContaining([
        "src",
        "src/generated",
        relative(luaBundleFile(config.tsconfig)),
      ]),
    );
  });

  it("are followed by a table whose links and the exports it names of scripts/ exist", () => {
    const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
    const start = readme.indexOf("\n## Toolchain\n");
    expect(start, "README.md: ## Toolchain").toBeGreaterThanOrEqual(0);
    const end = readme.indexOf("\n## ", start + 1);
    const section = readme.slice(start, end);
    const anchors = new Set(
      [...readme.matchAll(/^#{1,6}\s+(.*?)\s*$/gm)].map(([, heading = ""]) =>
        heading
          .toLowerCase()
          .replace(/[^\p{L}\p{N} _-]/gu, "")
          .replaceAll(" ", "-"),
      ),
    );
    const problems = [
      ...[...section.matchAll(/\]\(#([^)]+)\)/g)]
        .map(([, anchor = ""]) => anchor)
        .filter((anchor) => !anchors.has(anchor))
        .map((anchor) => `the link #${anchor} names no heading of the README`),
      ...[...section.matchAll(/`(\w+)` in `(scripts\/[\w./-]+\.ts)`/g)]
        .filter(
          ([, name = "", file = ""]) =>
            !new RegExp(
              `^export (?:async )?(?:function|const|class) ${name}\\b`,
              "m",
            ).test(
              fs.existsSync(path.join(ROOT, file))
                ? fs.readFileSync(path.join(ROOT, file), "utf8")
                : "",
            ),
        )
        .map(([, name, file]) => `${file} exports no ${name}`),
    ];
    expect(
      problems,
      "the table under the Toolchain diagram in README.md: update it",
    ).toEqual([]);
  });
});
