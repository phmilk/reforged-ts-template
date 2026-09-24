import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, parseCommandLine, resolveConfig } from "../../scripts/config.ts";
import { makeTempDir } from "./helpers.ts";

const root = path.resolve("fake-project-root");

describe("resolveConfig", () => {
  it("resolves paths against the root and names the archive after the map folder", () => {
    expect(resolveConfig({ mapFolder: "maps/my-map.w3x" }, root)).toEqual({
      root,
      mapFolder: path.join(root, "maps", "my-map.w3x"),
      outputFolder: path.join(root, "dist"),
      archiveName: "my-map.w3x",
      mode: "dev",
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
