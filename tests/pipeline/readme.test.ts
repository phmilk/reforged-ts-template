// The README's sync blocks as the Template ships them: the library's release
// sync rewrites the text between each pair of markers and nothing else. And
// its title, which the Creation CLI rewrites in a new Map project.
// In a generated Map project the README is the author's own: this test is
// Template maintenance, deleted with the rest of it (see AGENTS.md).
import { describe, expect, it } from "vitest";
import { locateBlock } from "../../scripts/sync.ts";
import { markedBlock, readRepoFile } from "./sync-markers.ts";

describe("README.md", () => {
  const readme = readRepoFile("README.md");

  // create-reforged-map writes the project name over the first `# ` line and
  // fails when the README has none.
  it("opens with the first-level title the Creation CLI prepares", () => {
    expect(readme).toMatch(/^# \S/);
  });

  it("holds the compatibility matrix between the matrix markers", () => {
    expect(markedBlock(readme, "matrix").trim()).not.toBe("");
  });

  // During the build phase the alphas are on `latest` (phmilk/reforged-ts#1062).
  it("installs from the build phase's `latest`: no command names `@next`", () => {
    const commands = [...readme.matchAll(/^```sh\n([\s\S]*?)^```$/gm)].map(
      ([, block]) => block,
    );
    expect(commands.join("")).toContain("npx create-reforged-map my-map");
    expect(commands.filter((block) => block.includes("@next"))).toEqual([]);
  });

  it("puts no alpha under the `next` dist-tag, nor asks `@next` for one, outside the synced matrix", () => {
    const { from, to } = locateBlock(readme, "matrix");
    const sentences = (readme.slice(0, from) + readme.slice(to)).split(
      /(?<=\.)\s/,
    );
    expect(
      sentences.filter(
        (sentence) =>
          sentence.includes("alpha") &&
          (/`next` (?:dist-tag|channel)/.test(sentence) ||
            sentence.includes("`@next`")),
      ),
    ).toEqual([]);
  });

  it("holds the llms.txt link between the docs markers", () => {
    expect(markedBlock(readme, "docs")).toMatch(
      /\]\(https:\/\/\S+\/llms\.txt\)/,
    );
  });
});
