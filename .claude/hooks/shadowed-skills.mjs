// @ts-check
// The session-start warning of ADR 0022, registered as a SessionStart hook
// in .claude/settings.json. In Claude Code a personal skill
// (~/.claude/skills/<name>/) wins over a project skill of the same name, so a
// Collaborator who still has the global copies of the Upstream skills runs
// them instead of the repository's, unknowingly; the upstream plugin, when
// the user's settings enable it, loads every Upstream skill a second time.
//
// The hook names each personal skill that has the name of a folder of this
// repository's .claude/skills/ (an Upstream skill or one of the repository's
// own), and the upstream plugin when ~/.claude/settings.json enables it, with
// the command that removes them. It prints one JSON object: `systemMessage`,
// which Claude Code shows the Collaborator, and `additionalContext`, which
// the Agent reads. It prints nothing when nothing shadows the repository's
// skills, never blocks the session and always exits 0, whatever it finds.
//
// Dependency-free: it runs on the Node that runs the session, before any
// `pnpm install`. Both repositories run it (.claude/shared.json, ADR 0024).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// The upstream plugin's name, the part of its id before the marketplace
// (`mattpocock-skills@claude-plugins-official`).
const UPSTREAM_PLUGIN = "mattpocock-skills";

// Every folder of .claude/skills/, the Upstream skills' and the repository's
// own, one folder up from this script's, sorted. It mirrors skillFolders() of
// test/conventions/skills.ts, kept apart because the hook is dependency-free.
function skillFolders() {
  const folder = fileURLToPath(new URL("../skills/", import.meta.url));
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// The user's Claude Code folder: CLAUDE_CONFIG_DIR when set, else
// ~/.claude (HOME, or USERPROFILE on Windows).
function userFolder() {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  return configured !== undefined && configured !== ""
    ? configured
    : join(homedir(), ".claude");
}

/**
 * The names of `names` the user has a personal skill of: a
 * `skills/<name>/SKILL.md` in their Claude Code folder, through a symbolic
 * link too (the skills CLI links them from ~/.agents/skills/).
 *
 * @param {string} user
 * @param {readonly string[]} names
 * @returns {string[]}
 */
function personalSkills(user, names) {
  return names.filter((name) =>
    existsSync(join(user, "skills", name, "SKILL.md")),
  );
}

/**
 * The ids of the upstream plugin the user's settings enable: the keys of
 * `enabledPlugins` whose plugin is the upstream one, set to `true`. Settings
 * that are absent or not JSON enable none.
 *
 * @param {string} user
 * @returns {string[]}
 */
function upstreamPlugins(user) {
  const path = join(user, "settings.json");
  if (!existsSync(path)) return [];
  /** @type {unknown} */
  let settings;
  try {
    settings = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
  if (typeof settings !== "object" || settings === null) return [];
  /** @type {unknown} */
  const enabled = Reflect.get(settings, "enabledPlugins");
  if (typeof enabled !== "object" || enabled === null) return [];
  return Object.entries(enabled)
    .filter(([id, on]) => on === true && id.split("@")[0] === UPSTREAM_PLUGIN)
    .map(([id]) => id)
    .sort();
}

/**
 * The warning, one paragraph per kind of shadowing; `undefined` when there
 * is none.
 *
 * @param {string} user
 * @param {readonly string[]} skills
 * @param {readonly string[]} plugins
 * @returns {string | undefined}
 */
function warning(user, skills, plugins) {
  const paragraphs = [];
  if (skills.length > 0) {
    paragraphs.push(
      `Your personal skills shadow this repository's Agent skills of the same name: ${skills.join(", ")}. ` +
        `Claude Code runs a personal skill (${join(user, "skills")}) instead of the project skill, ` +
        `so the Agent runs your copies, not the repository's (.claude/skills/). ` +
        `Remove them with: npx skills remove -g ${skills.join(" ")}`,
    );
  }
  for (const id of plugins) {
    paragraphs.push(
      `The upstream plugin ${id} is enabled in your user settings: it loads every Upstream skill a second time, ` +
        `beside the repository's copies. Remove it with: claude plugin uninstall ${id}`,
    );
  }
  return paragraphs.length === 0 ? undefined : paragraphs.join("\n\n");
}

try {
  const user = userFolder();
  const message = warning(
    user,
    personalSkills(user, skillFolders()),
    upstreamPlugins(user),
  );
  if (message !== undefined) {
    process.stdout.write(
      `${JSON.stringify({
        systemMessage: message,
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: `The session-start hook of this repository (.claude/hooks/shadowed-skills.mjs) warned the user:\n\n${message}`,
        },
      })}\n`,
    );
  }
} catch {
  // A warning is never worth a failed session start.
}
process.exitCode = 0;
