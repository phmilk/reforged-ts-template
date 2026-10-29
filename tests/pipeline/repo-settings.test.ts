// The Template's repository settings, `scripts/repo-settings.ts`: the merge
// settings it commits and the request that applies them, after the
// library's `repo-settings.test.ts`. Template maintenance, deleted with the
// script (see AGENTS.md).
import { describe, expect, it } from "vitest";
import {
  MERGE_SETTINGS,
  planMergeSettings,
} from "../../scripts/repo-settings.ts";

describe("the committed merge settings", () => {
  it("turn auto-merge on, so a pull request merges behind the required checks", () => {
    expect(MERGE_SETTINGS.allow_auto_merge).toBe(true);
  });
});

describe("planMergeSettings", () => {
  it("patches the repository when auto-merge is off", () => {
    expect(
      planMergeSettings({
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        allow_auto_merge: false,
        has_issues: true,
      }),
    ).toEqual({
      method: "PATCH",
      endpoint: "/repos/phmilk/reforged-ts-template",
      body: {
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        allow_auto_merge: true,
      },
    });
  });

  it("patches a repository as GitHub creates it", () => {
    expect(
      planMergeSettings({
        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: true,
        allow_auto_merge: false,
      })?.method,
    ).toBe("PATCH");
  });

  it("sends nothing when every merge setting already matches", () => {
    expect(
      planMergeSettings({
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        allow_auto_merge: true,
        delete_branch_on_merge: false,
      }),
    ).toBeNull();
  });
});
