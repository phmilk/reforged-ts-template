import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openArchive } from "../../scripts/pack.ts";
import { copyProject, hashTree, runScript, sha256 } from "./helpers.ts";

const MAP = path.join("maps", "reforged-ts-template.w3m");
const ARCHIVE = path.join("dist", "reforged-ts-template.w3m");
const ENV = path.join("src", "generated", "env.ts");

/** The map script inside the built archive, as text. */
const archivedScript = (project: string): string =>
  Buffer.from(openArchive(new Uint8Array(fs.readFileSync(path.join(project, ARCHIVE)))).get("war3map.lua")!.bytes()).toString("utf8");

/** The entry's module in the composed script, from its first line to its `return`. */
function entryModule(script: string): string {
  const start = script.indexOf('["main"] = function(...)');
  expect(start).toBeGreaterThan(-1);
  return script.slice(start, script.indexOf("return ____exports", start));
}

describe("node scripts/build.ts (pnpm build)", () => {
  it("packs the map folder and the entry into an archive named after the map folder", () => {
    const project = copyProject();
    const mapBefore = hashTree(path.join(project, MAP));
    const tsconfigBefore = sha256(fs.readFileSync(path.join(project, "tsconfig.json")));

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const archive = new Uint8Array(fs.readFileSync(path.join(project, ARCHIVE)));
    expect(result.stdout).toContain(`Built ${ARCHIVE} (${archive.byteLength} bytes, mode dev)`);

    // The archive's script is the editor's script, one newline, then the bundle.
    const editorScript = fs.readFileSync(path.join(project, MAP, "war3map.lua"));
    const bundle = fs.readFileSync(path.join(project, "dist", "bundle.lua"));
    const script = openArchive(archive).get("war3map.lua")!.bytes();
    expect(new Uint8Array(script)).toEqual(new Uint8Array([...editorScript, 0x0a, ...bundle]));
    expect(bundle.toString("utf8")).toContain('print("reforged-ts-template: map script loaded")');

    // Nothing written into the map folder (so no percent character introduced there); tsconfig untouched.
    expect(hashTree(path.join(project, MAP))).toEqual(mapBefore);
    expect(sha256(fs.readFileSync(path.join(project, "tsconfig.json")))).toBe(tsconfigBefore);
  });

  it("generates the env file with dev mode on and calls Reforged.configure with it first", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, "src", "generated"), { recursive: true, force: true });

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain("export const devMode: boolean = true;");
    const script = archivedScript(project);
    expect(script).toContain('["generated.env"] = function(...) \nlocal ____exports = {}\n');
    expect(script).toMatch(/\["generated\.env"\][^]*?____exports\.devMode = true\n/);
    // After the imports' requires, the entry's first statement is the configure call.
    const statements = entryModule(script)
      .split("\n")
      .slice(2)
      .filter((line) => line !== "" && !/^local \w+ = (require\(|____)/.test(line));
    expect(statements[0]).toBe("Reforged:configure({devMode = devMode})");
  });

  it("with --mode release, differs from the dev build only in the env file's value", () => {
    const project = copyProject();
    expect(runScript(project, "scripts/build.ts").status).toBe(0);
    const devScript = archivedScript(project);

    const result = runScript(project, "scripts/build.ts", ["--mode", "release"]);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("mode release");
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain("export const devMode: boolean = false;");
    const releaseScript = archivedScript(project);
    expect(releaseScript).toMatch(/\["generated\.env"\][^]*?____exports\.devMode = false\n/);
    expect(releaseScript.replace("____exports.devMode = false", "____exports.devMode = true")).toBe(devScript);
  });

  it("refuses an invalid --mode with exit 1 before touching the output folder", () => {
    const project = copyProject();

    const result = runScript(project, "scripts/build.ts", ["--mode", "shipping"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Build failed: --mode must be dev or release, got "shipping".');
    expect(fs.existsSync(path.join(project, "dist"))).toBe(false);
  });

  it("fails with a clear message and exit 1 when the map folder has no war3map.lua, before touching the output folder", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, MAP, "war3map.lua"));
    fs.mkdirSync(path.join(project, "dist"));
    fs.writeFileSync(path.join(project, "dist", "keep.txt"), "previous build");

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("reforged-ts-template.w3m has no war3map.lua: the map was not saved with Lua as the script language");
    expect(fs.existsSync(path.join(project, ARCHIVE))).toBe(false);
    expect(fs.readdirSync(path.join(project, "dist"))).toEqual(["keep.txt"]);
  });

  it("fails with tstl's diagnostics and exit 1 on a type error", () => {
    const project = copyProject();
    fs.writeFileSync(path.join(project, "src", "broken.ts"), 'export const n: number = "not a number";\n');

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/src[\\/]broken\.ts\(1,14\): error TS2322/);
    expect(fs.existsSync(path.join(project, ARCHIVE))).toBe(false);
  });
});

describe("node scripts/generate.ts (the prepare script)", () => {
  it("writes the generated files so the source type-checks with no other command", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, "src", "generated"), { recursive: true, force: true });
    // Source using an editor global: needs the generated declarations.
    fs.writeFileSync(path.join(project, "src", "uses-globals.ts"), "export const t: trigger = gg_trg_Melee_Initialization;\n");

    const result = runScript(project, "scripts/generate.ts");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const generated = ["env.ts", "editor-globals.d.ts", "editor-globals.lua"].map((name) => path.join("src", "generated", name));
    expect(result.stdout).toContain(`Generated ${generated.join(", ")} (mode dev)`);
    for (const file of generated) expect(fs.existsSync(path.join(project, file))).toBe(true);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain("export const devMode: boolean = true;");
    const tsc = runScript(project, path.join("node_modules", "typescript", "bin", "tsc"), ["-p", "tsconfig.json", "--noEmit"]);
    expect(tsc.stdout + tsc.stderr).toBe("");
    expect(tsc.status).toBe(0);
  });

  it("prints the editor-globals warnings to stderr", () => {
    const project = copyProject();
    const script = path.join(project, MAP, "war3map.lua");
    fs.writeFileSync(script, "gg_qst_Main = nil\r\n" + fs.readFileSync(script, "utf8"));

    const result = runScript(project, "scripts/generate.ts");

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("Warning: gg_qst_Main: unknown editor prefix gg_qst_, declared as handle.\n");
  });

  it("fails with exit 1 when the map folder has no editor script", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, MAP, "war3map.lua"));

    const result = runScript(project, "scripts/generate.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^Generate failed: reforged-ts-template\.w3m has no war3map\.lua/);
  });

  it("honours --mode release", () => {
    const project = copyProject();
    expect(runScript(project, "scripts/generate.ts", ["--mode", "release"]).status).toBe(0);
    expect(fs.readFileSync(path.join(project, ENV), "utf8")).toContain("export const devMode: boolean = false;");
  });
});
