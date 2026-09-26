# Map project

## Overview

This repository is a Map project: a Warcraft III 3.0.0 map whose code is TypeScript compiled to Lua with typescript-to-lua and [reforged-ts](https://github.com/phmilk/reforged-ts). The World Editor owns the map data (terrain, object data, placed units); this repository owns the code. Files in the map folder change only through the World Editor. The project vocabulary lives in `CONTEXT.md`; use its terms.

## Commands

- `pnpm build`: compiles `src` in Dev mode (the library's runtime Guards on), stages the map folder and packs the `.w3x` into `dist/`.
- `pnpm build --mode release`: the same build with Dev mode off, as players get it.
- `pnpm dev`: rebuilds on every change to `src` or the map folder, until stopped.
- `pnpm test:map`: launches the game on the staged map folder of the last build.
- `pnpm test`: runs the tests without the game (see Testing).
- `pnpm check`: lint, type check and tests, stopping at the first failure.

A task is finished when `pnpm check` is green.

## Layout

- `src/`: the map's code; `src/main.ts` is the entry point. New code goes here.
- The map folder (`mapFolder` in `reforged.config.ts`): owned by the World Editor, read-only here.
- `reforged.config.ts`: the typed build configuration. It is committed, so it holds only what every machine shares.
- `src/generated/`: `env.ts` (the build mode) and the typings of the map's editor globals, rewritten by every install and build. Read-only: change the config or the map instead.
- `tests/lua/`: the map's tests on the harness; `tests/stubs/`: the extra Native stubs they need.
- `dist/`: build output, never committed.

## Runtime constraints

- The game runs Lua 5.3 with 32-bit integers that wrap at 2^31; floats are doubles.
- `debug`, `require`, `package`, `io`, `collectgarbage` and `os.getenv` are absent; `load` works.
- `pairs` order is deterministic per game build but not guaranteed: iterate the library's synced collections (`SyncedMap`, `SyncedSet`, `HandleMap`, `HandleSet`).
- The editor's `config` runs before `main`; map code starts from the library's Init stages.
- Handles are created in an Init stage, never at module top level.
- `os.clock` and the async Natives return local values that differ per client: keep them out of game state.
- A game-state change for one player desyncs the game: local-only code is visuals only, inside `MapPlayer.runLocal`.
- A `%` in a script pasted into the World Editor crashes the editor on save.
- Handle identity is stable across Natives; handle ids are not recycled immediately.
- The measured facts in full: [Runtime facts](https://phmilk.github.io/reforged-ts/docs/guides/runtime-facts).

## Lint

`pnpm lint` runs the recommended rules of `eslint-plugin-reforged` on `src` and `tests/lua`, next to the TypeScript and Prettier rules. Each problem links to its rule's page. To tolerate one finding, disable its rule on that line only, with the reason after `--`:

```ts
// eslint-disable-next-line reforged/no-unsafe-natives -- runs in a trigger action, where the sleep is safe
```

A disable comment without a reason fails lint. Suggestions are applied by a click in the editor, one at a time; saving applies only the automatic fixes.

## Testing

`pnpm test` runs `tests/lua` on the `reforged-test` harness: real Lua 5.3 with the Natives stubbed. The stubs record every Native call with its arguments, give each Handle a stable identity and let a test fire triggers and timers. The harness does not simulate the engine: no pathing, no combat, no rendering, no object data, and its integers are 64-bit. A Native no stub defines fails with "Native X is not stubbed": stub it in `tests/stubs`. What only the game can answer is verified with `pnpm test:map`.

## Domain docs

Single-context: `CONTEXT.md` at the repo root and ADRs under `docs/adr/` (none yet). See `docs/agents/domain.md`.

## Library docs

<!-- reforged-ts:docs:start -->

The documentation of the installed reforged-ts version, as one plain-text file for a language model: [llms.txt](https://phmilk.github.io/reforged-ts/llms.txt).
<!-- reforged-ts:docs:end -->

The TSDoc of every Wrapper, System and Native lives in the installed declarations: `node_modules/reforged-ts/dist/**/*.d.ts` and `node_modules/reforged-types/3.0.0/*.d.ts`. Read them before calling an API from memory.

## Your project

This section belongs to the map's author: the map's own instructions for agents go here.

## Template maintenance

This section, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` and `tests/pipeline/seeds.test.ts` serve the development of the Template itself. Delete them in a generated Map project.

- **Issue tracker**: the Template's issues live in `phmilk/reforged-ts-template`'s GitHub Issues and are driven with the `gh` CLI; the library's live in `phmilk/reforged-ts`. Specs carry the `spec` label and their tickets are sub-issues with native "blocked by" dependencies. See `docs/agents/issue-tracker.md`.
- **Triage labels**: the five canonical triage labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Two kind labels sit next to them: `spec` on an issue created with `to-spec`, `ticket` on one created with `to-tickets`. See `docs/agents/triage-labels.md`.
- **Sync markers**: on each library release, the sync rewrites the text between the `reforged-ts:<name>:start` and `reforged-ts:<name>:end` marker comments of `AGENTS.md`, `CONTEXT.md` and `README.md`, and nothing outside them. Edit the Template's copy outside the markers only.
