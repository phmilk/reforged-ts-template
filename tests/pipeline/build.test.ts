import fs from "node:fs";
import path from "node:path";
import { objectDataText } from "reforged-map";
import { describe, expect, it } from "vitest";
import { openArchive } from "../../scripts/pack.ts";
import {
  COPY_VERSION,
  copyProject,
  defaultArchiveName,
  ENTRY_MODULE,
  escapeRegExp,
  FIXTURE_OBJECTS_MAP,
  hashTree,
  makeTempDir,
  MAP_FOLDER,
  MAP_FOLDER_NAME,
  runScript,
  setPackageVersion,
  sha256,
} from "./helpers.ts";

/** The archive a dev build packs: the map folder's name, the version, `-dev`. */
const ARCHIVE = path.join("dist", defaultArchiveName("dev", COPY_VERSION));
/** The archive a release build packs: no `-dev`. */
const RELEASE_ARCHIVE = path.join(
  "dist",
  defaultArchiveName("release", COPY_VERSION),
);
const ENV = path.join("src", "generated", "env.ts");

/** The map script inside `archive`; fails the test when it has none. */
function scriptOf(archive: Uint8Array): Uint8Array {
  const script = openArchive(archive).get("war3map.lua");
  if (!script) throw new Error("The archive has no war3map.lua.");
  return new Uint8Array(script.bytes());
}

/** The map script inside the built archive (`ARCHIVE` unless given), as text. */
const archivedScript = (project: string, archive = ARCHIVE): string =>
  Buffer.from(
    scriptOf(new Uint8Array(fs.readFileSync(path.join(project, archive)))),
  ).toString("utf8");

/** Points the copy's tsconfig `tstl.luaBundle` at `file` (relative to the tsconfig). */
function setLuaBundle(project: string, file: string): void {
  const tsconfig = path.join(project, "tsconfig.json");
  const text = fs.readFileSync(tsconfig, "utf8");
  expect(text).toContain('"luaBundle": "dist/bundle.lua"');
  fs.writeFileSync(
    tsconfig,
    text.replace(
      '"luaBundle": "dist/bundle.lua"',
      `"luaBundle": ${JSON.stringify(file)}`,
    ),
  );
}

/** The entry's module in the composed script, from its first line to its `return`. */
function entryModule(script: string): string {
  const start = script.indexOf('["main"] = function(...)');
  expect(start).toBeGreaterThan(-1);
  return script.slice(start, script.indexOf("return ____exports", start));
}

describe("node scripts/build.ts (pnpm build)", () => {
  it("packs the map folder and the entry into an archive named after the map folder, the version and -dev", () => {
    const project = copyProject();
    const mapBefore = hashTree(path.join(project, MAP_FOLDER));
    const tsconfigBefore = sha256(
      fs.readFileSync(path.join(project, "tsconfig.json")),
    );

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const archive = new Uint8Array(
      fs.readFileSync(path.join(project, ARCHIVE)),
    );
    expect(result.stdout).toContain(
      `Built ${ARCHIVE} (${String(archive.byteLength)} bytes, mode dev)`,
    );

    // The archive's script is the editor's script, one newline, then the bundle.
    const editorScript = fs.readFileSync(
      path.join(project, MAP_FOLDER, "war3map.lua"),
    );
    const bundle = fs.readFileSync(path.join(project, "dist", "bundle.lua"));
    expect(scriptOf(archive)).toEqual(
      new Uint8Array([...editorScript, 0x0a, ...bundle]),
    );
    expect(bundle.toString("utf8")).toContain(ENTRY_MODULE);

    // Nothing written into the map folder (so no percent character introduced there); tsconfig untouched.
    expect(hashTree(path.join(project, MAP_FOLDER))).toEqual(mapBefore);
    expect(sha256(fs.readFileSync(path.join(project, "tsconfig.json")))).toBe(
      tsconfigBefore,
    );
  });

  it("in GitHub Actions, sets the step output `archive` to the versioned archive's path", () => {
    const project = copyProject();
    const outputs = path.join(makeTempDir(), "github-output");

    const result = runScript(
      project,
      "scripts/build.ts",
      ["--mode", "release"],
      {
        GITHUB_OUTPUT: outputs,
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(fs.readFileSync(outputs, "utf8")).toBe(
      `archive=${RELEASE_ARCHIVE.split(path.sep).join("/")}\n`,
    );
  });

  it("names the archive without a version when package.json has none", () => {
    const project = copyProject();
    setPackageVersion(project, undefined);

    const dev = runScript(project, "scripts/build.ts");
    expect(dev.status).toBe(0);
    expect(dev.stderr).toBe("");
    expect(dev.stdout).toContain(
      `Built ${path.join("dist", defaultArchiveName("dev", undefined))} (`,
    );
    const release = runScript(project, "scripts/build.ts", [
      "--mode",
      "release",
    ]);
    expect(release.status).toBe(0);
    expect(release.stderr).toBe("");
    expect(release.stdout).toContain(
      `Built ${path.join("dist", defaultArchiveName("release", undefined))} (`,
    );
    expect(fs.readdirSync(path.join(project, "dist"))).toContain(
      defaultArchiveName("release", undefined),
    );
  });

  it("in GitHub Actions, sets the step output `archive` to the configured archive's path", () => {
    const project = copyProject();
    const configFile = path.join(project, "reforged.config.ts");
    fs.writeFileSync(
      configFile,
      fs
        .readFileSync(configFile, "utf8")
        .replace(
          'outputFolder: "dist",',
          'outputFolder: "out",\n  archiveName: "packed.w3x",',
        ),
    );
    setLuaBundle(project, "out/bundle.lua");
    const outputs = path.join(makeTempDir(), "github-output");
    fs.writeFileSync(outputs, "earlier=step\n");

    const result = runScript(project, "scripts/build.ts", [], {
      GITHUB_OUTPUT: outputs,
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(project, "out", "packed.w3x"))).toBe(true);
    expect(fs.readFileSync(outputs, "utf8")).toBe(
      "earlier=step\narchive=out/packed.w3x\n",
    );
  });

  it("generates the env file with dev mode on and calls Reforged.configure with it first", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, "src", "generated"), {
      recursive: true,
      force: true,
    });
    // A map module imported only for its side effects, its name hyphenated as
    // map files often are: its bare require must not count as the entry's
    // first statement.
    fs.writeFileSync(
      path.join(project, "src", "welcome-message.ts"),
      'import { Init } from "reforged-ts";\n\nInit.onGameStart(() => {\n  print("welcome");\n});\n',
    );
    const main = path.join(project, "src", "main.ts");
    fs.writeFileSync(
      main,
      'import "./welcome-message";\n' + fs.readFileSync(main, "utf8"),
    );

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain(
      "export const devMode: boolean = true;",
    );
    const script = archivedScript(project);
    expect(script).toContain(
      '["generated.env"] = function(...) \nlocal ____exports = {}\n',
    );
    expect(script).toMatch(
      /\["generated\.env"\][^]*?____exports\.devMode = true\n/,
    );
    // After the imports' requires (bound or bare, for side effects), the
    // entry's first statement is the configure call. An import's module top
    // level still runs before it, as imports do: that code only registers Init
    // stages, which run after configure.
    const lines = entryModule(script).split("\n").slice(2);
    expect(lines).toContain('require("welcome-message")');
    const statements = lines.filter(
      (line) =>
        line !== "" &&
        !/^local \w+ = (require\(|____)/.test(line) &&
        !/^require\(".*"\)$/.test(line),
    );
    expect(statements[0]).toBe("Reforged:configure({devMode = devMode})");
  });

  it("with --mode release, differs from the dev build only in the env file's value", () => {
    const project = copyProject();
    expect(runScript(project, "scripts/build.ts").status).toBe(0);
    const devScript = archivedScript(project);

    const result = runScript(project, "scripts/build.ts", [
      "--mode",
      "release",
    ]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Built ${RELEASE_ARCHIVE} (`);
    expect(result.stdout).toContain("mode release");
    // The build cleans the output folder: the dev archive is gone.
    expect(fs.existsSync(path.join(project, ARCHIVE))).toBe(false);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain(
      "export const devMode: boolean = false;",
    );
    const releaseScript = archivedScript(project, RELEASE_ARCHIVE);
    expect(releaseScript).toMatch(
      /\["generated\.env"\][^]*?____exports\.devMode = false\n/,
    );
    expect(
      releaseScript.replace(
        "____exports.devMode = false",
        "____exports.devMode = true",
      ),
    ).toBe(devScript);
  });

  it("refuses an invalid --mode with exit 1 before touching the output folder", () => {
    const project = copyProject();

    const result = runScript(project, "scripts/build.ts", [
      "--mode",
      "shipping",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Build failed: --mode must be dev or release, got "shipping".',
    );
    expect(fs.existsSync(path.join(project, "dist"))).toBe(false);
  });

  it("fails with a clear message and exit 1 when the map folder has no war3map.lua, before touching the output folder", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, MAP_FOLDER, "war3map.lua"));
    fs.mkdirSync(path.join(project, "dist"));
    fs.writeFileSync(path.join(project, "dist", "keep.txt"), "previous build");

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `${MAP_FOLDER_NAME} has no war3map.lua: the map was not saved with Lua as the script language`,
    );
    expect(fs.existsSync(path.join(project, ARCHIVE))).toBe(false);
    expect(fs.readdirSync(path.join(project, "dist"))).toEqual(["keep.txt"]);
  });

  it("writes the bundle where the tsconfig's luaBundle says, and composes that file", () => {
    const project = copyProject();
    setLuaBundle(project, "dist/lua/map.lua");

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const bundle = fs.readFileSync(
      path.join(project, "dist", "lua", "map.lua"),
      "utf8",
    );
    expect(fs.existsSync(path.join(project, "dist", "bundle.lua"))).toBe(false);
    expect(archivedScript(project).endsWith(bundle)).toBe(true);
  });

  it("refuses a luaBundle outside the output folder, naming both, before touching the output folder", () => {
    const project = copyProject();
    setLuaBundle(project, "build/bundle.lua");
    fs.mkdirSync(path.join(project, "dist"));
    fs.writeFileSync(path.join(project, "dist", "keep.txt"), "previous build");

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Build failed: tsconfig.json: `tstl.luaBundle` resolves to build/bundle.lua, which is not a file of its own in the output folder dist (`outputFolder` in reforged.config.ts). Set it to a file there, e.g. "dist/bundle.lua".',
    );
    expect(fs.readdirSync(path.join(project, "dist"))).toEqual(["keep.txt"]);
    expect(fs.existsSync(path.join(project, "build"))).toBe(false);
  });

  it("refuses a luaBundle the configured output folder no longer covers, or one inside the staging folder", () => {
    const project = copyProject();
    const configFile = path.join(project, "reforged.config.ts");
    fs.writeFileSync(
      configFile,
      fs
        .readFileSync(configFile, "utf8")
        .replace('outputFolder: "dist"', 'outputFolder: "out"'),
    );
    let result = runScript(project, "scripts/build.ts");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /resolves to dist\/bundle\.lua, .* output folder out .* e\.g\. "out\/bundle\.lua"/,
    );

    setLuaBundle(project, "out/staging/bundle.lua");
    result = runScript(project, "scripts/build.ts");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "resolves to out/staging/bundle.lua, which is not a file of its own",
    );
  });

  it("fails with tstl's diagnostics and exit 1 on a type error", () => {
    const project = copyProject();
    fs.writeFileSync(
      path.join(project, "src", "broken.ts"),
      'export const n: number = "not a number";\n',
    );

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/src[\\/]broken\.ts\(1,14\): error TS2322/);
    expect(fs.existsSync(path.join(project, ARCHIVE))).toBe(false);
  });
});

describe("node scripts/generate.ts (the prepare script)", () => {
  it("writes the generated files so the source type-checks with no other command", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, "src", "generated"), {
      recursive: true,
      force: true,
    });
    // Source using an editor global: needs the generated declarations.
    fs.writeFileSync(
      path.join(project, "src", "uses-globals.ts"),
      "export const t: trigger = gg_trg_Melee_Initialization;\n",
    );

    const result = runScript(project, "scripts/generate.ts");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const generated = [
      "env.ts",
      "editor-globals.d.ts",
      "editor-globals.lua",
      "map-objects.d.ts",
      "custom-units.ts",
      "custom-items.ts",
      "custom-abilities.ts",
      "custom-buffs.ts",
      "custom-destructables.ts",
      "custom-doodads.ts",
      "custom-upgrades.ts",
    ].map((name) => path.join("src", "generated", name));
    expect(result.stdout).toContain(
      `Generated ${generated.join(", ")} (mode dev)`,
    );
    for (const file of generated)
      expect(fs.existsSync(path.join(project, file))).toBe(true);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain(
      "export const devMode: boolean = true;",
    );
    const tsc = runScript(
      project,
      path.join("node_modules", "typescript", "bin", "tsc"),
      ["-p", "tsconfig.json", "--noEmit"],
    );
    expect(tsc.stdout + tsc.stderr).toBe("");
    expect(tsc.status).toBe(0);
  });

  it("prints the editor-globals warnings to stderr", () => {
    const project = copyProject();
    const script = path.join(project, MAP_FOLDER, "war3map.lua");
    fs.writeFileSync(
      script,
      "gg_qst_Main = nil\r\n" + fs.readFileSync(script, "utf8"),
    );

    const result = runScript(project, "scripts/generate.ts");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe(
      "Warning: gg_qst_Main: unknown editor prefix gg_qst_, declared as handle.\n",
    );
  });

  it("fails with exit 1 when the map folder has no editor script", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, MAP_FOLDER, "war3map.lua"));

    const result = runScript(project, "scripts/generate.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      new RegExp(
        `^Generate failed: ${escapeRegExp(MAP_FOLDER_NAME)} has no war3map\\.lua`,
      ),
    );
  });

  it("honours --mode release", () => {
    const project = copyProject();
    expect(
      runScript(project, "scripts/generate.ts", ["--mode", "release"]).status,
    ).toBe(0);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain(
      "export const devMode: boolean = false;",
    );
  });
});

/** A Custom unit, the Sergeant, derived from the Footman: a definition file's text. */
const SERGEANT = `import { defineUnit } from "reforged-map/objects";

export const Sergeant = defineUnit({
  rawcode: "h002",
  base: FourCC("hfoo"),
  fields: { unam: "Sergeant", uhpm: 520 },
});
`;

/** Writes `text` as the copy's `src/objects/units.ts`. */
function defineUnits(project: string, text: string): void {
  fs.mkdirSync(path.join(project, "src", "objects"), { recursive: true });
  fs.writeFileSync(path.join(project, "src", "objects", "units.ts"), text);
}

describe("the Object definitions in pnpm build", () => {
  it("merges a definition into the staged map folder and the archive, leaving the map folder and the manifest alone, and none reaches the Lua", () => {
    const project = copyProject();
    defineUnits(project, SERGEANT);
    const map = hashTree(path.join(project, MAP_FOLDER));

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const staged = new Uint8Array(
      fs.readFileSync(
        path.join(project, "dist", "staging", MAP_FOLDER, "war3map.w3u"),
      ),
    );
    expect(objectDataText(staged, "war3map.w3u")).toContain(
      "custom h002 from hfoo",
    );
    const archived = openArchive(
      new Uint8Array(fs.readFileSync(path.join(project, ARCHIVE))),
    ).get("war3map.w3u");
    expect(archived && new Uint8Array(archived.bytes())).toEqual(staged);
    // Only read: the map folder as it was, no manifest written.
    expect(hashTree(path.join(project, MAP_FOLDER))).toEqual(map);
    expect(fs.existsSync(path.join(project, "object-manifest.json"))).toBe(
      false,
    );
    // The definitions run in Node only: the Lua gets the generated constant, never the definition.
    const bundle = fs.readFileSync(
      path.join(project, "dist", "bundle.lua"),
      "utf8",
    );
    expect(bundle).toContain("Sergeant_h002 = 1747988530");
    expect(bundle).not.toContain("reforged-map");
    expect(bundle).not.toContain("defineUnit");
    expect(bundle).not.toContain('["objects.');
  });

  it("fails with the definitions' problems and exit 1 on an invalid definition or a collision", () => {
    const project = copyProject();
    defineUnits(project, SERGEANT.replace("uhpm: 520", 'uhpm: "many"'));

    const invalid = runScript(project, "scripts/build.ts");

    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toMatch(/^Build failed: .*h002/m);
    expect(invalid.stderr).toContain("uhpm");
    expect(invalid.stderr).not.toMatch(/^\s+at /m);

    // h000 is the Captain of the objects map, which the code does not own.
    fs.rmSync(path.join(project, MAP_FOLDER), { recursive: true });
    fs.cpSync(FIXTURE_OBJECTS_MAP, path.join(project, MAP_FOLDER), {
      recursive: true,
    });
    defineUnits(project, SERGEANT.replace('"h002"', '"h000"'));

    const collision = runScript(project, "scripts/build.ts");

    expect(collision.status).toBe(1);
    expect(collision.stderr).toMatch(/^Build failed: .*h000/m);
    expect(collision.stderr).toContain("objects:adopt");
  });
});

describe("a Map project whose map folder was renamed", () => {
  it("builds the archive the pipeline helpers name, which follow the copy's reforged.config.ts", () => {
    // What `create-reforged-map my-map` does: the map folder renamed, `mapFolder` pointed at it.
    const renamed =
      MAP_FOLDER === "my-map.w3m" ? "other-map.w3m" : "my-map.w3m";
    const base = path.basename(renamed, ".w3m");
    const project = copyProject();
    const configFile = path.join(project, "reforged.config.ts");
    const text = fs.readFileSync(configFile, "utf8");
    const entry = `mapFolder: ${JSON.stringify(MAP_FOLDER)}`;
    expect(text).toContain(entry);
    fs.writeFileSync(
      configFile,
      text.replace(entry, `mapFolder: ${JSON.stringify(renamed)}`),
    );
    fs.renameSync(path.join(project, MAP_FOLDER), path.join(project, renamed));
    // The copy's own helpers, as its pipeline tests import them.
    fs.writeFileSync(
      path.join(project, "print-helpers.ts"),
      `import * as h from "./tests/pipeline/helpers.ts";
console.log(JSON.stringify({
  mapFolder: h.MAP_FOLDER,
  name: h.MAP_FOLDER_NAME,
  dev: h.defaultArchiveName("dev", h.COPY_VERSION),
  release: h.defaultArchiveName("release", undefined),
}));
`,
    );

    const printed = runScript(project, "print-helpers.ts");

    expect(printed.stderr).toBe("");
    expect(printed.status).toBe(0);
    const helpers = JSON.parse(printed.stdout) as Record<string, string>;
    expect(helpers).toEqual({
      mapFolder: renamed,
      name: renamed,
      dev: `${base}-${COPY_VERSION}-dev.w3m`,
      release: `${base}.w3m`,
    });

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `Built ${path.join("dist", helpers.dev)} (`,
    );
    expect(fs.existsSync(path.join(project, "dist", helpers.dev))).toBe(true);
    expect(fs.existsSync(path.join(project, MAP_FOLDER))).toBe(false);
  });
});
