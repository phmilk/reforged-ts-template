// The README's sync blocks as the Template ships them: the library's release
// sync rewrites the text between each pair of markers and nothing else.
// In a generated Map project the README is the author's own: this test is
// Template maintenance, deleted with the rest of it (see AGENTS.md).
import { describe, expect, it } from "vitest";
import { markedBlock, readRepoFile } from "./sync-markers.ts";

describe("README.md", () => {
  const readme = readRepoFile("README.md");

  it("holds the compatibility matrix between the matrix markers", () => {
    expect(markedBlock(readme, "matrix").trim()).not.toBe("");
  });

  it("holds the llms.txt link between the docs markers", () => {
    expect(markedBlock(readme, "docs")).toMatch(
      /\]\(https:\/\/\S+\/llms\.txt\)/,
    );
  });
});
