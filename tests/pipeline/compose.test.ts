import { describe, expect, it } from "vitest";
import { composeMapScript } from "../../scripts/compose.ts";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("composeMapScript", () => {
  it("writes the editor script, one newline, then the bundle, byte-exact", () => {
    const editor = bytes(
      "gg_trg_Melee_Initialization = nil\r\nfunction main()\r\nend\r\n",
    );
    const bundle = bytes('print("bundle")\nreturn ____entry\n');
    const out = composeMapScript(editor, bundle);
    expect(out).toEqual(new Uint8Array([...editor, 0x0a, ...bundle]));
  });

  it("adds the newline even when the editor script has no trailing newline", () => {
    expect(composeMapScript(bytes("a"), bytes("b"))).toEqual(bytes("a\nb"));
  });

  it("does not re-encode non-ASCII or BOM bytes", () => {
    const editor = new Uint8Array([
      0xef, 0xbb, 0xbf, 0x2d, 0x2d, 0xc3, 0xa9, 0xff,
    ]);
    const bundle = new Uint8Array([0x00, 0xfe]);
    expect(composeMapScript(editor, bundle)).toEqual(
      new Uint8Array([...editor, 0x0a, ...bundle]),
    );
  });
});
