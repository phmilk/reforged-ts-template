// The editor configs leave a map folder to the World Editor wherever it
// lives and whatever it is named, as `.gitattributes` does (ADR 0020 of
// phmilk/reforged-ts): `.editorconfig` unsets its whitespace rules, the
// workspace settings keep it read-only and out of the Lua language server,
// and ESLint (which runs Prettier) ignores it.
import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import * as ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { escapeRegExp, MAP_FOLDERS, ROOT } from "./helpers.ts";

/** A file of a map folder, the Template's and elsewhere, as either suffix. */
const MAP_FILES = MAP_FOLDERS.map((folder) => `${folder}/war3map.lua`);

/** A file outside any map folder, which every config keeps to its rules. */
const SOURCE_FILE = "src/main.ts";

const read = (file: string): string =>
  fs.readFileSync(path.join(ROOT, file), "utf8");

/**
 * Whether `file` (relative to the root) matches the `.editorconfig` section
 * `glob`: a glob with a `/` is relative to the file's folder, `**` crosses
 * folders, `*` does not, `{a,b}` is either.
 */
function editorconfigMatches(glob: string, file: string): boolean {
  const pattern = glob
    .split(/(\*\*|\*|\{[^}]*\})/)
    .map((token) =>
      token === "**"
        ? ".*"
        : token === "*"
          ? "[^/]*"
          : token.startsWith("{")
            ? `(${token.slice(1, -1).split(",").map(escapeRegExp).join("|")})`
            : escapeRegExp(token),
    )
    .join("");
  const anchored = glob.includes("/") ? `^${pattern}$` : `(^|/)${pattern}$`;
  return new RegExp(anchored).test(file);
}

/**
 * The `charset` `.editorconfig` gives `file`: that of the last section that
 * matches it and sets one, since a later section wins over an earlier one.
 */
function editorconfigCharset(file: string): string | undefined {
  let section: string | undefined;
  let charset: string | undefined;
  for (const line of read(".editorconfig").split("\n")) {
    const header = /^\[(.+)\]$/.exec(line.trim());
    if (header !== null) section = header[1];
    const value = /^charset\s*=\s*(\S+)$/.exec(line.trim());
    if (
      value !== null &&
      section !== undefined &&
      editorconfigMatches(section, file)
    )
      charset = value[1];
  }
  return charset;
}

interface Settings {
  "files.readonlyInclude": Record<string, boolean>;
  "Lua.workspace.ignoreDir": string[];
}

/** The workspace settings, a JSON with comments. */
const settings = ts.parseConfigFileTextToJson(
  ".vscode/settings.json",
  read(".vscode/settings.json"),
).config as Settings;

const isReadonly = (file: string): boolean =>
  Object.entries(settings["files.readonlyInclude"]).some(
    ([glob, on]) => on && path.matchesGlob(file, glob),
  );

/** Whether a folder of `file` is one the Lua language server ignores: a name without `/` matches a folder anywhere, as in `.gitignore`. */
const isLuaIgnored = (file: string): boolean =>
  file
    .split("/")
    .slice(0, -1)
    .some((folder) =>
      settings["Lua.workspace.ignoreDir"].some(
        (glob) => !glob.includes("/") && path.matchesGlob(folder, glob),
      ),
    );

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

describe("the editor configs", () => {
  it.each(MAP_FILES)(
    ".editorconfig leaves %s as the World Editor wrote it",
    (file) => {
      expect(editorconfigCharset(file)).toBe("unset");
    },
  );

  it.each(MAP_FILES)("the workspace settings keep %s read-only", (file) => {
    expect(isReadonly(file)).toBe(true);
  });

  it.each(MAP_FILES)("the Lua language server ignores %s", (file) => {
    expect(isLuaIgnored(file)).toBe(true);
  });

  it.each(MAP_FILES)(
    "ESLint, and Prettier through it, ignore %s",
    async (file) => {
      expect(await eslint.isPathIgnored(path.join(ROOT, file))).toBe(true);
    },
  );

  it("keep a source file outside a map folder to their rules", async () => {
    expect(editorconfigCharset(SOURCE_FILE)).toBe("utf-8");
    expect(isReadonly(SOURCE_FILE)).toBe(false);
    expect(isLuaIgnored(SOURCE_FILE)).toBe(false);
    expect(await eslint.isPathIgnored(path.join(ROOT, SOURCE_FILE))).toBe(
      false,
    );
  });
});
