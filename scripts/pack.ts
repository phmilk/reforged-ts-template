import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { AuthorError } from "./errors.ts";

// Deep import of the parser only: the package root pulls in the WebGL viewer.
// Loaded through require because the module is CommonJS with a `default` export.
type War3MapClass = typeof import("mdx-m3-viewer-th/dist/cjs/parsers/w3x/map.js").default;
const require = createRequire(import.meta.url);
const War3Map = (require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/map.js") as { default: War3MapClass }).default;
export type War3Map = InstanceType<War3MapClass>;

/** The editor's import list. */
export const IMPORTS_FILE = "war3map.imp";

/**
 * `War3Map` whose save does not parse `war3map.w3i` (the opaque-w3i override
 * from reforged-ts#32). The upstream save parses the w3i only to decide
 * whether to prepend the legacy `HM3W` header, and its parser throws on the
 * 3.0 editor's version 39. Skipping it stores every editor file byte for
 * byte and never prepends the header (3.0 maps do not have one).
 * It also keeps a `war3map.imp` already in the archive: the upstream save
 * always replaces it with the list built by `import`, which would drop what
 * the editor recorded (custom paths, flags).
 */
export class OpaqueW3iMap extends War3Map {
  override save(): Uint8Array {
    if (!this.has(IMPORTS_FILE)) this.setImportsFile();
    const bytes = this.archive.save();
    if (!bytes) throw new AuthorError("The MPQ writer failed to save the archive.");
    return bytes;
  }
}

/**
 * Every regular file under `folder`, recursively, as archive entry names:
 * relative, backslash-separated whatever the host separator, sorted by code
 * unit so the archive does not depend on directory listing order.
 * Empty folders contribute nothing.
 */
export function listMapFiles(folder: string): string[] {
  const names: string[] = [];
  const walk = (dir: string, prefix: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), [...prefix, entry.name]);
      else if (entry.isFile()) names.push([...prefix, entry.name].join("\\"));
    }
  };
  walk(folder, []);
  return names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Reads a file as a plain `Uint8Array` (a copy, never a Node `Buffer` view). */
function readPlain(file: string): Uint8Array {
  const buffer = fs.readFileSync(file);
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

/**
 * Packs a map folder into an archive, in memory. The editor's `war3map.imp`,
 * when the folder has one, is stored byte for byte; otherwise one is
 * generated listing every file (each goes through the map's import call).
 * The hash table is sized for the files plus the two entries the writer may
 * add (`war3map.imp`, `(listfile)`).
 */
export function packMapFolder(folder: string): Uint8Array {
  const names = listMapFiles(folder);
  const map = new OpaqueW3iMap();
  if (!map.archive.resizeHashtable(names.length + 2)) {
    throw new AuthorError(`The MPQ writer could not size its hash table for ${names.length} files.`);
  }
  for (const name of names) {
    const bytes = readPlain(path.join(folder, ...name.split("\\")));
    const buffer = bytes as unknown as ArrayBuffer;
    const added = name === IMPORTS_FILE ? map.set(name, buffer) : map.import(name, buffer);
    if (!added) {
      throw new AuthorError(`The MPQ writer could not add ${name} to the archive.`);
    }
  }
  return map.save();
}

/** Opens an archive for reading. Takes a plain `Uint8Array`; a Node `Buffer` view would misread the tables. */
export function openArchive(bytes: Uint8Array): War3Map {
  const plain = Object.getPrototypeOf(bytes) === Uint8Array.prototype ? bytes : Uint8Array.from(bytes);
  const map = new War3Map();
  map.load(plain, true);
  return map;
}
