# Map project

## Overview

This repository is a Map project: a Warcraft III 3.0.0 map whose code is TypeScript compiled to Lua with typescript-to-lua and [reforged-ts](https://github.com/phmilk/reforged-ts). The World Editor owns the map data (terrain, object data, placed units); this repository owns the code. Files in the map folder change only through the World Editor. The project vocabulary lives in `CONTEXT.md`; use its terms.

## Commands

- `pnpm build`: compiles `src` in dev mode (the `mode` `reforged.config.ts` ships with), with the library's runtime checks on, stages the map folder and packs the `.w3x` into `dist/`.
- `pnpm build --mode release`: the same build with the runtime checks off, as players get it.
- `pnpm dev`: rebuilds on every change to `src` or the map folder, until stopped.
- `pnpm test:map`: builds (dev mode unless `--mode release`), then launches the game on the staged map folder.
- `pnpm test`: runs the map's tests and the Template's pipeline tests, without the game (see Testing).
- `pnpm check`: lint, type check and tests, stopping at the first failure.

A task is finished when `pnpm check` is green.

## Layout

- `src/`: the map's code; `src/main.ts` is the entry point. New code goes here.
- The map folder (`mapFolder` in `reforged.config.ts`): owned by the World Editor, read-only here.
- `reforged.config.ts`: the typed build configuration. It is committed, so it holds only what every machine shares.
- `pnpm-workspace.yaml`: pnpm's settings. The project runs on pnpm 12 (`packageManager` in `package.json`; `npm install --global pnpm@12` installs it), which reads its settings nowhere else. A new dependency with an install script fails the install until `allowBuilds` lists it.
- `src/generated/`: `env.ts` (the build mode) and the Editor globals (`editor-globals.d.ts`, `editor-globals.lua` for the harness): the `gg_` and `udg_` globals of the map folder, which `reforged-map` declares from `war3map.lua` and `war3map.wtg`. Rewritten by every install and build. Read-only: change the config or the map instead.
- `tests/lua/`: the map's tests on the harness; `tests/stubs/`: the extra Native stubs they need.
- `dist/` and `dist-test/`: build output (the map, the compiled Lua tests), ignored by git.

## Runtime constraints

- The game runs Lua 5.3 with 32-bit integers that wrap at 2^31; floats are doubles.
- `debug`, `require`, `package`, `io`, `collectgarbage` and `os.getenv` are absent; `load` works.
- `pairs` order is deterministic per game build but not guaranteed: iterate the library's synced collections (`SyncedMap`, `SyncedSet`, `HandleMap`, `HandleSet`).
- The editor's `config` runs before `main`; map code starts from the library's Init stages.
- Create Handles inside an Init stage; module top level runs while the script loads, before the game is ready.
- `os.clock` and the async Natives return local values that differ per client: keep them out of game state.
- A game-state change for one player desyncs the game: local-only code is visuals only, inside `MapPlayer.runLocal`.
- A `%` in a script pasted into the World Editor crashes the editor on save.
- Handle identity is stable across Natives; handle ids are not recycled immediately.
- The measured facts in full: [Runtime facts](https://phmilk.github.io/reforged-ts/docs/guides/runtime-facts).

## Rawcodes

- A Rawcode is typed by its Object kind: `Rawcode<"unit">`, `Rawcode<"unit" | "upgrade">` (either kind), or `Rawcode` alone for any kind. A plain `number` is not a Rawcode.
- `FourCC("hfoo")` is an `UnknownRawcode`, which every Rawcode parameter accepts. To have the compiler check a constant that holds a literal, annotate the constant with its kind: `const HOLY_LIGHT: Rawcode<"ability"> = FourCC("AHhb");`.
- What the game returns (`GetUnitTypeId`, `unit.typeId`, an Event descriptor's `abilityId`) carries its kind into the next call: pass it on without a cast.
- A GUI variable of an object type (`udg_SpawnType`) is declared with its kind from the Variable Editor's type: a Unit-Type is a `Rawcode<"unit">`, an array a `Record<number, Rawcode<"unit">>`. If its kind is wrong, change the variable's type in the World Editor; never cast the variable.
- `as Rawcode<"unit">` is only for a number the compiler cannot know (a save code, a sync message), never to silence a kind error.
- The rules in full: [Rawcodes](https://phmilk.github.io/reforged-ts/docs/guides/rawcodes).

## Lint

`pnpm lint` runs the recommended rules of `eslint-plugin-reforged` on `src` and `tests/lua`, next to the TypeScript and Prettier rules. Each problem links to its rule's page. To tolerate one finding, disable its rule on that line only, with the reason after `--`:

```ts
// eslint-disable-next-line reforged/no-unsafe-natives -- runs in a trigger action, where the sleep is safe
```

A disable comment without a reason fails lint. Saving applies only the automatic fixes; a rule's suggestions change behaviour, so each one is applied deliberately, by a click in the editor or by hand.

## Testing

The map's tests live in `tests/lua` and run on the `reforged-test` harness (`pnpm test:lua` runs them alone): real Lua 5.3 with the Natives stubbed. The stubs record every Native call with its arguments, give each Handle a stable identity and let a test fire triggers and timers. The harness stands in for the Natives only, not for the engine: pathing, combat, rendering and object data are absent, and its integers are 64-bit. A Native no stub defines fails with "Native X is not stubbed": stub it in `tests/stubs`. What only the game can answer is verified with `pnpm test:map`.

## Domain docs

Single-context: `CONTEXT.md` at the repo root and ADRs under `docs/adr/` (none yet). See `docs/agents/domain.md`.

## Library docs

<!-- reforged-ts:docs:start -->

The documentation of the installed reforged-ts version, as one plain-text file for a language model: [llms.txt](https://phmilk.github.io/reforged-ts/docs/next/llms.txt).

<!-- reforged-ts:docs:end -->

The TSDoc of every Wrapper, System and Native lives in the installed declarations: `node_modules/reforged-ts/dist/**/*.d.ts` and `node_modules/reforged-types/3.0.0/*.d.ts`. Read them before calling an API from memory.

## Agent skills

Each skill is a step list for a recurring task. An agent without skill support reads the file as a document when a request matches its triggers.

- `.claude/skills/map-feature/SKILL.md`: "add a feature", "implement <mechanic>", "new system". From idea to a tested module under `src`.
- `.claude/skills/run-in-game/SKILL.md`: "run the map", "test in game", "launch". Builds, starts the game and reports what it showed.

## Template maintenance

This section, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/release-gate.md`, the sync-shape tests (`tests/pipeline/seeds.test.ts`, `tests/pipeline/readme.test.ts` and their helper `tests/pipeline/sync-markers.ts`), the sync script `scripts/sync.ts` with its test `tests/pipeline/sync.test.ts`, and the sync workflow `.github/workflows/sync.yml` that runs it serve the development of the Template itself. Delete them in a generated Map project, and keep Your project below.

- **Issue tracker**: the Template's issues live in `phmilk/reforged-ts-template`'s GitHub Issues and are driven with the `gh` CLI; the library's live in `phmilk/reforged-ts`. Specs carry the `spec` label and their tickets are sub-issues with native "blocked by" dependencies. See `docs/agents/issue-tracker.md`.
- **Triage labels**: the five canonical triage labels are used as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Two kind labels sit next to them: `spec` on an issue created with `to-spec`, `ticket` on one created with `to-tickets`. See `docs/agents/triage-labels.md`.
- **Sync markers**: on each library release, the Template's sync sets the five library packages' ranges in `package.json` and rewrites the text between the `reforged-ts:<name>:start` and `reforged-ts:<name>:end` marker comments of `AGENTS.md`, `CONTEXT.md` and the README, and nothing else. Edit around the markers, never between them.
- **Sync workflow**: `.github/workflows/sync.yml` runs on the library's `reforged-ts-release` dispatch (or by hand, `gh workflow run sync.yml --ref <branch> -f payload="$(cat payload.json)"`, for a dry run), then syncs, refreshes the lockfile, builds in release mode, runs `pnpm check` and opens a pull request named after the tag; a maintainer merges it. It opens the pull request with the token of the repository's GitHub App when the repository variable `APP_CLIENT_ID` and the secret `APP_PRIVATE_KEY` are set (the names the library uses), and otherwise with the fine-grained token in the secret `SYNC_TOKEN` (contents and pull requests read/write on this repository); with neither, it fails before syncing.
- **Release gate**: the library's release builds, lints and tests the Template against its packed packages, from the `v<major>` ref. See `docs/agents/release-gate.md`.

## Your project

This section belongs to the map's author: the map's own instructions for agents go here.
