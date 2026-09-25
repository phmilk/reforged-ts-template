import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyProject } from "./helpers.ts";

const MAP_SCRIPT = path.join("maps", "reforged-ts-template.w3m", "war3map.lua");

interface AssertionResult {
  fullName: string;
  status: string;
  failureMessages: string[];
}

/** Runs `vitest run --project lua` (the Lua half of `pnpm test`) in `project`, with vitest's JSON report. */
function runLuaProject(project: string): { status: number | null; output: string; fileErrors: string; tests: AssertionResult[] } {
  const report = path.join(project, "report.json");
  // The outer vitest's variables would make the inner run think it is a worker.
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST")));
  const result = spawnSync(
    process.execPath,
    [path.join("node_modules", "vitest", "vitest.mjs"), "run", "--project", "lua", "--reporter=json", `--outputFile=${report}`],
    { cwd: project, encoding: "utf8", env },
  );
  const files = fs.existsSync(report)
    ? (JSON.parse(fs.readFileSync(report, "utf8")) as { testResults: { message: string; assertionResults: AssertionResult[] }[] }).testResults
    : [];
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    fileErrors: files.map((file) => file.message).join("\n"),
    tests: files.flatMap((file) => file.assertionResults),
  };
}

describe("pnpm test: the Lua harness", () => {
  it("runs map code on Lua 5.3 with the editor-globals stub and the map-specific stubs, one vitest test per it", () => {
    const project = copyProject();
    // No prior build and no generated folder: the run generates and compiles.
    fs.rmSync(path.join(project, "src", "generated"), { recursive: true, force: true });
    fs.rmSync(path.join(project, "dist-test"), { recursive: true, force: true });
    fs.rmSync(path.join(project, "dist"), { recursive: true, force: true });

    // A test-only map script: the editor saved a region and a variable.
    const script = path.join(project, MAP_SCRIPT);
    fs.writeFileSync(script, "udg_SpawnCount = 3\r\ngg_rct_Spawn = nil\r\n" + fs.readFileSync(script, "utf8"));
    // Source referencing them.
    fs.writeFileSync(
      path.join(project, "src", "spawn.ts"),
      [
        "/** @noSelfInFile */",
        "/** How many units spawn: the editor's udg_SpawnCount. */",
        "export function spawnCount(): number {",
        "  return udg_SpawnCount;",
        "}",
        "/** Where they spawn: the center of the editor's Spawn region. */",
        "export function spawnPoint(): [number, number] {",
        "  return [GetRectCenterX(gg_rct_Spawn), GetRectCenterY(gg_rct_Spawn)];",
        "}",
        "",
      ].join("\n"),
    );
    // A map-specific stub: GetRectCenterX only; GetRectCenterY stays unstubbed.
    fs.mkdirSync(path.join(project, "tests", "stubs"), { recursive: true });
    fs.writeFileSync(
      path.join(project, "tests", "stubs", "rects.lua"),
      [
        "function GetRectCenterX(whichRect)",
        '  __stub_record("GetRectCenterX", whichRect)',
        "  return (whichRect.minX + whichRect.maxX) / 2",
        "end",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(project, "tests", "lua", "spawn.test.ts"),
      [
        "/** @noSelfInFile */",
        'import { describe, expect, it, stubCalls } from "reforged-test/lua";',
        'import { spawnCount, spawnPoint } from "../../src/spawn";',
        'describe("spawn", () => {',
        '  it("reads the editor variable from the generated stub", () => {',
        "    expect(spawnCount()).toBe(3);",
        "  });",
        '  it("fails on a Native no stub defines", () => {',
        "    gg_rct_Spawn = Rect(0, 0, 256, 512);",
        "    spawnPoint();",
        "  });",
        '  it("uses the map-specific stub", () => {',
        "    expect(GetRectCenterX(gg_rct_Spawn)).toBe(128);",
        '    expect(stubCalls()).toContainCall("GetRectCenterX(rect#1048577)");',
        "  });",
        "});",
        "",
      ].join("\n"),
    );

    const run = runLuaProject(project);

    const byName = Object.fromEntries(run.tests.map((test) => [test.fullName, test]));
    expect(Object.keys(byName).sort(), run.output).toEqual(
      [
        "tests/lua/harness.test.ts the harness runs Natives on the stubs and logs each call",
        "tests/lua/harness.test.ts the harness declares the editor's globals, nil until the editor script creates them",
        "tests/lua/spawn.test.ts spawn reads the editor variable from the generated stub",
        "tests/lua/spawn.test.ts spawn fails on a Native no stub defines",
        "tests/lua/spawn.test.ts spawn uses the map-specific stub",
      ].sort(),
    );
    expect(byName["tests/lua/spawn.test.ts spawn reads the editor variable from the generated stub"]?.status).toBe("passed");
    expect(byName["tests/lua/spawn.test.ts spawn uses the map-specific stub"]?.status).toBe("passed");
    const unstubbed = byName["tests/lua/spawn.test.ts spawn fails on a Native no stub defines"];
    expect(unstubbed?.status).toBe("failed");
    expect(unstubbed?.failureMessages.join("\n")).toContain("Native GetRectCenterY is not stubbed");
    expect(run.status).toBe(1);
    // The generated folder was written by the run itself.
    expect(fs.readFileSync(path.join(project, "src", "generated", "editor-globals.lua"), "utf8")).toContain("\nudg_SpawnCount = 3\n");
  });

  it("fails the run with typescript-to-lua's diagnostics when a Lua test does not compile", () => {
    const project = copyProject();
    fs.writeFileSync(path.join(project, "tests", "lua", "broken.test.ts"), 'export const n: number = "not a number";\n');

    const run = runLuaProject(project);

    expect(run.status).toBe(1);
    expect(run.fileErrors, run.output).toMatch(/The Lua tests did not compile:[\s\S]*broken\.test\.ts\(1,14\): error TS2322/);
  });
});
