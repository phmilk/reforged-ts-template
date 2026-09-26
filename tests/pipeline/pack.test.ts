import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  listMapFiles,
  openArchive,
  packMapFolder,
  type War3Map,
} from "../../scripts/pack.ts";
import { FIXTURE_MAP, makeTempDir, sha256 } from "./helpers.ts";

/** sha256 of the committed fixture's war3map.w3i (version 39, saved by WE 3.0.0.24268). */
const FIXTURE_W3I_SHA256 =
  "03e3d8c0ce7d163771f9735f9085750d3b525f181e8c219b0938af644234ad5f";

const fileBytes = (map: War3Map, name: string): Uint8Array | undefined => {
  const file = map.get(name);
  return file ? new Uint8Array(file.bytes()) : undefined;
};

describe("packMapFolder on the committed blank map folder", () => {
  let archive: Uint8Array;
  let map: War3Map;
  const inputs = listMapFiles(FIXTURE_MAP);

  beforeAll(() => {
    archive = packMapFolder(FIXTURE_MAP);
    map = openArchive(archive);
  });

  it("lists the fixture's files", () => {
    expect(inputs).toContain("war3map.lua");
    expect(inputs).toContain("war3map.w3i");
    expect(inputs.length).toBe(17);
  });

  it("stores every input file byte for byte", () => {
    for (const name of inputs) {
      const want = new Uint8Array(
        fs.readFileSync(path.join(FIXTURE_MAP, name)),
      );
      expect(fileBytes(map, name), name).toEqual(want);
    }
  });

  it("stores war3map.w3i (version 39) unchanged", () => {
    const w3i = fileBytes(map, "war3map.w3i");
    expect(w3i && sha256(w3i)).toBe(FIXTURE_W3I_SHA256);
    expect(new DataView(w3i!.buffer, w3i!.byteOffset).getInt32(0, true)).toBe(
      39,
    );
  });

  it("has a listfile, the imports file and no attributes file", () => {
    expect(map.has("(listfile)")).toBe(true);
    expect(map.has("war3map.imp")).toBe(true);
    expect(map.has("(attributes)")).toBe(false);
    expect(map.getFileNames().sort()).toEqual(
      [...inputs, "(listfile)", "war3map.imp"].sort(),
    );
    expect(map.getImportNames().sort()).toEqual([...inputs].sort());
  });

  it("starts with the MPQ header, not the legacy HM3W header", () => {
    expect([...archive.subarray(0, 4)]).toEqual([0x4d, 0x50, 0x51, 0x1a]); // "MPQ\x1a"
  });

  it("round-trips when re-opened from a plain Uint8Array read from disk", () => {
    const dir = makeTempDir();
    const file = path.join(dir, "map.w3m");
    fs.writeFileSync(file, archive);
    const reopened = openArchive(new Uint8Array(fs.readFileSync(file)));
    for (const name of inputs) {
      expect(fileBytes(reopened, name), name).toEqual(fileBytes(map, name));
    }
    expect(reopened.getFileNames()).toEqual(map.getFileNames());
  });

  it("is deterministic: two packs of the same folder are byte-identical", () => {
    expect(sha256(packMapFolder(FIXTURE_MAP))).toBe(sha256(archive));
  });
});

describe("packMapFolder on nested folders", () => {
  it("names entries with backslashes and skips empty folders", () => {
    const dir = makeTempDir();
    fs.cpSync(FIXTURE_MAP, dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "war3mapImported", "ui", "icons"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, "war3mapImported", "ui", "icons", "a.blp"),
      new Uint8Array([1, 2, 3]),
    );
    fs.mkdirSync(path.join(dir, "_Locales"), { recursive: true }); // the editor leaves it empty; git drops it

    const names = listMapFiles(dir);
    expect(names).toContain("war3mapImported\\ui\\icons\\a.blp");
    expect(names.some((n) => n.includes("/"))).toBe(false);
    expect(names.some((n) => n.startsWith("_Locales"))).toBe(false);

    const map = openArchive(packMapFolder(dir));
    expect(fileBytes(map, "war3mapImported\\ui\\icons\\a.blp")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(map.getFileNames()).toContain("war3mapImported\\ui\\icons\\a.blp");
  });

  it("packs every file when the file count is a power of two", () => {
    const dir = makeTempDir();
    for (let i = 0; i < 16; i++)
      fs.writeFileSync(path.join(dir, `f${i}.txt`), `file ${i}`);
    const map = openArchive(packMapFolder(dir));
    expect(map.getFileNames().length).toBe(18);
    expect(map.has("(listfile)")).toBe(true);
    expect(map.has("war3map.imp")).toBe(true);
  });
});

/** A `war3map.imp` as the editor writes it: version 1, then (flag, NUL-terminated path) per import. */
function editorImportsFile(
  entries: Array<[flag: number, path: string]>,
): Uint8Array {
  const parts: number[] = [1, 0, 0, 0, entries.length, 0, 0, 0];
  for (const [flag, name] of entries)
    parts.push(flag, ...Buffer.from(name, "latin1"), 0);
  return new Uint8Array(parts);
}

describe("packMapFolder on a map folder with the editor's war3map.imp", () => {
  it("stores the editor's imports file byte for byte instead of generating one", () => {
    const dir = makeTempDir();
    fs.cpSync(FIXTURE_MAP, dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "war3mapImported"));
    fs.writeFileSync(
      path.join(dir, "war3mapImported", "a.blp"),
      new Uint8Array([1, 2, 3]),
    );
    // Flag 13 (a custom path) and a path the folder does not hold: a generated list would differ on both.
    const editorImp = editorImportsFile([
      [13, "war3mapImported\\a.blp"],
      [13, "war3mapImported\\missing.mdx"],
    ]);
    fs.writeFileSync(path.join(dir, "war3map.imp"), editorImp);

    const map = openArchive(packMapFolder(dir));
    expect(fileBytes(map, "war3map.imp")).toEqual(editorImp);
    expect(map.getFileNames().sort()).toEqual(
      [...listMapFiles(dir), "(listfile)"].sort(),
    );
    expect(fileBytes(map, "war3mapImported\\a.blp")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
