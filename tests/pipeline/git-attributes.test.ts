// The attributes `.gitattributes` gives the map folder, as git reads them
// (`git check-attr`): no checkout or commit changes a byte of it, and its
// Object data diffs through reforged-map's textconv driver.
import { describe, expect, it } from "vitest";
import { DIFF_DRIVER } from "../../scripts/diff-driver.ts";
import { git, MAP_FOLDER, MAP_FOLDERS, ROOT } from "./helpers.ts";

/** The fourteen Object data files: each kind's base file and its Skin file. */
const OBJECT_DATA_FILES = ["w3u", "w3t", "w3a", "w3h", "w3b", "w3d", "w3q"]
  .flatMap((ext) => [`war3map.${ext}`, `war3mapSkin.${ext}`])
  .sort();

/** The value of `attribute` for each path, as `git check-attr` reports it (`set`, `unset`, `unspecified` or a value). */
function checkAttr(attribute: string, paths: string[]): Map<string, string> {
  const out = git(ROOT, "check-attr", attribute, "--", ...paths);
  return new Map(
    out
      .trimEnd()
      .split("\n")
      .map((line) => {
        const [file, , value] = line.split(": ");
        return [file, value];
      }),
  );
}

describe(".gitattributes", () => {
  // A map folder elsewhere, or saved as a .w3x folder, gets the same attributes.
  const folders = MAP_FOLDERS;

  it.each(folders)(
    "gives every Object data file of %s the textconv driver",
    (folder) => {
      const files = OBJECT_DATA_FILES.map((name) => `${folder}/${name}`);
      for (const [file, value] of checkAttr("diff", files))
        expect(value, file).toBe(DIFF_DRIVER);
    },
  );

  it.each(folders)(
    "keeps every byte of %s as the World Editor wrote it",
    (folder) => {
      const files = [
        ...OBJECT_DATA_FILES,
        "war3map.wts",
        "war3map.lua",
        "war3map.w3i",
      ].map((name) => `${folder}/${name}`);
      for (const [file, value] of checkAttr("text", files))
        expect(value, file).toBe("unset");
    },
  );

  it("marks every committed file of the map folder -text", () => {
    const files = git(ROOT, "ls-files", "--", MAP_FOLDER)
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(0);
    for (const [file, value] of checkAttr("text", files))
      expect(value, file).toBe("unset");
  });

  it("leaves war3map.wts and war3map.lua to git's own text diff", () => {
    const files = ["war3map.wts", "war3map.lua"].map(
      (name) => `${MAP_FOLDER}/${name}`,
    );
    for (const [file, value] of checkAttr("diff", files))
      expect(value, file).toBe("unspecified");
  });
});
