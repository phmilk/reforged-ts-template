// The sync: applies a reforged-ts release to the Template's files. The
// library's release workflow dispatches a payload (the released versions,
// the tag and three URLs) to the Template's sync workflow, which runs this
// script, builds, checks and opens a pull request with its summary.
// Template maintenance: a generated Map project deletes it (see AGENTS.md).
import fs from "node:fs";
import path from "node:path";
import { runAsEntry } from "./cli.ts";
import { AuthorError } from "./errors.ts";

/** The library packages the Template depends on, bumped to each release. */
export const SYNCED_PACKAGES = [
  "reforged-ts",
  "reforged-types",
  "reforged-test",
  "eslint-plugin-reforged",
] as const;

export type SyncedPackage = (typeof SYNCED_PACKAGES)[number];

/**
 * The map-author terms of the library's glossary the Template's CONTEXT.md
 * carries (phmilk/reforged-ts#21); the others are the library's own.
 */
export const LIBRARY_TERMS = [
  "Native",
  "Handle",
  "Wrapper",
  "System",
  "Init stage",
  "Event descriptor",
  "Subscription",
  "Map project",
  "Template",
  "Toolchain",
  "Patch",
] as const;

/** The files the sync rewrites, relative to the repository root. */
export const SYNCED_FILES = [
  "package.json",
  "CONTEXT.md",
  "AGENTS.md",
  "README.md",
] as const;

export type SyncedFile = (typeof SYNCED_FILES)[number];

/** The content of each synced file. */
export type SyncFiles = Record<SyncedFile, string>;

/** What the library's release sends: the Template computes none of it. */
export interface ReleasePayload {
  /** The release's git tag in the library repository. */
  tag: string;
  /** The released version of each package, without a range operator. */
  versions: Record<SyncedPackage, string>;
  /** The raw URL of the library's CONTEXT.md at the tag. */
  contextUrl: string;
  /** The raw URL of the generated compatibility-matrix Markdown block. */
  matrixUrl: string;
  /** The llms.txt of the docs version cut for the release. */
  llmsUrl: string;
}

/** The content of the payload's two raw URLs. */
export interface FetchedSources {
  /** The library's CONTEXT.md. */
  context: string;
  /** The compatibility-matrix block. */
  matrix: string;
}

export interface SyncResult {
  /** Every synced file, changed or not. */
  files: SyncFiles;
  /** The files whose content changed, in `SYNCED_FILES` order. */
  changed: SyncedFile[];
  /** The change summary, Markdown: the sync pull request's body. */
  summary: string;
}

/** Fetches a URL's body as text; throws when it cannot. */
export type FetchText = (url: string) => Promise<string>;

/** The heading the library terms sit under, inside the CONTEXT.md block. */
const TERMS_HEADING = "## Library terms";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** An llms.txt link target in Markdown: `](<url>/llms.txt)`. */
const LLMS_LINK = /\]\(https?:\/\/[^\s)]+\/llms\.txt\)/g;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The payload of a `reforged-ts-release` dispatch, checked. A missing or
 * malformed field is an AuthorError naming it.
 */
export function parsePayload(value: unknown): ReleasePayload {
  if (!isRecord(value))
    throw new AuthorError("the payload is not a JSON object.");
  const text = (field: string): string => {
    const found = value[field];
    if (typeof found !== "string" || found.trim() === "")
      throw new AuthorError(`the payload has no \`${field}\`.`);
    return found;
  };
  const url = (field: string): string => {
    const found = text(field);
    if (!/^https:\/\/[^\s)]+$/.test(found))
      throw new AuthorError(
        `the payload's \`${field}\` is not an https URL: ${found}`,
      );
    return found;
  };
  const versions = value.versions;
  if (!isRecord(versions))
    throw new AuthorError("the payload has no `versions` object.");
  const parsed = Object.fromEntries(
    SYNCED_PACKAGES.map((name) => {
      const version = versions[name];
      if (typeof version !== "string" || !SEMVER.test(version))
        throw new AuthorError(
          `the payload's \`versions\` has no version of ${name}, as x.y.z: ${String(version)}`,
        );
      return [name, version];
    }),
  ) as Record<SyncedPackage, string>;
  const llmsUrl = url("llmsUrl");
  if (!llmsUrl.endsWith("/llms.txt"))
    throw new AuthorError(
      `the payload's \`llmsUrl\` does not end in /llms.txt: ${llmsUrl}`,
    );
  return {
    tag: text("tag"),
    versions: parsed,
    contextUrl: url("contextUrl"),
    matrixUrl: url("matrixUrl"),
    llmsUrl,
  };
}

/** Why a file is left unchanged: one sentence, for the summary. */
class Skipped extends Error {
  override name = "Skipped";
}

const startMarker = (name: string) => `<!-- reforged-ts:${name}:start -->`;
const endMarker = (name: string) => `<!-- reforged-ts:${name}:end -->`;

/**
 * `text` (LF) with the block between the `name` markers replaced by
 * `replace(block)`, written in the shape Prettier keeps: a blank line, the
 * content, a blank line. Each marker must appear once, on a line of its own,
 * the start before the end; otherwise the file is skipped.
 */
function replaceBlock(
  text: string,
  name: string,
  replace: (block: string) => string,
): string {
  const start = startMarker(name);
  const end = endMarker(name);
  const lines = text.split("\n");
  for (const marker of [start, end]) {
    const count = text.split(marker).length - 1;
    if (count === 0) throw new Skipped(`the marker \`${marker}\` is missing.`);
    if (count > 1)
      throw new Skipped(
        `the marker \`${marker}\` appears ${String(count)} times.`,
      );
    if (!lines.includes(marker))
      throw new Skipped(
        `the marker \`${marker}\` is not on a line of its own.`,
      );
  }
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end);
  if (to < from)
    throw new Skipped(`the marker \`${end}\` comes before \`${start}\`.`);
  const content = replace(text.slice(from, to)).trim();
  return `${text.slice(0, from)}\n\n${content}\n\n${text.slice(to)}`;
}

/**
 * The entries of the library's CONTEXT.md for the `LIBRARY_TERMS`, in the
 * library file's order. An entry is a paragraph whose first line is
 * `**<term>**:`. A term the file lacks is an AuthorError naming it: the sync
 * never drops a term silently.
 */
function libraryTerms(context: string): string[] {
  const entries = new Map<string, string>();
  for (const paragraph of context.split(/\n[ \t]*\n/)) {
    const entry = paragraph.trim();
    const term = /^\*\*(.+?)\*\*:\n/.exec(entry)?.[1];
    if (term !== undefined && !entries.has(term)) entries.set(term, entry);
  }
  const wanted = new Set<string>(LIBRARY_TERMS);
  const missing = LIBRARY_TERMS.filter((term) => !entries.has(term));
  if (missing.length > 0)
    throw new AuthorError(
      `the library's CONTEXT.md defines no ${missing.map((term) => `**${term}**`).join(", ")}, which the Template's CONTEXT.md carries (LIBRARY_TERMS in scripts/sync.ts).`,
    );
  return [...entries].filter(([term]) => wanted.has(term)).map(([, e]) => e);
}

/** package.json with each package's range set to `^<version>`, wherever it is a dependency. */
function bumpDependencies(
  text: string,
  versions: Record<SyncedPackage, string>,
): string {
  const manifest = JSON.parse(text) as Record<string, unknown>;
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ].map((key) => manifest[key]);
  const missing = SYNCED_PACKAGES.filter(
    (name) =>
      !sections.some(
        (section) => isRecord(section) && typeof section[name] === "string",
      ),
  );
  if (missing.length > 0)
    throw new Skipped(`no dependency on ${missing.join(", ")}.`);
  let bumped = text;
  for (const name of SYNCED_PACKAGES) {
    bumped = bumped.replace(
      new RegExp(`("${name}"\\s*:\\s*)"[^"]*"`, "g"),
      (_, key: string) => `${key}"^${versions[name]}"`,
    );
  }
  return bumped;
}

/** Replaces every llms.txt link of the `docs` block; a block without one is skipped. */
function replaceLlmsLink(text: string, llmsUrl: string): string {
  return replaceBlock(text, "docs", (block) => {
    if (block.match(LLMS_LINK) === null)
      throw new Skipped(
        `no llms.txt link between the \`${startMarker("docs")}\` markers.`,
      );
    return block.replaceAll(LLMS_LINK, `](${llmsUrl})`);
  });
}

/**
 * The sync's entry point: the synced files' current content, the payload
 * and the fetched sources in; the new content and a change summary out.
 * `package.json` gets caret ranges on the four released versions; between
 * their markers, CONTEXT.md gets the library terms, AGENTS.md and the README
 * the llms.txt link, the README the compatibility matrix. Nothing else
 * changes. A file whose markers are missing or broken comes back unchanged
 * and is named in the summary. Applying the result again with the same
 * payload changes nothing.
 */
export function applyRelease(
  files: SyncFiles,
  payload: ReleasePayload,
  sources: FetchedSources,
): SyncResult {
  const terms = libraryTerms(sources.context.replaceAll("\r\n", "\n"));
  const matrix = sources.matrix.replaceAll("\r\n", "\n").trim();
  if (matrix === "")
    throw new AuthorError(`the matrix block at ${payload.matrixUrl} is empty.`);

  const edits: Record<SyncedFile, (text: string) => string> = {
    "package.json": (text) => bumpDependencies(text, payload.versions),
    "CONTEXT.md": (text) =>
      replaceBlock(text, "terms", () => [TERMS_HEADING, ...terms].join("\n\n")),
    "AGENTS.md": (text) => replaceLlmsLink(text, payload.llmsUrl),
    "README.md": (text) =>
      replaceLlmsLink(
        replaceBlock(text, "matrix", () => matrix),
        payload.llmsUrl,
      ),
  };
  const what: Record<SyncedFile, string> = {
    "package.json": SYNCED_PACKAGES.map(
      (name) => `\`${name}\` ^${payload.versions[name]}`,
    ).join(", "),
    "CONTEXT.md": `the library terms, from ${payload.contextUrl}`,
    "AGENTS.md": `the llms.txt link, ${payload.llmsUrl}`,
    "README.md": `the compatibility matrix, from ${payload.matrixUrl}; the llms.txt link, ${payload.llmsUrl}`,
  };

  const result = { ...files };
  const changed: SyncedFile[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  for (const file of SYNCED_FILES) {
    const original = files[file];
    const crlf = original.includes("\r\n");
    try {
      const updated = edits[file](original.replaceAll("\r\n", "\n"));
      result[file] = crlf ? updated.replaceAll("\n", "\r\n") : updated;
    } catch (error) {
      if (!(error instanceof Skipped)) throw error;
      skipped.push(`- \`${file}\`: ${error.message} Left unchanged.`);
      continue;
    }
    if (result[file] === original) unchanged.push(`- \`${file}\``);
    else changed.push(file);
  }

  const section = (title: string, lines: string[]) =>
    lines.length === 0 ? [] : ["", title, "", ...lines];
  const summary = [
    `Applies the reforged-ts release \`${payload.tag}\` to the Template.`,
    ...section(
      "Changed:",
      changed.map((file) => `- \`${file}\`: ${what[file]}`),
    ),
    ...section("Already up to date:", unchanged),
    ...section("Not synced, to fix by hand:", skipped),
    "",
  ].join("\n");
  return { files: result, changed, summary };
}

/** The payload's URL, fetched with the global fetch; a non-2xx status throws. */
const fetchOverHttp: FetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok)
    throw new AuthorError(
      `GET ${url} answered ${String(response.status)} ${response.statusText}.`,
    );
  return response.text();
};

/**
 * Applies the release to the repository at `root`: reads the synced files,
 * fetches the payload's CONTEXT.md and matrix URLs with `fetchText`, and
 * writes the files that changed. A failed fetch writes nothing.
 */
export async function syncRepository(
  root: string,
  payload: ReleasePayload,
  fetchText: FetchText = fetchOverHttp,
): Promise<SyncResult> {
  const files = Object.fromEntries(
    SYNCED_FILES.map((file) => [
      file,
      fs.readFileSync(path.join(root, file), "utf8"),
    ]),
  ) as SyncFiles;
  const [context, matrix] = await Promise.all([
    fetchText(payload.contextUrl),
    fetchText(payload.matrixUrl),
  ]);
  const result = applyRelease(files, payload, { context, matrix });
  for (const file of result.changed)
    fs.writeFileSync(path.join(root, file), result.files[file]);
  return result;
}

const USAGE = "Usage: node scripts/sync.ts <payload.json> [--summary <file>]";

/**
 * Command line: `node scripts/sync.ts <payload.json> [--summary <file>]`, run
 * from the repository root by the sync workflow. Reads the dispatch payload
 * from the JSON file, syncs, prints the summary and, with `--summary`, also
 * writes it to that file (the pull request's body).
 */
await runAsEntry(import.meta.url, "sync", async () => {
  const args = process.argv.slice(2);
  const summaryAt = args.indexOf("--summary");
  const summaryFile = summaryAt === -1 ? undefined : args[summaryAt + 1];
  const rest =
    summaryAt === -1
      ? args
      : args.filter((_, i) => i !== summaryAt && i !== summaryAt + 1);
  if (
    rest.length !== 1 ||
    rest[0].startsWith("-") ||
    (summaryAt !== -1 && (summaryFile === undefined || summaryFile === ""))
  )
    throw new AuthorError(USAGE);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(rest[0], "utf8"));
  } catch (error) {
    throw new AuthorError(
      `cannot read the payload ${rest[0]}: ${(error as Error).message}`,
    );
  }
  const result = await syncRepository(process.cwd(), parsePayload(raw));
  if (summaryFile !== undefined) fs.writeFileSync(summaryFile, result.summary);
  console.log(result.summary);
});
