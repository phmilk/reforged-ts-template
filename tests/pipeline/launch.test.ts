import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXECUTABLE_ENV } from "../../scripts/config.ts";
import { LAUNCH_ARGS, launchCommand } from "../../scripts/launch.ts";
import { copyProject, makeTempDir } from "./helpers.ts";

const staging = path.resolve("project", "dist", "staging", "my-map.w3x");

describe("launchCommand", () => {
  it("builds the native argument list confirmed in game: -loadfile <staging folder> -launch -editor -windowmode windowed", () => {
    expect(
      launchCommand({ executable: "wc3", extraArgs: [] }, staging),
    ).toEqual({
      command: "wc3",
      args: [
        "-loadfile",
        staging,
        "-launch",
        "-editor",
        "-windowmode",
        "windowed",
      ],
      env: {},
    });
  });

  it("appends the extra arguments", () => {
    expect(
      launchCommand(
        {
          executable: "wc3",
          extraArgs: ["-nowfpause", "-graphicsapi", "Direct3D11"],
        },
        staging,
      ).args,
    ).toEqual([
      "-loadfile",
      staging,
      ...LAUNCH_ARGS,
      "-nowfpause",
      "-graphicsapi",
      "Direct3D11",
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "runs through Wine with the folder as a Z: path and the prefix set",
    () => {
      const exe =
        "C:\\Program Files (x86)\\Warcraft III\\_retail_\\x86_64\\Warcraft III.exe";
      const winePrefix = path.resolve("wine-wc3");
      expect(
        launchCommand(
          {
            executable: exe,
            extraArgs: ["-nowfpause"],
            winePath: "wine",
            winePrefix,
          },
          staging,
        ),
      ).toEqual({
        command: "wine",
        args: [
          exe,
          "-loadfile",
          `Z:${staging}`,
          "-launch",
          "-editor",
          "-windowmode",
          "windowed",
          "-nowfpause",
        ],
        env: { WINEPREFIX: winePrefix },
      });
      expect(
        launchCommand(
          { executable: exe, extraArgs: [], winePath: "wine" },
          staging,
        ).env,
      ).toEqual({});
    },
  );
});

/** Runs `node scripts/launch.ts` (= `pnpm test:map`) in `cwd` with the environment variable set or removed. */
function testMap(cwd: string, executable?: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name !== EXECUTABLE_ENV),
  );
  if (executable !== undefined) env[EXECUTABLE_ENV] = executable;
  return spawnSync(process.execPath, ["scripts/launch.ts"], {
    cwd,
    env,
    encoding: "utf8",
  });
}

describe("pnpm test:map", () => {
  it.skipIf(process.platform !== "linux")(
    "without a game exits non-zero with the config message, before building",
    () => {
      const dir = copyProject();
      const result = testMap(dir);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(
        /^test:map failed: Warcraft III was not found\. Set `gameExecutable` in reforged\.config\.ts/,
      );
      expect(result.stderr).not.toMatch(/\n\s+at /);
      expect(fs.existsSync(path.join(dir, "dist"))).toBe(false);
    },
  );

  it.skipIf(process.platform === "win32")(
    "builds, then starts the executable on the staging folder",
    async () => {
      const dir = copyProject();
      const record = path.join(makeTempDir(), "argv.txt");
      const fakeGame = path.join(makeTempDir(), "fake-wc3");
      fs.writeFileSync(
        fakeGame,
        `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}.tmp' && mv '${record}.tmp' '${record}'\n`,
        { mode: 0o755 },
      );
      const result = testMap(dir, fakeGame);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(record) && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      const staging = path.join(
        dir,
        "dist",
        "staging",
        "reforged-ts-template.w3m",
      );
      expect(fs.readFileSync(record, "utf8").trimEnd().split("\n")).toEqual([
        "-loadfile",
        staging,
        ...LAUNCH_ARGS,
      ]);
      expect(fs.existsSync(path.join(staging, "war3map.lua"))).toBe(true);
    },
    60_000,
  );
});
