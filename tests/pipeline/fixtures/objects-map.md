# Provenance of `objects-map.w3m`

`objects-map.w3m/` is a copy of reforged-map's fixture `packages/reforged-map/test/fixtures/editor-objects.w3m` in [phmilk/reforged-ts](https://github.com/phmilk/reforged-ts) at commit `e963600c`, where `editor-objects.md` gives its full provenance: this Template's map folder (at `4e176b7`), with Object data seeded by a script, then loaded and saved by the 3.0 World Editor (Patch 3.0.0.24268) on 2026-10-14.

It holds a Custom object and a modified Built-in object of each of the seven Object kinds: among them the Custom unit Captain (`h000`, from `hfoo`), the Footman renamed Militia (`hfoo`), and a Custom buff and a Custom destructable both at `B000`. `tests/pipeline/generate.test.ts` generates the map's objects from it, and `tests/pipeline/builtins-overloads.test.ts` type-checks the generated overloads against `reforged-builtins`'. `.gitattributes` keeps git from changing its files.
