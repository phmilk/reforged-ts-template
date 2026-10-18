// `pnpm template:detach`: removes the Template maintenance from a Map
// project made with GitHub's "Use this template" (#93). The files are those
// template-maintenance.json lists; the sections are AGENTS.md's "Template
// maintenance" and the README's "Deletable in a generated project". It
// removes itself, its package script and the manifest too, so it runs once.
//
// Template maintenance: a generated Map project deletes it (see AGENTS.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { runAsEntry } from "./cli.ts";
import { AuthorError } from "./errors.ts";

/** The manifest of the Template maintenance files, at the project root. */
export const MANIFEST_FILE = "template-maintenance.json";
/** The package script that runs this command. */
export const SCRIPT_NAME = "template:detach";
/** The Template's own repository, where the command refuses to run. */
export const TEMPLATE_REPOSITORY = "phmilk/reforged-ts-template";
/** The `## ` section each file loses, by file. */
export const SECTIONS: Readonly<Record<string, string>> = {
  "AGENTS.md": "Template maintenance",
  "README.md": "Deletable in a generated project",
};

const USAGE = "Usage: node scripts/detach.ts [--force]";

/** The paths the manifest at `root` lists, relative to `root`. */
export function readManifest(root: string): string[] {
  const file = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(file)) return [];
  const { paths } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    paths: string[];
  };
  return paths;
}

/** `text` without its `## <heading>` section, up to the next `## ` heading. */
export function withoutSection(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) return text;
  const next = text.indexOf("\n## ", start + 1);
  return next === -1
    ? `${text.slice(0, start).trimEnd()}\n`
    : text.slice(0, start) + text.slice(next);
}

/** Whether the `origin` remote of the git checkout at `root` is the Template's own. */
function isTemplateCheckout(root: string): boolean {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: root,
    encoding: "utf8",
  });
  return (
    result.status === 0 &&
    /[/:]phmilk\/reforged-ts-template(\.git)?\/?$/.test(result.stdout.trim())
  );
}

/**
 * Removes the Template maintenance from the project at `root` and returns
 * what it removed: each listed path that exists, each section, the package
 * script. A second run removes nothing. Refuses in the Template's own
 * checkout unless `force`.
 */
export function detach(root: string, force = false): string[] {
  if (!force && isTemplateCheckout(root))
    throw new AuthorError(
      `this is ${TEMPLATE_REPOSITORY} itself, whose maintenance files stay. Run it in a Map project made from the Template, or pass --force.`,
    );
  const removed: string[] = [];
  // The manifest goes last: it lists itself.
  const paths = readManifest(root).toSorted(
    (a, b) => Number(a === MANIFEST_FILE) - Number(b === MANIFEST_FILE),
  );
  for (const rel of paths) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    fs.rmSync(file, { recursive: true });
    removed.push(rel);
  }
  for (const [name, heading] of Object.entries(SECTIONS)) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const next = withoutSection(text, heading);
    if (next === text) continue;
    fs.writeFileSync(file, next);
    removed.push(`${name}, section "${heading}"`);
  }
  const manifest = path.join(root, "package.json");
  if (fs.existsSync(manifest)) {
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (pkg.scripts?.[SCRIPT_NAME] !== undefined) {
      pkg.scripts = Object.fromEntries(
        Object.entries(pkg.scripts).filter(([name]) => name !== SCRIPT_NAME),
      );
      fs.writeFileSync(manifest, `${JSON.stringify(pkg, null, 2)}\n`);
      removed.push(`package.json, script "${SCRIPT_NAME}"`);
    }
  }
  return removed;
}

await runAsEntry(import.meta.url, SCRIPT_NAME, () => {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--force"))
    throw new AuthorError(USAGE);
  const removed = detach(process.cwd(), args[0] === "--force");
  if (removed.length === 0) {
    console.log("Nothing to remove: the Template maintenance is gone already.");
    return;
  }
  console.log(
    `Removed the Template maintenance:\n${removed.map((r) => `- ${r}`).join("\n")}`,
  );
});
