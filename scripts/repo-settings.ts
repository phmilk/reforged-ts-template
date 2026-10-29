// `node scripts/repo-settings.ts [--dry-run]`: the Template's repository
// settings as code, after the library's `repo:settings`. Reads the merge
// settings of phmilk/reforged-ts-template with the maintainer's `gh`
// authentication, which must be an administrator of it, and patches those
// that differ from `MERGE_SETTINGS`; `--dry-run` prints the request and
// sends none.
//
// Template maintenance: a generated Map project deletes it (see AGENTS.md).
import { spawnSync } from "node:child_process";
import { runAsEntry } from "./cli.ts";
import { TEMPLATE_REPOSITORY } from "./detach.ts";
import { AuthorError } from "./errors.ts";

/**
 * The merge settings: squash merge only, and auto-merge, so a pull request
 * merges once the required checks pass (the library's ADR 0021).
 */
export const MERGE_SETTINGS = {
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  allow_auto_merge: true,
} as const;

/** The request that makes the repository's merge settings match. */
export interface MergeSettingsRequest {
  method: "PATCH";
  /** The path under the API root, with a leading `/`. */
  endpoint: string;
  body: typeof MERGE_SETTINGS;
}

const USAGE = "Usage: node scripts/repo-settings.ts [--dry-run]";

/**
 * The request that sets `MERGE_SETTINGS` on the Template's repository, given
 * its `current` settings (`GET /repos/{owner}/{repo}`); `null` when every
 * one already matches.
 */
export function planMergeSettings(
  current: Readonly<Record<string, unknown>>,
): MergeSettingsRequest | null {
  const matches = Object.entries(MERGE_SETTINGS).every(
    ([key, value]) => current[key] === value,
  );
  return matches
    ? null
    : {
        method: "PATCH",
        endpoint: `/repos/${TEMPLATE_REPOSITORY}`,
        body: { ...MERGE_SETTINGS },
      };
}

/** `gh api` with `args`, `input` on its standard input; its parsed JSON answer. */
function ghApi(args: readonly string[], input?: string): unknown {
  const result = spawnSync("gh", ["api", ...args], {
    encoding: "utf8",
    input,
  });
  if (result.error !== undefined) {
    throw new AuthorError(`gh api ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new AuthorError(
      `gh api ${args.join(" ")}: ${stderr === "" ? `exit ${String(result.status)}` : stderr}`,
    );
  }
  return JSON.parse(result.stdout) as unknown;
}

function main(args: readonly string[]): void {
  if (args.some((arg) => arg !== "--dry-run")) throw new AuthorError(USAGE);
  const dryRun = args.includes("--dry-run");

  const endpoint = `/repos/${TEMPLATE_REPOSITORY}`;
  const current = ghApi([endpoint]) as Record<string, unknown> & {
    permissions?: { admin?: boolean };
  };
  if (current.permissions?.admin !== true) {
    throw new AuthorError(
      `the gh authentication has no administrator rights on ${TEMPLATE_REPOSITORY}, ` +
        "and changing its settings needs them (gh auth login, or gh auth switch to that account).",
    );
  }

  const request = planMergeSettings(current);
  if (request === null) {
    console.log(
      `${TEMPLATE_REPOSITORY}: the merge settings already match (squash merge only, auto-merge).`,
    );
    return;
  }
  console.log(
    `${request.method} ${request.endpoint}\n${JSON.stringify(request.body, null, 2)}`,
  );
  if (dryRun) return;
  ghApi(
    ["--method", request.method, request.endpoint, "--input", "-"],
    JSON.stringify(request.body),
  );
  console.log(`Done: the merge settings of ${TEMPLATE_REPOSITORY} are set.`);
}

await runAsEntry(import.meta.url, "repo-settings", () => {
  main(process.argv.slice(2));
});
