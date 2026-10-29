// @ts-check
// The map of Replaced skills of ADR 0027: each Upstream skill a Skill variant
// replaces, read from the `metadata.replaces` field of the variant's
// SKILL.md frontmatter, next to `upstream` and `upstream-hash`
// (docs/agents/development-loop.md, "Skill variants"). A Replaced skill is
// never run or recommended, and is named only beside its variant.
//
// The hooks that hold the rule (skill-target.mjs, replaced-skill-stop.mjs)
// import replacedSkills and namesSkill; the skills conventions test
// (test/conventions/skills.test.ts) reads the same map and fails when a
// `replaces` names no Upstream skill of the lock. It is not a hook itself and
// prints nothing.
//
// Dependency-free: a hook runs on the Node that runs the session, before any
// `pnpm install`, so the frontmatter is read line by line instead of with a
// YAML parser. Both repositories hold it (.claude/shared.json, ADR 0024).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

/**
 * The folder of the Agent skills, one folder up from this script's.
 */
export const SKILLS_FOLDER = fileURLToPath(
  new URL("../skills/", import.meta.url),
);

/**
 * The `metadata.replaces` of a SKILL.md: the Upstream skill its variant
 * replaces, or `undefined` when its frontmatter declares none. It reads the
 * frontmatter's `metadata:` block, whose fields are indented under it, and
 * strips one pair of quotes around the value.
 *
 * @param {string} text The whole SKILL.md.
 * @returns {string | undefined}
 */
export function replacesOf(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (block === undefined) return undefined;
  let inMetadata = false;
  for (const line of block.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inMetadata = /^metadata:\s*$/.test(line);
      continue;
    }
    if (!inMetadata) continue;
    const value = /^\s+replaces:\s*(.*?)\s*$/.exec(line)?.[1];
    if (value === undefined) continue;
    const unquoted = /^(["'])(.*)\1$/.exec(value)?.[2] ?? value;
    return unquoted === "" ? undefined : unquoted;
  }
  return undefined;
}

/**
 * The map of Replaced skills, from the Upstream skill replaced to the Skill
 * variant replacing it, read from every `<folder>/SKILL.md` of a skills
 * folder, sorted by the replaced skill. A folder without a SKILL.md, or
 * whose frontmatter declares no `replaces`, adds nothing.
 *
 * @param {string} [skillsFolder] The folder of the Agent skills; this
 *   repository's `.claude/skills/` by default.
 * @returns {Record<string, string>}
 */
export function replacedSkills(skillsFolder = SKILLS_FOLDER) {
  /** @type {[string, string][]} */
  const pairs = [];
  for (const entry of readdirSync(skillsFolder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(skillsFolder, entry.name, "SKILL.md");
    if (!existsSync(path)) continue;
    const replaced = replacesOf(readFileSync(path, "utf8"));
    if (replaced !== undefined) pairs.push([replaced, entry.name]);
  }
  return Object.fromEntries(
    pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * Whether `line` names the skill `name`: its name as a word of its own, a
 * slash command (`/to-spec`), a code span or a path segment, never inside a
 * longer name (`to-spec` is not named by `to-specs` or `my-to-spec`).
 *
 * @param {string} line
 * @param {string} name
 * @returns {boolean}
 */
export function namesSkill(line, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(line);
}
