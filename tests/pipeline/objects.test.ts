import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import * as prettier from "prettier";
import { objectDataText } from "reforged-map";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  loadObjectsConfig,
  type ExecutableProbe,
  type ObjectsConfig,
} from "../../scripts/config.ts";
import { AuthorError } from "../../scripts/errors.ts";
import { generate } from "../../scripts/generate.ts";
import {
  adoptObjectsIntoCode,
  parseObjectsCommandLine,
  releaseObjectsToMap,
  syncObjects,
  syncReportLines,
  type WorldEditorSeams,
} from "../../scripts/objects.ts";
import {
  copyProject,
  FIXTURE_OBJECTS_MAP,
  hashTree,
  makeTempDir,
  MAP_FOLDER,
  ROOT,
  runScript,
} from "./helpers.ts";

/** No World Editor window: the check reads no title, on any system. */
const NO_WINDOW: WorldEditorSeams = {
  worldEditorCheck: { readWindowTitles: () => [] },
};

/** A machine with no game: `findWorldEditor` finds nothing. */
const NO_GAME: ExecutableProbe = {
  platform: "linux",
  env: {},
  exists: () => false,
};

/** A Custom unit, the Sergeant, derived from the Footman: a definition file's text. */
const SERGEANT = `import { defineUnit } from "reforged-map/objects";

export const Sergeant = defineUnit({
  rawcode: "h002",
  base: FourCC("hfoo"),
  fields: { unam: "Sergeant", uhpm: 520 },
});
`;

/**
 * A `copyProject()` copy whose map folder holds `FIXTURE_OBJECTS_MAP` (the
 * Custom unit Captain at `h000`, among others), with its generated files
 * written from it.
 */
async function objectsProject(
  probe: ExecutableProbe = NO_GAME,
): Promise<{ project: string; config: ObjectsConfig }> {
  const project = copyProject();
  const mapFolder = path.join(project, MAP_FOLDER);
  fs.rmSync(mapFolder, { recursive: true });
  fs.cpSync(FIXTURE_OBJECTS_MAP, mapFolder, { recursive: true });
  const config = await loadObjectsConfig(
    path.join(project, "reforged.config.ts"),
    [],
    probe,
  );
  generate(config, undefined, () => undefined);
  return { project, config };
}

/** Writes a definition file under the copy's `src/objects/`. */
function writeDefinition(project: string, name: string, text: string): string {
  const file = path.join(project, "src", "objects", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** The units file of a map folder as `textconv` shows it. */
const unitsText = (mapFolder: string): string =>
  objectDataText(
    new Uint8Array(fs.readFileSync(path.join(mapFolder, "war3map.w3u"))),
    "war3map.w3u",
  );

const manifestOf = (config: ObjectsConfig): string =>
  fs.readFileSync(config.objectManifest, "utf8");

describe("parseObjectsCommandLine", () => {
  it("reads the command, the Rawcodes, --all and --force", () => {
    expect(parseObjectsCommandLine(["sync"])).toEqual({
      command: "sync",
      rawcodes: [],
      force: false,
    });
    expect(parseObjectsCommandLine(["sync", "--force"])).toEqual({
      command: "sync",
      rawcodes: [],
      force: true,
    });
    expect(parseObjectsCommandLine(["adopt", "h000", "buff:B000"])).toEqual({
      command: "adopt",
      rawcodes: ["h000", "buff:B000"],
      force: false,
    });
    expect(parseObjectsCommandLine(["adopt", "--all"])).toEqual({
      command: "adopt",
      rawcodes: "all",
      force: false,
    });
    expect(parseObjectsCommandLine(["release", "h000", "--force"])).toEqual({
      command: "release",
      rawcodes: ["h000"],
      force: true,
    });
  });

  it("refuses an unknown command, a missing Rawcode, --all outside adopt, and an unknown flag", () => {
    for (const argv of [
      [],
      ["merge"],
      ["adopt"],
      ["release"],
      ["release", "--all"],
      ["adopt", "--all", "h000"],
      ["sync", "h000"],
      ["sync", "--dry-run"],
    ])
      expect(() => parseObjectsCommandLine(argv), argv.join(" ")).toThrow(
        AuthorError,
      );
  });
});

describe("pnpm objects:sync", () => {
  it("writes a definition into the map folder and the manifest, then writes nothing on a second sync", async () => {
    const { project, config } = await objectsProject();
    writeDefinition(project, "units.ts", SERGEANT);

    const report = syncObjects(config, NO_WINDOW);
    expect(report.added.map((object) => object.rawcode)).toEqual(["h002"]);
    expect(report.written).toContain("war3map.w3u");
    expect(report.manifestWritten).toBe(true);
    expect(unitsText(config.mapFolder)).toContain("custom h002 from hfoo");
    expect(manifestOf(config)).toContain('"rawcode": "h002"');
    expect(syncReportLines(config, report)).toContain(
      "Added unit h002 (src/objects/units.ts)",
    );

    const map = hashTree(config.mapFolder);
    const manifest = manifestOf(config);
    const again = syncObjects(config, NO_WINDOW);
    expect(again.written).toEqual([]);
    expect(again.manifestWritten).toBe(false);
    expect(hashTree(config.mapFolder)).toEqual(map);
    expect(manifestOf(config)).toBe(manifest);
    expect(syncReportLines(config, again)).toEqual([
      "Object sync: 1 defined, nothing to write: the map folder holds every definition.",
    ]);
  });

  it("exits non-zero with the report on a refusal, writing nothing", async () => {
    const { project, config } = await objectsProject();
    // h000 is the map folder's Captain, which the code does not own: a collision.
    writeDefinition(
      project,
      "captain.ts",
      SERGEANT.replace('"h002"', '"h000"'),
    );
    const map = hashTree(config.mapFolder);

    const result = runScript(project, "scripts/objects.ts", ["sync"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^objects:sync failed: /m);
    expect(result.stderr).toContain("h000");
    expect(result.stderr).toContain("objects:adopt");
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(hashTree(config.mapFolder)).toEqual(map);
    expect(fs.existsSync(config.objectManifest)).toBe(false);
  });

  it("reloads a World Editor holding the map with World Editor.exe beside the game, -launch -loadfile", async () => {
    // A game the discovery of pnpm test:map finds (WC3_EXECUTABLE), with the World Editor beside it.
    const install = makeTempDir();
    const game = path.join(install, "Warcraft III.exe");
    const editor = path.join(install, "World Editor.exe");
    for (const file of [game, editor]) fs.writeFileSync(file, "");
    const { project, config } = await objectsProject({
      platform: process.platform,
      env: { WC3_EXECUTABLE: game },
      exists: (file) =>
        fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false,
    });
    expect(config.worldEditorExecutable).toBe(editor);
    writeDefinition(project, "units.ts", SERGEANT);
    const launched: [string, readonly string[]][] = [];

    const report = syncObjects(config, {
      worldEditorCheck: {
        readWindowTitles: () => [
          `Warcraft III World Editor - [${config.mapFolder}]`,
        ],
      },
      worldEditorReload: {
        system: "windows",
        launch: (executable, args) => launched.push([executable, args]),
      },
    });

    expect(report.worldEditor).toBe("open");
    expect(report.worldEditorReloaded).toBe(true);
    expect(launched).toEqual([
      [editor, ["-launch", "-loadfile", path.resolve(config.mapFolder)]],
    ]);
    expect(syncReportLines(config, report)).toContain(
      "Reloaded the map in the World Editor.",
    );
  });

  it("warns to reload by hand when the game is not found", async () => {
    const { project, config } = await objectsProject();
    expect(config.worldEditorExecutable).toBeUndefined();
    writeDefinition(project, "units.ts", SERGEANT);

    const report = syncObjects(config, {
      worldEditorCheck: {
        readWindowTitles: () => [
          `Warcraft III World Editor - [${config.mapFolder}]`,
        ],
      },
    });

    expect(report.worldEditorReloaded).toBe(false);
    expect(report.warnings.join("\n")).toMatch(/reload/i);
  });
});

/** Type-checks the copy's Object definitions with its tsconfig.objects.json: the diagnostics' text. */
function typecheckObjects(project: string): string[] {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(project, "tsconfig.objects.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        );
      },
    },
  );
  if (parsed === undefined)
    throw new Error("tsconfig.objects.json did not parse");
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

describe("pnpm objects:adopt", () => {
  it(
    "writes a formatted definition file that passes lint and the type check, and leaves the map folder as it was",
    { timeout: 180_000 },
    async () => {
      const { project, config } = await objectsProject();
      const map = hashTree(config.mapFolder);

      const report = await adoptObjectsIntoCode(config, ["h000"], NO_WINDOW);

      const file = path.join(
        project,
        "src",
        "objects",
        "unit",
        "Captain_h000.ts",
      );
      expect(report.files).toEqual([file]);
      const text = fs.readFileSync(file, "utf8");
      expect(text).toContain('rawcode: "h000"');
      expect(
        await prettier.check(text, {
          ...((await prettier.resolveConfig(file)) ?? {}),
          filepath: file,
        }),
      ).toBe(true);
      expect(hashTree(config.mapFolder)).toEqual(map);
      expect(manifestOf(config)).toContain('"rawcode": "h000"');

      const [lint] = await new ESLint({ cwd: project }).lintFiles([file]);
      expect(lint.messages).toEqual([]);
      expect(typecheckObjects(project)).toEqual([]);

      // Adopted as the map folder holds it: the next sync writes no byte.
      const sync = syncObjects(config, NO_WINDOW);
      expect(sync.written).toEqual([]);
      expect(sync.manifestWritten).toBe(false);
    },
  );
});

describe("pnpm objects:release", () => {
  it("puts the object back in the map folder as the code last defined it, and deletes its definition", async () => {
    const { project, config } = await objectsProject();
    const file = writeDefinition(project, "unit/Sergeant_h002.ts", SERGEANT);
    syncObjects(config, NO_WINDOW);

    const report = releaseObjectsToMap(config, ["h002"], NO_WINDOW);

    expect(report.released.map((object) => object.rawcode)).toEqual(["h002"]);
    expect(report.deleted).toEqual([file]);
    expect(fs.existsSync(file)).toBe(false);
    expect(unitsText(config.mapFolder)).toContain("custom h002 from hfoo");
    expect(
      fs.existsSync(config.objectManifest) ? manifestOf(config) : "",
    ).not.toContain('"h002"');
    // The map folder owns it now: a sync leaves it alone.
    const map = hashTree(config.mapFolder);
    expect(syncObjects(config, NO_WINDOW).written).toEqual([]);
    expect(hashTree(config.mapFolder)).toEqual(map);
  });
});

describe("the type check of src/objects/", () => {
  it("is a project of its own that pnpm typecheck runs, and fails a definition with a wrong field value", async () => {
    const scripts = (
      JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    expect(scripts.typecheck).toContain("tsc -p tsconfig.objects.json");

    const { project } = await objectsProject();
    writeDefinition(project, "units.ts", SERGEANT);
    expect(typecheckObjects(project)).toEqual([]);
    writeDefinition(
      project,
      "units.ts",
      SERGEANT.replace("uhpm: 520", 'uhpm: "many"'),
    );
    expect(typecheckObjects(project)).toEqual([
      "Type 'string' is not assignable to type 'number'.",
    ]);
  });

  it("is left out of the map's program and of the Lua tests' program", () => {
    for (const tsconfig of ["tsconfig.json", "tests/lua/tsconfig.json"]) {
      const parsed = ts.getParsedCommandLineOfConfigFile(
        path.join(ROOT, tsconfig),
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: () => {
            throw new Error(`${tsconfig} did not parse`);
          },
        },
      );
      const objects = path
        .join(ROOT, "src", "objects")
        .split(path.sep)
        .join("/");
      expect(
        parsed?.fileNames.filter((file) => file.startsWith(objects)),
        tsconfig,
      ).toEqual([]);
      expect(parsed?.raw, tsconfig).toHaveProperty("exclude");
    }
  });
});
