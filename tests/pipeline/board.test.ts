// The board caller, `.github/workflows/board.yml`: on the Template's issue and
// pull-request events it calls the library's reusable board-dispatch, so the
// Claim board reconciles within a minute (the library's ADR 0017). The
// Template has no YAML parser, so the test reads the file's text. Template
// maintenance, deleted with the caller (see AGENTS.md).
import { describe, expect, it } from "vitest";
import { readRepoFile } from "./sync-markers.ts";

/** The text of the `## <heading>` section, up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  expect(start, `## ${heading}`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/** The flow list of `types:` under the trigger `event` of the `on:` block. */
function eventTypes(workflow: string, event: string): string[] {
  const match = new RegExp(
    `^  ${event}:\\n(?:    #.*\\n)*    types:\\s*\\[([^\\]]*)\\]`,
    "m",
  ).exec(workflow);
  expect(match, `${event} with a types list`).not.toBeNull();
  return (match?.[1] ?? "")
    .split(",")
    .map((type) => type.trim())
    .filter((type) => type !== "");
}

/** The top-level keys of the `on:` block, in order. */
function triggers(workflow: string): string[] {
  const on = /^on:\n((?:(?: .*)?\n)*)/m.exec(workflow);
  expect(on, "an on: block").not.toBeNull();
  return [...(on?.[1] ?? "").matchAll(/^ {2}([a-z_]+):/gm)].map(
    ([, key]) => key,
  );
}

describe("the board caller", () => {
  const workflow = readRepoFile(".github/workflows/board.yml");

  it("runs on exactly the library board workflow's issue and pull_request_target types", () => {
    // The other copy of these lists: the library's release/test/board.test.ts,
    // "board.yml". Neither repository reads the other's files in a test.
    expect(triggers(workflow)).toEqual(["issues", "pull_request_target"]);
    expect(eventTypes(workflow, "issues")).toEqual([
      "opened",
      "reopened",
      "closed",
      "deleted",
      "transferred",
      "assigned",
      "unassigned",
      "labeled",
      "unlabeled",
    ]);
    // main's file, whatever the pull request holds, and a fork's pull request
    // reaches the board: never pull_request.
    expect(eventTypes(workflow, "pull_request_target")).toEqual([
      "opened",
      "reopened",
      "closed",
      "edited",
      "converted_to_draft",
      "ready_for_review",
    ]);
  });

  it("calls the library's board-dispatch at master in one job, in this repository alone, with no concurrency group", () => {
    const jobs = [...workflow.matchAll(/^ {2}([a-z-]+):\n/gm)].filter(
      ({ index }) => index > workflow.indexOf("\njobs:\n"),
    );
    expect(jobs).toHaveLength(1);
    expect(workflow).toMatch(
      /^ {4}if: github\.repository == 'phmilk\/reforged-ts-template'$/m,
    );
    expect(workflow).toMatch(
      /^ {4}uses: phmilk\/reforged-ts\/\.github\/workflows\/board-dispatch\.yml@master$/m,
    );
    expect(workflow).not.toMatch(/^\s*concurrency:/m);
    expect(workflow).not.toMatch(/^\s*secrets:/m);
  });

  it("is listed in AGENTS.md's Template maintenance with its test", () => {
    const maintenance = section(
      readRepoFile("AGENTS.md"),
      "Template maintenance",
    );
    expect(maintenance).toContain("`.github/workflows/board.yml`");
    expect(maintenance).toContain("`tests/pipeline/board.test.ts`");
  });
});
