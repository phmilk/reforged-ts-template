# reforged-ts-template

Template for Warcraft III 3.0.0 map projects written in TypeScript with [reforged-ts](https://github.com/phmilk/reforged-ts), compiled to Lua with typescript-to-lua.

**Status: under construction.** The build pipeline, the scripts and the editor baseline are being built; their specs live in this repository's issue tracker, at https://github.com/phmilk/reforged-ts-template/issues. The design is recorded in the library's ADR 0006: the Template owns code, the World Editor owns data.

## Machine-specific settings

`reforged.config.ts` is committed, so it holds only what every machine shares. `pnpm test:map` finds the game on its own in the Battle.net install locations; when the game lives elsewhere, set the `WC3_EXECUTABLE` environment variable to its executable (and `WINEPREFIX` for a Wine prefix) instead of writing the path into `gameExecutable`.

`pnpm test` fails when a committed file holds an absolute path (`tests/pipeline/absolute-paths.test.ts`), in the Template and in every Map project generated from it: such a path works on one machine only. The check reads the files as committed in `HEAD`, so a path you set locally and do not commit, such as `gameExecutable` or `file:` overrides for locally packed tarballs in `package.json`, never fails it; commit the change and it does.

## Lint

`pnpm lint` runs ESLint over the repository (the map's source, its Lua tests, the pipeline scripts and their tests) and fails on any problem, warnings included; `pnpm lint:fix` applies the fixes and formats. The flat config in `eslint.config.mjs` holds:

- the library's base stack: `@eslint/js` recommended, typescript-eslint's strict and stylistic type-checked presets through the project service, and `eslint-plugin-import-x` with the TypeScript resolver;
- every recommended rule of [`eslint-plugin-reforged`](https://github.com/phmilk/reforged-ts/tree/master/packages/eslint-plugin-reforged), the lint layer of the library's Guards, on the code that runs in the game (`src` and `tests/lua`); each problem links to its rule's page;
- Prettier as an ESLint rule, with the config in `.prettierrc` (Prettier 3's defaults, trailing commas `all`, as in the library), so the editor and `pnpm lint` format alike.

A rule is silenced on one line only, with the reason after `--`; a disable comment without one is an error:

```ts
// eslint-disable-next-line reforged/no-unsafe-natives -- runs in a trigger action, where the sleep is safe
TriggerSleepAction(1);
```

The type-aware rules find each file's program through the nearest `tsconfig.json`. The Node side (`scripts`, `tests/pipeline`, `tests/harness` and the configuration files) is typed by `tsconfig.scripts.json`, which no `tsconfig.json` names; the map's `tsconfig.json` references it through `tsconfig.solution.json`, a solution file that compiles nothing, so ESLint and the editor both find it.

## The library packages

The Template depends on four packages of [phmilk/reforged-ts](https://github.com/phmilk/reforged-ts): `reforged-ts` and `reforged-types` (the map's code), `reforged-test` (the Lua test harness) and `eslint-plugin-reforged` (the lint rules). `package.json` declares the four the same way, with caret ranges on the first major. None of them is on npm yet, so until their first publish a plain `pnpm install` cannot resolve them: install with `pnpm use:local <checkout>` (below). When the library publishes its first versions under the `next` dist-tag, the ranges move to that channel and the lockfile is committed.

## Developing against a local checkout of the library

To try a change to reforged-ts in the game before any package is published, point the project at a local checkout of [phmilk/reforged-ts](https://github.com/phmilk/reforged-ts):

```sh
pnpm use:local ../reforged-ts   # build, pack and install the four library packages from the checkout
pnpm build                      # or pnpm test, pnpm test:map
pnpm use:local --reset          # back to the registry versions
```

`pnpm use:local <path>` runs the checkout's build for the four packages (`eslint-plugin-reforged` included, so `pnpm lint` runs the checkout's rules), packs them into `.local-packages/` (ignored by git) and installs them in place of the registry versions. It works on a fresh clone with no `node_modules`. Rerun it after changing the library to pick up the change.

Nothing committed changes, in either direction: the committed pnpm hook `.pnpmfile.cjs` swaps the four packages for their tarballs only while `.local-packages/packages.json` exists, and the local install writes no lockfile. `git status` stays clean after `use:local` and after `--reset`. While the local packages are in use, install with `pnpm use:local` rather than a plain `pnpm install` or `pnpm add`: those write a lockfile pointing at the local tarballs, which must not be committed.
