import fs from "node:fs";
import path from "node:path";
import { MapFolderError } from "reforged-map";
import { InstallNotFoundError, type StudioOptions } from "reforged-studio";
import { describe, expect, it } from "vitest";
import {
  EXECUTABLE_ENV,
  loadLaunchConfig,
  loadObjectsConfig,
  loadStudioConfig,
  type ExecutableProbe,
} from "../../scripts/config.ts";
import { AuthorError } from "../../scripts/errors.ts";
import { runStudio, type StartStudio } from "../../scripts/studio.ts";
import { LIBRARY_PACKAGES } from "../../scripts/use-local.ts";
import { makeTempDir, ROOT, runScript } from "./helpers.ts";

/** A file of the repository, as text. */
const readRepoFile = (file: string): string =>
  fs.readFileSync(path.join(ROOT, file), "utf8");

/** Writes a configuration file default-exporting `config` into a fresh folder and returns its path. */
function writeConfig(config: object): string {
  const file = path.join(makeTempDir(), "reforged.config.ts");
  fs.writeFileSync(file, `export default ${JSON.stringify(config)};\n`);
  return file;
}

/** A machine where exactly `existing` exist. */
const probeOf = (
  platform: NodeJS.Platform,
  existing: string[],
  env: Record<string, string> = {},
): ExecutableProbe => ({
  platform,
  env,
  exists: (file) => existing.includes(file),
});

const windowsEnv = {
  "ProgramFiles(x86)": "C:\\Program Files (x86)",
  ProgramFiles: "C:\\Program Files",
};
const GAME =
  "C:\\Program Files (x86)\\Warcraft III\\_retail_\\x86_64\\Warcraft III.exe";
const EDITOR =
  "C:\\Program Files (x86)\\Warcraft III\\_retail_\\x86_64\\World Editor.exe";
/** The game's executable as a path of this machine, inside a Wine prefix. */
const ON_THIS_MACHINE = path.resolve(
  "wine-prefix",
  "drive_c",
  "Warcraft III",
  "Warcraft III.exe",
);

describe("loadStudioConfig", () => {
  it("resolves the map folder, the game and the World Editor as pnpm test:map and pnpm objects:sync do", async () => {
    const file = writeConfig({ mapFolder: "my-map.w3m" });
    const probe = probeOf("win32", [GAME, EDITOR], windowsEnv);
    const studio = await loadStudioConfig(file, probe);
    const launch = await loadLaunchConfig(file, [], probe);
    const objects = await loadObjectsConfig(file, [], probe);

    expect(studio.root).toBe(path.dirname(file));
    expect(studio.mapFolder).toBe(path.join(path.dirname(file), "my-map.w3m"));
    expect(studio.mapFolder).toBe(launch.mapFolder);
    expect(studio.game.executable).toBe(GAME);
    expect(studio.game).toEqual(launch.game);
    expect(studio.worldEditorExecutable).toBe(EDITOR);
    expect(studio.worldEditorExecutable).toBe(objects.worldEditorExecutable);
  });

  it("fails on a missing game with one line naming the setting", async () => {
    const file = writeConfig({ mapFolder: "my-map.w3m" });
    const failure = loadStudioConfig(file, probeOf("win32", [], windowsEnv));
    await expect(failure).rejects.toThrow(AuthorError);
    const { message } = (await failure.catch(
      (error: unknown) => error,
    )) as Error;
    expect(message).not.toContain("\n");
    expect(message).toContain("`gameExecutable` in reforged.config.ts");
  });

  it("has no World Editor when none is beside the game", async () => {
    const file = writeConfig({ mapFolder: "my-map.w3m" });
    const studio = await loadStudioConfig(
      file,
      probeOf("win32", [GAME], windowsEnv),
    );
    expect(studio.worldEditorExecutable).toBeUndefined();
  });

  it("reads a game Wine launches when its executable is a path of this machine", async () => {
    const file = writeConfig({ mapFolder: "my-map.w3m", winePath: "wine" });
    const studio = await loadStudioConfig(
      file,
      probeOf("linux", [ON_THIS_MACHINE], {
        [EXECUTABLE_ENV]: ON_THIS_MACHINE,
      }),
    );
    expect(studio.game.executable).toBe(ON_THIS_MACHINE);
  });

  it("refuses a Wine-side path to the game, naming the setting", async () => {
    const file = writeConfig({
      mapFolder: "my-map.w3m",
      winePath: "wine",
      gameExecutable: GAME,
    });
    const failure = loadStudioConfig(file, probeOf("linux", []));
    await expect(failure).rejects.toThrow(AuthorError);
    await expect(failure).rejects.toThrow(
      "`gameExecutable` in reforged.config.ts is a path of Wine's Windows side (`winePath`)",
    );
  });
});

/** A `startStudio` stand-in that records the options it gets. */
function recordingStart(): StartStudio & { calls: StudioOptions[] } {
  const calls: StudioOptions[] = [];
  const start = (options: StudioOptions) => {
    calls.push(options);
    return Promise.resolve({
      url: "http://localhost:5174",
      started: true,
      close: () => Promise.resolve(),
    });
  };
  return Object.assign(start, { calls });
}

describe("runStudio", () => {
  it("starts the Studio on the Map project's map folder, with the game and the World Editor it resolved, and opens the page", async () => {
    const file = writeConfig({ mapFolder: "my-map.w3m" });
    const config = await loadStudioConfig(
      file,
      probeOf("win32", [GAME, EDITOR], windowsEnv),
    );
    const start = recordingStart();
    const studio = await runStudio(config, start);
    expect(studio.url).toBe("http://localhost:5174");
    expect(start.calls).toEqual([
      {
        projectRoot: path.dirname(file),
        mapFolder: path.join(path.dirname(file), "my-map.w3m"),
        gameExecutable: GAME,
        worldEditorExecutable: EDITOR,
        open: true,
      },
    ]);
  });

  it("leaves the World Editor out when none is beside the game", async () => {
    const file = writeConfig({ mapFolder: "my-map.w3m" });
    const config = await loadStudioConfig(
      file,
      probeOf("win32", [GAME], windowsEnv),
    );
    const start = recordingStart();
    await runStudio(config, start);
    expect(start.calls[0]).not.toHaveProperty("worldEditorExecutable");
  });

  it.each([
    ["map folder", new MapFolderError("The map folder my-map.w3m is missing.")],
    [
      "install",
      new InstallNotFoundError("No Warcraft III install holds .build.info."),
    ],
  ])(
    "turns a %s the Studio cannot read into an AuthorError with its message",
    async (_, refusal) => {
      const file = writeConfig({ mapFolder: "my-map.w3m" });
      const config = await loadStudioConfig(
        file,
        probeOf("win32", [GAME], windowsEnv),
      );
      const failure = runStudio(config, () => Promise.reject(refusal));
      await expect(failure).rejects.toThrow(AuthorError);
      await expect(failure).rejects.toThrow(refusal.message);
    },
  );
});

describe("pnpm studio", () => {
  it("runs scripts/studio.ts", () => {
    const manifest = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts.studio).toBe("node scripts/studio.ts");
  });

  it("prints one line naming the setting and exits 1 when the game is missing", () => {
    const file = writeConfig({
      mapFolder: "my-map.w3m",
      gameExecutable: "missing.exe",
    });
    const result = runScript(
      path.dirname(file),
      path.join(ROOT, "scripts", "studio.ts"),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trimEnd().split("\n")).toEqual([
      'studio failed: reforged.config.ts: `gameExecutable` is set to "missing.exe", which does not exist.',
    ]);
  });
});

describe("reforged-studio", () => {
  it("is a library package: in devDependencies at a next range, packed by pnpm use:local", () => {
    const manifest = JSON.parse(readRepoFile("package.json")) as {
      devDependencies: Record<string, string>;
    };
    expect(manifest.devDependencies["reforged-studio"]).toMatch(
      /^\^1\.0\.0-alpha\.\d+$/,
    );
    expect(LIBRARY_PACKAGES).toContain("reforged-studio");
  });

  it("leaves its runtime file out of git", () => {
    expect(readRepoFile(".gitignore").split("\n")).toContain(
      ".reforged-studio.json",
    );
  });
});
