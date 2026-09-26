import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AuthorError } from "../../scripts/errors.ts";
import { readEditorScript, stageMapFolder } from "../../scripts/stage.ts";
import { FIXTURE_MAP, hashTree, makeTempDir } from "./helpers.ts";

describe("readEditorScript", () => {
  it("returns the editor's war3map.lua", () => {
    expect(readEditorScript(FIXTURE_MAP)).toEqual(
      new Uint8Array(fs.readFileSync(path.join(FIXTURE_MAP, "war3map.lua"))),
    );
  });

  it("rejects a map folder saved without Lua as the script language", () => {
    const dir = path.join(makeTempDir(), "jass-map.w3x");
    fs.cpSync(FIXTURE_MAP, dir, { recursive: true });
    fs.rmSync(path.join(dir, "war3map.lua"));
    fs.writeFileSync(
      path.join(dir, "war3map.j"),
      "function main takes nothing returns nothing\nendfunction\n",
    );
    expect(() => readEditorScript(dir)).toThrow(AuthorError);
    expect(() => readEditorScript(dir)).toThrow(
      /jass-map\.w3x has no war3map\.lua: the map was not saved with Lua as the script language/,
    );
  });

  it("rejects a missing map folder", () => {
    expect(() =>
      readEditorScript(path.join(makeTempDir(), "nope.w3x")),
    ).toThrow(/Map folder not found/);
  });
});

describe("stageMapFolder", () => {
  it("copies the map folder and leaves it unchanged", () => {
    const before = hashTree(FIXTURE_MAP);
    const staging = path.join(
      makeTempDir(),
      "staging",
      "reforged-ts-template.w3m",
    );
    stageMapFolder(FIXTURE_MAP, staging);
    expect(hashTree(staging)).toEqual(before);
    expect(hashTree(FIXTURE_MAP)).toEqual(before);
  });
});
