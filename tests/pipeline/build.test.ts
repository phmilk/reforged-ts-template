import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openArchive } from "../../scripts/pack.ts";
import { copyProject, hashTree, runScript, sha256 } from "./helpers.ts";

const MAP = path.join("maps", "reforged-ts-template.w3m");
const ARCHIVE = path.join("dist", "reforged-ts-template.w3m");

describe("node scripts/build.ts (pnpm build)", () => {
  it("packs the map folder and the entry into an archive named after the map folder", () => {
    const project = copyProject();
    const mapBefore = hashTree(path.join(project, MAP));
    const tsconfigBefore = sha256(fs.readFileSync(path.join(project, "tsconfig.json")));

    const result = runScript(project, "scripts/build.ts");

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const archive = new Uint8Array(fs.readFileSync(path.join(project, ARCHIVE)));
    expect(result.stdout).toContain(`Built ${ARCHIVE} (${archive.byteLength} bytes)`);

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

  it("fails with a clear message and exit 1 when the map folder has no war3map.lua", () => {
    const project = copyProject();
    fs.rmSync(path.join(project, MAP, "war3map.lua"));

    const result = runScript(project, "scripts/build.ts");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("reforged-ts-template.w3m has no war3map.lua: the map was not saved with Lua as the script language");
    expect(fs.existsSync(path.join(project, ARCHIVE))).toBe(false);
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
