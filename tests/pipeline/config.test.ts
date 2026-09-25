import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXECUTABLE_ENV, isInside, loadConfig, loadLaunchConfig, parseCommandLine, resolveConfig, resolveGameLaunch, type ExecutableProbe } from "../../scripts/config.ts";
import { makeTempDir } from "./helpers.ts";

const root = path.resolve("fake-project-root");

describe("isInside", () => {
  it("is true for the folder itself and anything under it, false beside or above it", () => {
    const folder = path.join(root, "out");
    expect(isInside(folder, folder)).toBe(true);
    expect(isInside(path.join(folder, "a", "b.txt"), folder)).toBe(true);
    expect(isInside(root, folder)).toBe(false);
    expect(isInside(path.join(root, "outside"), folder)).toBe(false);
    // A sibling whose name starts with two dots is still outside.
    expect(isInside(path.join(root, "..out"), folder)).toBe(false);
    expect(isInside(path.join(folder, "..hidden"), folder)).toBe(true);
  });
});

describe("resolveConfig", () => {
  it("resolves paths against the root and names the archive after the map folder", () => {
    expect(resolveConfig({ mapFolder: "maps/my-map.w3x" }, root)).toEqual({
      root,
      mapFolder: path.join(root, "maps", "my-map.w3x"),
      outputFolder: path.join(root, "dist"),
      archiveName: "my-map.w3x",
      mode: "dev",
      sourceFolder: path.join(root, "src"),
      generatedFolder: path.join(root, "src", "generated"),
      tsconfig: path.join(root, "tsconfig.json"),
    });
  });

  it("keeps an explicit archive name and output folder", () => {
    const config = resolveConfig({ mapFolder: "maps/a.w3m", outputFolder: "out", archiveName: "b.w3x" }, root);
    expect(config.outputFolder).toBe(path.join(root, "out"));
    expect(config.archiveName).toBe("b.w3x");
  });

  it("refuses an output folder the clean step would destroy the project with", () => {
    for (const outputFolder of [".", "src", "maps", "maps/a.w3m", "maps/a.w3m/out"]) {
      expect(() => resolveConfig({ mapFolder: "maps/a.w3m", outputFolder }, root), outputFolder).toThrow(/outputFolder/);
    }
  });

  it("requires the map folder", () => {
    expect(() => resolveConfig({} as never, root)).toThrow(/mapFolder/);
  });
});

/** Writes a configuration file default-exporting `config` into a fresh folder and returns its path. */
function writeConfig(config: object): string {
  const file = path.join(makeTempDir(), "reforged.config.ts");
  fs.writeFileSync(file, `export default ${JSON.stringify(config)};\n`);
  return file;
}

describe("loadConfig", () => {
  it("applies the defaults when the file names only the map folder, resolving against the file's folder", async () => {
    const file = writeConfig({ mapFolder: "maps/m.w3x" });
    const dir = path.dirname(file);
    expect(await loadConfig(file)).toEqual({
      root: dir,
      mapFolder: path.join(dir, "maps", "m.w3x"),
      outputFolder: path.join(dir, "dist"),
      archiveName: "m.w3x",
      mode: "dev",
      sourceFolder: path.join(dir, "src"),
      generatedFolder: path.join(dir, "src", "generated"),
      tsconfig: path.join(dir, "tsconfig.json"),
    });
  });

  it("keeps the file's mode without a flag", async () => {
    expect((await loadConfig(writeConfig({ mapFolder: "m.w3x", mode: "release" }), [])).mode).toBe("release");
  });

  it("lets --mode release override a config saying dev", async () => {
    const file = writeConfig({ mapFolder: "m.w3x", mode: "dev" });
    expect((await loadConfig(file, ["--mode", "release"])).mode).toBe("release");
    expect((await loadConfig(file, ["--mode=release"])).mode).toBe("release");
  });

  it("lets --mode dev override a config saying release", async () => {
    expect((await loadConfig(writeConfig({ mapFolder: "m.w3x", mode: "release" }), ["--mode", "dev"])).mode).toBe("dev");
  });

  it("refuses an invalid mode in the file, naming the field and the allowed values", async () => {
    await expect(loadConfig(writeConfig({ mapFolder: "m.w3x", mode: "debug" }))).rejects.toThrow(
      'reforged.config.ts: `mode` must be "dev" or "release", got "debug".',
    );
  });

  it("refuses an invalid mode on the command line even when the file is valid", async () => {
    await expect(loadConfig(writeConfig({ mapFolder: "m.w3x" }), ["--mode", "prod"])).rejects.toThrow('--mode must be dev or release, got "prod".');
  });
});

describe("parseCommandLine", () => {
  it("returns no override without flags", () => {
    expect(parseCommandLine([])).toEqual({});
  });

  it("refuses a missing value, an unknown flag and a positional argument", () => {
    expect(() => parseCommandLine(["--mode"])).toThrow(/--mode/);
    expect(() => parseCommandLine(["--release"])).toThrow(/Unknown option '--release'.*Usage: --mode dev\|release/);
    expect(() => parseCommandLine(["release"])).toThrow(/Usage/);
  });
});

/** A machine where exactly `existing` exist. */
function fakeProbe(platform: NodeJS.Platform, existing: string[], env: Record<string, string> = {}): ExecutableProbe & { asked: string[] } {
  const asked: string[] = [];
  return {
    platform,
    env,
    asked,
    exists: (file) => {
      asked.push(file);
      return existing.includes(file);
    },
  };
}

const X86 = "C:\\Program Files (x86)\\Warcraft III\\_retail_\\x86_64\\Warcraft III.exe";
const X64 = "C:\\Program Files\\Warcraft III\\_retail_\\x86_64\\Warcraft III.exe";
const MAC = "/Applications/Warcraft III/_retail_/x86_64/Warcraft III.app/Contents/MacOS/Warcraft III";
/** An executable outside the well-known locations (absolute on this machine, like a real override). */
const ELSEWHERE = path.resolve("elsewhere", "wc3");
const windowsEnv = { "ProgramFiles(x86)": "C:\\Program Files (x86)", ProgramFiles: "C:\\Program Files" };

describe("loadLaunchConfig (executable detection, injected probe)", () => {
  it("lets the gameExecutable override win over the environment variable and the well-known locations", async () => {
    const file = writeConfig({ mapFolder: "m.w3x", gameExecutable: "game/wc3.exe" });
    const override = path.join(path.dirname(file), "game", "wc3.exe");
    const probe = fakeProbe("win32", [override, X86, ELSEWHERE], { ...windowsEnv, [EXECUTABLE_ENV]: ELSEWHERE });
    const config = await loadLaunchConfig(file, [], probe);
    expect(config.game).toEqual({ executable: override, extraArgs: [] });
    expect(probe.asked).toEqual([override]);
  });

  it("reports an override that does not exist, naming the field", async () => {
    const file = writeConfig({ mapFolder: "m.w3x", gameExecutable: "missing.exe" });
    await expect(loadLaunchConfig(file, [], fakeProbe("win32", [X86], windowsEnv))).rejects.toThrow(/`gameExecutable` is set to "missing.exe", which does not exist/);
  });

  it("takes the first existing well-known location, Program Files (x86) before Program Files", async () => {
    const file = writeConfig({ mapFolder: "m.w3x" });
    expect((await loadLaunchConfig(file, [], fakeProbe("win32", [X86, X64], windowsEnv))).game.executable).toBe(X86);
    const probe = fakeProbe("win32", [X64], windowsEnv);
    expect((await loadLaunchConfig(file, [], probe)).game.executable).toBe(X64);
    expect(probe.asked).toEqual([X86, X64]);
  });

  it("probes the inner binary of the application bundle on macOS", async () => {
    const file = writeConfig({ mapFolder: "m.w3x" });
    expect((await loadLaunchConfig(file, [], fakeProbe("darwin", [MAC]))).game.executable).toBe(MAC);
  });

  it("honours the environment variable, before the well-known locations", async () => {
    const file = writeConfig({ mapFolder: "m.w3x" });
    expect((await loadLaunchConfig(file, [], fakeProbe("linux", [ELSEWHERE], { [EXECUTABLE_ENV]: ELSEWHERE }))).game.executable).toBe(ELSEWHERE);
    const env = { ...windowsEnv, [EXECUTABLE_ENV]: path.win32.join("Games", "WC3", "Warcraft III.exe") };
    expect((await loadLaunchConfig(file, [], fakeProbe("win32", [X86, env[EXECUTABLE_ENV]], env))).game.executable).toBe(env[EXECUTABLE_ENV]);
  });

  it("names the config field when nothing is found", async () => {
    const file = writeConfig({ mapFolder: "m.w3x" });
    await expect(loadLaunchConfig(file, [], fakeProbe("linux", []))).rejects.toThrow(
      /Warcraft III was not found\. Set `gameExecutable` in reforged\.config\.ts \(or the WC3_EXECUTABLE environment variable\)/,
    );
    await expect(loadLaunchConfig(file, [], fakeProbe("win32", [], windowsEnv))).rejects.toThrow(/`gameExecutable`.*Looked at: .*Program Files \(x86\)/);
  });

  it("keeps the extra arguments and the Wine settings, and does not check a Wine-side executable", async () => {
    const file = writeConfig({ mapFolder: "m.w3x", gameExecutable: X86, extraLaunchArgs: ["-nowfpause"], winePath: "wine", winePrefix: "wine-prefix" });
    const config = await loadLaunchConfig(file, ["--mode", "release"], fakeProbe("linux", []));
    expect(config.mode).toBe("release");
    expect(config.game).toEqual({ executable: X86, extraArgs: ["-nowfpause"], winePath: "wine", winePrefix: path.join(path.dirname(file), "wine-prefix") });
  });

  it("refuses malformed launch fields", () => {
    expect(() => resolveGameLaunch({ mapFolder: "m", extraLaunchArgs: "-x" as never }, root, fakeProbe("linux", []))).toThrow(/`extraLaunchArgs` must be an array of strings/);
    expect(() => resolveGameLaunch({ mapFolder: "m", winePath: "" }, root, fakeProbe("linux", []))).toThrow(/`winePath` must be a non-empty string/);
  });

  it("is not needed by loadConfig, which never probes (pnpm build runs without a game)", async () => {
    const file = writeConfig({ mapFolder: "m.w3x", gameExecutable: "missing.exe" });
    expect((await loadConfig(file)).mapFolder).toBe(path.join(path.dirname(file), "m.w3x"));
  });
});
