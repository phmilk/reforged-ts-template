// The README's sync blocks as the Template ships them: the library's release
// sync rewrites the text between each pair of markers and nothing else.
// In a generated Map project the README is the author's own: this test is
// Template maintenance, deleted with the rest of it (see AGENTS.md).
import { describe, expect, it } from "vitest";
import { markedBlock, readRepoFile } from "./sync-markers.ts";

describe("README.md", () => {
  const readme = readRepoFile("README.md");

  // create-reforged-map writes the project name over the first `# ` line and
  // the map's description in a paragraph under it; it stops when it is gone.
  it("opens with the first-level title the Creation CLI prepares", () => {
    expect(readme).toMatch(/^# \S.*\n\n\S/);
  });

  it("holds the compatibility matrix between the matrix markers", () => {
    expect(markedBlock(readme, "matrix").trim()).not.toBe("");
  });

  it("holds the llms.txt link between the docs markers", () => {
    expect(markedBlock(readme, "docs")).toMatch(
      /\]\(https:\/\/\S+\/llms\.txt\)/,
    );
  });
});
