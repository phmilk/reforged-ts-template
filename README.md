# reforged-ts-template

Template for Warcraft III 3.0.0 map projects written in TypeScript with [reforged-ts](https://github.com/phmilk/reforged-ts), compiled to Lua with typescript-to-lua.

**Status: under construction.** The build pipeline, the scripts and the editor baseline are being built; their specs live in this repository's issue tracker, at https://github.com/phmilk/reforged-ts-template/issues. The design is recorded in the library's ADR 0006: the Template owns code, the World Editor owns data.

## Machine-specific settings

`reforged.config.ts` is committed, so it holds only what every machine shares. `pnpm test:map` finds the game on its own in the Battle.net install locations; when the game lives elsewhere, set the `WC3_EXECUTABLE` environment variable to its executable (and `WINEPREFIX` for a Wine prefix) instead of writing the path into `gameExecutable`.

`pnpm test` fails when a committed file holds an absolute path (`tests/pipeline/absolute-paths.test.ts`), in the Template and in every Map project generated from it: such a path works on one machine only. The check reads the files as committed in `HEAD`, so a path you set locally and do not commit, such as `gameExecutable` or `file:` overrides for locally packed tarballs in `package.json`, never fails it; commit the change and it does.
