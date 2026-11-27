// @ts-check
// The ship Stop check of ADR 0026 (#807), registered in .claude/settings.json
// on Stop. Every implement ends with /ship-branch, which pushes the branch and
// opens its pull request; a forgotten /ship-branch is caught here. A turn that
// ends after an implement, with commits ahead of the remote default and no
// pull request (or a draft, which cannot carry auto-merge), is blocked once
// and the Agent told to run /ship-branch or say why it stops. The stop after
// that passes, since its stop hook is already active, so a false alarm costs
// one look and never a loop; and so does any stop when the transcript, `git`
// or `gh` cannot be read, so a network failure never traps a session. A stop
// with work in flight (a running Subagent or background command, or a wakeup
// the session scheduled) passes before any read, since the work has not ended
// (#953): the stop after it finishes meets the check again. A branch whose
// pull request is merged with the branch's last commit as its head passes
// too: a squash leaves its commits ahead of the remote default, and the work
// is shipped all the same (#971).
//
// The decision is verdict(), a pure function from the hook input and three
// facts: whether an implement (/implement or /implement-spec, typed or a
// Skill tool call) ran after the last /ship-branch, read from the transcript by
// implementPending(), a pure function over its lines; how many commits the
// branch has ahead of the remote default, read with `git`; and the state of
// the branch's pull request, read with `gh` and, to tell a merged one that
// shipped the branch as it stands, the branch's last commit
// (pullRequestStateOf()). run() reads the facts in that order, each only
// when the ones before it call for it, through readers the script gives it;
// the rest is those readers and the printing of the output after reading
// stdin. The hook never fails a stop on
// its own error and always exits 0.
//
// Dependency-free: it runs on the Node that runs the session, before any
// `pnpm install`. Both repositories run it (.claude/shared.json, ADR 0024).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * A hook input as Claude Code sends it, the fields the check reads.
 *
 * @typedef {object} HookInput
 * @property {string} [hook_event_name]
 * @property {boolean} [stop_hook_active]
 * @property {string} [transcript_path]
 * @property {string} [cwd]
 * @property {readonly unknown[]} [background_tasks] The running Subagents
 *   and background commands.
 * @property {readonly unknown[]} [session_crons] The wakeups the session
 *   scheduled.
 */

/**
 * The state of the branch's pull request: none, a draft, open with
 * auto-merge on, open without it, or merged with the branch's last commit
 * as its head.
 *
 * @typedef {"none" | "draft" | "auto-merge" | "open" | "merged"} PullRequestState
 */

/**
 * The three facts of the verdict. `null` is a fact that could not be read,
 * or that run() did not need to read: either way the stop passes.
 *
 * @typedef {object} Facts
 * @property {boolean} pending Whether an implement ran after the last
 *   /ship-branch.
 * @property {number | null} ahead The branch's commits ahead of the remote default.
 * @property {PullRequestState | null} pullRequest
 */

/**
 * What run() reads its facts with: the transcript's lines, the commits
 * ahead, `gh pr list`'s answer for the branch, and the branch's last
 * commit. Each throws when it cannot read.
 *
 * @typedef {object} Readers
 * @property {() => readonly string[]} transcript
 * @property {() => number} ahead
 * @property {() => string} pullRequest
 * @property {() => string} lastCommit The hash of the branch's last
 *   commit, read with the pull request.
 */

/**
 * A pass, or a block with the reason the Agent reads and the Stop output
 * that says it to Claude Code.
 *
 * @typedef {{ verdict: "pass" } | { verdict: "block", reason: string, output: object }} Verdict
 */

/** The implements: each ends with /ship-branch (ADR 0026). */
const IMPLEMENTS = ["implement", "implement-spec"];

/**
 * The skill that ships, by its own name. Claude Code reserves `ship` for its
 * built-in /ship, which never runs the skill and is not matched here (#940):
 * the open pull request it leaves passes through the repository state.
 */
const SHIP = "ship-branch";

const SOURCE = "ADR 0026, .claude/hooks/ship-stop.mjs";

/**
 * The skills a transcript line invokes, by name with a plugin's `name:`
 * prefix dropped: a slash command the Collaborator typed (its
 * `<command-name>` tag, or a prompt that opens with it), or a call of the
 * Skill tool. A tool's result, a reply's text and a Subagent's line invoke
 * nothing.
 *
 * @param {string} line
 * @returns {string[]}
 */
function invokedSkills(line) {
  /** @type {any} */
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return [];
  }
  if (entry === null || typeof entry !== "object") return [];
  if (entry.isSidechain === true) return [];
  const content = entry.message?.content;
  /** @type {string[]} */
  const names = [];
  if (entry.type === "user") {
    const texts =
      typeof content === "string"
        ? [content]
        : Array.isArray(content)
          ? content
              .filter((item) => item?.type === "text")
              .map((item) => String(item.text ?? ""))
          : [];
    for (const text of texts) {
      const match =
        /<command-name>\/([\w:-]+)<\/command-name>/.exec(text) ??
        /^\s*\/([\w:-]+)(?:\s|$)/.exec(text);
      if (match?.[1] !== undefined) names.push(match[1]);
    }
  } else if (entry.type === "assistant" && Array.isArray(content)) {
    for (const item of content) {
      if (
        item?.type === "tool_use" &&
        item.name === "Skill" &&
        typeof item.input?.skill === "string"
      ) {
        names.push(item.input.skill);
      }
    }
  }
  return names.map((name) => name.slice(name.indexOf(":") + 1));
}

/**
 * Whether an implement (/implement or /implement-spec) ran after the last
 * /ship-branch, given the transcript's lines in order: an implement with no
 * /ship-branch after it.
 *
 * @param {readonly string[]} lines
 * @returns {boolean}
 */
export function implementPending(lines) {
  let pending = false;
  for (const line of lines) {
    for (const name of invokedSkills(line)) {
      if (IMPLEMENTS.includes(name)) pending = true;
      else if (name === SHIP) pending = false;
    }
  }
  return pending;
}

/**
 * The state of the branch's pull request from the answer of
 * `gh pr list --head <branch> --state all --json
 * state,isDraft,autoMergeRequest,headRefOid`, given `lastCommit`, the hash
 * of the branch's last commit: the open one's when there is one; else
 * merged, when one was merged with `lastCommit` as its head, so that
 * commits made after a merge are still unshipped; else none, a closed one
 * included. Throws on any other answer.
 *
 * @param {string} answer
 * @param {string} lastCommit
 * @returns {PullRequestState}
 */
export function pullRequestStateOf(answer, lastCommit) {
  /** @type {unknown} */
  const list = JSON.parse(answer);
  if (!Array.isArray(list)) throw new Error("gh pr list: not a list");
  const pullRequests = list.map((/** @type {unknown} */ one) => {
    if (
      one === null ||
      typeof one !== "object" ||
      !("state" in one) ||
      !("isDraft" in one) ||
      !("autoMergeRequest" in one) ||
      !("headRefOid" in one)
    ) {
      throw new Error("gh pr list: not a pull request");
    }
    return one;
  });
  const open = pullRequests.find(({ state }) => state === "OPEN");
  if (open !== undefined) {
    if (open.isDraft === true) return "draft";
    return open.autoMergeRequest === null ? "open" : "auto-merge";
  }
  return pullRequests.some(
    ({ state, headRefOid }) => state === "MERGED" && headRefOid === lastCommit,
  )
    ? "merged"
    : "none";
}

/**
 * Whether the check looks at a hook input at all: a Stop whose stop hook is
 * not already active, with no work in flight. A Stop that lists a running
 * Subagent or background command, or a wakeup the session scheduled, is not
 * the end of the work: the Stop after that work finishes meets the check
 * again (#953).
 *
 * @param {HookInput} input
 * @returns {boolean}
 */
function applies(input) {
  return (
    input.hook_event_name === "Stop" &&
    input.stop_hook_active !== true &&
    (input.background_tasks ?? []).length === 0 &&
    (input.session_crons ?? []).length === 0
  );
}

/**
 * The check's verdict on a hook input, given its three facts: `block` with
 * the reason the Agent reads and the Stop output, or `pass`.
 *
 * @param {HookInput} input
 * @param {Facts} facts
 * @returns {Verdict}
 */
export function verdict(input, facts) {
  if (!applies(input)) return { verdict: "pass" };
  const { pending, ahead, pullRequest } = facts;
  if (!pending || ahead === null || ahead <= 0) return { verdict: "pass" };
  if (pullRequest !== "none" && pullRequest !== "draft") {
    return { verdict: "pass" };
  }
  const commits = `${String(ahead)} ${ahead === 1 ? "commit" : "commits"}`;
  const state =
    pullRequest === "none"
      ? "no pull request"
      : "a draft pull request without auto-merge";
  const reason = `This session ran an implement after its last /ship-branch, and its branch has ${commits} ahead of the remote default with ${state} (${SOURCE}). Every implement ends with /ship-branch: run /ship-branch now, which reviews the branch, pushes it, opens or readies its pull request and turns on auto-merge unless a human is needed. If the work stops here on purpose, say why in your reply instead.`;
  return { verdict: "block", reason, output: { decision: "block", reason } };
}

/**
 * Runs the check on `input`, reading its facts through `read` in order,
 * each only when the ones before it call for it; a read that throws ends
 * in a pass.
 *
 * @param {HookInput} input
 * @param {Readers} read
 * @returns {Verdict}
 */
export function run(input, read) {
  /** @type {Facts} */
  const facts = { pending: false, ahead: null, pullRequest: null };
  const decide = () => verdict(input, facts);
  if (!applies(input)) return decide();
  try {
    facts.pending = implementPending(read.transcript());
    if (!facts.pending) return decide();
    facts.ahead = read.ahead();
    if (facts.ahead <= 0) return decide();
    facts.pullRequest = pullRequestStateOf(
      read.pullRequest(),
      read.lastCommit(),
    );
  } catch {
    return { verdict: "pass" };
  }
  return decide();
}

// The readers of the script: the transcript's file, `git` and `gh`.

/** How long one `git` call may take: it reads the clone, never the network. */
const GIT_TIMEOUT_MS = 5_000;

/** How long one `gh` call may take: the session waits on it. */
const GH_TIMEOUT_MS = 20_000;

/**
 * `program`'s trimmed standard output for `args` (constants and a checked
 * branch name only) in `cwd`; throws when it fails. On Windows it goes
 * through the shell, which finds a `.exe` or a `.cmd` of that name.
 *
 * @param {"gh" | "git"} program
 * @param {readonly string[]} args
 * @param {string} cwd
 * @param {number} timeout
 * @returns {string}
 */
function tool(program, args, cwd, timeout) {
  const options = { cwd, timeout, encoding: /** @type {const} */ ("utf8") };
  const result =
    process.platform === "win32"
      ? spawnSync(`${program} ${args.join(" ")}`, { ...options, shell: true })
      : spawnSync(program, args, options);
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${program} ${args[0] ?? ""} exited ${String(result.status)}`,
    );
  }
  return result.stdout.trim();
}

/**
 * The readers for a hook input: its transcript, and `git` and `gh` in its
 * working folder, or the project's when that folder is gone.
 *
 * @param {HookInput} input
 * @returns {Readers}
 */
function readersOf(input) {
  const cwd =
    typeof input.cwd === "string" && existsSync(input.cwd)
      ? input.cwd
      : (process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const git = (/** @type {string[]} */ ...args) =>
    tool("git", args, cwd, GIT_TIMEOUT_MS);
  return {
    transcript: () => {
      if (typeof input.transcript_path !== "string") {
        throw new Error("no transcript");
      }
      return readFileSync(input.transcript_path, "utf8").split(/\r?\n/);
    },
    ahead: () => {
      const remoteHead = git(
        "symbolic-ref",
        "--short",
        "refs/remotes/origin/HEAD",
      );
      if (!remoteHead.startsWith("origin/")) throw new Error(remoteHead);
      const count = Number(git("rev-list", "--count", `${remoteHead}..HEAD`));
      if (!Number.isInteger(count)) throw new Error("git rev-list: no count");
      return count;
    },
    pullRequest: () => {
      const branch = git("branch", "--show-current");
      // A detached HEAD has no pull request to read; a name the shell
      // could misread is never passed to it.
      if (!/^[\w./-]+$/.test(branch)) throw new Error("no branch to read");
      return tool(
        "gh",
        [
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "all",
          "--json",
          "state,isDraft,autoMergeRequest,headRefOid",
        ],
        cwd,
        GH_TIMEOUT_MS,
      );
    },
    lastCommit: () => git("rev-parse", "HEAD"),
  };
}

// Whether this file is the script node runs, not a module a test imports.
function isMain() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return (
      realpathSync(entry).toLowerCase() === realpathSync(self).toLowerCase()
    );
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    /** @type {HookInput} */
    const input = JSON.parse(readFileSync(0, "utf8"));
    const result = run(input, readersOf(input));
    if (result.verdict === "block") {
      process.stdout.write(`${JSON.stringify(result.output)}\n`);
    }
  } catch {
    // A check is never worth a failed stop.
  }
  process.exitCode = 0;
}
