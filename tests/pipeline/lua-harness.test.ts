import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyProject, MAP_FOLDER } from "./helpers.ts";

const MAP_SCRIPT = path.join(MAP_FOLDER, "war3map.lua");

interface AssertionResult {
  fullName: string;
  status: string;
  failureMessages: string[];
}

/** Runs `vitest run --project lua` (the Lua half of `pnpm test`) in `project`, with vitest's JSON report. */
function runLuaProject(project: string): {
  status: number | null;
  output: string;
  fileErrors: string;
  tests: AssertionResult[];
} {
  const report = path.join(project, "report.json");
  // The outer vitest's variables would make the inner run think it is a worker.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("VITEST")),
  );
  const result = spawnSync(
    process.execPath,
    [
      path.join("node_modules", "vitest", "vitest.mjs"),
      "run",
      "--project",
      "lua",
      "--reporter=json",
      `--outputFile=${report}`,
    ],
    { cwd: project, encoding: "utf8", env },
  );
  const files = fs.existsSync(report)
    ? (
        JSON.parse(fs.readFileSync(report, "utf8")) as {
          testResults: {
            message: string;
            assertionResults: AssertionResult[];
          }[];
        }
      ).testResults
    : [];
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    fileErrors: files.map((file) => file.message).join("\n"),
    tests: files.flatMap((file) => file.assertionResults),
  };
}

describe("pnpm test: the Lua harness", () => {
  it("runs map code on Lua 5.3 with the editor-globals stub, one vitest test per it, a Native without a Stub answered by stubNative", () => {
    const project = copyProject();
    // No prior build and no generated folder: the run generates and compiles.
    fs.rmSync(path.join(project, "src", "generated"), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(project, "dist-test"), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(project, "dist"), { recursive: true, force: true });

    // A test-only map script: the editor saved a region and a variable.
    const script = path.join(project, MAP_SCRIPT);
    fs.writeFileSync(
      script,
      "udg_SpawnCount = 3\r\ngg_rct_Spawn = nil\r\n" +
        fs.readFileSync(script, "utf8"),
    );
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
    fs.writeFileSync(
      path.join(project, "tests", "lua", "spawn.test.ts"),
      [
        'import { describe, expect, it, stubNative } from "reforged-test/map";',
        'import { spawnCount, spawnPoint } from "../../src/spawn";',
        "// GetRectCenterX only: GetRectCenterY stays without a Stub.",
        'stubNative("GetRectCenterX", () => 128);',
        'describe("spawn", () => {',
        '  it("reads the editor variable from the generated stub", () => {',
        "    expect(spawnCount()).toBe(3);",
        "  });",
        '  it("fails on a Native without a Stub", () => {',
        "    gg_rct_Spawn = Rect(0, 0, 256, 512);",
        "    spawnPoint();",
        "  });",
        '  it("answers a Native with stubNative", () => {',
        "    const spawn = Rect(0, 0, 256, 512);",
        "    expect(GetRectCenterX(spawn)).toBe(128);",
        "    expect(GetRectCenterX).toHaveBeenCalledWith(spawn);",
        "  });",
        "});",
        "",
      ].join("\n"),
    );
    // A test of the map's own, beside the starter's and this test's fixtures.
    fs.writeFileSync(
      path.join(project, "tests", "lua", "map-own.test.ts"),
      [
        'import { describe, expect, it } from "reforged-test/map";',
        'describe("the map\'s own test", () => {',
        '  it("passes", () => {',
        "    expect(1 + 1).toBe(2);",
        "  });",
        "});",
        "",
      ].join("\n"),
    );

    const run = runLuaProject(project);

    const byName = new Map(run.tests.map((test) => [test.fullName, test]));
    // Only the tests this one owns are checked by name: the map's own tests may run beside them.
    expect([...byName.keys()], run.output).toEqual(
      expect.arrayContaining([
        "tests/lua/main.test.ts the starter source prints its line when the game starts",
        "tests/lua/main.test.ts the starter source prints the name of a unit that dies",
        "tests/lua/main.test.ts the starter source counts the minutes played",
        "tests/lua/spawn.test.ts spawn reads the editor variable from the generated stub",
        "tests/lua/spawn.test.ts spawn fails on a Native without a Stub",
        "tests/lua/spawn.test.ts spawn answers a Native with stubNative",
      ]),
    );
    // The map's own test ran and passed.
    expect(
      byName.get("tests/lua/map-own.test.ts the map's own test passes")?.status,
    ).toBe("passed");
    // The starter's test still passes beside the other test files.
    for (const test of run.tests.filter((test) =>
      test.fullName.startsWith("tests/lua/main.test.ts"),
    )) {
      expect(test.status, test.fullName).toBe("passed");
    }
    expect(
      byName.get(
        "tests/lua/spawn.test.ts spawn reads the editor variable from the generated stub",
      )?.status,
    ).toBe("passed");
    expect(
      byName.get(
        "tests/lua/spawn.test.ts spawn answers a Native with stubNative",
      )?.status,
    ).toBe("passed");
    const unstubbed = byName.get(
      "tests/lua/spawn.test.ts spawn fails on a Native without a Stub",
    );
    expect(unstubbed?.status).toBe("failed");
    expect(unstubbed?.failureMessages.join("\n")).toMatch(
      /GetRectCenterY is a Native reforged-test does not stub: give it an answer with stubNative\("GetRectCenterY"/,
    );
    expect(run.status).toBe(1);
    // The generated folder was written by the run itself.
    expect(
      fs.readFileSync(
        path.join(project, "src", "generated", "editor-globals.lua"),
        "utf8",
      ),
    ).toContain("\nudg_SpawnCount = 3\n");
  });

  it("fails the run with typescript-to-lua's diagnostics when a Lua test does not compile", () => {
    const project = copyProject();
    fs.writeFileSync(
      path.join(project, "tests", "lua", "broken.test.ts"),
      'export const n: number = "not a number";\n',
    );

    const run = runLuaProject(project);

    expect(run.status).toBe(1);
    expect(run.fileErrors, run.output).toMatch(
      /The Lua tests did not compile:[\s\S]*broken\.test\.ts\(1,14\): error TS2322/,
    );
  });
});
