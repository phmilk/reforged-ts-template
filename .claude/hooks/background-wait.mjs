// @ts-check
// The background-wait check of #767, registered in .claude/settings.json on
// two events. An Agent that waits on background work learns that the work
// ended only from a completion notice, which sometimes never comes: the
// process dies, or the waiter went idle first. The check stops the two ways
// an Agent ends up waiting on nothing.
//
// - PreToolUse: a Subagent (a call whose input carries an agent id) may not
//   start a Bash or PowerShell command in the background; it is told to run
//   it in the foreground. The main conversation keeps background commands.
// - Stop: a turn whose last reply says it waits on background work, while the
//   input lists no background task and no session cron, is blocked once and
//   the Agent told to verify; an input whose stop hook is already active
//   passes, and so does a reply that only quotes a wait. A named agent left
//   idle (a teammate) is listed among the background tasks as running, so a
//   wait on it passes (#768).
//
// The decision is verdict(), a pure function from the hook input to a
// verdict; a verdict that blocks carries the output its event takes, which
// the rest prints after reading stdin. The hook never fails a call or a stop
// on its own error and always exits 0.
//
// Dependency-free: it runs on the Node that runs the session, before any
// `pnpm install`. Both repositories run it (.claude/shared.json, ADR 0024).
import { readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * A hook input as Claude Code sends it, the fields the check reads.
 *
 * @typedef {object} HookInput
 * @property {string} [hook_event_name]
 * @property {string} [agent_id]
 * @property {string} [tool_name]
 * @property {Record<string, unknown>} [tool_input]
 * @property {boolean} [stop_hook_active]
 * @property {string} [last_assistant_message]
 * @property {readonly unknown[]} [background_tasks]
 * @property {readonly unknown[]} [session_crons]
 */

/**
 * A pass, or a block with the reason the Agent reads and the hook output
 * that says it to Claude Code: a PreToolUse deny, a Stop block.
 *
 * @typedef {{ verdict: "pass" } | { verdict: "block", reason: string, output: object }} Verdict
 */

const FOREGROUND =
  "A Subagent does not start background commands (.claude/hooks/background-wait.mjs): the notice that one ended may never reach it. Run this command in the foreground instead (no run_in_background), with a timeout of at most 600000 ms (ten minutes), or split it into steps that each fit in ten minutes.";

// A reply that says it waits on background work: phrases of waiting, in
// Portuguese and English, never a bare "segundo plano", "background" or
// "rodando", which a reply saying nothing runs uses too.
const WAITING = new RegExp(
  [
    "me avisa(rá)? quando",
    "quando (ele|ela|eles|elas) (terminar|terminarem|avisar|avisarem|acabar|acabarem)",
    "(estou |fico |vou )?(aguardando|esperando|aguardar|esperar|aguardo|espero) (o|a|os|as) (agente|subagente|implementador|revis|check|teste|build|aviso|notifica|resultado|relat)",
    "ainda (está |esta )?rodando",
    "still running",
    "I'll (continue|resume|pick up|pick it up) when",
    "when (it|they) (finish|finishes|report|reports|complete|completes)",
    "wait(ing)? (for|on) (the |its |their )?(agent|subagent|check|build|notification|completion|result|report)",
  ].join("|"),
  "i",
);

// What a reply quotes rather than says: a fenced block, a code span, and
// text between curly quotes, guillemets, or straight quotes that open and
// close at a word's edge (so an inch mark pairs with nothing). A reply that
// only quotes a wait (a retrospective, the report of a stall) waits on
// nothing. A `>` line still counts: an Agent writes its own status in one.
const QUOTED =
  /```[\s\S]*?```|`[^`\n]*`|“[^”\n]*”|«[^»\n]*»|(?<=^|[\s([{])"[^"\n]*"(?=$|[\s.,;:!?)\]}])/gm;

const NOTHING_IN_FLIGHT =
  "Your reply says you are waiting on background work, but nothing is in flight (.claude/hooks/background-wait.mjs): no background task and no scheduled wakeup, so nothing will wake this session. Verify with ListAgents and the process list, then either resume the work yourself (send a message to an idle agent, run the command again in the foreground) or tell the user plainly that nothing is running.";

/**
 * The check's verdict on a hook input: `block` with the reason the Agent
 * reads and the hook output, or `pass`.
 *
 * @param {HookInput} input
 * @returns {Verdict}
 */
export function verdict(input) {
  if (
    input.hook_event_name === "PreToolUse" &&
    input.agent_id !== undefined &&
    (input.tool_name === "Bash" || input.tool_name === "PowerShell") &&
    input.tool_input?.run_in_background === true
  ) {
    return {
      verdict: "block",
      reason: FOREGROUND,
      output: {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: FOREGROUND,
        },
      },
    };
  }
  if (
    input.hook_event_name === "Stop" &&
    input.stop_hook_active !== true &&
    (input.background_tasks ?? []).length === 0 &&
    (input.session_crons ?? []).length === 0 &&
    WAITING.test((input.last_assistant_message ?? "").replace(QUOTED, ""))
  ) {
    return {
      verdict: "block",
      reason: NOTHING_IN_FLIGHT,
      output: { decision: "block", reason: NOTHING_IN_FLIGHT },
    };
  }
  return { verdict: "pass" };
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
    const result = verdict(input);
    if (result.verdict === "block") {
      process.stdout.write(`${JSON.stringify(result.output)}\n`);
    }
  } catch {
    // A check is never worth a failed call or stop.
  }
  process.exitCode = 0;
}
