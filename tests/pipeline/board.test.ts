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

/** The lines of the trigger `event` of the `on:` block, under its key. */
function trigger(workflow: string, event: string): string {
  const match = new RegExp(`^  ${event}:\\n((?:(?:    .*)?\\n)*)`, "m").exec(
    workflow,
  );
  expect(match, `the trigger ${event}`).not.toBeNull();
  return match?.[1] ?? "";
}

/** The flow list of `key:` under the trigger `event` of the `on:` block. */
function eventList(workflow: string, event: string, key: string): string[] {
  const match = new RegExp(`^    ${key}:\\s*\\[([^\\]]*)\\]`, "m").exec(
    trigger(workflow, event),
  );
  expect(match, `${event} with a ${key} list`).not.toBeNull();
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

  it("runs on exactly the library board workflow's issue and pull_request_target types, pull requests into main alone", () => {
    // The other copy of these lists: the library's release/test/board.test.ts,
    // "board.yml". Neither repository reads the other's files in a test.
    expect(triggers(workflow)).toEqual(["issues", "pull_request_target"]);
    expect(eventList(workflow, "issues", "types")).toEqual([
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
    expect(eventList(workflow, "pull_request_target", "types")).toEqual([
      "opened",
      "reopened",
      "closed",
      "edited",
      "converted_to_draft",
      "ready_for_review",
    ]);
    // Into main alone, as the library's into master: a pull_request_target
    // run is on the base branch's ref, which the environment board refuses on
    // any other, and a closing keyword closes nothing outside the default
    // branch.
    expect(eventList(workflow, "pull_request_target", "branches")).toEqual([
      "main",
    ]);
    expect(trigger(workflow, "issues")).not.toMatch(/^ {4}branches:/m);
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
