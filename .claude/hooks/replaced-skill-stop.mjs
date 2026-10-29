// @ts-check
// The Replaced skill Stop check of ADR 0027 (#804), registered in
// .claude/settings.json on Stop. A Replaced skill is never run or
// recommended: an Agent names its variant, and names the Replaced skill only
// beside it, on the same line. A turn whose last reply has a line naming a
// Replaced skill (`/to-spec`, `to-spec`, inside a code span or not) without
// its variant is blocked once, and the Agent told which variant to name
// instead. A line that names both passes ("`write-spec` replaces
// `to-spec`"), and so does a stop whose stop hook is already active, so a
// false alarm costs one rewrite and never a loop.
//
// The decision is verdict(), a pure function from the hook input and the map
// of Replaced skills to a verdict; the rest reads the map from the skills'
// folders (replaced-skills.mjs) and prints the output after reading stdin.
// The hook never fails a stop on its own error and always exits 0.
//
// Dependency-free: it runs on the Node that runs the session, before any
// `pnpm install`. Both repositories run it (.claude/shared.json, ADR 0024).
import { readFileSync, realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { namesSkill, replacedSkills } from "./replaced-skills.mjs";

/**
 * A hook input as Claude Code sends it, the fields the check reads.
 *
 * @typedef {object} HookInput
 * @property {string} [hook_event_name]
 * @property {boolean} [stop_hook_active]
 * @property {string} [last_assistant_message]
 */

/**
 * A pass, or a block with the reason the Agent reads and the Stop output
 * that says it to Claude Code.
 *
 * @typedef {{ verdict: "pass" } | { verdict: "block", reason: string, output: object }} Verdict
 */

/**
 * The check's verdict on a hook input, given the map of Replaced skills
 * (from the Upstream skill replaced to its variant): `block` with the reason
 * the Agent reads and the Stop output, or `pass`.
 *
 * @param {HookInput} input
 * @param {Readonly<Record<string, string>>} replaced
 * @returns {Verdict}
 */
export function verdict(input, replaced) {
  if (input.hook_event_name !== "Stop" || input.stop_hook_active === true) {
    return { verdict: "pass" };
  }
  const lines = (input.last_assistant_message ?? "").split(/\r?\n/);
  const unpaired = Object.entries(replaced).filter(([skill, variant]) =>
    lines.some((line) => namesSkill(line, skill) && !namesSkill(line, variant)),
  );
  if (unpaired.length === 0) return { verdict: "pass" };
  const names = unpaired
    .map(([skill, variant]) => `\`${variant}\` instead of \`${skill}\``)
    .join(", ");
  const reason = `Your reply names a Replaced skill without its variant on the same line (ADR 0027, .claude/hooks/replaced-skill-stop.mjs): name ${names}. A Replaced skill is never run or recommended; name it only beside its variant, on the same line. Rewrite those lines of your reply.`;
  return {
    verdict: "block",
    reason,
    output: { decision: "block", reason },
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
    const result = verdict(input, replacedSkills());
    if (result.verdict === "block") {
      process.stdout.write(`${JSON.stringify(result.output)}\n`);
    }
  } catch {
    // A check is never worth a failed stop.
  }
  process.exitCode = 0;
}
