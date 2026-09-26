const NEWLINE = new Uint8Array([0x0a]);

/**
 * The map script: the editor's `war3map.lua`, one newline, then the bundle.
 * Byte-exact: neither input is decoded or re-encoded. Both run in one Lua
 * global scope, so the editor's triggers and entry points stay defined.
 */
export function composeMapScript(
  editorScript: Uint8Array,
  bundle: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(
    editorScript.byteLength + NEWLINE.byteLength + bundle.byteLength,
  );
  out.set(editorScript, 0);
  out.set(NEWLINE, editorScript.byteLength);
  out.set(bundle, editorScript.byteLength + NEWLINE.byteLength);
  return out;
}
