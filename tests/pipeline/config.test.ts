import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../scripts/config.ts";

const root = path.resolve("fake-project-root");

describe("resolveConfig", () => {
  it("resolves paths against the root and names the archive after the map folder", () => {
    expect(resolveConfig({ mapFolder: "maps/my-map.w3x" }, root)).toEqual({
      root,
      mapFolder: path.join(root, "maps", "my-map.w3x"),
      outputFolder: path.join(root, "dist"),
      archiveName: "my-map.w3x",
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
